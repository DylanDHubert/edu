import { NextRequest, NextResponse } from 'next/server';
import { JobQueueService } from '../../../services/job-queue-service';
import { LlamaParseService, ScreenshotData, ScreenshotPath } from '../../../services/llamaparse-service';
import { createServiceClient } from '../../../utils/supabase/server';
import OpenAI from 'openai';
// @ts-ignore - tiktoken types not available
import { encoding_for_model } from 'tiktoken';

/**
 * UPLOAD SCREENSHOTS TO SUPABASE STORAGE
 */
async function uploadScreenshotsToStorage(
  job: any, 
  screenshots: ScreenshotData[], 
  serviceClient: any
): Promise<ScreenshotPath[]> {
  const screenshotPaths: ScreenshotPath[] = [];
  
  for (const screenshot of screenshots) {
    try {
      // CONVERT BASE64 TO BUFFER
      const imageBuffer = Buffer.from(screenshot.imageData, 'base64');
      
      // CREATE STORAGE PATH
      const screenshotPath = `teams/${job.team_id}/portfolios/${job.portfolio_id}/screenshots/${job.document_id}/${screenshot.filename}`;
      
      // UPLOAD TO SUPABASE STORAGE
      const { error } = await serviceClient.storage
        .from('team-documents')
        .upload(screenshotPath, imageBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });
      
      if (error) {
        console.error(`FAILED TO UPLOAD SCREENSHOT ${screenshot.filename}:`, error);
        continue;
      }
      
      screenshotPaths.push({
        pageNumber: screenshot.pageNumber,
        path: screenshotPath,
        filename: screenshot.filename
      });
      
      console.log(`SCREENSHOT UPLOADED: ${screenshotPath}`);
    } catch (error) {
      console.error(`ERROR UPLOADING SCREENSHOT ${screenshot.filename}:`, error);
    }
  }
  
  return screenshotPaths;
}

/**
 * ADD PAGE MARKERS EVERY 400 TOKENS FOR SOURCE CITATIONS
 */
