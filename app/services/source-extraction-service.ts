import OpenAI from 'openai';
import { createServiceClient } from '../utils/supabase/server';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface SourceInfo {
  documentName: string;
  docId: string;
  pageStart: number;
  pageEnd: number;
  relevanceScore?: number;
}

export class SourceExtractionService {
  /**
   * Extract sources from OpenAI run steps with page ranges
   */
  async extractSourcesFromRun(threadId: string, runId: string): Promise<SourceInfo[]> {
    try {
      console.log(`🔍 EXTRACTING SOURCES: Thread ${threadId}, Run ${runId}`);
      
      // Fetch run steps from OpenAI
      const runSteps = await client.beta.threads.runs.steps.list(threadId, runId, {
        include: ['step_details.tool_calls[*].file_search.results[*].content']
      } as any);
      
      console.log(`📊 FOUND ${runSteps.data.length} RUN STEPS`);
      
      const sources: SourceInfo[] = [];
      const supabase = createServiceClient();
      
      // Process each run step
      for (const step of runSteps.data) {
        if (!('tool_calls' in step.step_details)) continue;
        
        const toolCalls = step.step_details.tool_calls;
        if (!toolCalls) continue;
        
        for (const toolCall of toolCalls) {
          if (toolCall.type !== 'file_search') continue;
          if (!toolCall.file_search?.results) continue;
          
          console.log(`🔎 PROCESSING ${toolCall.file_search.results.length} FILE SEARCH RESULTS`);
          
          for (const result of toolCall.file_search.results) {
            if (!result.file_id) continue;
            
            // Extract content text from this chunk
            let contentText = '';
            if (result.content && result.content.length > 0) {
              for (const contentItem of result.content) {
                if (contentItem.type === 'text' && 'text' in contentItem) {
                  contentText += contentItem.text;
                }
              }
            }
            
            // Extract page numbers from this chunk only
            const pageNumbers = this.extractPageNumbers(contentText);
            
            console.log(`📄 CHUNK ${result.file_id}: Found ${pageNumbers.length} page numbers:`, pageNumbers);
            
            if (pageNumbers.length > 0) {
              // Look up document by openai_file_id
              const { data: document, error: docError } = await supabase
                .from('course_documents')
                .select('id, original_name')
                .eq('openai_file_id', result.file_id)
                .single();
              
              console.log(`📋 DOCUMENT INFO for ${result.file_id}:`, document);
              
              if (docError || !document) {
                console.warn(`⚠️ Could not find document for file_id ${result.file_id}`);
                continue;
              }
              
              // Create a separate source for this chunk
              sources.push({
                documentName: document.original_name,
                docId: document.id,
                pageStart: pageNumbers[0],
                pageEnd: pageNumbers[pageNumbers.length - 1],
                relevanceScore: result.score || 0
              });
            }
          }
        }
      }
      
      // Sort by relevance score and return top 5
      const topSources = sources
        .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
        .slice(0, 5);
      
      console.log(`✅ EXTRACTED ${topSources.length} SOURCES:`, topSources.map(s => `${s.documentName} - Page ${s.pageStart}-${s.pageEnd}`));
      
      return topSources;
      
    } catch (error) {
      console.error('❌ ERROR EXTRACTING SOURCES:', error);
      // Return empty array on error - don't break chat
      return [];
    }
  }
  
  /**
   * Extract page numbers from text content
   * Supports both <<N>> (LlamaParse) and --- Page N --- (custom) formats
   */
  private extractPageNumbers(text: string): number[] {
    const pages = new Set<number>();
    
    // Match both formats: <<N>> and --- Page N ---
    const llamaParsePattern = /<<(\d+)>>/g;
    const customMarkerPattern = /---\s*Page\s+(\d+)\s*---/gi;
    
    let match;
    while ((match = llamaParsePattern.exec(text)) !== null) {
      pages.add(parseInt(match[1]));
    }
    while ((match = customMarkerPattern.exec(text)) !== null) {
      pages.add(parseInt(match[1]));
    }
    
    return Array.from(pages).sort((a, b) => a - b);
  }
}
