// SAFE MODE: PDF PAGE IMAGE GENERATION API
// RENDERS PDF PAGES AS IMAGES USING PDF.js

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../utils/supabase/server';
import { verifyUserAuth } from '../../../../utils/auth-helpers';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');
    const pageNumber = parseInt(searchParams.get('page') || '1');
    const teamId = searchParams.get('teamId');
    const portfolioId = searchParams.get('portfolioId');

    // VALIDATE PARAMETERS
    if (!documentId || !pageNumber || !teamId || !portfolioId) {
      return NextResponse.json(
        { error: 'Document ID, page number, team ID, and portfolio ID are required' },
        { status: 400 }
      );
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const { user } = await verifyUserAuth(cookieStore);

    // VERIFY USER HAS ACCESS TO THIS TEAM/PORTFOLIO
    const serviceClient = createServiceClient();
    const { data: teamMember, error: memberError } = await serviceClient
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberError || !teamMember) {
      return NextResponse.json(
        { error: 'Access denied to this team' },
        { status: 403 }
      );
    }

    // GET DOCUMENT INFO
    const { data: document, error: docError } = await serviceClient
      .from('team_documents')
      .select('original_name, file_path')
      .eq('id', documentId)
      .eq('team_id', teamId)
      .eq('portfolio_id', portfolioId)
      .single();

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // FOR SAFE MODE: USE THE TEST PDF DIRECTLY
    // NO NEED FOR DATABASE LOOKUP - JUST USE THE TEST PDF
    const testPdfUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/safemode_testdata.pdf`;
    
    // USE PDF.js TO RENDER THE PAGE AS AN IMAGE
    // THIS WILL BE A DATA URL (base64 encoded image)
    const pdfJsUrl = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(testPdfUrl)}#page=${pageNumber}`;
    
    // FOR NOW, RETURN A PLACEHOLDER THAT SHOWS THE PAGE NUMBER
    // LATER: IMPLEMENT ACTUAL PDF.js CANVAS RENDERING
    const placeholderImageUrl = `https://via.placeholder.com/400x600/1e293b/94a3b8?text=Page+${pageNumber}+of+${document.original_name}`;

    return NextResponse.json({
      success: true,
      imageUrl: placeholderImageUrl,
      pageNumber,
      documentName: document.original_name,
      pdfUrl: testPdfUrl
    });

  } catch (error) {
    console.error('PDF PAGE IMAGE ERROR:', error);
    return NextResponse.json(
      { error: 'Failed to generate page image' },
      { status: 500 }
    );
  }
}
