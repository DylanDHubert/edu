import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { teamId, documentId } = await request.json();

    // Validate required fields
    if (!teamId || !documentId) {
      return NextResponse.json(
        { error: 'Team ID and document ID are required' },
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

    const serviceClient = createServiceClient();

    // Get the document to verify it exists and get OpenAI file ID
    const { data: document, error: documentError } = await serviceClient
      .from('team_documents')
      .select('id, original_name, openai_file_id, file_path, team_id')
      .eq('id', documentId)
      .eq('team_id', teamId)
      .eq('document_type', 'inventory')
      .single();

    if (documentError || !document) {
      return NextResponse.json(
        { error: 'Inventory document not found' },
        { status: 404 }
      );
    }

    // Delete from Supabase storage
    const { error: storageError } = await serviceClient.storage
      .from('team-documents')
      .remove([document.file_path]);

    if (storageError) {
      console.error('Error deleting file from storage:', storageError);
      // Continue with database deletion even if storage deletion fails
    }

    // Delete from OpenAI if file exists
    if (document.openai_file_id && document.openai_file_id !== 'processing' && document.openai_file_id !== 'failed') {
      try {
        await openaiClient.files.del(document.openai_file_id);
        console.log(`Deleted OpenAI file: ${document.openai_file_id}`);
      } catch (openaiError) {
        console.error('Error deleting OpenAI file:', openaiError);
        // Continue with database deletion even if OpenAI deletion fails
      }
    }

    // Delete any associated processing jobs
    const { error: jobError } = await serviceClient
      .from('processing_jobs')
      .delete()
      .eq('document_id', documentId);

    if (jobError) {
      console.error('Error deleting processing jobs:', jobError);
      // Continue with document deletion
    }

    // Delete the document record
    const { error: deleteError } = await serviceClient
      .from('team_documents')
      .delete()
      .eq('id', documentId);

    if (deleteError) {
      console.error('Error deleting document record:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete inventory document' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Inventory document "${document.original_name}" deleted successfully`
    });

  } catch (error) {
    console.error('Error deleting inventory document:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