function addPageMarkersEvery400Tokens(markdown: string): string {
  try {
    const tokenizer = encoding_for_model('gpt-4');
    const parts = markdown.split(/(<<\d+>>)/);
    const result = [];
    
    for (let i = 0; i < parts.length; i += 2) {
      const content = parts[i];
      const pageMarker = parts[i + 1]; // <<N>>
      
      if (content && content.trim().length > 0) {
        const tokens = tokenizer.encode(content);
        const pageNum = pageMarker ? pageMarker.match(/\d+/)?.[0] : '1';
        
        // ALWAYS add page marker at the beginning of each page section
        result.push(`--- Page ${pageNum} ---`);
        
        // Add page markers every 400 tokens within the page
        for (let j = 0; j < tokens.length; j += 400) {
          const chunkTokens = tokens.slice(j, j + 400);
          const chunkText = tokenizer.decode(chunkTokens);
          result.push(chunkText);
          
          // Add page marker if there are more tokens after this chunk
          if (j + 400 < tokens.length) {
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
          
          // POST-PROCESS MARKDOWN TO ADD PAGE MARKERS FOR SOURCE CITATIONS
          await jobQueueService.updateJobStatus(
            job.id, 
            'processing', 
            55, 
            'adding_page_markers'
          );
          
          const processedMarkdown = addPageMarkersEvery400Tokens(markdown);
          console.log(`PAGE MARKERS PROCESSING COMPLETE: ${processedMarkdown.length} characters`);
          
          // DETERMINE TOTAL PAGES FROM MARKDOWN AND PROCESS SCREENSHOTS
          let screenshotPaths: any[] = [];
          console.log(`ABOUT TO EXTRACT PAGE COUNT FROM MARKDOWN...`);
          try {
            const pageNumbers = llamaparseService.extractPageNumbers(processedMarkdown);
            console.log(`DETECTED ${pageNumbers.length} PAGES IN DOCUMENT:`, pageNumbers);
            console.log(`PROCESSED MARKDOWN PREVIEW: ${processedMarkdown.substring(0, 200)}...`);
            
            if (pageNumbers.length > 0) {
              console.log(`ATTEMPTING TO DOWNLOAD SCREENSHOTS FOR ${pageNumbers.length} PAGES...`);
              
              // DOWNLOAD SCREENSHOTS
              await jobQueueService.updateJobStatus(
                job.id, 
                'processing', 
                60, 
                'downloading_screenshots'
              );
              
              console.log(`CALLING downloadAllScreenshots with jobId: ${job.llamaparse_job_id}, pageNumbers:`, pageNumbers);
              const screenshots = await llamaparseService.downloadAllScreenshots(job.llamaparse_job_id, pageNumbers);
              console.log(`SCREENSHOTS DOWNLOADED: ${screenshots.length}/${pageNumbers.length} pages`);
              
              if (screenshots.length > 0) {
                // UPLOAD SCREENSHOTS TO SUPABASE STORAGE
                await jobQueueService.updateJobStatus(
                  job.id, 
                  'processing', 
                  65, 
                  'uploading_screenshots'
                );
                
                console.log(`UPLOADING ${screenshots.length} SCREENSHOTS TO STORAGE...`);
                screenshotPaths = await uploadScreenshotsToStorage(job, screenshots, serviceClient);
                console.log(`SCREENSHOTS UPLOADED: ${screenshotPaths.length} files`);
              } else {
                console.log('NO SCREENSHOTS DOWNLOADED - SKIPPING UPLOAD');
              }
            } else {
              console.log('NO PAGES DETECTED - SKIPPING SCREENSHOT PROCESSING');
            }
          } catch (screenshotError) {
            console.error('SCREENSHOT PROCESSING ERROR:', screenshotError);
            if (screenshotError instanceof Error) {
              console.error('ERROR STACK:', screenshotError.stack);
            }
            console.log('CONTINUING WITHOUT SCREENSHOTS...');
          }
          
          // UPLOAD MARKDOWN TO SUPABASE STORAGE
          await jobQueueService.updateJobStatus(
            job.id, 
            'processing', 
            70, 
            'uploading_to_supabase'
          );
          
          // FETCH DOCUMENT INFO TO GET ORIGINAL FILENAME
          const { data: documentData, error: documentError } = await serviceClient
            .from('team_documents')
            .select('original_name')
            .eq('id', job.document_id)
            .single();
          
          if (documentError || !documentData) {
            throw new Error(`Failed to fetch document info: ${documentError?.message || 'Document not found'}`);
          }
          
          const originalFileName = documentData.original_name.replace('.pdf', '');
          const markdownFileName = `processed_${originalFileName}.md`;
          const markdownFilePath = `teams/${job.team_id}/portfolios/${job.portfolio_id}/${markdownFileName}`;
          
          const { error: storageError } = await serviceClient.storage
            .from('team-documents')
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
          
          // ATOMIC UPDATE: MARK JOB AS COMPLETED AND UPDATE DOCUMENT
          const { error: updateError } = await serviceClient
            .from('team_documents')
            .update({ 
              openai_file_id: openaiFile.id
            })
            .eq('id', job.document_id);
          
          if (updateError) {
            throw new Error(`Failed to update document: ${updateError.message}`);
          }
          
          // VECTORIZE FOR SAFE MODE
          await jobQueueService.updateJobStatus(
            job.id, 
            'processing', 
            95, 
            'vectorizing_for_safe_mode'
          );
          
          try {
            const { VectorizationService } = await import('../../../services/vectorization-service');
            const vectorizationService = new VectorizationService();
            
            // Check if we have screenshot paths from earlier processing
            if (screenshotPaths && screenshotPaths.length > 0) {
              await vectorizationService.vectorizeWithScreenshots(job.document_id, markdown, screenshotPaths);
              console.log(`SAFE MODE VECTORIZATION WITH SCREENSHOTS COMPLETE: ${job.document_id}`);
            } else {
              await vectorizationService.vectorizeUploadedMarkdown(job.document_id, markdown);
              console.log(`SAFE MODE VECTORIZATION COMPLETE: ${job.document_id}`);
            }
          } catch (vectorizationError) {
            console.error('SAFE MODE VECTORIZATION ERROR:', vectorizationError);
            // CONTINUE WITH JOB COMPLETION EVEN IF VECTORIZATION FAILS
          }
          
          // MARK JOB AS COMPLETED (AFTER DOCUMENT UPDATE SUCCESS)
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
            .from('team_documents')
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
            .from('team_documents')
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
          .from('team_documents')
          .update({ openai_file_id: 'failed' })
          .eq('id', job.document_id);
        
        failureCount++;
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
