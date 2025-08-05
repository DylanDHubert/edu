// THIS FILE SHOULD ONLY BE USED ON THE SERVER SIDE
// CLIENT-SIDE CODE SHOULD NOT IMPORT THIS FILE DIRECTLY

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// PORTFOLIO CONFIGURATIONS
export const PORTFOLIOS = {
  hip: {
    name: 'HIP PORTFOLIO',
    description: 'SURGICAL TECHNIQUES, PROTOCOLS, SPECIFICATIONS',
    assistantId: process.env.HIP_ASSISTANT_ID || '',
    vectorStoreId: process.env.HIP_VECTOR_STORE_ID || ''
  },
  knee: {
    name: 'KNEE PORTFOLIO',
    description: 'SURGICAL TECHNIQUES, PROTOCOLS, SPECIFICATIONS',
    assistantId: process.env.KNEE_ASSISTANT_ID || '',
    vectorStoreId: process.env.KNEE_VECTOR_STORE_ID || ''
  },
  ts_knee: {
    name: 'TS KNEE PORTFOLIO',
    description: 'SURGICAL TECHNIQUES, PROTOCOLS, SPECIFICATIONS',
    assistantId: process.env.TS_KNEE_ASSISTANT_ID || '',
    vectorStoreId: process.env.TS_KNEE_VECTOR_STORE_ID || ''
  }
} as const;

export type PortfolioType = keyof typeof PORTFOLIOS;

// GET ASSISTANT ID FOR PORTFOLIO
export async function getAssistantId(portfolioType: PortfolioType) {
  const portfolio = PORTFOLIOS[portfolioType];
  
  if (!portfolio.assistantId) {
    throw new Error(`ASSISTANT ID NOT CONFIGURED FOR ${portfolioType.toUpperCase()} PORTFOLIO`);
  }
  
  return portfolio.assistantId;
}

// CREATE NEW THREAD
export async function createThread() {
  return await client.beta.threads.create();
}

// STREAMING EVENT HANDLER FOR REAL-TIME RESPONSES
export class StreamingEventHandler {
  private messageContent = '';
  private citations: string[] = [];
  private onUpdate: (content: string, citations: string[]) => void;

  constructor(onUpdate: (content: string, citations: string[]) => void) {
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
    // MESSAGE IS COMPLETE - PROCESS CITATIONS
    const messageContent = message.content[0].text;
    const annotations = messageContent.annotations;
    
    // PROCESS CITATIONS
    for (let index = 0; index < annotations.length; index++) {
      const annotation = annotations[index];
      if (annotation.type === 'file_citation' && annotation.file_citation) {
        // REPLACE CITATION TEXT WITH NUMBERED REFERENCE
        this.messageContent = this.messageContent.replace(
          annotation.text,
          `[${index + 1}]`
        );
        
        // ADD CITATION DETAILS
        const citation = `[${index + 1}] ${annotation.file_citation.quote}`;
        this.citations.push(citation);
      }
    }
    
    // FINAL UPDATE WITH CITATIONS
    this.onUpdate(this.messageContent, this.citations);
  }
}

// SEND MESSAGE WITH STREAMING
export async function sendMessageStreaming(
  threadId: string, 
  message: string, 
  assistantId: string,
  onUpdate: (content: string, citations: string[]) => void
) {
  try {
    // ADD MESSAGE TO THREAD
    await client.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message
    });

    let messageContent = '';
    let citations: string[] = [];

    // STREAM THE RESPONSE USING EVENT LISTENERS
    const run = client.beta.threads.runs.stream(threadId, {
      assistant_id: assistantId
    })
      .on('textCreated', (text) => {
        // TEXT IS BEING CREATED - START STREAMING
        messageContent += text.value;
        onUpdate(messageContent, citations);
      })
      .on('textDelta', (textDelta, snapshot) => {
        // TEXT IS BEING UPDATED - CONTINUE STREAMING
        messageContent += textDelta.value;
        onUpdate(messageContent, citations);
      })
      .on('toolCallCreated', (toolCall) => {
        // TOOL IS BEING USED (E.G., FILE SEARCH)
        console.log('TOOL CALL:', toolCall.type);
      })
      .on('messageDone', (message) => {
        // MESSAGE IS COMPLETE - PROCESS CITATIONS
        if (message.content[0].type === 'text') {
          const textContent = message.content[0] as any;
          const annotations = textContent.text.annotations;
          
          // PROCESS CITATIONS
          for (let index = 0; index < annotations.length; index++) {
            const annotation = annotations[index];
            if (annotation.type === 'file_citation' && annotation.file_citation) {
              // REPLACE CITATION TEXT WITH NUMBERED REFERENCE
              messageContent = messageContent.replace(
                annotation.text,
                `[${index + 1}]`
              );
              
              // ADD CITATION DETAILS
              const citation = `[${index + 1}] ${annotation.file_citation.quote}`;
              citations.push(citation);
            }
          }
          
          // FINAL UPDATE WITH CITATIONS
          onUpdate(messageContent, citations);
        }
      });

    // WAIT FOR COMPLETION
    for await (const event of run) {
      // STREAM EVENTS ARE HANDLED BY THE EVENT LISTENERS
    }

    // GET FINAL MESSAGES FOR CITATIONS
    const messages = await client.beta.threads.messages.list(threadId);
    return messages.data;
  } catch (error) {
    console.error('ERROR IN SENDMESSAGESTREAMING:', error);
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