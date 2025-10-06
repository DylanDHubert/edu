// THIS FILE SHOULD ONLY BE USED ON THE SERVER SIDE
// CLIENT-SIDE CODE SHOULD NOT IMPORT THIS FILE DIRECTLY

import OpenAI from 'openai';
import { ChatService } from '../services/chat-service';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});



// CREATE NEW THREAD
export async function createThread(initialMessage?: string) {
  const thread = await client.beta.threads.create();
  
  if (initialMessage) {
    await client.beta.threads.messages.create(thread.id, {
      role: 'assistant',
      content: initialMessage,
      metadata: { 
        hidden: 'true', 
        messageType: 'system_context' 
      }
    });
  }
  
  return thread;
}

// STREAMING EVENT HANDLER FOR REAL-TIME RESPONSES
export class StreamingEventHandler {
  private messageContent = '';
  private citations: string[] = [];
  private citationData: Array<{
    citationNumber: number;
    fileId: string;
    quote: string;
    fullChunkContent?: string;
    fileName?: string;
    relevanceScore?: number;
  }> = [];
  private onUpdate: (content: string, citations: string[], step?: string, citationData?: any[]) => void;

  constructor(onUpdate: (content: string, citations: string[], step?: string, citationData?: any[]) => void) {
    this.onUpdate = onUpdate;
  }

  onTextCreated(text: any) {
    // TEXT IS BEING CREATED - START STREAMING
    this.messageContent += text.value;
    this.onUpdate(this.messageContent, this.citations);
  }

  onTextDelta(delta: any) {
    // TEXT IS BEING UPDATED - CONTINUE STREAMING
    this.messageContent += delta.value;
    this.onUpdate(this.messageContent, this.citations);
  }

  onToolCallCreated(toolCall: any) {
    // TOOL IS BEING USED (E.G., FILE SEARCH)
    console.log('TOOL CALL:', toolCall.type);
  }

  onMessageDone(message: any) {
    // MESSAGE IS COMPLETE
    const messageContent = message.content[0].text;
    
    
    // EXTRACT CITATION DATA AND BUILD CITATIONS ARRAY
    let processedContent = messageContent.value;
    const annotations = messageContent.annotations;
    const extractedCitations: string[] = [];
    
    for (let index = 0; index < annotations.length; index++) {
      const annotation = annotations[index];
      if (annotation.type === 'file_citation') {
        processedContent = processedContent.replace(annotation.text, `[${index + 1}]`);
        
        // EXTRACT CITATION INFORMATION
        if (annotation.file_citation) {
          // USE THE ANNOTATION TEXT WHICH CONTAINS THE ACTUAL CITATION INFO
          const citationInfo = annotation.text || annotation.file_citation.quote || 'Unknown source';
          extractedCitations.push(`[${index + 1}] ${citationInfo}`);
          console.log(`📚 STREAMING CITATION [${index + 1}]:`, citationInfo);
        }
      }
    }
    
    console.log('📚 STREAMING FINAL CITATIONS:', extractedCitations);
    this.messageContent = processedContent;
    this.onUpdate(this.messageContent, extractedCitations, 'COMPLETE');
  }
}

