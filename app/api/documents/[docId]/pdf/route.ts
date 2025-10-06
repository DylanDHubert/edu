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
    
    // Generate a signed URL for the PDF (works with private buckets)
    const { data: signedUrlData, error: signedUrlError } = await serviceClient.storage
      .from('team-documents')
      .createSignedUrl(document.file_path, 3600); // 1 hour expiry
    
    if (signedUrlError || !signedUrlData) {
      console.error('SIGNED URL ERROR:', signedUrlError);
      return NextResponse.json(
        { error: 'Failed to generate PDF access URL' },
        { status: 500 }
      );
    }
    
    // Build the signed URL with PDF.js viewer for better page navigation
    let redirectUrl = signedUrlData.signedUrl;
    if (page) {
      // Use PDF.js viewer with page parameter (more reliable than #page anchor)
      redirectUrl = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(signedUrlData.signedUrl)}&page=${page}`;
    }
    
    console.log(`🔍 PDF DEBUG INFO:`);
    console.log(`   Document ID: ${docId}`);
    console.log(`   Page Requested: ${page}`);
    console.log(`   File Path: ${document.file_path}`);
    console.log(`   Signed URL: ${signedUrlData.signedUrl}`);
    console.log(`   Final Redirect URL: ${redirectUrl}`);
    
    // Redirect to the signed URL with page anchor
    return NextResponse.redirect(redirectUrl);
    
  } catch (error) {
    console.error('PDF SERVING ERROR:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
