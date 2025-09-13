import { createServiceClient } from '../utils/supabase/server';
import { LlamaParseService } from './llamaparse-service';
import OpenAI from 'openai';

export interface ProcessingJob {
  id: string;
  teamId: string;
  portfolioId: string;
  documentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessingResult {
  success: boolean;
  openaiFileId?: string;
  error?: string;
}

export class DocumentProcessingService {
  private serviceClient = createServiceClient();
  private llamaparseService = new LlamaParseService();
  private openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  /**
   * CREATE A NEW PROCESSING JOB
   */
  async createJob(teamId: string, portfolioId: string, documentId: string): Promise<string> {
    try {
      console.log(`CREATING PROCESSING JOB: ${documentId}`);
      
      // UPDATE DOCUMENT STATUS TO PROCESSING
      const { error: updateError } = await this.serviceClient
        .from('team_documents')
        .update({ 
          openai_file_id: 'processing'
        })
        .eq('id', documentId)
        .eq('team_id', teamId)
        .eq('portfolio_id', portfolioId);

      if (updateError) {
        console.error('ERROR UPDATING DOCUMENT STATUS:', updateError);
        throw new Error(`Failed to update document status: ${updateError.message}`);
      }

      console.log(`PROCESSING JOB CREATED FOR DOCUMENT: ${documentId}`);
      return documentId;
    } catch (error) {
      console.error('ERROR CREATING PROCESSING JOB:', error);
      throw error;
    }
  }

  /**
   * UPDATE JOB STATUS
   */
  async updateJobStatus(documentId: string, status: string, progress?: number, error?: string): Promise<void> {
    try {
      console.log(`UPDATING JOB STATUS: ${documentId} -> ${status}`);
      
      const updateData: any = {};

      // MAP STATUS TO OPENAI_FILE_ID FIELD
      switch (status) {
        case 'processing':
          updateData.openai_file_id = 'processing';
          break;
        case 'failed':
          updateData.openai_file_id = 'failed';
          break;
        case 'completed':
          // KEEP EXISTING OPENAI_FILE_ID IF COMPLETED
          break;
        default:
          updateData.openai_file_id = status;
      }

      const { error: updateError } = await this.serviceClient
        .from('team_documents')
        .update(updateData)
        .eq('id', documentId);

      if (updateError) {
        console.error('ERROR UPDATING JOB STATUS:', updateError);
        throw new Error(`Failed to update job status: ${updateError.message}`);
      }

      console.log(`JOB STATUS UPDATED: ${documentId} -> ${status}`);
    } catch (error) {
      console.error('ERROR UPDATING JOB STATUS:', error);
      throw error;
    }
  }