// SEND MESSAGE WITH STREAMING
export async function sendMessageStreaming(
  threadId: string, 
  message: string, 
  assistantId: string,
  onUpdate: (content: string, citations: string[], step?: string, citationData?: any[], openaiMessageId?: string, sources?: any[]) => void,
  userId: string
) {
  try {
    // START STREAMING MESSAGE PROCESSING
    
    // ADD MESSAGE TO THREAD
    await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message
    });

    let messageContent = '';
    let citations: string[] = [];
    let citationData: Array<{
      citationNumber: number;
      fileId: string;
      quote: string;
      fullChunkContent?: string;
      fileName?: string;
      relevanceScore?: number;
    }> = [];
    let currentStep = 'PROCESSING...';
    let runId: string | null = null;

    // SEND INITIAL STEP UPDATE
    onUpdate(messageContent, citations, currentStep);

    // STREAM THE RESPONSE USING EVENT LISTENERS
    const run = client.beta.threads.runs.stream(threadId, {
      assistant_id: assistantId
    })
      .on('run', (run) => {
        // CAPTURE RUN ID FOR LATER USE
        runId = run.id;
        // RUN CREATED - ASSISTANT IS STARTING TO PROCESS
      })
      .on('runStepCreated', (step) => {
        // NEW STEP CREATED
        currentStep = `STEP ${step.step_details?.type || 'PROCESSING'}...`;
        // CAPTURE RUN ID FROM STEP FOR LATER CHUNK RETRIEVAL
        if (!runId) {
          runId = step.run_id;
        }
        onUpdate(messageContent, citations, currentStep);
      })
      .on('runStepDelta', (delta, snapshot) => {
        // STEP UPDATED
        if (delta.step_details?.type === 'tool_calls') {
          const toolCalls = delta.step_details.tool_calls;
          if (toolCalls && toolCalls.length > 0) {
            const toolType = toolCalls[0].type;
            if (toolType === 'file_search') {
              currentStep = 'SEARCHING DOCUMENTS...';
              onUpdate(messageContent, citations, currentStep);
            }
          }
        }
      })
      .on('textCreated', (text) => {
        // TEXT IS BEING CREATED - START STREAMING
        currentStep = 'GENERATING RESPONSE...';
        // DON'T ADD CONTENT HERE - IT WILL BE ADDED IN TEXTDELTA
        onUpdate(messageContent, citations, currentStep);
      })
      .on('textDelta', (textDelta, snapshot) => {
        // TEXT IS BEING UPDATED - CONTINUE STREAMING
        messageContent += textDelta.value;
        onUpdate(messageContent, citations, currentStep);
      })
      .on('toolCallCreated', (toolCall) => {
        // TOOL IS BEING USED (E.G., FILE SEARCH)
        if (toolCall.type === 'file_search') {
          currentStep = 'SEARCHING FILES...';
        } else if (toolCall.type === 'code_interpreter') {
          currentStep = 'RUNNING CODE...';
        } else {
          currentStep = `USING ${toolCall.type.toUpperCase()}...`;
        }
        onUpdate(messageContent, citations, currentStep);
      })
      .on('messageDone', async (message) => {
        // MESSAGE IS COMPLETE
        currentStep = 'COMPLETE';
        // MESSAGE COMPLETE - EXTRACT CITATIONS FROM ANNOTATIONS
        if (message.content[0].type === 'text') {
          const textContent = message.content[0] as any;
          const annotations = textContent.text.annotations;
          // PROCESS FILE CITATION ANNOTATIONS
          
          // EXTRACT CITATION DATA AND BUILD CITATIONS ARRAY
          const extractedCitations: string[] = [];
          
          // REPLACE CITATION PLACEHOLDERS WITH NUMBERED REFERENCES
          for (let index = 0; index < annotations.length; index++) {
            const annotation = annotations[index];
            // EXTRACT CITATION DATA FROM ANNOTATION
            if (annotation.type === 'file_citation') {
              messageContent = messageContent.replace(annotation.text, `[${index + 1}]`);
              
              // EXTRACT CITATION INFORMATION
              if (annotation.file_citation) {
                const citationInfo = annotation.text || annotation.file_citation.quote || 'Unknown source';
                extractedCitations.push(`[${index + 1}] ${citationInfo}`);
                
                // STORE DETAILED CITATION DATA
                citationData.push({
                  citationNumber: index + 1,
                  fileId: annotation.file_citation.file_id,
                  quote: annotation.file_citation.quote || citationInfo,
                  fileName: undefined, // WILL BE FILLED LATER
                  fullChunkContent: undefined, // WILL BE FILLED LATER
                  relevanceScore: undefined // WILL BE FILLED LATER
                });
                
                // CITATION DATA ADDED TO ARRAY
              }
            }
          }
          
          onUpdate(messageContent, extractedCitations, currentStep, citationData, message.id);
        }
      });

    // WAIT FOR COMPLETION
    for await (const event of run) {
      // STREAM EVENTS ARE HANDLED BY THE EVENT LISTENERS
    }

    // GET RUN ID FROM THE RUN OBJECT IF NOT CAPTURED
    if (!runId && run) {
      // FALLBACK: TRY TO GET RUN ID FROM RUN OBJECT
      const currentRun = run.currentRun();
      if (currentRun) {
        runId = currentRun.id;
      }
    }

    // STREAMING COMPLETE - NOW RETRIEVE DETAILED CHUNK CONTENT

    // AFTER STREAMING IS COMPLETE, GET CHUNK CONTENT
    try {
      if (runId) {
        // GET RUN STEPS WITH FULL CHUNK CONTENT
        const runSteps = await client.beta.threads.runs.steps.list(threadId, runId, {
          include: ['step_details.tool_calls[*].file_search.results[*].content']
        } as any);
        
        // MATCH CITATION DATA WITH CHUNK CONTENT FROM RUN STEPS
        
        // EXTRACT CHUNK CONTENT FROM RUN STEPS
        for (const step of runSteps.data) {
          // PROCESS EACH RUN STEP
          if (step.step_details && step.step_details.type === 'tool_calls' && 'tool_calls' in step.step_details) {
            for (const toolCall of step.step_details.tool_calls) {
              // CHECK FOR FILE SEARCH TOOL CALLS
              if (toolCall.type === 'file_search' && toolCall.file_search && toolCall.file_search.results) {
                // PROCESS FILE SEARCH RESULTS
                for (const result of toolCall.file_search.results) {
                  // PROCESS EACH FILE SEARCH RESULT
                  
                  // MATCH THIS RESULT TO OUR CITATION DATA
                  const citationIndex = citationData.findIndex(c => c.fileId === result.file_id);
                  // MATCH RESULT TO EXISTING CITATION DATA
                  
                  if (citationIndex !== -1) {
                    // GET FILE NAME
                    try {
                      const file = await client.files.retrieve(result.file_id);
                      citationData[citationIndex].fileName = file.filename;
                      // FILENAME RETRIEVED SUCCESSFULLY
                    } catch (error) {
                      console.log('Could not retrieve filename for file:', result.file_id);
                    }
                    
                    // GET CHUNK CONTENT
                    if (result.content && result.content.length > 0) {
                      const chunkContent = result.content
                        .filter((content: any) => content.type === 'text')
                        .map((content: any) => content.text)
                        .join('\n\n');
                      citationData[citationIndex].fullChunkContent = chunkContent;
                      // CHUNK CONTENT RETRIEVED SUCCESSFULLY
                    } else {
                      // NO CONTENT AVAILABLE FOR THIS FILE
                    }
                    
                    // GET RELEVANCE SCORE
                    if (result.score !== undefined) {
                      citationData[citationIndex].relevanceScore = result.score;
                      // RELEVANCE SCORE RETRIEVED
                    }
                  }
                }
              }
            }
          }
        }
        
        // CITATION DATA COMPLETE - SEND FINAL UPDATE
        
        // STORE CITATIONS IN DATABASE AFTER STREAMING COMPLETES
        if (citationData.length > 0) {
          try {
            // GET THE LATEST MESSAGE ID FROM THE THREAD
            const messages = await client.beta.threads.messages.list(threadId, { limit: 1 });
            if (messages.data.length > 0) {
              const latestMessage = messages.data[0];
              const openaiMessageId = latestMessage.id;
              
              // SEND FINAL UPDATE WITH COMPLETE CITATION DATA AND MESSAGE ID
              onUpdate(messageContent, citations, 'COMPLETE', citationData, openaiMessageId);
              
              // PREPARE CITATION DATA FOR DATABASE STORAGE
              const citationsForStorage = citationData.map(citation => ({
                citation_number: citation.citationNumber,
                file_id: citation.fileId,
                quote: citation.quote,
                full_chunk_content: citation.fullChunkContent,
                file_name: citation.fileName,
                relevance_score: citation.relevanceScore
              }));
              
              // STORE CITATIONS IN DATABASE
              await storeCitationsInDatabase(threadId, openaiMessageId, citationsForStorage, userId);
              
              // EXTRACT SOURCES FOR PAGE CITATIONS
              console.log(`🚀 ABOUT TO START SOURCE EXTRACTION for thread ${threadId}, run ${runId}`);
              try {
                console.log(`🚀 STARTING SOURCE EXTRACTION for thread ${threadId}, run ${runId}`);
                const { SourceExtractionService } = await import('../services/source-extraction-service');
                console.log(`📦 SOURCE EXTRACTION SERVICE IMPORTED`);
                const sourceService = new SourceExtractionService();
                console.log(`🔧 SOURCE SERVICE CREATED`);
                const sources = await sourceService.extractSourcesFromRun(threadId, runId);
                
                console.log(`📤 SENDING SOURCES TO FRONTEND:`, sources);
                // Send sources in final update
                onUpdate(messageContent, citations, 'COMPLETE', citationData, openaiMessageId, sources);
                console.log(`✅ SOURCES SENT: ${sources.length} sources found`);
              } catch (sourceError) {
                console.error('❌ ERROR EXTRACTING SOURCES:', sourceError);
                // Continue without sources if extraction fails
                onUpdate(messageContent, citations, 'COMPLETE', citationData, openaiMessageId);
              }
            }
          } catch (error) {
            console.error('ERROR STORING CITATIONS IN DATABASE:', error);
            // DON'T THROW - CITATIONS STORAGE FAILURE SHOULD NOT BREAK THE CHAT
          }
        } else {
          // NO CITATIONS - STILL SEND FINAL UPDATE WITH MESSAGE ID
          try {
            const messages = await client.beta.threads.messages.list(threadId, { limit: 1 });
            if (messages.data.length > 0) {
              const latestMessage = messages.data[0];
              const openaiMessageId = latestMessage.id;
              onUpdate(messageContent, citations, 'COMPLETE', citationData, openaiMessageId);
            }
          } catch (error) {
            console.log('Could not get message ID for final update:', error);
            onUpdate(messageContent, citations, 'COMPLETE', citationData);
          }
        }
      }
    } catch (error) {
      console.log('Could not retrieve chunk content from run steps:', error);
    }
  } catch (error) {
    console.error('ERROR IN STREAMING:', error);
    throw error;
  }
}

