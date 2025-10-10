import { NextRequest, NextResponse } from 'next/server';
import { JobQueueService } from '../../../services/job-queue-service';
import { LlamaParseService } from '../../../services/llamaparse-service';
import { createServiceClient } from '../../../utils/supabase/server';
import OpenAI from 'openai';
// @ts-ignore - tiktoken types not available
// tiktoken import removed - using character-based chunking instead

// Screenshot upload function removed

/**
 * ADD PAGE MARKERS EVERY 400 TOKENS FOR SOURCE CITATIONS
 */
function addPageMarkersEvery400Tokens(markdown: string): string {
  try {
    // Simple approach: Add page markers every ~2000 characters (roughly 400 tokens)
    const parts = markdown.split(/(<<\d+>>)/);
    const result = [];
    
    for (let i = 0; i < parts.length; i += 2) {
      const content = parts[i];
      const pageMarker = parts[i + 1]; // <<N>>
      
      if (content && content.trim().length > 0) {
        const pageNum = pageMarker ? pageMarker.match(/\d+/)?.[0] : '1';
        
        // Add page marker at the beginning of each page section
        result.push(`--- Page ${pageNum} ---`);
        
        // Add page markers every ~2000 characters (roughly 400 tokens)
        const chunkSize = 2000;
        for (let j = 0; j < content.length; j += chunkSize) {
          const chunk = content.slice(j, j + chunkSize);
          result.push(chunk);
          
          // Add page marker if there are more characters after this chunk
          if (j + chunkSize < content.length) {
            result.push(`--- Page ${pageNum} ---`);
          }
        }
      }
      
      if (pageMarker) {
        result.push(pageMarker);
      }
    }
    
    const processedMarkdown = result.join('\n');
    console.log(`PAGE MARKERS ADDED: ${processedMarkdown.length} characters (was ${markdown.length})`);
    return processedMarkdown;
    
  } catch (error) {
    console.error('ERROR ADDING PAGE MARKERS:', error);
    // Return original markdown if processing fails
    return markdown;
  }
}

