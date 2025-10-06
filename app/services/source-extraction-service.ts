import { createServiceClient } from '../utils/supabase/server';
import OpenAI from 'openai';

export interface SourceInfo {
  documentName: string;
  pageNumber: number;
  docId: string;
  relevanceScore?: number;
}

export class SourceExtractionService {
  private serviceClient = createServiceClient();
  private openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  /**
   * EXTRACT SOURCES FROM CHAT RESPONSE
   */
  async extractSourcesFromRun(
    threadId: string, 
    runId: string
  ): Promise<SourceInfo[]> {
    try {
      console.log(`EXTRACTING SOURCES: Thread ${threadId}, Run ${runId}`);
      
      // Get run steps with chunk content (using existing analytics code)
      const runSteps = await this.openaiClient.beta.threads.runs.steps.list(threadId, runId, {
        include: ['step_details.tool_calls[*].file_search.results[*].content']
      } as any);
      
      console.log(`FOUND ${runSteps.data.length} RUN STEPS`);
      
      const sources: SourceInfo[] = [];
      
      // Process each run step
      for (const step of runSteps.data) {
        if (step.step_details && 'tool_calls' in step.step_details && step.step_details.tool_calls) {
          for (const toolCall of step.step_details.tool_calls) {
            if (toolCall.type === 'file_search' && toolCall.file_search && toolCall.file_search.results) {
              console.log(`PROCESSING ${toolCall.file_search.results.length} FILE SEARCH RESULTS`);
              
              for (const result of toolCall.file_search.results) {
                if (result.content && result.content.length > 0) {
                  // Extract page numbers from chunk content
                  const pageNumbers = this.extractPageNumbersFromChunk(result.content);
                  
                  if (pageNumbers.length > 0) {
                    // Get document info for this file
                    const documentInfo = await this.getDocumentInfo(result.file_id);
                    
                    if (documentInfo) {
                      // Create source entries for each page number found
                      for (const pageNumber of pageNumbers) {
                        sources.push({
                          documentName: documentInfo.originalName,
                          pageNumber: pageNumber,
                          docId: documentInfo.docId,
                          relevanceScore: result.score
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      // Deduplicate sources (same document + page combination)
      const deduplicatedSources = this.deduplicateSources(sources);
      
      // Sort by relevance score and limit to top 5
      const topSources = deduplicatedSources
        .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
        .slice(0, 5);
      
      console.log(`EXTRACTED ${topSources.length} SOURCES:`, topSources.map(s => `${s.documentName} - Page ${s.pageNumber}`));
      
      return topSources;
      
    } catch (error) {
      console.error('ERROR EXTRACTING SOURCES:', error);
      return [];
    }
  }

  /**
   * EXTRACT PAGE NUMBERS FROM CHUNK CONTENT
   */
  private extractPageNumbersFromChunk(content: any[]): number[] {
    const pageNumbers: number[] = [];
    
    for (const contentItem of content) {
      if (contentItem.type === 'text' && contentItem.text) {
        // Look for page markers: --- Page N ---
        const pageMatches = contentItem.text.match(/--- Page (\d+) ---/g);
        
        if (pageMatches) {
          for (const match of pageMatches) {
            const pageNumber = parseInt(match.match(/\d+/)?.[0] || '0');
            if (pageNumber > 0) {
              pageNumbers.push(pageNumber);
            }
          }
        }
      }
    }
    
    // Remove duplicates and sort
    return [...new Set(pageNumbers)].sort((a, b) => a - b);
  }

  /**
   * GET DOCUMENT INFO FROM OPENAI FILE ID
   */
  private async getDocumentInfo(fileId: string): Promise<{originalName: string, docId: string} | null> {
    try {
      const { data: document } = await this.serviceClient
        .from('team_documents')
        .select('id, original_name')
        .eq('openai_file_id', fileId)
        .single();
      
      if (document) {
        return {
          originalName: document.original_name,
          docId: document.id
        };
      }
      
      return null;
    } catch (error) {
      console.error('ERROR GETTING DOCUMENT INFO:', error);
      return null;
    }
  }

  /**
   * DEDUPLICATE SOURCES BY DOCUMENT + PAGE
   */
  private deduplicateSources(sources: SourceInfo[]): SourceInfo[] {
    const seen = new Set<string>();
    const deduplicated: SourceInfo[] = [];
    
    for (const source of sources) {
      const key = `${source.docId}-${source.pageNumber}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(source);
      }
    }
    
    return deduplicated;
  }
}