  /**
   * COMPLETE JOB WITH MARKDOWN CONTENT
   */
  async completeJob(documentId: string, markdownContent: string): Promise<ProcessingResult> {
    try {
      console.log(`COMPLETING JOB: ${documentId}`);
      
      // GET DOCUMENT INFO TO BUILD MARKDOWN FILE PATH
      const { data: document, error: docError } = await this.serviceClient
        .from('team_documents')
        .select('team_id, portfolio_id, original_name')
        .eq('id', documentId)
        .single();

      if (docError || !document) {
        throw new Error(`Document not found: ${docError?.message || 'Unknown error'}`);
      }

      // CREATE MARKDOWN FILE PATH
      const originalFileName = document.original_name.replace('.pdf', '');
      const markdownFileName = `processed_${originalFileName}.md`;
      const markdownFilePath = `teams/${document.team_id}/portfolios/${document.portfolio_id}/${markdownFileName}`;

      // UPLOAD MARKDOWN TO SUPABASE STORAGE
      const { error: storageError } = await this.serviceClient.storage
        .from('team-documents')
        .upload(markdownFilePath, markdownContent, {
          contentType: 'text/markdown',
          upsert: true
        });

      if (storageError) {
        console.error('ERROR UPLOADING MARKDOWN TO SUPABASE:', storageError);
        throw new Error(`Failed to upload markdown to storage: ${storageError.message}`);
      }

      console.log(`MARKDOWN SAVED TO SUPABASE: ${markdownFilePath}`);
      
      // UPLOAD MARKDOWN TO OPENAI
      const openaiFile = await this.openaiClient.files.create({
        file: new File([markdownContent], `processed_${documentId}.md`, { type: 'text/markdown' }),
        purpose: 'assistants'
      });

      console.log(`MARKDOWN UPLOADED TO OPENAI: ${openaiFile.id}`);

      // UPDATE DOCUMENT WITH OPENAI FILE ID
      const { error: updateError } = await this.serviceClient
        .from('team_documents')
        .update({ 
          openai_file_id: openaiFile.id
        })
        .eq('id', documentId);

      if (updateError) {
        console.error('ERROR UPDATING DOCUMENT WITH OPENAI FILE ID:', updateError);
        throw new Error(`Failed to update document: ${updateError.message}`);
      }

      console.log(`JOB COMPLETED SUCCESSFULLY: ${documentId} -> ${openaiFile.id}`);
      
      return {
        success: true,
        openaiFileId: openaiFile.id,
      };
    } catch (error) {
      console.error('ERROR COMPLETING JOB:', error);
      
      // MARK JOB AS FAILED
      await this.updateJobStatus(documentId, 'failed', undefined, error instanceof Error ? error.message : 'Unknown error');
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * PROCESS DOCUMENT WITH LLAMAPARSE
   */
  async processDocument(teamId: string, portfolioId: string, documentId: string): Promise<ProcessingResult> {
    try {
      console.log(`STARTING DOCUMENT PROCESSING: ${documentId}`);
      
      // GET DOCUMENT INFO
      const { data: document, error: docError } = await this.serviceClient
        .from('team_documents')
        .select('*')
        .eq('id', documentId)
        .eq('team_id', teamId)
        .eq('portfolio_id', portfolioId)
        .single();

      if (docError || !document) {
        throw new Error(`Document not found: ${docError?.message || 'Unknown error'}`);
      }

      // DOWNLOAD PDF FROM SUPABASE STORAGE
      const { data: fileData, error: downloadError } = await this.serviceClient.storage
        .from('team-documents')
        .download(document.file_path);

      if (downloadError) {
        throw new Error(`Failed to download PDF: ${downloadError.message}`);
      }

      // CONVERT TO BUFFER
      const arrayBuffer = await fileData.arrayBuffer();
      const pdfBuffer = Buffer.from(arrayBuffer);

      console.log(`PDF DOWNLOADED: ${document.original_name} (${pdfBuffer.length} bytes)`);

      // SUBMIT TO LLAMAPARSE (NOW SYNCHRONOUS)
      const markdown = await this.llamaparseService.submitDocument(pdfBuffer, document.original_name);
      console.log(`LLAMAPARSE PROCESSING COMPLETE: ${document.original_name}`);

      // COMPLETE THE JOB
      return await this.completeJob(documentId, markdown);

    } catch (error) {
      console.error('ERROR PROCESSING DOCUMENT:', error);
      
      // MARK JOB AS FAILED
      await this.updateJobStatus(documentId, 'failed', undefined, error instanceof Error ? error.message : 'Unknown error');
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * GET PROCESSING STATUS FROM JOB QUEUE (GROUND TRUTH)
   */
  async getProcessingStatus(documentId: string): Promise<ProcessingJob | null> {
    try {
      // GET PROCESSING JOB FOR THIS DOCUMENT
      const { data: job, error } = await this.serviceClient
        .from('processing_jobs')
        .select('*')
        .eq('document_id', documentId)
        .single();

      if (error || !job) {
        // NO JOB EXISTS - CHECK IF DOCUMENT EXISTS AND IS COMPLETED
        const { data: document, error: docError } = await this.serviceClient
          .from('team_documents')
          .select('*')
          .eq('id', documentId)
          .single();

        if (docError || !document) {
          return null;
        }

        // IF DOCUMENT HAS OPENAI FILE ID, IT'S COMPLETED (LEGACY)
        if (document.openai_file_id && document.openai_file_id.startsWith('file-')) {
          return {
            id: documentId,
            teamId: document.team_id,
            portfolioId: document.portfolio_id,
            documentId: document.id,
            status: 'completed',
            progress: 100,
            createdAt: document.created_at,
            updatedAt: document.updated_at,
          };
        }

        // NO JOB AND NO COMPLETED STATUS = PENDING
        return {
          id: documentId,
          teamId: document.team_id,
          portfolioId: document.portfolio_id,
          documentId: document.id,
          status: 'pending',
          progress: 0,
          createdAt: document.created_at,
          updatedAt: document.updated_at,
        };
      }

      // RETURN JOB STATUS (GROUND TRUTH)
      return {
        id: job.id,
        teamId: job.team_id,
        portfolioId: job.portfolio_id,
        documentId: job.document_id,
        status: job.status,
        progress: job.progress,
        error: job.error,
        createdAt: job.created_at,
        updatedAt: job.completed_at || job.started_at || job.created_at,
      };
    } catch (error) {
      console.error('ERROR GETTING PROCESSING STATUS:', error);
      return null;
    }
  }

  /**
   * RETRY FAILED JOB
   */
  async retryJob(teamId: string, portfolioId: string, documentId: string): Promise<ProcessingResult> {
    try {
      console.log(`RETRYING FAILED JOB: ${documentId}`);
      
      // RESET STATUS TO PROCESSING
      await this.updateJobStatus(documentId, 'processing');
      
      // PROCESS DOCUMENT AGAIN
      return await this.processDocument(teamId, portfolioId, documentId);
    } catch (error) {
      console.error('ERROR RETRYING JOB:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
