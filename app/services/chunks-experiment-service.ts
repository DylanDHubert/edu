import OpenAI from 'openai';

// Initialize OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Specific project client for historical threads
const projectClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  project: 'proj_lNxW2HsF47ntT5fS2ESTf1tW'
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
      let run;
      let activeClient = client; // Track which client worked
      
      try {
        // Try default client first
        console.log('🔍 Trying default project for assistant:', this.assistantId);
        run = await client.beta.threads.runs.createAndPoll(thread.id, {
          assistant_id: this.assistantId,
        });
        console.log('✅ Found assistant in default project');
        activeClient = client;
      } catch (error: any) {
        if (error.status === 404) {
          console.log('Assistant not found in default project, trying specific project...');
          
          // Try specific project client
          try {
            run = await projectClient.beta.threads.runs.createAndPoll(thread.id, {
              assistant_id: this.assistantId,
            });
            console.log('✅ Found assistant in specific project');
            activeClient = projectClient;
          } catch (projectError: any) {
            if (projectError.status === 404) {
              throw new Error(`Assistant ${this.assistantId} not found in either default or specific project`);
            }
            throw projectError;
          }
        } else {
          throw error;
        }
      }

      // Step 4: Retrieve the run with detailed file search results
      console.log('\n🔍 Retrieving detailed run results...');
      
      let detailedRun: DetailedRun;
      
      try {
        // First try the documented include parameter
        detailedRun = await activeClient.beta.threads.runs.retrieve(
          thread.id, 
          run.id, 
          {
            include: ['step_details.tool_calls[*].file_search.results[*].content']
          }
        ) as DetailedRun;
        console.log('✅ Retrieved with include parameter');
      } catch (error) {
        console.log('⚠️  Include parameter failed, trying without...');
        detailedRun = await activeClient.beta.threads.runs.retrieve(thread.id, run.id) as DetailedRun;
      }

      // Also try to get run steps separately
      console.log('\n🔍 Retrieving run steps...');
      const runSteps = await activeClient.beta.threads.runs.steps.list(thread.id, run.id, {
        include: ['step_details.tool_calls[*].file_search.results[*].content']
      });
      
      console.log(`Found ${runSteps.data.length} run steps`);

      // Step 5: Get the assistant's response
      console.log('\n📨 Getting assistant response...');
      const messages = await activeClient.beta.threads.messages.list(thread.id);
      const assistantMessage = messages.data.find(msg => msg.role === 'assistant');

      // Step 6: Process and format the results
      console.log('\n📊 Processing results...');
      const markdownResult = await this.processResults(detailedRun, runSteps, assistantMessage, thread.id, activeClient);

      const processingTime = Date.now() - startTime;

      // Cleanup: Delete the thread
      console.log('\n🧹 Cleaning up thread...');
      await activeClient.beta.threads.del(thread.id);
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
        }
      };

    } catch (error) {
      console.error('❌ Experiment failed:', error);
      throw error;
    }
  }

  private async processResults(detailedRun: DetailedRun, runSteps: any, assistantMessage: any, threadId: string, activeClient: OpenAI): Promise<string> {
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
                const file = await activeClient.files.retrieve(annotation.file_citation.file_id);
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
                    const file = await activeClient.files.retrieve(result.file_id);
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
                    const file = await activeClient.files.retrieve(result.file_id);
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
}
