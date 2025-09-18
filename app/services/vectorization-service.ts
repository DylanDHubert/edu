// SAFE MODE: VECTORIZATION SERVICE FOR MARKDOWN PROCESSING
// HANDLES PAGE-BASED CHUNKING, EMBEDDING GENERATION, AND DATABASE STORAGE

import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import OpenAI from 'openai';
import { createServiceClient } from '../utils/supabase/server';
import { ScreenshotPath } from './llamaparse-service';

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
  
  async vectorizeUploadedMarkdown(documentId: string, markdownContent: string): Promise<void> {
    console.log('SAFE MODE: STARTING VECTORIZATION FOR DOCUMENT', documentId);
    
    // 1. SPLIT BY PAGE BREAKS (<<{page_number}>>)
    const pages = this.splitByPageBreaks(markdownContent);
    console.log('SAFE MODE: FOUND', pages.length, 'PAGES');
    
    // 2. PROCESS EACH PAGE INDEPENDENTLY
    const allChunks: Chunk[] = [];
    let globalChunkIndex = 1;
    
    for (const page of pages) {
      const pageChunks = await this.chunkPageWithOverlap(page.content, page.pageNumber, globalChunkIndex);
      
      allChunks.push(...pageChunks);
      globalChunkIndex += pageChunks.length;
      
      console.log('SAFE MODE: PROCESSED PAGE', page.pageNumber, '- CREATED', pageChunks.length, 'CHUNKS');
    }
    
    console.log('SAFE MODE: TOTAL CHUNKS CREATED:', allChunks.length);
    
    // 3. GENERATE SUMMARIES AND EMBEDDINGS
    console.log('SAFE MODE: GENERATING SUMMARIES...');
    const summaries = await this.generateSummaries(allChunks);
    
    console.log('SAFE MODE: CREATING EMBEDDINGS...');
    const embeddings = await this.createEmbeddings(allChunks);
    
    // 4. STORE IN DATABASE
    console.log('SAFE MODE: STORING CHUNKS IN DATABASE...');
    await this.storeChunks(documentId, allChunks, summaries, embeddings);
    
    console.log('SAFE MODE: VECTORIZATION COMPLETE FOR DOCUMENT', documentId);
  }

  /**
   * VECTORIZE MARKDOWN WITH SCREENSHOT SUPPORT
   */
  async vectorizeWithScreenshots(documentId: string, markdownContent: string, screenshotPaths: ScreenshotPath[]): Promise<void> {
    console.log('SAFE MODE: STARTING VECTORIZATION WITH SCREENSHOTS FOR DOCUMENT', documentId);
    
    // 1. SPLIT BY PAGE BREAKS (<<{page_number}>>)
    const pages = this.splitByPageBreaks(markdownContent);
    console.log('SAFE MODE: FOUND', pages.length, 'PAGES');
    console.log('SAFE MODE: SCREENSHOTS AVAILABLE:', screenshotPaths.length);
    
    // 2. PROCESS EACH PAGE WITH SCREENSHOT REFERENCE
    const allChunks: Chunk[] = [];
    let globalChunkIndex = 1;
    
    for (const page of pages) {
      const screenshotPath = screenshotPaths.find(s => s.pageNumber === page.pageNumber);
      
      const pageChunks = await this.chunkPageWithOverlap(page.content, page.pageNumber, globalChunkIndex);
      
      // 3. ADD SCREENSHOT METADATA TO EACH CHUNK
      const chunksWithScreenshots = pageChunks.map(chunk => ({
        ...chunk,
        metadata: {
          ...chunk.metadata,
          screenshot_path: screenshotPath?.path || null,
          screenshot_filename: screenshotPath?.filename || null
        }
      }));
      
      allChunks.push(...chunksWithScreenshots);
      globalChunkIndex += pageChunks.length;
      
      console.log('SAFE MODE: PROCESSED PAGE', page.pageNumber, '- CREATED', pageChunks.length, 'CHUNKS', 
                  screenshotPath ? 'WITH SCREENSHOT' : 'NO SCREENSHOT');
    }
    
    console.log('SAFE MODE: TOTAL CHUNKS CREATED:', allChunks.length);
    
    // 4. GENERATE SUMMARIES AND EMBEDDINGS
    console.log('SAFE MODE: GENERATING SUMMARIES...');
    const summaries = await this.generateSummaries(allChunks);
    
    console.log('SAFE MODE: CREATING EMBEDDINGS...');
    const embeddings = await this.createEmbeddings(allChunks);
    
    // 5. STORE IN DATABASE
    console.log('SAFE MODE: STORING CHUNKS IN DATABASE...');
    await this.storeChunks(documentId, allChunks, summaries, embeddings);
    
    console.log('SAFE MODE: VECTORIZATION WITH SCREENSHOTS COMPLETE FOR DOCUMENT', documentId);
  }
  
  private splitByPageBreaks(content: string): { content: string; pageNumber: number }[] {
    // SPLIT BY <<{page_number}>> PATTERN AND PRESERVE PAGE NUMBERS
    const pageBreakPattern = /\r?\n<<(\d+)>>\r?\n/g;
    const parts = content.split(pageBreakPattern);
    
    const pages: { content: string; pageNumber: number }[] = [];
    
    // FIRST PART (BEFORE ANY PAGE BREAKS) IS PAGE 1
    if (parts[0] && parts[0].trim().length > 0) {
      pages.push({ content: parts[0], pageNumber: 1 });
    }
    
    // PROCESS REMAINING PARTS (PAGE NUMBERS AND CONTENT ALTERNATE)
    for (let i = 1; i < parts.length; i += 2) {
      const pageNumber = parseInt(parts[i]);
      const pageContent = parts[i + 1];
      
      if (pageNumber && pageContent && pageContent.trim().length > 0) {
        pages.push({ content: pageContent, pageNumber });
      }
    }
    
    console.log('🔍 PAGE SPLITTING DEBUG:');
    console.log('  - Total parts:', parts.length);
    console.log('  - Pages created:', pages.length);
    console.log('  - Page numbers:', pages.map(p => p.pageNumber));
    
    return pages;
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
      token_count: this.estimateTokenCount(chunk.pageContent),
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

  private estimateTokenCount(text: string): number {
    // SIMPLE TOKEN ESTIMATION: ~4 characters per token for English text
    // This is a rough approximation that works well for most cases
    return Math.ceil(text.length / 4);
  }
  
  private async generateSummaries(chunks: Chunk[]): Promise<string[]> {
    // SKIP OPENAI SUMMARIES FOR NOW - USE SIMPLE PLACEHOLDERS FOR TESTING
    console.log('SAFE MODE: SKIPPING SUMMARY GENERATION - USING PLACEHOLDERS');
    
    return chunks.map((chunk, index) => {
      // USE FIRST 100 CHARACTERS AS PLACEHOLDER SUMMARY
      const preview = chunk.chunk_text.substring(0, 100).trim();
      return `[PLACEHOLDER] ${preview}${chunk.chunk_text.length > 100 ? '...' : ''}`;
    });
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
    
    const { error } = await this.serviceClient
      .from('document_chunks')
      .insert(chunkData);
    
    if (error) {
      console.error('SAFE MODE: ERROR STORING CHUNKS:', error);
      throw new Error(`Failed to store chunks: ${error.message}`);
    }
    
    console.log('SAFE MODE: SUCCESSFULLY STORED', chunkData.length, 'CHUNKS');
  }
}
