// SAFE MODE: SEARCH API FOR VECTOR SIMILARITY SEARCH
// RETURNS TOP N MOST RELEVANT SOURCES WITHOUT AI-GENERATED RESPONSES

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../utils/supabase/server';
import { verifyUserAuth } from '../../../utils/auth-helpers';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { rateLimitMiddleware, RATE_LIMITS } from '../../../utils/rate-limit';
import { sanitizeInput } from '../../../utils/security';

// TYPE DEFINITION FOR SEARCH CHUNKS RESULT
interface SearchChunkResult {
  chunk_text: string;
  chunk_summary: string;
  page_number: number;
  document_name: string;
  similarity: number;
  screenshot_path?: string;
  screenshot_filename?: string;
  document_id?: string;
}

export async function POST(request: NextRequest) {
  try {
    // APPLY RATE LIMITING FOR CHAT ENDPOINT
    const rateLimitResponse = rateLimitMiddleware(request, RATE_LIMITS.CHAT);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { question, teamId, portfolioId, limit = 5 } = await request.json();
    
    // VALIDATE REQUIRED FIELDS
    if (!question || !teamId || !portfolioId) {
      return NextResponse.json(
        { error: 'Question, team ID, and portfolio ID are required' },
        { status: 400 }
      );
    }

    // SANITIZE USER INPUT TO PREVENT XSS
    const sanitizedQuestion = sanitizeInput(question);

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const { user } = await verifyUserAuth(cookieStore);

    // VERIFY USER HAS ACCESS TO THIS TEAM/PORTFOLIO
    const serviceClient = createServiceClient();
    const { data: teamMember, error: memberError } = await serviceClient
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberError || !teamMember) {
      return NextResponse.json(
        { error: 'Access denied to this team' },
        { status: 403 }
      );
    }

    // VERIFY PORTFOLIO EXISTS
    const { data: portfolio, error: portfolioError } = await serviceClient
      .from('team_portfolios')
      .select('id, name')
      .eq('id', portfolioId)
      .eq('team_id', teamId)
      .single();

    if (portfolioError || !portfolio) {
      return NextResponse.json(
        { error: 'Portfolio not found' },
        { status: 404 }
      );
    }

    console.log('SAFE MODE: SEARCHING FOR QUESTION:', sanitizedQuestion);
    console.log('SAFE MODE: TEAM:', teamId, 'PORTFOLIO:', portfolioId);

    // EMBED QUESTION USING OPENAI
    const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const embeddingResponse = await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: sanitizedQuestion
    });
    const questionEmbedding = embeddingResponse.data[0].embedding;

    console.log('SAFE MODE: QUESTION EMBEDDED, SEARCHING VECTORS...');

    // SEARCH VECTORS USING SUPABASE FUNCTION
    const { data: chunks, error: searchError } = await serviceClient.rpc('search_chunks', {
      query_embedding: questionEmbedding,
      team_id: teamId,
      portfolio_id: portfolioId,
      result_limit: Math.min(limit, 10) // CAP AT 10 FOR PERFORMANCE
    });

    if (searchError) {
      console.error('SAFE MODE: VECTOR SEARCH ERROR:', searchError);
      return NextResponse.json(
        { error: 'Failed to search documents' },
        { status: 500 }
      );
    }

    console.log('SAFE MODE: FOUND', chunks?.length || 0, 'RELEVANT CHUNKS');

    // DEDUPLICATE BY PAGE NUMBER - KEEP HIGHEST SCORING CHUNK PER PAGE
    const pageMap = new Map<number, SearchChunkResult>();
    
    (chunks || []).forEach((chunk: SearchChunkResult) => {
      const pageNumber = chunk.page_number;
      const existingChunk = pageMap.get(pageNumber);
      
      // KEEP THE CHUNK WITH HIGHER SIMILARITY SCORE
      if (!existingChunk || chunk.similarity > existingChunk.similarity) {
        pageMap.set(pageNumber, chunk);
      }
    });
    
    // CONVERT TO ARRAY AND SORT BY SIMILARITY (DESCENDING)
    const deduplicatedChunks = Array.from(pageMap.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5); // TOP 5 PAGES MAX
    
    console.log('SAFE MODE: DEDUPLICATED TO', deduplicatedChunks.length, 'UNIQUE PAGES');

    // FORMAT RESULTS WITH ADDITIONAL METADATA INCLUDING SCREENSHOTS
    const formattedSources = deduplicatedChunks.map((chunk: SearchChunkResult, index: number) => ({
      rank: index + 1,
      chunk_text: chunk.chunk_text,
      chunk_summary: chunk.chunk_summary,
      page_number: chunk.page_number,
      document_name: chunk.document_name,
      similarity_score: Math.round(chunk.similarity * 100) / 100, // ROUND TO 2 DECIMAL PLACES
      relevance_percentage: Math.round(chunk.similarity * 100), // CONVERT TO PERCENTAGE
      screenshot_path: chunk.screenshot_path || null,
      screenshot_filename: chunk.screenshot_filename || null,
      document_id: chunk.document_id || null
    }));

    // RETURN RESULTS
    return NextResponse.json({ 
      success: true,
      question: sanitizedQuestion,
      portfolio_name: portfolio.name,
      sources: formattedSources,
      total_sources: formattedSources.length,
      search_metadata: {
        team_id: teamId,
        portfolio_id: portfolioId,
        search_timestamp: new Date().toISOString(),
        embedding_model: 'text-embedding-3-small'
      }
    });
    
  } catch (error) {
    console.error('SAFE MODE SEARCH ERROR:', error);
    return NextResponse.json(
      { error: 'Failed to process safe mode query' },
      { status: 500 }
    );
  }
}
