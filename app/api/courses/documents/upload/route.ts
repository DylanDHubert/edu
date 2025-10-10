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

    const { courseId, portfolioId, uploadedFiles } = await request.json();

    // Validate required fields
    if (!courseId || !portfolioId || !uploadedFiles || !Array.isArray(uploadedFiles)) {
      return NextResponse.json(
        { error: 'course ID, portfolio ID, and uploaded files array are required' },
        { status: 400 }
      );
    }

    // Validate uploaded files structure
    for (const file of uploadedFiles) {
      if (!file.processingType || !['standard', 'enhanced', 'super'].includes(file.processingType)) {
        return NextResponse.json(
          { error: 'Each file must have a valid processingType (standard, enhanced, or super)' },
          { status: 400 }
        );
      }
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

    // Initialize services for ALL processing types (unified approach)
    const jobQueueService = new JobQueueService();
    let llamaparseService: LlamaParseService | null = null;

    // Process uploaded files
    for (const uploadedFile of uploadedFiles) {
      const { filePath, originalName, uniqueFileName, fileSize, processingType } = uploadedFile;

      // Initialize LlamaParse service if needed for this file
      if ((processingType === 'enhanced' || processingType === 'super') && !llamaparseService) {
        llamaparseService = new LlamaParseService();
      }

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

      // UNIFIED PROCESSING: All modes use job queue system
      // Save document record with pending status
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
          openai_file_id: null, // Will be set when processing completes
          processing_type: processingType,
          status: 'pending', // REQUIRED FIELD - unified approach
          uploaded_by: user.id
        })
        .select()
        .single();

      if (docError) {
        console.error('Error creating document record:', docError);
        continue;
      }

      // CREATE PROCESSING JOB FOR ALL MODES
      try {
        if (processingType === 'standard') {
          // STANDARD: Create job without LlamaParse
          await jobQueueService.createJob(document.id, courseId, portfolioId, null, processingType);
          console.log(`PROCESSING JOB CREATED FOR STANDARD: ${originalName}`);
        } else {
          // ENHANCED/SUPER: Submit to LlamaParse first
          const llamaparseJobId = await llamaparseService!.submitDocument(buffer, originalName, processingType as 'enhanced' | 'super');
          console.log(`LLAMAPARSE JOB SUBMITTED: ${originalName} -> Job ID: ${llamaparseJobId}`);

          // CREATE PROCESSING JOB
          await jobQueueService.createJob(document.id, courseId, portfolioId, llamaparseJobId, processingType);
          console.log(`PROCESSING JOB CREATED FOR: ${originalName}`);
        }

        // UPDATE DOCUMENT STATUS TO PROCESSING
        const { error: statusError } = await serviceClient
          .from('course_documents')
          .update({ status: 'processing' })
          .eq('id', document.id);

        if (statusError) {
          console.error('ERROR UPDATING DOCUMENT STATUS:', statusError);
          throw new Error(`Failed to update document status: ${statusError.message}`);
        }

      } catch (jobError) {
        console.error('ERROR CREATING PROCESSING JOB:', jobError);
        // MARK DOCUMENT AS FAILED
        await serviceClient
          .from('course_documents')
          .update({ status: 'failed' })
          .eq('id', document.id);
        
        // CONTINUE WITH NEXT FILE INSTEAD OF RETURNING ERROR
        continue;
      }

      uploadedDocuments.push({
        id: document.id,
        filename: document.filename,
        originalName: document.original_name,
        fileSize: document.file_size,
        status: 'processing'
      });
    }

    const processingMessage = `${uploadedFiles.length} file(s) uploaded. Processing started in background.`;

    return NextResponse.json({
      success: true,
      documents: uploadedDocuments,
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