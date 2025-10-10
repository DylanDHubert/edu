import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { validateFileContent, validateMarkdownContent } from '../../../../utils/security';
import { rateLimitMiddleware, RATE_LIMITS } from '../../../../utils/rate-limit';
import { LlamaParseService } from '../../../../services/llamaparse-service';
import { JobQueueService } from '../../../../services/job-queue-service';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    // APPLY RATE LIMITING FOR FILE UPLOAD
    const rateLimitResponse = rateLimitMiddleware(request, RATE_LIMITS.FILE_UPLOAD);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { courseId, portfolioId, uploadedFiles, processingType = 'standard' } = await request.json();

    // Validate required fields
    if (!courseId || !portfolioId || !uploadedFiles || !Array.isArray(uploadedFiles)) {
      return NextResponse.json(
        { error: 'course ID, portfolio ID, and uploaded files array are required' },
        { status: 400 }
      );
    }

    // Validate processing type
    if (!['standard', 'enhanced', 'super'].includes(processingType)) {
      return NextResponse.json(
        { error: 'processingType must be standard, enhanced, or super' },
        { status: 400 }
      );
    }

    // Verify user authentication
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // USE SERVICE CLIENT TO BYPASS RLS FOR MEMBERSHIP CHECK
    const serviceClient = createServiceClient();
    const { data: courseMember, error: memberError } = await serviceClient
      .from('course_members')
      .select('role')
      .eq('course_id', courseId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberError || !courseMember || courseMember.role !== 'manager') {
      return NextResponse.json(
        { error: 'Manager access required' },
        { status: 403 }
      );
    }

    // Get portfolio and course info using service client
    const { data: portfolio, error: portfolioError } = await serviceClient
      .from('course_portfolios')
      .select(`
        *,
        courses!inner(name)
      `)
      .eq('id', portfolioId)
      .eq('course_id', courseId)
      .single();

    if (portfolioError || !portfolio) {
      return NextResponse.json(
        { error: 'Portfolio not found' },
        { status: 404 }
      );
    }

    const uploadedDocuments = [];
    const openaiFileIds = [];

    // Initialize services for enhanced/super processing
    let jobQueueService: JobQueueService | null = null;
    let llamaparseService: LlamaParseService | null = null;
    
    if (processingType === 'enhanced' || processingType === 'super') {
      jobQueueService = new JobQueueService();
      llamaparseService = new LlamaParseService();
    }

    // Process uploaded files
    for (const uploadedFile of uploadedFiles) {
      const { filePath, originalName, uniqueFileName, fileSize } = uploadedFile;

      // Download file from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('course-documents')
        .download(filePath);

      if (downloadError) {
        console.error('Error downloading file from Supabase:', downloadError);
        return NextResponse.json(
          { error: 'Failed to download file: ' + originalName },
          { status: 500 }
        );
      }

      // Convert to buffer for OpenAI upload
      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // VALIDATE FILE CONTENT TO ENSURE IT'S ACTUALLY A PDF OR MARKDOWN
      const isMarkdown = originalName.toLowerCase().endsWith('.md');
      const expectedMimeType = isMarkdown ? 'text/plain' : 'application/pdf'; // Markdown files often detected as text/plain
      
      const isValidFile = await validateFileContent(buffer, expectedMimeType) || 
                         (isMarkdown && await validateMarkdownContent(buffer));
      
      if (!isValidFile) {
        console.error(`File content validation failed for: ${originalName}`);
        return NextResponse.json(
          { error: `Invalid file type detected for: ${originalName}. Only PDF and Markdown files are allowed.` },
          { status: 400 }
        );
      }

      // PROCESS BASED ON PROCESSING TYPE
      if (processingType === 'standard') {
        // STANDARD: Direct OpenAI upload
        const fileType = originalName.toLowerCase().endsWith('.md') ? 'text/markdown' : 'application/pdf';
        const openaiFile = await client.files.create({
          file: new File([buffer], originalName, { type: fileType }),
          purpose: 'assistants'
        });

        openaiFileIds.push(openaiFile.id);

        // Save document record with OpenAI file ID
        const { data: document, error: docError } = await serviceClient
          .from('course_documents')
          .insert({
            course_id: courseId,
            portfolio_id: portfolioId,
            name: originalName, // REQUIRED FIELD
            filename: uniqueFileName,
            original_name: originalName,
            file_path: filePath,
            file_size: fileSize,
            openai_file_id: openaiFile.id,
            processing_type: processingType,
            status: 'completed', // REQUIRED FIELD
            uploaded_by: user.id
          })
          .select()
          .single();

        if (docError) {
          console.error('Error saving document record:', docError);
          return NextResponse.json(
            { error: 'Failed to save document record: ' + docError.message },
            { status: 500 }
          );
        } else {
          uploadedDocuments.push(document);
        }

      } else {
        // ENHANCED/SUPER: LlamaParse processing
        const { data: document, error: docError } = await serviceClient
          .from('course_documents')
          .insert({
            course_id: courseId,
            portfolio_id: portfolioId,
            filename: uniqueFileName,
            original_name: originalName,
            file_path: filePath,
            file_size: fileSize,
            openai_file_id: null, // Will be set when processing completes
            processing_type: processingType,
            uploaded_by: user.id
          })
          .select()
          .single();

        if (docError) {
          console.error('Error creating document record:', docError);
          continue;
        }

        // SUBMIT TO LLAMAPARSE
        try {
          const llamaparseJobId = await llamaparseService!.submitDocument(buffer, originalName, processingType as 'enhanced' | 'super');
          console.log(`LLAMAPARSE JOB SUBMITTED: ${originalName} -> Job ID: ${llamaparseJobId}`);

          // CREATE PROCESSING JOB
          await jobQueueService!.createJob(document.id, courseId, portfolioId, llamaparseJobId);
          console.log(`PROCESSING JOB CREATED FOR: ${originalName}`);

          // UPDATE DOCUMENT STATUS TO PROCESSING
          await serviceClient
            .from('course_documents')
            .update({ openai_file_id: 'processing' })
            .eq('id', document.id);

        } catch (jobError) {
          console.error('ERROR CREATING PROCESSING JOB:', jobError);
          // MARK DOCUMENT AS FAILED
          await serviceClient
            .from('course_documents')
            .update({ openai_file_id: 'failed' })
            .eq('id', document.id);
        }

        uploadedDocuments.push({
          id: document.id,
          filename: document.filename,
          originalName: document.original_name,
          fileSize: document.file_size,
          status: 'processing'
        });
      }
    }

    const processingMessage = processingType === 'standard' 
      ? `${uploadedFiles.length} file(s) uploaded and processed successfully.`
      : `${uploadedFiles.length} file(s) uploaded. ${processingType === 'super' ? 'Super' : 'Enhanced'} processing started in background.`;

    return NextResponse.json({
      success: true,
      documents: uploadedDocuments,
      processingType,
      message: processingMessage
    });

  } catch (error) {
    console.error('Error in document upload:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 