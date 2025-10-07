import OpenAI from 'openai';

// Initialize OpenAI client (same as working chat system)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface FileSearchResult {
  file_id: string;
  score?: number;
  content?: Array<{
    type: string;
    text?: string;
  }>;
}

interface ToolCall {
  type: string;
  file_search?: {
    results?: FileSearchResult[];
  };
}

interface RunStep {
  step_details?: {
    tool_calls?: ToolCall[];
  };
}

interface DetailedRun {
  id: string;
  status: string;
  model?: string;
  created_at: number;
  completed_at?: number;
  usage?: any;
  steps?: RunStep[];
}

export interface SourceInfo {
  documentName: string;
  docId: string;
  pageStart: number;
  pageEnd: number;
  relevanceScore?: number;
}

export interface ExperimentResult {
  result: string; // Markdown output
  metadata: {
    timestamp: string;
    assistantId: string;
    query: string;
    threadId: string;
    runId: string;
    status: string;
    model?: string;
    processingTime: number;
    chunkCount: number;
    tokensUsed?: any;
  };
  sources?: SourceInfo[]; // Extracted page citations
}

export class ChunksExperimentService {
  private assistantId: string;
  private query: string;

  constructor(assistantId: string, query: string) {
    this.assistantId = assistantId;
    this.query = query;
  }

  async run(): Promise<ExperimentResult> {
    console.log('🧪 Starting Chunks Experiment...');
    console.log(`Assistant ID: ${this.assistantId}`);
    console.log(`Query: ${this.query}`);
    
    const startTime = Date.now();
    
    try {
      // Step 1: Create a thread
      console.log('\n📝 Creating thread...');
      const thread = await client.beta.threads.create();
      console.log(`Thread created: ${thread.id}`);

      // Step 2: Add the user message to the thread
      console.log('\n💬 Adding message to thread...');
      await client.beta.threads.messages.create(thread.id, {
        role: 'user',
        content: this.query
      });

      // Step 3: Create and run the assistant with file search results included
      console.log('\n🤖 Running assistant...');
      console.log('🔍 Using OpenAI client for assistant:', this.assistantId);
      const run = await client.beta.threads.runs.createAndPoll(thread.id, {
        assistant_id: this.assistantId,
      });
      console.log('✅ Assistant run created successfully');

      // Step 4: Retrieve the run with detailed file search results
      console.log('\n🔍 Retrieving detailed run results...');
      
      let detailedRun: DetailedRun;
      
      // Retrieve the run details
      try {
        // Try with include parameter (might work despite TypeScript warning)
        detailedRun = await client.beta.threads.runs.retrieve(thread.id, run.id, {
          include: ['step_details.tool_calls[*].file_search.results[*].content']
        } as any) as DetailedRun;
        console.log('✅ Retrieved run with include parameter');
      } catch (includeError) {
        console.log('⚠️ Run include parameter failed, trying without...');
        detailedRun = await client.beta.threads.runs.retrieve(thread.id, run.id) as DetailedRun;
      }

      // Also try to get run steps separately
      console.log('\n🔍 Retrieving run steps...');
      let runSteps;
      try {
        // Try with include parameter (might work despite TypeScript warning)
        runSteps = await client.beta.threads.runs.steps.list(thread.id, run.id, {
          include: ['step_details.tool_calls[*].file_search.results[*].content']
        } as any);
        console.log('✅ Retrieved run steps with include parameter');
      } catch (includeError) {
        console.log('⚠️ Include parameter failed, trying without...');
        // Fallback to basic call
        runSteps = await client.beta.threads.runs.steps.list(thread.id, run.id);
      }
      
      console.log(`Found ${runSteps.data.length} run steps`);

      // Step 5: Get the assistant's response
      console.log('\n📨 Getting assistant response...');
      const messages = await client.beta.threads.messages.list(thread.id);
      const assistantMessage = messages.data.find(msg => msg.role === 'assistant');

      // Step 6: Process and format the results
      console.log('\n📊 Processing results...');
      const markdownResult = await this.processResults(detailedRun, runSteps, assistantMessage, thread.id, client);

      // Step 7: Extract sources with page ranges
      console.log('\n🔍 Extracting sources from chunks...');
      const sources = await this.extractSources(detailedRun, runSteps, client);
      console.log(`✅ Extracted ${sources.length} sources`);

      const processingTime = Date.now() - startTime;

      // Cleanup: Delete the thread
      console.log('\n🧹 Cleaning up thread...');
      await client.beta.threads.del(thread.id);
      console.log('Thread deleted.');

      console.log('\n✅ Experiment completed successfully!');

      return {
        result: markdownResult,
        metadata: {
          timestamp: new Date().toISOString(),
          assistantId: this.assistantId,
          query: this.query,
          threadId: thread.id,
          runId: detailedRun.id,
          status: detailedRun.status,
          model: detailedRun.model,
          processingTime,
          chunkCount: await this.countChunks(detailedRun, runSteps),
          tokensUsed: detailedRun.usage
        },
        sources
      };

    } catch (error) {
      console.error('❌ Experiment failed:', error);
      throw error;
    }
  }

