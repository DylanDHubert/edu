import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';
import { rateLimitMiddleware, RATE_LIMITS } from '../../../../utils/rate-limit';
import { JobQueueService } from '../../../../services/job-queue-service';
import { LlamaParseService } from '../../../../services/llamaparse-service';

export async function POST(request: NextRequest) {
  try {
    // APPLY RATE LIMITING FOR FILE UPLOAD
    const rateLimitResponse = rateLimitMiddleware(request, RATE_LIMITS.FILE_UPLOAD);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { teamId, uploadedFiles } = await request.json();

    // VALIDATE REQUIRED FIELDS
    if (!teamId || !uploadedFiles || !Array.isArray(uploadedFiles)) {
      return NextResponse.json(
        { error: 'Team ID and uploaded files array are required' },
        { status: 400 }
      );
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // VERIFY USER IS A MANAGER OF THIS TEAM
    const { data: teamMember, error: memberError } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberError || !teamMember || teamMember.role !== 'manager') {
      return NextResponse.json(
        { error: 'Manager access required' },
        { status: 403 }
      );
    }

    // VERIFY TEAM EXISTS USING SERVICE CLIENT
    const serviceClient = createServiceClient();
    const { data: team, error: teamError } = await serviceClient
      .from('teams')
      .select('id, name')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    const jobQueueService = new JobQueueService();
    const llamaparseService = new LlamaParseService();
    const uploadedDocuments = [];

    // PROCESS UPLOADED FILES
    for (const uploadedFile of uploadedFiles) {
      const { filePath, originalName, uniqueFileName, fileSize } = uploadedFile;

      // CREATE DOCUMENT RECORD WITH PROCESSING STATUS
      const { data: document, error: docError } = await serviceClient
        .from('team_documents')
        .insert({
          team_id: teamId,
          portfolio_id: null, // NULL for inventory documents
          filename: uniqueFileName,
          original_name: originalName,
          file_path: filePath,
          file_size: fileSize,
          openai_file_id: null, // WILL BE SET TO 'processing' WHEN JOB STARTS
          uploaded_by: user.id,
          document_type: 'inventory' // MARK AS INVENTORY DOCUMENT
        })
        .select()
        .single();

      if (docError) {
        console.error('ERROR CREATING INVENTORY DOCUMENT RECORD:', docError);
        return NextResponse.json(
          { error: 'Failed to create inventory document record: ' + originalName },
          { status: 500 }
        );
      }

      // DOWNLOAD EXCEL FILE FROM SUPABASE STORAGE TO SUBMIT TO LLAMAPARSE
      try {
        const { data: fileData, error: downloadError } = await serviceClient.storage
          .from('team-documents')
          .download(filePath);

        if (downloadError) {
          throw new Error(`Failed to download Excel file: ${downloadError.message}`);
        }

        // CONVERT TO BUFFER
        const arrayBuffer = await fileData.arrayBuffer();
        const excelBuffer = Buffer.from(arrayBuffer);

        console.log(`EXCEL FILE DOWNLOADED FOR LLAMAPARSE: ${originalName} (${excelBuffer.length} bytes)`);

        // SUBMIT TO LLAMAPARSE AND GET JOB ID IMMEDIATELY
        const llamaparseJobId = await llamaparseService.submitDocument(excelBuffer, originalName);
        console.log(`LLAMAPARSE JOB SUBMITTED: ${originalName} -> Job ID: ${llamaparseJobId}`);

        // CREATE PROCESSING JOB WITH LLAMAPARSE JOB ID
        // Note: portfolio_id is NULL for inventory documents
        await jobQueueService.createJob(document.id, teamId, null, llamaparseJobId);
        console.log(`PROCESSING JOB CREATED FOR INVENTORY: ${originalName}`);

        // UPDATE DOCUMENT STATUS TO PROCESSING
        await serviceClient
          .from('team_documents')
          .update({ openai_file_id: 'processing' })
          .eq('id', document.id);

      } catch (jobError) {
        console.error('ERROR CREATING PROCESSING JOB:', jobError);
        // MARK DOCUMENT AS FAILED
        await serviceClient
          .from('team_documents')
          .update({ openai_file_id: 'failed' })
          .eq('id', document.id);
        // CONTINUE WITH OTHER FILES EVEN IF ONE FAILS
      }

      uploadedDocuments.push({
        id: document.id,
        filename: document.filename,
        originalName: document.original_name,
        fileSize: document.file_size,
        status: 'processing'
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Inventory files uploaded successfully. Processing started in background.',
      documents: uploadedDocuments
    });

  } catch (error) {
    console.error('ERROR IN INVENTORY UPLOAD WITH LLAMAPARSE ROUTE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