// SEND MESSAGE TO THREAD WITH TIMEOUT AND BETTER ERROR HANDLING (NON-STREAMING)
export async function sendMessage(threadId: string, message: string, assistantId: string) {
  const TIMEOUT_MS = 60000; // 60 SECOND TIMEOUT
  const POLL_INTERVAL_MS = 1000; // 1 SECOND POLLING
  
  try {
    // ADD MESSAGE TO THREAD
    await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message
    });

    // RUN ASSISTANT
    const run = await client.beta.threads.runs.create(threadId, {
      assistant_id: assistantId
    });

    // POLL FOR COMPLETION WITH TIMEOUT
    let runStatus = await client.beta.threads.runs.retrieve(threadId, run.id);
    let attempts = 0;
    const maxAttempts = TIMEOUT_MS / POLL_INTERVAL_MS;
    
    while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      runStatus = await client.beta.threads.runs.retrieve(threadId, run.id);
      attempts++;
      
      // CHECK FOR TIMEOUT
      if (attempts >= maxAttempts) {
        throw new Error('ASSISTANT RESPONSE TIMEOUT - PLEASE TRY AGAIN');
      }
      
      // CHECK FOR FAILED STATUS
      if (runStatus.status === 'failed') {
        throw new Error(`ASSISTANT RUN FAILED: ${runStatus.last_error?.message || 'UNKNOWN ERROR'}`);
      }
      
      // CHECK FOR CANCELLED STATUS
      if (runStatus.status === 'cancelled') {
        throw new Error('ASSISTANT RUN WAS CANCELLED');
      }
    }

    // VERIFY SUCCESSFUL COMPLETION
    if (runStatus.status !== 'completed') {
      throw new Error(`ASSISTANT RUN ENDED WITH STATUS: ${runStatus.status}`);
    }

    // GET MESSAGES
    const messages = await client.beta.threads.messages.list(threadId);
    
    // EXTRACT SOURCES FROM RUN STEPS (for source citations)
    try {
      const { SourceExtractionService } = await import('../services/source-extraction-service');
      const sourceService = new SourceExtractionService();
      const sources = await sourceService.extractSourcesFromRun(threadId, run.id);
      
      // Add sources to the last assistant message
      if (messages.data.length > 0) {
        const lastMessage = messages.data[0];
        if (lastMessage.role === 'assistant') {
          // Add sources as metadata to the message
          (lastMessage as any).sources = sources;
          console.log(`SOURCES EXTRACTED: ${sources.length} sources found`);
        }
      }
    } catch (sourceError) {
      console.error('ERROR EXTRACTING SOURCES:', sourceError);
      // Continue without sources if extraction fails
    }
    
    return messages.data;
  } catch (error) {
    console.error('ERROR IN SENDMESSAGE:', error);
    throw error; // RE-THROW TO BE HANDLED BY CALLER
  }
}

