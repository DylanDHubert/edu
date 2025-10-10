import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;
    
    console.log(`📄 SIGNED URL REQUEST: Document ${docId}`);
    
    // Get document info from course_documents table
    const serviceClient = createServiceClient();
    const { data: document, error: documentError } = await serviceClient
      .from('course_documents')
      .select('file_path, original_name, course_id, portfolio_id')
      .eq('id', docId)
      .single();
    
    if (documentError || !document) {
      console.error('❌ DOCUMENT NOT FOUND:', documentError);
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }
    
    console.log(`✅ FOUND DOCUMENT: ${document.original_name} at ${document.file_path}`);
    
    // Generate signed URL from Supabase Storage
    const { data: signedUrlData, error: signedUrlError } = await serviceClient.storage
      .from('course-documents')
      .createSignedUrl(document.file_path, 3600); // 1 hour expiry
    
    if (signedUrlError || !signedUrlData) {
      console.error('❌ SIGNED URL ERROR:', signedUrlError);
      return NextResponse.json(
        { error: 'Failed to generate PDF access URL' },
        { status: 500 }
      );
    }
    
    console.log(`🔗 SIGNED URL GENERATED for ${document.original_name}`);
    
    // Return document info and signed URL
    return NextResponse.json({
      documentName: document.original_name,
      signedUrl: signedUrlData.signedUrl,
      filePath: document.file_path
    });
    
  } catch (error) {
    console.error('❌ SIGNED URL ERROR:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