  private async processResults(detailedRun: DetailedRun, runSteps: any, assistantMessage: any, threadId: string, openaiClient: OpenAI): Promise<string> {
    const results: string[] = [];
    
    // Header
    results.push('# Chunks Experiment Results\n');
    results.push(`**Timestamp:** ${new Date().toISOString()}\n`);
    results.push(`**Assistant ID:** ${this.assistantId}\n`);
    results.push(`**Thread ID:** ${threadId}\n`);
    results.push(`**Query:** ${this.query}\n`);
    results.push('---\n');

    // Assistant Response
    results.push('## Assistant Response\n');
    if (assistantMessage && assistantMessage.content && assistantMessage.content[0]) {
      const content = assistantMessage.content[0];
      if (content.type === 'text') {
        results.push(content.text.value);
        
        // Handle citations if present
        if (content.text.annotations && content.text.annotations.length > 0) {
          results.push('\n\n### Citations\n');
          for (let i = 0; i < content.text.annotations.length; i++) {
            const annotation = content.text.annotations[i];
            if (annotation.file_citation) {
              try {
                const file = await openaiClient.files.retrieve(annotation.file_citation.file_id);
                results.push(`[${i}] ${file.filename}\n`);
              } catch (error) {
                results.push(`[${i}] File ID: ${annotation.file_citation.file_id} (could not retrieve filename)\n`);
              }
            }
          }
        }
      }
    } else {
      results.push('*No assistant response found*');
    }
    
    results.push('\n\n---\n');

    // File Search Results (The chunks!)
    results.push('## Retrieved Chunks\n');
    
    let chunkCount = 0;
    
    // First try from detailedRun.steps
    if (detailedRun.steps) {
      for (const step of detailedRun.steps) {
        if (step.step_details && step.step_details.tool_calls) {
          for (const toolCall of step.step_details.tool_calls) {
            if (toolCall.type === 'file_search' && toolCall.file_search && toolCall.file_search.results) {
              for (const result of toolCall.file_search.results) {
                chunkCount++;
                results.push(`### Chunk ${chunkCount}\n`);
                
                // File information
                if (result.file_id) {
                  try {
                    const file = await openaiClient.files.retrieve(result.file_id);
                    results.push(`**File:** ${file.filename}\n`);
                  } catch (error) {
                    results.push(`**File ID:** ${result.file_id} (could not retrieve filename)\n`);
                  }
                }
                
                // Score
                if (result.score !== undefined) {
                  results.push(`**Relevance Score:** ${result.score}\n`);
                }
                
                // Content
                if (result.content && result.content.length > 0) {
                  results.push(`**Content:**\n`);
                  for (const contentItem of result.content) {
                    if (contentItem.type === 'text') {
                      results.push('```\n');
                      results.push(contentItem.text || '*No text content*');
                      results.push('\n```\n');
                    }
                  }
                } else {
                  results.push('*No content available*\n');
                }
                
                results.push('\n---\n');
              }
            }
          }
        }
      }
    }
    
    // If no chunks found in detailedRun, try runSteps
    if (chunkCount === 0 && runSteps && runSteps.data) {
      results.push('*Trying from run steps...*\n\n');
      
      for (const step of runSteps.data) {
        if (step.step_details && step.step_details.tool_calls) {
          for (const toolCall of step.step_details.tool_calls) {
            if (toolCall.type === 'file_search' && toolCall.file_search && toolCall.file_search.results) {
              for (const result of toolCall.file_search.results) {
                chunkCount++;
                results.push(`### Chunk ${chunkCount} (from run steps)\n`);
                
                // File information
                if (result.file_id) {
                  try {
                    const file = await openaiClient.files.retrieve(result.file_id);
                    results.push(`**File:** ${file.filename}\n`);
                  } catch (error) {
                    results.push(`**File ID:** ${result.file_id} (could not retrieve filename)\n`);
                  }
                }
                
                // Score
                if (result.score !== undefined) {
                  results.push(`**Relevance Score:** ${result.score}\n`);
                }
                
                // Content
                if (result.content && result.content.length > 0) {
                  results.push(`**Content:**\n`);
                  for (const contentItem of result.content) {
                    if (contentItem.type === 'text') {
                      results.push('```\n');
                      results.push(contentItem.text || '*No text content*');
                      results.push('\n```\n');
                    }
                  }
                } else {
                  results.push('*No content available*\n');
                }
                
                results.push('\n---\n');
              }
            }
          }
        }
      }
    }
      
    if (chunkCount === 0) {
      results.push('*No file search results found*\n');
    } else {
      results.push(`\n**Total chunks retrieved:** ${chunkCount}\n`);
    }

    // Run Details
    results.push('\n## Run Details\n');
    results.push(`**Run ID:** ${detailedRun.id}\n`);
    results.push(`**Status:** ${detailedRun.status}\n`);
    results.push(`**Model:** ${detailedRun.model || 'Not specified'}\n`);
    results.push(`**Created:** ${new Date(detailedRun.created_at * 1000).toISOString()}\n`);
    if (detailedRun.completed_at) {
      results.push(`**Completed:** ${new Date(detailedRun.completed_at * 1000).toISOString()}\n`);
    }
    
    // Usage info if available
    if (detailedRun.usage) {
      results.push(`**Tokens Used:** ${JSON.stringify(detailedRun.usage, null, 2)}\n`);
    }

    return results.join('');
  }

