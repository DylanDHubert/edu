import { createServiceClient } from '../utils/supabase/server';

export interface ProcessingJob {
  id: string;
  document_id: string;
  course_id: string;
  portfolio_id: string | null;
  llamaparse_job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  current_step?: string;
  error_message?: string;
  retry_count: number;
  max_retries: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export class JobQueueService {
  private serviceClient = createServiceClient();

  /**
   * CREATE A NEW PROCESSING JOB
   */
  async createJob(
    documentId: string, 
    courseId: string, 
    portfolioId: string | null, 
    llamaparseJobId: string
  ): Promise<string> {
    try {
      console.log(`CREATING PROCESSING JOB: ${documentId} -> LlamaParse Job: ${llamaparseJobId}`);
      
      const { data: job, error: jobError } = await this.serviceClient
        .from('processing_jobs')
        .insert({
          document_id: documentId,
          course_id: courseId,
          portfolio_id: portfolioId,
          llamaparse_job_id: llamaparseJobId,
          status: 'pending',
          progress: 0,
          current_step: 'job_created',
          retry_count: 0,
          max_retries: 3
        })
        .select()
        .single();

      if (jobError) {
        console.error('ERROR CREATING PROCESSING JOB:', jobError);
        throw new Error(`Failed to create processing job: ${jobError.message}`);
      }

      console.log(`PROCESSING JOB CREATED: ${job.id} for document ${documentId}`);
      return job.id;

    } catch (error) {
      console.error('ERROR CREATING PROCESSING JOB:', error);
      throw error;
    }
  }

  /**
   * GET ALL PENDING JOBS AND CHECK FOR STUCK JOBS
   */
  async getPendingJobs(): Promise<ProcessingJob[]> {
    try {
      // FIRST, CHECK FOR STUCK JOBS (PROCESSING FOR >3 HOURS)
      await this.checkForStuckJobs();

      const { data, error } = await this.serviceClient
        .from('processing_jobs')
        .select(`
          *,
          course_documents!inner(
            id, original_name, file_path, course_id, portfolio_id
          )
        `)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: true })
        .limit(10); // PROCESS IN BATCHES

      if (error) {
        console.error('ERROR FETCHING PENDING JOBS:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('ERROR FETCHING PENDING JOBS:', error);
      return [];
    }
  }

  /**
   * CHECK FOR STUCK JOBS AND MARK THEM AS FAILED
   */
  private async checkForStuckJobs(): Promise<void> {
    try {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      
      const { data: stuckJobs, error } = await this.serviceClient
        .from('processing_jobs')
        .select('*')
        .eq('status', 'processing')
        .lt('started_at', threeHoursAgo);

      if (error) {
        console.error('ERROR CHECKING FOR STUCK JOBS:', error);
        return;
      }

      if (stuckJobs && stuckJobs.length > 0) {
        console.log(`FOUND ${stuckJobs.length} STUCK JOBS, MARKING AS FAILED`);
        
        for (const job of stuckJobs) {
          await this.updateJobStatus(
            job.id,
            'failed',
            0,
            'Job stuck in processing for over 3 hours',
            'Job timeout - processing took too long'
          );
        }
      }
    } catch (error) {
      console.error('ERROR IN CHECK FOR STUCK JOBS:', error);
    }
  }

  /**
   * UPDATE JOB STATUS
   */
  async updateJobStatus(
    jobId: string,
    status: string,
    progress?: number,
    currentStep?: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      console.log(`UPDATING JOB ${jobId}: ${status} (${progress}%) - ${currentStep}`);
      
      const updateData: any = {
        status
      };

      if (progress !== undefined) updateData.progress = progress;
      if (currentStep) updateData.current_step = currentStep;
      if (errorMessage) updateData.error_message = errorMessage;

      // SET TIMING FIELDS
      if (status === 'processing' && !updateData.started_at) {
        updateData.started_at = new Date().toISOString();
      }
      if (status === 'completed' || status === 'failed') {
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await this.serviceClient
        .from('processing_jobs')
        .update(updateData)
        .eq('id', jobId);

      if (error) {
        console.error(`ERROR UPDATING JOB ${jobId}:`, error);
        throw error;
      }

      console.log(`JOB STATUS UPDATED: ${jobId} -> ${status}`);
    } catch (error) {
      console.error('ERROR UPDATING JOB STATUS:', error);
      throw error;
    }
  }

  /**
   * GET JOB BY ID
   */
  async getJob(jobId: string): Promise<ProcessingJob | null> {
    try {
      const { data, error } = await this.serviceClient
        .from('processing_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error || !data) {
        return null;
      }

      return data;
    } catch (error) {
      console.error('ERROR GETTING JOB:', error);
      return null;
    }
  }

  /**
   * GET JOBS BY DOCUMENT ID
   */
  async getJobsByDocumentId(documentId: string): Promise<ProcessingJob[]> {
    try {
      const { data, error } = await this.serviceClient
        .from('processing_jobs')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('ERROR FETCHING JOBS BY DOCUMENT ID:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('ERROR FETCHING JOBS BY DOCUMENT ID:', error);
      return [];
    }
  }

  /**
   * MARK JOB AS FAILED
   */
  async markJobFailed(jobId: string, errorMessage: string): Promise<void> {
    try {
      await this.updateJobStatus(jobId, 'failed', undefined, 'job_failed', errorMessage);
      console.log(`JOB MARKED AS FAILED: ${jobId} - ${errorMessage}`);
    } catch (error) {
      console.error('ERROR MARKING JOB AS FAILED:', error);
      throw error;
    }
  }

  /**
   * MARK JOB AS COMPLETED
   */
  async markJobCompleted(jobId: string): Promise<void> {
    try {
      await this.updateJobStatus(jobId, 'completed', 100, 'job_completed');
      console.log(`JOB MARKED AS COMPLETED: ${jobId}`);
    } catch (error) {
      console.error('ERROR MARKING JOB AS COMPLETED:', error);
      throw error;
    }
  }

  /**
   * CHECK IF ALL JOBS FOR A PORTFOLIO ARE COMPLETED
   */
  async isPortfolioProcessingComplete(courseId: string, portfolioId: string): Promise<{
    isComplete: boolean;
    totalJobs: number;
    completedJobs: number;
    pendingJobs: number;
    processingJobs: number;
    failedJobs: number;
  }> {
    try {
      const { data: jobs, error } = await this.serviceClient
        .from('processing_jobs')
        .select('status')
        .eq('course_id', courseId)
        .eq('portfolio_id', portfolioId);

      if (error) {
        console.error('ERROR CHECKING PORTFOLIO PROCESSING STATUS:', error);
        throw error;
      }

      const totalJobs = jobs?.length || 0;
      const completedJobs = jobs?.filter(job => job.status === 'completed').length || 0;
      const pendingJobs = jobs?.filter(job => job.status === 'pending').length || 0;
      const processingJobs = jobs?.filter(job => job.status === 'processing').length || 0;
      const failedJobs = jobs?.filter(job => job.status === 'failed').length || 0;

      // IF NO JOBS EXIST, CONSIDER IT COMPLETE (LEGACY PORTFOLIOS)
      const isComplete = totalJobs === 0 || (pendingJobs === 0 && processingJobs === 0);

      return {
        isComplete,
        totalJobs,
        completedJobs,
        pendingJobs,
        processingJobs,
        failedJobs
      };
    } catch (error) {
      console.error('ERROR CHECKING PORTFOLIO PROCESSING STATUS:', error);
      throw error;
    }
  }

}
