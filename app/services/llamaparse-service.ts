import { createServiceClient } from '../utils/supabase/server';
import { LlamaParseReader } from 'llama-cloud-services';

export interface LlamaParseJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
}

export interface LlamaParseResult {
  markdown: string;
  metadata?: any;
}

export class LlamaParseService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.LLAMAPARSE_API_KEY || '';
    this.baseUrl = process.env.LLAMAPARSE_BASE_URL || 'https://cloud.llamaindex.ai';

    // DON'T THROW ERROR IN CONSTRUCTOR - CHECK IN METHODS INSTEAD
    console.log('LLAMAPARSE SERVICE INITIALIZED:', {
      hasApiKey: !!this.apiKey,
      baseUrl: this.baseUrl
    });
  }

  /**
   * SUBMIT DOCUMENT TO LLAMAPARSE FOR PROCESSING
   */
  async submitDocument(pdfBuffer: Buffer, filename: string): Promise<string> {
    try {
      // CHECK API KEY
      if (!this.apiKey) {
        throw new Error('LLAMAPARSE_API_KEY environment variable is required');
      }

      console.log(`SUBMITTING DOCUMENT TO LLAMAPARSE: ${filename}`);
      
      // SET UP LLAMAPARSE READER
      const reader = new LlamaParseReader({ 
        apiKey: this.apiKey,
        resultType: "markdown"
      });

      // CREATE TEMPORARY FILE PATH
      const tempFilePath = `/tmp/${filename}`;
      
      // WRITE BUFFER TO TEMPORARY FILE
      const fs = require('fs');
      fs.writeFileSync(tempFilePath, pdfBuffer);

      try {
        // PARSE THE DOCUMENT (THIS IS ALREADY ASYNC AND HANDLES POLLING INTERNALLY)
        const documents = await reader.loadData(tempFilePath);
        
        if (!documents || documents.length === 0) {
          throw new Error('No documents returned from LlamaParse');
        }

        // EXTRACT MARKDOWN CONTENT
        const markdown = documents.map(doc => doc.text).join('\n\n');
        
        console.log(`LLAMAPARSE PROCESSING COMPLETE: ${filename}`);
        
        // RETURN THE MARKDOWN DIRECTLY
        return markdown;
        
      } finally {
        // CLEAN UP TEMPORARY FILE
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
          console.warn('Failed to cleanup temp file:', cleanupError);
        }
      }
      
    } catch (error) {
      console.error('ERROR SUBMITTING TO LLAMAPARSE:', error);
      throw error;
    }
  }

}