// GET THREAD MESSAGES
export async function getThreadMessages(threadId: string) {
  const messages = await client.beta.threads.messages.list(threadId);
  return messages.data;
}

// DELETE OPENAI ASSISTANT
export async function deleteAssistant(assistantId: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`🤖 DELETING OPENAI ASSISTANT: ${assistantId}`);
    await client.beta.assistants.del(assistantId);
    console.log(`✅ SUCCESSFULLY DELETED ASSISTANT: ${assistantId}`);
    return { success: true };
  } catch (error: any) {
    // Handle "already deleted" case gracefully
    if (error.status === 404) {
      console.log(`⚠️ ASSISTANT ALREADY DELETED: ${assistantId}`);
      return { success: true };
    }
    console.error(`❌ ERROR DELETING ASSISTANT ${assistantId}:`, error);
    return { success: false, error: error.message || 'Failed to delete assistant' };
  }
}

// DELETE OPENAI VECTOR STORE
export async function deleteVectorStore(vectorStoreId: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`🗃️ DELETING OPENAI VECTOR STORE: ${vectorStoreId}`);
    await (client as any).vectorStores.del(vectorStoreId);
    console.log(`✅ SUCCESSFULLY DELETED VECTOR STORE: ${vectorStoreId}`);
    return { success: true };
  } catch (error: any) {
    // Handle "already deleted" case gracefully
    if (error.status === 404) {
      console.log(`⚠️ VECTOR STORE ALREADY DELETED: ${vectorStoreId}`);
      return { success: true };
    }
    console.error(`❌ ERROR DELETING VECTOR STORE ${vectorStoreId}:`, error);
    return { success: false, error: error.message || 'Failed to delete vector store' };
  }
}

