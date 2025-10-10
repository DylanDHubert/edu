import { NextRequest, NextResponse } from 'next/server';
import { JobQueueService } from '../../services/job-queue-service';
import { LlamaParseService } from '../../services/llamaparse-service';
import { createServiceClient } from '../../utils/supabase/server';
import OpenAI from 'openai';

// Screenshot upload function removed

export async function GET(request: NextRequest) {
  // CHECK FOR BYPASS TOKEN
  const url = new URL(request.url);
  const bypassToken = url.searchParams.get('bypass');
  
  if (bypassToken !== 'test123') {
    return NextResponse.json(
      { error: 'Unauthorized. Use ?bypass=test123 for testing' },
      { status: 401 }
    );
  }
  
  console.log('MANUAL CRON TRIGGER: Processing documents');
  
  try {
    const jobQueueService = new JobQueueService();
    const llamaparseService = new LlamaParseService();
    const serviceClient = createServiceClient();
    const openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    // GET PENDING JOBS
    const pendingJobs = await jobQueueService.getPendingJobs();
    console.log(`FOUND ${pendingJobs.length} PENDING JOBS`);
    
    if (pendingJobs.length === 0) {
      return NextResponse.json({ 
        success: true, 
        processed: 0,
        message: 'No pending jobs to process'
      });
    }
    
    // PROCESS EACH JOB
    let processedCount = 0;
    let successCount = 0;
    let failureCount = 0;
    
    for (const job of pendingJobs) {
      try {
        console.log(`PROCESSING JOB: ${job.id} for document ${job.document_id} (LlamaParse Job: ${job.llamaparse_job_id})`);
        
        // MARK AS PROCESSING
        await jobQueueService.updateJobStatus(
          job.id, 
          'processing', 
          10, 
          'checking_llamaparse_status'
        );
        
        // CHECK LLAMAPARSE JOB STATUS
        const statusResult = await llamaparseService.checkJobStatus(job.llamaparse_job_id);
        console.log(`LLAMAPARSE STATUS: ${job.llamaparse_job_id} -> ${statusResult.status}`);
        
        if (statusResult.status === 'SUCCESS') {
          // DOWNLOAD MARKDOWN FROM LLAMAPARSE
          await jobQueueService.updateJobStatus(
            job.id, 
            'processing', 
            50, 
            'downloading_markdown'
          );
          
          const markdown = await llamaparseService.downloadMarkdown(job.llamaparse_job_id);
          console.log(`MARKDOWN DOWNLOADED: ${job.llamaparse_job_id} (${markdown.length} characters)`);
          
          // Screenshot processing removed - keeping page markers only
          
          // UPLOAD MARKDOWN TO SUPABASE STORAGE
          await jobQueueService.updateJobStatus(
            job.id, 
            'processing', 
            70, 
            'uploading_to_supabase'
          );
          
          // FETCH DOCUMENT INFO TO GET ORIGINAL FILENAME
          const { data: documentData, error: documentError } = await serviceClient
            .from('course_documents')
            .select('original_name')
            .eq('id', job.document_id)
            .single();
          
          if (documentError || !documentData) {
            throw new Error(`Failed to fetch document info: ${documentError?.message || 'Document not found'}`);
          }
          
          const originalFileName = documentData.original_name.replace('.pdf', '');
          const markdownFileName = `processed_${originalFileName}.md`;
          const markdownFilePath = `courses/${job.course_id}/portfolios/${job.portfolio_id}/${markdownFileName}`;
          
          const { error: storageError } = await serviceClient.storage
            .from('course-documents')
            .upload(markdownFilePath, markdown, {
              contentType: 'text/markdown',
              upsert: true
            });
          
          if (storageError) {
            throw new Error(`Failed to upload markdown to Supabase: ${storageError.message}`);
          }
          
          console.log(`MARKDOWN SAVED TO SUPABASE: ${markdownFilePath}`);
          
          // UPLOAD MARKDOWN TO OPENAI
          await jobQueueService.updateJobStatus(
            job.id, 
            'processing', 
            90, 
            'uploading_to_openai'
          );
          
          const openaiFile = await openaiClient.files.create({
            file: new File([markdown], `processed_${job.document_id}.md`, { type: 'text/markdown' }),
            purpose: 'assistants'
          });
          
          console.log(`MARKDOWN UPLOADED TO OPENAI: ${openaiFile.id}`);
          
          // UPDATE DOCUMENT WITH OPENAI FILE ID
          const { error: updateError } = await serviceClient
            .from('course_documents')
            .update({ 
              openai_file_id: openaiFile.id
            })
            .eq('id', job.document_id);
          
          if (updateError) {
            throw new Error(`Failed to update document: ${updateError.message}`);
          }
          
          // Safe mode vectorization removed
          
          // MARK JOB AS COMPLETED
          await jobQueueService.markJobCompleted(job.id);
          console.log(`JOB COMPLETED: ${job.id} -> ${openaiFile.id}`);
          successCount++;
          
        } else if (statusResult.status === 'PENDING' || statusResult.status === 'PROCESSING') {
          // STILL PROCESSING - UPDATE PROGRESS
          const progress = statusResult.progress || 25;
          await jobQueueService.updateJobStatus(
            job.id, 
            'processing', 
            progress, 
            `llamaparse_${statusResult.status.toLowerCase()}`
          );
          console.log(`JOB STILL PROCESSING: ${job.id} -> ${statusResult.status} (${progress}%)`);
          
        } else if (statusResult.status === 'FAILED') {
          // LLAMAPARSE JOB FAILED
          const errorMessage = statusResult.error || 'LlamaParse job failed';
          await jobQueueService.markJobFailed(job.id, errorMessage);
          
          // MARK DOCUMENT AS FAILED
          await serviceClient
            .from('course_documents')
            .update({ openai_file_id: 'failed' })
            .eq('id', job.document_id);
          
          console.error(`JOB FAILED: ${job.id} - ${errorMessage}`);
          failureCount++;
          
        } else {
          // UNKNOWN STATUS
          const errorMessage = `Unknown LlamaParse status: ${statusResult.status}`;
          await jobQueueService.markJobFailed(job.id, errorMessage);
          
          // MARK DOCUMENT AS FAILED
          await serviceClient
            .from('course_documents')
            .update({ openai_file_id: 'failed' })
            .eq('id', job.document_id);
          
          console.error(`JOB FAILED: ${job.id} - ${errorMessage}`);
          failureCount++;
        }
        
        processedCount++;
        
      } catch (error) {
        console.error(`ERROR PROCESSING JOB ${job.id}:`, error);
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await jobQueueService.markJobFailed(job.id, errorMessage);
        
        // MARK DOCUMENT AS FAILED
        await serviceClient
          .from('course_documents')
          .update({ openai_file_id: 'failed' })
          .eq('id', job.document_id);
        
        failureCount++;
      }
    }
    
    console.log(`MANUAL CRON COMPLETED: Processed ${processedCount} jobs (${successCount} success, ${failureCount} failed)`);
    
    return NextResponse.json({ 
      success: true, 
      processed: processedCount,
      successful: successCount,
      failed: failureCount,
      message: `Processed ${processedCount} jobs (${successCount} success, ${failureCount} failed)`
    });
    
  } catch (error) {
    console.error('MANUAL CRON ERROR:', error);
    return NextResponse.json(
      { error: 'Manual cron failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
