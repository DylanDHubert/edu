# Safe Mode Implementation Plan

## Current System Architecture

### Document Processing Pipeline
The system currently processes documents through the following flow:

1. **Upload**: PDFs uploaded to Supabase storage (`team-documents` bucket)
2. **LlamaParse Processing**: PDFs processed using LlamaParse service with `technicalDocumentation` preset
3. **Job Queue**: Processing jobs tracked in `processing_jobs` table with status tracking
4. **Markdown Storage**: Processed content stored as `processed_DOCNAME.md` in Supabase storage
5. **OpenAI Integration**: Markdown files uploaded to OpenAI for assistant knowledge
6. **Vector Stores**: Portfolio-specific vector stores created for file search

### Current Job Queue System
- **Table**: `processing_jobs` with fields: `id`, `document_id`, `team_id`, `portfolio_id`, `llamaparse_job_id`, `status`, `progress`, `current_step`, `error_message`, `retry_count`, `max_retries`
- **Status Flow**: `pending` → `processing` → `completed`/`failed`
- **Cron Processing**: `/api/cron/process-documents` and `/api/trigger-cron` handle job processing
- **Progress Tracking**: 0-100% with step descriptions

### Current Storage Structure
- **PDFs**: `teams/{teamId}/portfolios/{portfolioId}/{filename}`
- **Markdown**: `teams/{teamId}/portfolios/{portfolioId}/processed_{filename}.md`
- **Access**: Signed URLs for secure file access

## Safe Mode Implementation (Simplified Approach)

### Overview
Safe Mode allows users to upload pre-parsed markdown documents with page breaks and search for relevant sources without AI-generated responses. Users can upload .md files with `\n<<{page_number}>>\n` page separators and get top N most relevant sources with summaries.

### Implementation Steps

#### 1. Database Schema Extensions (30 mins)
```sql
-- DOCUMENT CHUNKS TABLE WITH PAGE ENFORCEMENT
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES team_documents(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL, -- CLEANED CONTENT FOR EMBEDDING
  chunk_summary TEXT NOT NULL, -- 2-5 sentence summary generated during vectorization
  embedding VECTOR(1536), -- OpenAI embedding dimension
  page_number INTEGER NOT NULL, -- ABSOLUTE PAGE NUMBER (EXTRACTED FROM LLAMAPARSE)
  chunk_index INTEGER NOT NULL, -- ORDER WITHIN THE DOCUMENT
  token_count INTEGER NOT NULL, -- ACTUAL TOKEN COUNT FOR THIS CHUNK
  -- RICH METADATA
  metadata JSONB DEFAULT '{}', -- INCLUDES ORIGINAL CONTENT, CLEANING INFO, ETC.
  created_at TIMESTAMP DEFAULT NOW()
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX ON document_chunks (document_id);
CREATE INDEX ON document_chunks (page_number);
CREATE INDEX ON document_chunks (chunk_index);
CREATE INDEX ON document_chunks USING GIN (metadata); -- FOR JSONB QUERIES
CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops);

-- VECTOR SEARCH FUNCTION
CREATE OR REPLACE FUNCTION search_chunks(
  query_embedding VECTOR(1536),
  team_id UUID,
  portfolio_id UUID,
  limit INT DEFAULT 5
)
RETURNS TABLE (
  chunk_text TEXT,
  chunk_summary TEXT,
  page_number INTEGER,
  document_name TEXT,
  similarity FLOAT
)
AS $$
  SELECT 
    dc.chunk_text,
    dc.chunk_summary,
    dc.page_number,
    td.original_name,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM document_chunks dc
  JOIN team_documents td ON dc.document_id = td.id
  WHERE td.team_id = search_chunks.team_id
    AND td.portfolio_id = search_chunks.portfolio_id
  ORDER BY dc.embedding <=> query_embedding
  LIMIT search_chunks.limit;
$$;
```

