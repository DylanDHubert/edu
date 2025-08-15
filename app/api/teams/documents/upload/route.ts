import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const teamId = formData.get('teamId') as string;
    const portfolioId = formData.get('portfolioId') as string;
    const files = formData.getAll('files') as File[];

    // Validate required fields
    if (!teamId || !portfolioId || files.length === 0) {
      return NextResponse.json(
        { error: 'Team ID, portfolio ID, and files are required' },
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

    // Get portfolio and team info
    const { data: portfolio, error: portfolioError } = await supabase
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

    // Validate files
    for (const file of files) {
      if (file.type !== 'application/pdf') {
        return NextResponse.json(
          { error: 'Only PDF files are allowed' },
          { status: 400 }
        );
      }
      if (file.size > 512 * 1024 * 1024) { // 512MB limit
        return NextResponse.json(
          { error: `File ${file.name} exceeds 512MB limit` },
          { status: 400 }
        );
      }
    }

    const uploadedDocuments = [];
    const openaiFileIds = [];

    // Upload files to Supabase Storage and OpenAI
    for (const file of files) {
      // Generate unique filename
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2);
      const fileExtension = '.pdf';
      const fileName = `${timestamp}_${random}${fileExtension}`;
      const filePath = `teams/${teamId}/portfolios/${portfolioId}/${fileName}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('team-documents')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Error uploading to Supabase:', uploadError);
        return NextResponse.json(
          { error: 'Failed to upload file: ' + file.name },
          { status: 500 }
        );
      }

      // Convert file to buffer for OpenAI upload
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Upload to OpenAI
      const openaiFile = await client.files.create({
        file: new File([buffer], file.name, { type: 'application/pdf' }),
        purpose: 'assistants'
      });

      openaiFileIds.push(openaiFile.id);

      // Save document record
      const { data: document, error: docError } = await supabase
        .from('team_documents')
        .insert({
          team_id: teamId,
          portfolio_id: portfolioId,
          filename: fileName,
          original_name: file.name,
          file_path: filePath,
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
      message: `${files.length} file(s) uploaded and processed successfully.`
    });

  } catch (error) {
    console.error('Error in document upload:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 