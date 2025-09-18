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

export interface ScreenshotData {
  pageNumber: number;
  imageData: string; // base64-encoded
  filename: string;
}

export interface ScreenshotPath {
  pageNumber: number;
  path: string;
  filename: string;
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
      
      // CREATE FORM DATA WITH SCREENSHOTS + PAGE SEPARATORS + TECHNICAL PRESET
      const formData = new FormData();
      formData.append('file', new Blob([new Uint8Array(pdfBuffer)]), filename);
      formData.append('preset', 'technicalDocumentation');
      formData.append('take_screenshot', 'true');
      formData.append('page_separator', '\n<<{pageNumber}>>\n');

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

      const responseText = await response.text();
      
      // PARSE JSON RESPONSE TO EXTRACT MARKDOWN CONTENT
      let markdown: string;
      try {
        const jsonResponse = JSON.parse(responseText);
        markdown = jsonResponse.markdown || responseText;
      } catch (parseError) {
        // IF NOT JSON, USE RAW TEXT
        markdown = responseText;
      }
      
      console.log(`LLAMAPARSE MARKDOWN DOWNLOADED: ${jobId} (${markdown.length} characters)`);
      
      return markdown;
      
    } catch (error) {
      console.error('ERROR DOWNLOADING LLAMAPARSE MARKDOWN:', error);
      throw error;
    }
  }

  /**
   * DOWNLOAD SCREENSHOT FOR SPECIFIC PAGE
   */
  async downloadPageScreenshot(jobId: string, pageNumber: number): Promise<{
    imageData: string; // base64-encoded
    pageNumber: number;
  }> {
    try {
      const imageName = `page_${pageNumber}.jpg`;
      const screenshotUrl = `${this.baseUrl}/parsing/job/${jobId}/result/image/${imageName}`;
      console.log(`🔍 DEBUG: Attempting to download screenshot from: ${screenshotUrl}`);
      
      const response = await fetch(screenshotUrl, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`SCREENSHOT DOWNLOAD FAILED: ${response.status} ${response.statusText}`);
      }

      const imageBuffer = await response.arrayBuffer();
      const imageData = Buffer.from(imageBuffer).toString('base64');
      
      console.log(`LLAMAPARSE SCREENSHOT DOWNLOADED: ${jobId} page ${pageNumber} (${imageBuffer.byteLength} bytes)`);
      
      return { imageData, pageNumber };
      
    } catch (error) {
      console.error('ERROR DOWNLOADING SCREENSHOT:', error);
      throw error;
    }
  }

  /**
   * DOWNLOAD ALL SCREENSHOTS FOR A DOCUMENT
   */
  async downloadAllScreenshots(jobId: string, pageNumbers: number[]): Promise<ScreenshotData[]> {
    const screenshots: ScreenshotData[] = [];
    
    console.log(`DOWNLOADING SCREENSHOTS FOR ${pageNumbers.length} PAGES: ${jobId}`);
    console.log(`PAGE NUMBERS TO DOWNLOAD:`, pageNumbers);
    
    // DOWNLOAD SCREENSHOTS FOR EACH PAGE NUMBER
    for (const pageNumber of pageNumbers) {
      try {
        const screenshot = await this.downloadPageScreenshot(jobId, pageNumber);
        screenshots.push({
          pageNumber: pageNumber,
          imageData: screenshot.imageData,
          filename: `page_${pageNumber}.jpg`
        });
        
        console.log(`SCREENSHOT DOWNLOADED: page ${pageNumber}`);
      } catch (error) {
        console.error(`FAILED TO DOWNLOAD SCREENSHOT FOR PAGE ${pageNumber}:`, error);
        // CONTINUE WITH OTHER PAGES EVEN IF ONE FAILS
      }
    }
    
    console.log(`SCREENSHOT DOWNLOAD COMPLETE: ${screenshots.length}/${pageNumbers.length} pages downloaded`);
    return screenshots;
  }

  /**
   * EXTRACT PAGE NUMBERS FROM MARKDOWN CONTENT
   */
  extractPageNumbers(markdown: string): number[] {
    const pageBreakPattern = /\r?\n<<\d+>>\r?\n/g;
    const matches = markdown.match(pageBreakPattern);
    
    if (!matches || matches.length === 0) {
      return [1]; // Single page if no breaks found
    }
    
    // EXTRACT PAGE NUMBERS FROM MATCHES
    const pageNumbers = matches.map(match => {
      const pageNum = match.match(/<<(\d+)>>/);
      return pageNum ? parseInt(pageNum[1]) : 0;
    }).filter(num => num > 0);
    
    // ADD PAGE 1 IF NOT PRESENT (BEFORE FIRST PAGE BREAK)
    const allPageNumbers = [1, ...pageNumbers];
    
    // REMOVE DUPLICATES AND SORT
    return [...new Set(allPageNumbers)].sort((a, b) => a - b);
  }

  /**
   * EXTRACT PAGE COUNT FROM MARKDOWN CONTENT
   */
  extractPageCount(markdown: string): number {
    const pageBreakPattern = /\r?\n<<\d+>>\r?\n/g;
    const matches = markdown.match(pageBreakPattern);
    
    console.log('🔍 PAGE COUNT DEBUG:');
    console.log('  - Markdown length:', markdown.length);
    console.log('  - First 500 chars:', markdown.substring(0, 500));
    console.log('  - Page break pattern:', pageBreakPattern);
    console.log('  - Matches found:', matches);
    
    if (!matches || matches.length === 0) {
      console.log('  - No page breaks found, assuming 1 page');
      return 1;
    }
    
    // EXTRACT PAGE NUMBERS FROM MATCHES
    const pageNumbers = matches.map(match => {
      const pageNum = match.match(/<<(\d+)>>/);
      return pageNum ? parseInt(pageNum[1]) : 0;
    }).filter(num => num > 0);
    
    console.log('  - Extracted page numbers:', pageNumbers);
    
    if (pageNumbers.length === 0) {
      console.log('  - No valid page numbers found, assuming 1 page');
      return 1;
    }
    
    // FIND THE ACTUAL PAGE COUNT
    const minPage = Math.min(...pageNumbers);
    const maxPage = Math.max(...pageNumbers);
    const actualPageCount = maxPage - minPage + 1;
    
    console.log('  - Min page:', minPage, 'Max page:', maxPage);
    console.log('  - Calculated total pages:', actualPageCount);
    
    return actualPageCount;
  }

}