#### 2. Vectorization Service (2 hours)
```typescript
// NEW: app/services/vectorization-service.ts
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { encoding_for_model } from 'tiktoken';
import OpenAI from 'openai';
import { createServiceClient } from '../utils/supabase/server';

interface Chunk {
  chunk_text: string;
  page_number: number;
  chunk_index: number;
  token_count: number;
  metadata: any;
}

export class VectorizationService {
  private serviceClient = createServiceClient();
  private openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  private encoding = encoding_for_model('gpt-4');
  
  async vectorizeUploadedMarkdown(documentId: string, markdownContent: string): Promise<void> {
    // 1. SPLIT BY PAGE BREAKS (<<{page_number}>>)
    const pages = this.splitByPageBreaks(markdownContent);
    
    // 2. PROCESS EACH PAGE INDEPENDENTLY
    const allChunks: Chunk[] = [];
    let globalChunkIndex = 1;
    
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const pageContent = pages[pageIndex];
      const pageChunks = await this.chunkPageWithOverlap(pageContent, pageIndex + 1, globalChunkIndex);
      
      allChunks.push(...pageChunks);
      globalChunkIndex += pageChunks.length;
    }
    
    // 3. GENERATE SUMMARIES AND EMBEDDINGS
    const summaries = await this.generateSummaries(allChunks);
    const embeddings = await this.createEmbeddings(allChunks);
    
    // 4. STORE IN DATABASE
    await this.storeChunks(documentId, allChunks, summaries, embeddings);
  }
  
  private splitByPageBreaks(content: string): string[] {
    // SPLIT BY <<{page_number}>> PATTERN
    const pageBreakPattern = /\n<<\d+>>\n/g;
    const pages = content.split(pageBreakPattern);
    
    return pages.filter(page => page.trim().length > 0);
  }
  
  private async chunkPageWithOverlap(pageContent: string, pageNumber: number, startChunkIndex: number): Promise<Chunk[]> {
    // CLEAN CONTENT FOR EMBEDDING
    const cleanedContent = this.cleanContentForEmbedding(pageContent);
    
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800,
      chunkOverlap: 400,
      separators: ['\n\n', '\n', ' ', ''], // RESPECT PARAGRAPH BOUNDARIES
      keepSeparator: true
    });
    
    const chunks = await splitter.createDocuments([cleanedContent]);
    
    return chunks.map((chunk, index) => ({
      chunk_text: chunk.pageContent,
      page_number: pageNumber, // ABSOLUTE PAGE NUMBER
      chunk_index: startChunkIndex + index,
      token_count: this.encoding.encode(chunk.pageContent).length,
      // RICH METADATA
      metadata: {
        page_number: pageNumber,
        chunk_index: startChunkIndex + index,
        original_page_content: pageContent, // KEEP ORIGINAL FOR REFERENCE
        cleaned_content: chunk.pageContent,
        created_at: new Date().toISOString()
      }
    }));
  }
  
  private cleanContentForEmbedding(content: string): string {
    // REMOVE TABLES (MARKDOWN TABLE SYNTAX)
    let cleaned = content.replace(/\|.*\|/g, ''); // REMOVE TABLE ROWS
    cleaned = cleaned.replace(/\|[-:\s]+\|/g, ''); // REMOVE TABLE SEPARATORS
    
    // REMOVE EXCESSIVE PUNCTUATION
    cleaned = cleaned.replace(/[^\w\s.,!?;:()-]/g, ' '); // KEEP BASIC PUNCTUATION
    
    // CLEAN UP WHITESPACE
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }
  
  private async generateSummaries(chunks: Chunk[]): Promise<string[]> {
    const summaries = [];
    
    for (const chunk of chunks) {
      try {
        const response = await this.openaiClient.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Generate a 2-5 sentence summary of the following text. Focus on the key information and main points.'
            },
            {
              role: 'user',
              content: chunk.chunk_text
            }
          ],
          max_tokens: 150,
          temperature: 0.3
        });
        
        summaries.push(response.choices[0].message.content || '');
      } catch (error) {
        console.error('Error generating summary:', error);
        summaries.push('Summary unavailable');
      }
    }
    
    return summaries;
  }
  
  private async createEmbeddings(chunks: Chunk[]): Promise<number[][]> {
    const chunkTexts = chunks.map(chunk => chunk.chunk_text);
    const response = await this.openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: chunkTexts
    });
    return response.data.map(item => item.embedding);
  }
  
  private async storeChunks(documentId: string, chunks: Chunk[], summaries: string[], embeddings: number[][]) {
    const chunkData = chunks.map((chunk, index) => ({
      document_id: documentId,
      chunk_text: chunk.chunk_text,
      chunk_summary: summaries[index],
      embedding: embeddings[index],
      page_number: chunk.page_number,
      chunk_index: chunk.chunk_index,
      token_count: chunk.token_count,
      metadata: chunk.metadata
    }));
    
    await this.serviceClient
      .from('document_chunks')
      .insert(chunkData);
  }
}
```

