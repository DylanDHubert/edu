import OpenAI from 'openai';
import { ThreadMessage } from '../types/assistant';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class OpenAIService {
  /**
   * GET MESSAGES FROM A THREAD
   */
  async getThreadMessages(threadId: string): Promise<ThreadMessage[] | null> {
    try {
      const messages = await client.beta.threads.messages.list(threadId);
      return messages.data.map((message: any) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        created_at: message.created_at
      }));
    } catch (error) {
      console.error(`Error fetching messages for thread ${threadId}:`, error);
      return null;
    }
  }

  /**
   * CREATE AN ASSISTANT
   */
  async createAssistant(config: any): Promise<any> {
    return await client.beta.assistants.create(config);
  }

  /**
   * EXTRACT TEXT CONTENT FROM MESSAGE
   */
  extractTextContent(message: any): string {
    if (!message.content || !Array.isArray(message.content) || message.content.length === 0) {
      return '';
    }

    const messageContent = message.content[0];
    if (messageContent.type === 'text') {
      return messageContent.text.value || '';
    }

    return '';
  }

  /**
   * DELETE AN ASSISTANT
   */
  async deleteAssistant(assistantId: string): Promise<void> {
    try {
      await client.beta.assistants.del(assistantId);
    } catch (error) {
      console.error(`Error deleting assistant ${assistantId}:`, error);
      throw error;
    }
  }

  /**
   * CREATE A VECTOR STORE
   */
  async createVectorStore(name: string): Promise<any> {
    return await (client as any).vectorStores.create({
      name
    });
  }

  /**
   * ADD FILES TO VECTOR STORE
   */
  async addFilesToVectorStore(vectorStoreId: string, fileIds: string[]): Promise<void> {
    try {
      await (client as any).vectorStores.fileBatches.createAndPoll(
        vectorStoreId,
        { file_ids: fileIds }
      );
    } catch (error) {
      console.error(`Error adding files to vector store ${vectorStoreId}:`, error);
      throw error;
    }
  }

  /**
   * GET VECTOR STORE
   */
  async getVectorStore(vectorStoreId: string): Promise<any> {
    try {
      return await (client as any).vectorStores.retrieve(vectorStoreId);
    } catch (error) {
      console.error(`Error retrieving vector store ${vectorStoreId}:`, error);
      return null;
    }
  }
}
