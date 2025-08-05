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

// SEND MESSAGE TO THREAD WITH TIMEOUT AND BETTER ERROR HANDLING
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