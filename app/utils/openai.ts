// THIS FILE SHOULD ONLY BE USED ON THE SERVER SIDE
// CLIENT-SIDE CODE SHOULD NOT IMPORT THIS FILE DIRECTLY

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});



// CREATE NEW THREAD
export async function createThread() {
  return await client.beta.threads.create();
}

// STREAMING EVENT HANDLER FOR REAL-TIME RESPONSES
export class StreamingEventHandler {
  private messageContent = '';
  private citations: string[] = [];
  private onUpdate: (content: string, citations: string[], step?: string) => void;

  constructor(onUpdate: (content: string, citations: string[], step?: string) => void) {
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
    
    // LOG BACKEND CITATION DATA FOR DEBUGGING
    console.log('🔍 STREAMING HANDLER ANNOTATIONS:', JSON.stringify(messageContent.annotations, null, 2));
    
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
  onUpdate: (content: string, citations: string[], step?: string) => void
) {
  try {
    // ADD MESSAGE TO THREAD
    await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message
    });

    let messageContent = '';
    let citations: string[] = [];
    let currentStep = 'PROCESSING...';
    let runId: string | null = null;

    // SEND INITIAL STEP UPDATE
    onUpdate(messageContent, citations, currentStep);

    // STREAM THE RESPONSE USING EVENT LISTENERS
    const run = client.beta.threads.runs.stream(threadId, {
      assistant_id: assistantId
    })
      .on('runStepCreated', (step) => {
        // NEW STEP CREATED
        currentStep = `STEP ${step.step_details?.type || 'PROCESSING'}...`;
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
      .on('messageDone', (message) => {
        // MESSAGE IS COMPLETE
        currentStep = 'COMPLETE';
        if (message.content[0].type === 'text') {
          const textContent = message.content[0] as any;
          const annotations = textContent.text.annotations;
          
          // LOG BACKEND CITATION DATA FOR DEBUGGING
          console.log('🔍 BACKEND MESSAGE ANNOTATIONS:', JSON.stringify(annotations, null, 2));
          
          // EXTRACT CITATION DATA AND BUILD CITATIONS ARRAY
          const extractedCitations: string[] = [];
          
          // REPLACE CITATION PLACEHOLDERS WITH NUMBERED REFERENCES
          for (let index = 0; index < annotations.length; index++) {
            const annotation = annotations[index];
            if (annotation.type === 'file_citation') {
              messageContent = messageContent.replace(annotation.text, `[${index + 1}]`);
              
              // EXTRACT CITATION INFORMATION
              if (annotation.file_citation) {
                // USE THE ANNOTATION TEXT WHICH CONTAINS THE ACTUAL CITATION INFO
                const citationInfo = annotation.text || annotation.file_citation.quote || 'Unknown source';
                extractedCitations.push(`[${index + 1}] ${citationInfo}`);
                console.log(`📚 EXTRACTED CITATION [${index + 1}]:`, citationInfo);
              }
            }
          }
          
          console.log('📚 FINAL EXTRACTED CITATIONS:', extractedCitations);
          onUpdate(messageContent, extractedCitations, currentStep);
        }
      });

    // WAIT FOR COMPLETION
    for await (const event of run) {
      // STREAM EVENTS ARE HANDLED BY THE EVENT LISTENERS
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