// STORE CITATIONS IN DATABASE
async function storeCitationsInDatabase(threadId: string, openaiMessageId: string, citations: any[], userId: string) {
  try {
    console.log(`📚 STORING ${citations.length} CITATIONS FOR MESSAGE ${openaiMessageId}`);
    
    // USE CHAT SERVICE DIRECTLY INSTEAD OF HTTP REQUEST
    const chatService = new ChatService();
    const result = await chatService.storeMessageCitations({
      threadId,
      openaiMessageId,
      citations
    }, userId);

    if (!result.success) {
      throw new Error(`Failed to store citations: ${result.error}`);
    }

    console.log(`✅ SUCCESSFULLY STORED CITATIONS FOR MESSAGE ${openaiMessageId}`);
  } catch (error) {
    console.error(`❌ ERROR STORING CITATIONS FOR MESSAGE ${openaiMessageId}:`, error);
    throw error;
  }
}

// DELETE MULTIPLE OPENAI RESOURCES WITH ERROR HANDLING
export async function deleteOpenAIResources(resources: {
  assistants: string[];
  vectorStores: string[];
}): Promise<{ 
  success: boolean; 
  deletedAssistants: string[]; 
  deletedVectorStores: string[]; 
  errors: string[] 
}> {
  const deletedAssistants: string[] = [];
  const deletedVectorStores: string[] = [];
  const errors: string[] = [];

  // DELETE ASSISTANTS FIRST (they reference vector stores)
  for (const assistantId of resources.assistants) {
    const result = await deleteAssistant(assistantId);
    if (result.success) {
      deletedAssistants.push(assistantId);
    } else {
      errors.push(`Assistant ${assistantId}: ${result.error}`);
    }
  }

  // DELETE VECTOR STORES SECOND
  for (const vectorStoreId of resources.vectorStores) {
    const result = await deleteVectorStore(vectorStoreId);
    if (result.success) {
      deletedVectorStores.push(vectorStoreId);
    } else {
      errors.push(`Vector Store ${vectorStoreId}: ${result.error}`);
    }
  }

  return {
    success: errors.length === 0,
    deletedAssistants,
    deletedVectorStores,
    errors
  };
} 