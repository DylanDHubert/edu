import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { validateFileContent, validateMarkdownContent } from '../../../../utils/security';
import { rateLimitMiddleware, RATE_LIMITS } from '../../../../utils/rate-limit';

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

    const { teamId, portfolioId, uploadedFiles } = await request.json();

    // Validate required fields
    if (!teamId || !portfolioId || !uploadedFiles || !Array.isArray(uploadedFiles)) {
      return NextResponse.json(
        { error: 'Team ID, portfolio ID, and uploaded files array are required' },
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

    // Verify user is a manager of this team
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

    // Get portfolio and team info using service client
    const serviceClient = createServiceClient();
    const { data: portfolio, error: portfolioError } = await serviceClient
      .from('team_portfolios')
      .select(`
        *,
        teams!inner(name)
      `)
      .eq('id', portfolioId)
      .eq('team_id', teamId)
      .single();

    if (portfolioError || !portfolio) {
      return NextResponse.json(
        { error: 'Portfolio not found' },
        { status: 404 }
      );
    }

    const uploadedDocuments = [];
    const openaiFileIds = [];

    // Process uploaded files
    for (const uploadedFile of uploadedFiles) {
      const { filePath, originalName, uniqueFileName, fileSize } = uploadedFile;

      // Download file from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('team-documents')
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

      // Upload to OpenAI
      const fileType = originalName.toLowerCase().endsWith('.md') ? 'text/markdown' : 'application/pdf';
      const openaiFile = await client.files.create({
        file: new File([buffer], originalName, { type: fileType }),
        purpose: 'assistants'
      });

      openaiFileIds.push(openaiFile.id);

      // Save document record using service client
      const { data: document, error: docError } = await serviceClient
        .from('team_documents')
        .insert({
          team_id: teamId,
          portfolio_id: portfolioId,
          filename: uniqueFileName,
          original_name: originalName,
          file_path: filePath,
          file_size: fileSize,
          openai_file_id: openaiFile.id,
          uploaded_by: user.id
        })
        .select()
        .single();

      if (docError) {
        console.error('Error saving document record:', docError);
        // Continue with other files even if one fails
      } else {
        uploadedDocuments.push(document);
      }
    }

    return NextResponse.json({
      success: true,
      documents: uploadedDocuments,
      message: `${uploadedFiles.length} file(s) uploaded and processed successfully.`
    });

  } catch (error) {
    console.error('Error in document upload:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 