export async function GET(request: NextRequest) {
  console.log('CRON JOB STARTED: Processing documents');
  
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
        console.log(`PROCESSING JOB: ${job.id} for document ${job.document_id} (Type: ${job.processing_type}, LlamaParse Job: ${job.llamaparse_job_id})`);
        
        // MARK AS PROCESSING
        await jobQueueService.updateJobStatus(
          job.id, 
          'processing', 
          10, 
          'starting_processing'
        );
        
        // PROCESS BASED ON TYPE
        if (job.processing_type === 'standard') {
          // STANDARD MODE: Direct OpenAI upload
          await processStandardDocument(job, serviceClient, openaiClient, jobQueueService);
        } else {
          // ENHANCED/SUPER MODE: LlamaParse processing
          await processLlamaParseDocument(job, llamaparseService, serviceClient, openaiClient, jobQueueService);
        }
        
        successCount++;
        processedCount++;
        
      } catch (error) {
        console.error(`ERROR PROCESSING JOB ${job.id}:`, error);
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await jobQueueService.markJobFailed(job.id, errorMessage);
        
        // MARK DOCUMENT AS FAILED
        await serviceClient
          .from('course_documents')
          .update({ status: 'failed' })
          .eq('id', job.document_id);
        
        failureCount++;
        processedCount++;
      }
    }
    
    console.log(`CRON JOB COMPLETED: Processed ${processedCount} jobs (${successCount} success, ${failureCount} failed)`);
    
    return NextResponse.json({ 
      success: true, 
      processed: processedCount,
      successful: successCount,
      failed: failureCount,
      message: `Processed ${processedCount} jobs (${successCount} success, ${failureCount} failed)`
    });
    
  } catch (error) {
    console.error('CRON JOB ERROR:', error);
    return NextResponse.json(
      { error: 'Cron job failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PROCESS STANDARD DOCUMENT (Direct OpenAI upload)
 */
async function processStandardDocument(job: any, serviceClient: any, openaiClient: any, jobQueueService: any) {
  try {
    console.log(`PROCESSING STANDARD DOCUMENT: ${job.document_id}`);
    
    // GET DOCUMENT INFO
    const { data: document, error: docError } = await serviceClient
      .from('course_documents')
      .select('*')
      .eq('id', job.document_id)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message || 'Unknown error'}`);
    }

    // DOWNLOAD FILE FROM SUPABASE STORAGE
    const { data: fileData, error: downloadError } = await serviceClient.storage
      .from('course-documents')
      .download(document.file_path);

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    // CONVERT TO BUFFER
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`FILE DOWNLOADED: ${document.original_name} (${buffer.length} bytes)`);

    // UPDATE PROGRESS
    await jobQueueService.updateJobStatus(
      job.id, 
      'processing', 
      50, 
      'uploading_to_openai'
    );

    // UPLOAD TO OPENAI
    const fileType = document.original_name.toLowerCase().endsWith('.md') ? 'text/markdown' : 'application/pdf';
    const openaiFile = await openaiClient.files.create({
      file: new File([buffer], document.original_name, { type: fileType }),
      purpose: 'assistants'
    });

    console.log(`FILE UPLOADED TO OPENAI: ${openaiFile.id}`);

    // UPDATE DOCUMENT WITH OPENAI FILE ID
    await serviceClient
      .from('course_documents')
      .update({ 
        openai_file_id: openaiFile.id,
        status: 'completed'
      })
      .eq('id', job.document_id);

    // MARK JOB AS COMPLETED
    await jobQueueService.markJobCompleted(job.id);
    console.log(`STANDARD JOB COMPLETED: ${job.id} -> ${openaiFile.id}`);

  } catch (error) {
    console.error('ERROR PROCESSING STANDARD DOCUMENT:', error);
    throw error;
  }
}

/**
 * PROCESS LLAMAPARSE DOCUMENT (Enhanced/Super mode)
 */
async function processLlamaParseDocument(job: any, llamaparseService: any, serviceClient: any, openaiClient: any, jobQueueService: any) {
  try {
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
      
      // POST-PROCESS MARKDOWN TO ADD PAGE MARKERS FOR SOURCE CITATIONS
      await jobQueueService.updateJobStatus(
        job.id, 
        'processing', 
        55, 
        'adding_page_markers'
      );
      
      const processedMarkdown = addPageMarkersEvery400Tokens(markdown);
      console.log(`PAGE MARKERS PROCESSING COMPLETE: ${processedMarkdown.length} characters`);
      
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
        .upload(markdownFilePath, processedMarkdown, {
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
        file: new File([processedMarkdown], `processed_${job.document_id}.md`, { type: 'text/markdown' }),
        purpose: 'assistants'
      });
      
      console.log(`MARKDOWN UPLOADED TO OPENAI: ${openaiFile.id}`);
      
      // UPDATE DOCUMENT WITH OPENAI FILE ID
      await serviceClient
        .from('course_documents')
        .update({ 
          openai_file_id: openaiFile.id,
          status: 'completed'
        })
        .eq('id', job.document_id);
      
      // MARK JOB AS COMPLETED
      await jobQueueService.markJobCompleted(job.id);
      console.log(`LLAMAPARSE JOB COMPLETED: ${job.id} -> ${openaiFile.id}`);
      
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
        .update({ status: 'failed' })
        .eq('id', job.document_id);
      
      console.error(`JOB FAILED: ${job.id} - ${errorMessage}`);
      throw new Error(errorMessage);
      
    } else {
      // UNKNOWN STATUS
      const errorMessage = `Unknown LlamaParse status: ${statusResult.status}`;
      await jobQueueService.markJobFailed(job.id, errorMessage);
      
      // MARK DOCUMENT AS FAILED
      await serviceClient
        .from('course_documents')
        .update({ status: 'failed' })
        .eq('id', job.document_id);
      
      console.error(`JOB FAILED: ${job.id} - ${errorMessage}`);
      throw new Error(errorMessage);
    }

  } catch (error) {
    console.error('ERROR PROCESSING LLAMAPARSE DOCUMENT:', error);
    throw error;
  }
}
