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
    
    // Get PDF from Supabase Storage
    const { data: pdfData, error: downloadError } = await serviceClient.storage
      .from('team-documents')
      .download(document.file_path);
    
    if (downloadError) {
      console.error('PDF DOWNLOAD ERROR:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download PDF' },
        { status: 500 }
      );
    }
    
    console.log(`PDF DOWNLOADED: ${pdfData.size} bytes`);
    
    // Convert to buffer for response
    const pdfBuffer = await pdfData.arrayBuffer();
    
    // Create response with PDF data
    const response = new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${document.original_name}"`,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        // Add page anchor if specified
        ...(page && { 'X-Page-Anchor': `#page=${page}` })
      }
    });
    
    console.log(`PDF SERVED: ${document.original_name} (${pdfBuffer.byteLength} bytes)`);
    return response;
    
  } catch (error) {
    console.error('PDF SERVING ERROR:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
