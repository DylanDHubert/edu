import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page');
    
    console.log(`PDF REQUEST: Document ${docId}, Page ${page || 'all'}`);
    
    // Get document info from team_documents table
    const serviceClient = createServiceClient();
    const { data: document, error: documentError } = await serviceClient
      .from('team_documents')
      .select('file_path, original_name, team_id, portfolio_id')
      .eq('id', docId)
      .single();
    
    if (documentError || !document) {
      console.error('DOCUMENT NOT FOUND:', documentError);
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }
    
    console.log(`FOUND DOCUMENT: ${document.original_name} at ${document.file_path}`);
    
    // Construct the Supabase Storage public URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('SUPABASE URL NOT CONFIGURED');
      return NextResponse.json(
        { error: 'Storage configuration error' },
        { status: 500 }
      );
    }
    
    // Build the public URL with page anchor
    let redirectUrl = `${supabaseUrl}/storage/v1/object/public/team-documents/${document.file_path}`;
    if (page) {
      redirectUrl += `#page=${page}`;
    }
    
    console.log(`REDIRECTING TO: ${redirectUrl}`);
    
    // Redirect to the Supabase Storage URL with page anchor
    return NextResponse.redirect(redirectUrl);
    
  } catch (error) {
    console.error('PDF SERVING ERROR:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