  private async countChunks(detailedRun: DetailedRun, runSteps: any): Promise<number> {
    let chunkCount = 0;
    
    // Count from detailedRun.steps
    if (detailedRun.steps) {
      for (const step of detailedRun.steps) {
        if (step.step_details && step.step_details.tool_calls) {
          for (const toolCall of step.step_details.tool_calls) {
            if (toolCall.type === 'file_search' && toolCall.file_search && toolCall.file_search.results) {
              chunkCount += toolCall.file_search.results.length;
            }
          }
        }
      }
    }
    
    // If no chunks found, try runSteps
    if (chunkCount === 0 && runSteps && runSteps.data) {
      for (const step of runSteps.data) {
        if (step.step_details && step.step_details.tool_calls) {
          for (const toolCall of step.step_details.tool_calls) {
            if (toolCall.type === 'file_search' && toolCall.file_search && toolCall.file_search.results) {
              chunkCount += toolCall.file_search.results.length;
            }
          }
        }
      }
    }
    
    return chunkCount;
  }

  private async extractSources(detailedRun: DetailedRun, runSteps: any, openaiClient: OpenAI): Promise<SourceInfo[]> {
    const { createServiceClient } = await import('../utils/supabase/server');
    const supabase = createServiceClient();
    
    const sourceMap = new Map<string, { pages: number[]; score: number; fileId: string }>();
    
    // Helper function to extract page numbers from text
    const extractPageNumbers = (text: string): number[] => {
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
    };
    
    // Process chunks from detailedRun.steps
    const steps = detailedRun.steps || runSteps?.data || [];
    
    for (const step of steps) {
      if (step.step_details && step.step_details.tool_calls) {
        for (const toolCall of step.step_details.tool_calls) {
          if (toolCall.type === 'file_search' && toolCall.file_search && toolCall.file_search.results) {
            for (const result of toolCall.file_search.results) {
              if (!result.file_id) continue;
              
              // Extract content text
              let contentText = '';
              if (result.content && result.content.length > 0) {
                for (const contentItem of result.content) {
                  if (contentItem.type === 'text' && contentItem.text) {
                    contentText += contentItem.text;
                  }
                }
              }
              
              // Extract page numbers from content
              const pageNumbers = extractPageNumbers(contentText);
              
              if (pageNumbers.length > 0) {
                if (!sourceMap.has(result.file_id)) {
                  sourceMap.set(result.file_id, {
                    pages: [],
                    score: result.score || 0,
                    fileId: result.file_id
                  });
                }
                
                const source = sourceMap.get(result.file_id)!;
                source.pages.push(...pageNumbers);
                // Keep highest score
                if (result.score && result.score > source.score) {
                  source.score = result.score;
                }
              }
            }
          }
        }
      }
    }
    
    // Convert to SourceInfo array with page ranges
    const sources: SourceInfo[] = [];
    
    for (const [fileId, data] of sourceMap.entries()) {
      try {
        // Get document info from team_documents by openai_file_id
        const { data: document, error: docError } = await supabase
          .from('team_documents')
          .select('id, original_name')
          .eq('openai_file_id', fileId)
          .single();
        
        if (docError || !document) {
          console.warn(`Could not find document for file_id ${fileId}`);
          continue;
        }
        
        // Get unique sorted pages
        const uniquePages = Array.from(new Set(data.pages)).sort((a, b) => a - b);
        
        if (uniquePages.length > 0) {
          sources.push({
            documentName: document.original_name,
            docId: document.id,
            pageStart: uniquePages[0],
            pageEnd: uniquePages[uniquePages.length - 1],
            relevanceScore: data.score
          });
        }
      } catch (error) {
        console.error(`Error processing file ${fileId}:`, error);
      }
    }
    
    // Sort by relevance score (highest first)
    sources.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    
    return sources;
  }
}