#### 3. Safe Mode Upload API (1 hour)
```typescript
// NEW: app/api/teams/safe-mode/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../utils/supabase/server';
import { VectorizationService } from '../../../services/vectorization-service';
import { verifyUserAuth } from '../../../utils/auth-helpers';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { teamId, portfolioId, markdownContent, fileName } = await request.json();
    
    // VERIFY USER ACCESS
    const { user } = await verifyUserAuth(cookies());
    
    // CREATE DOCUMENT RECORD
    const serviceClient = createServiceClient();
    const { data: document, error: docError } = await serviceClient
      .from('team_documents')
      .insert({
        team_id: teamId,
        portfolio_id: portfolioId,
        original_name: fileName,
        filename: `${Date.now()}_${fileName}`,
        file_path: `teams/${teamId}/portfolios/${portfolioId}/safe-mode/${fileName}`,
        openai_file_id: 'safe-mode-upload'
      })
      .select()
      .single();
    
    if (docError) {
      throw new Error(`Failed to create document: ${docError.message}`);
    }
    
    // VECTORIZE THE MARKDOWN
    const vectorizationService = new VectorizationService();
    await vectorizationService.vectorizeUploadedMarkdown(document.id, markdownContent);
    
    return NextResponse.json({
      success: true,
      documentId: document.id,
      message: 'Document vectorized successfully'
    });
    
  } catch (error) {
    console.error('SAFE MODE UPLOAD ERROR:', error);
    return NextResponse.json({ error: 'Failed to process safe mode upload' }, { status: 500 });
  }
}
```

#### 4. Safe Mode Search API (1 hour)
```typescript
// NEW: app/api/chat/safe-mode/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../utils/supabase/server';
import { verifyUserAuth } from '../../../utils/auth-helpers';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  try {
    const { question, teamId, portfolioId } = await request.json();
    
    // VERIFY USER ACCESS
    const { user } = await verifyUserAuth(cookies());
    
    // EMBED QUESTION
    const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const embeddingResponse = await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: question
    });
    const questionEmbedding = embeddingResponse.data[0].embedding;
    
    // SEARCH VECTORS
    const serviceClient = createServiceClient();
    const { data: chunks } = await serviceClient.rpc('search_chunks', {
      query_embedding: questionEmbedding,
      team_id: teamId,
      portfolio_id: portfolioId,
      limit: 5
    });
    
    // RETURN RESULTS
    return NextResponse.json({ 
      success: true,
      question,
      sources: chunks,
      totalSources: chunks.length
    });
    
  } catch (error) {
    console.error('SAFE MODE ERROR:', error);
    return NextResponse.json({ error: 'Failed to process safe mode query' }, { status: 500 });
  }
}
```

### Frontend Implementation (To be done when UI is built)

#### 1. Safe Mode Upload Interface
- File upload for .md files only
- Support for markdown with `\n<<{page_number}>>\n` page separators
- Progress indicator during vectorization

#### 2. Safe Mode Search Interface
- Question input field
- Display top 5 most relevant sources
- Show chunk summaries and full text
- Page number references
- Similarity scores

## Implementation Summary

### Total Time: ~4 hours

**Backend Implementation:**
- Database schema extensions ✅
- Vectorization service ✅
- Safe mode upload API ✅
- Safe mode search API ✅

**Frontend Implementation (To be done):**
- Safe mode upload interface
- Safe mode search interface
- Source cards with summaries
- PDF viewer integration

### Key Features:
1. **Simple Upload**: Users upload .md files with page breaks
2. **Page-Based Chunking**: 800 tokens with 400 overlap, respecting page boundaries
3. **Vector Search**: Uses Supabase pgvector for similarity search
4. **Chunk Summaries**: Generates 2-5 sentence summaries during vectorization
5. **Clean UI**: Source cards show both summary and full text with page references
6. **Secure Access**: Maintains existing access controls

### Benefits:
- **Fast Implementation**: 4-hour backend timeline
- **Clean Architecture**: Separate from existing chat system
- **Easy Maintenance**: Simple, focused codebase
- **Scalable**: Can be enhanced with more features later

This implementation provides a working safe mode that shows users the top 5 most relevant sources for their questions, with direct references to the page numbers containing that information.
