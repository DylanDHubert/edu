import { createServiceClient } from '../utils/supabase/server';

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
    this.baseUrl = (process.env.LLAMAPARSE_BASE_URL || 'https://api.cloud.llamaindex.ai') + '/api/v1';

    // DON'T THROW ERROR IN CONSTRUCTOR - CHECK IN METHODS INSTEAD
    console.log('LLAMAPARSE SERVICE INITIALIZED:', {
      hasApiKey: !!this.apiKey,
      baseUrl: this.baseUrl
    });
  }

  /**
   * SUBMIT DOCUMENT TO LLAMAPARSE FOR PROCESSING (GET JOB ID IMMEDIATELY)
   */
  async submitDocument(pdfBuffer: Buffer, filename: string): Promise<string> {
    try {
      // CHECK API KEY
      if (!this.apiKey) {
        throw new Error('LLAMAPARSE_API_KEY environment variable is required');
      }

      console.log(`SUBMITTING DOCUMENT TO LLAMAPARSE: ${filename}`);
      
      // CREATE FORM DATA
      const formData = new FormData();
      formData.append('file', new Blob([pdfBuffer]), filename);

      // SUBMIT TO LLAMAPARSE API
      const response = await fetch(`${this.baseUrl}/parsing/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`LLAMAPARSE UPLOAD FAILED: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const jobId = data.id;

      if (!jobId) {
        throw new Error('No job ID returned from LlamaParse');
      }

      console.log(`LLAMAPARSE JOB SUBMITTED: ${filename} -> Job ID: ${jobId}`);
      
      // RETURN THE JOB ID (NOT THE MARKDOWN)
      return jobId;
      
    } catch (error) {
      console.error('ERROR SUBMITTING TO LLAMAPARSE:', error);
      throw error;
    }
  }

  /**
   * CHECK LLAMAPARSE JOB STATUS
   */
  async checkJobStatus(jobId: string): Promise<{ status: string; progress?: number; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/parsing/job/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`LLAMAPARSE STATUS CHECK FAILED: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      console.log(`LLAMAPARSE JOB STATUS: ${jobId} -> ${data.status}`);
      
      return {
        status: data.status,
        progress: data.progress,
        error: data.error
      };
      
    } catch (error) {
      console.error('ERROR CHECKING LLAMAPARSE JOB STATUS:', error);
      throw error;
    }
  }

  /**
   * DOWNLOAD MARKDOWN FROM COMPLETED LLAMAPARSE JOB
   */
  async downloadMarkdown(jobId: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/parsing/job/${jobId}/result/markdown`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`LLAMAPARSE DOWNLOAD FAILED: ${response.status} ${response.statusText}`);
      }

      const markdown = await response.text();
      
      console.log(`LLAMAPARSE MARKDOWN DOWNLOADED: ${jobId} (${markdown.length} characters)`);
      
      return markdown;
      
    } catch (error) {
      console.error('ERROR DOWNLOADING LLAMAPARSE MARKDOWN:', error);
      throw error;
    }
  }

}
