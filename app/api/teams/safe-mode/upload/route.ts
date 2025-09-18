// SAFE MODE: UPLOAD API FOR MARKDOWN DOCUMENTS WITH PAGE BREAKS
// ALLOWS USERS TO UPLOAD PRE-PARSED MARKDOWN AND VECTORIZE IT FOR SEARCH

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { VectorizationService } from '../../../../services/vectorization-service';
import { cookies } from 'next/headers';
import { rateLimitMiddleware, RATE_LIMITS } from '../../../../utils/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // APPLY RATE LIMITING FOR FILE UPLOAD
    const rateLimitResponse = rateLimitMiddleware(request, RATE_LIMITS.FILE_UPLOAD);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { teamId, portfolioId, markdownContent, fileName } = await request.json();
    
    // VALIDATE REQUIRED FIELDS
    if (!teamId || !portfolioId || !markdownContent || !fileName) {
      return NextResponse.json(
        { error: 'Team ID, portfolio ID, markdown content, and file name are required' },
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

    // VERIFY PORTFOLIO EXISTS AND USER HAS ACCESS
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

    // VALIDATE MARKDOWN CONTENT HAS PAGE BREAKS
    const pageBreakPattern = /\n<<\d+>>\n/g;
    const hasPageBreaks = pageBreakPattern.test(markdownContent);
    
    if (!hasPageBreaks) {
      return NextResponse.json(
        { error: 'Markdown content must contain page breaks in format: \\n<<{page_number}>>\\n' },
        { status: 400 }
      );
    }

    console.log('SAFE MODE: UPLOADING MARKDOWN FOR TEAM', teamId, 'PORTFOLIO', portfolioId);

    // CREATE DOCUMENT RECORD
    const { data: document, error: docError } = await serviceClient
      .from('team_documents')
      .insert({
        team_id: teamId,
        portfolio_id: portfolioId,
        original_name: fileName,
        filename: `safe-mode-${Date.now()}_${fileName}`,
        file_path: `teams/${teamId}/portfolios/${portfolioId}/safe-mode/${fileName}`,
        openai_file_id: 'safe-mode-upload', // SPECIAL IDENTIFIER FOR SAFE MODE
        uploaded_by: user.id,
        file_size: Buffer.byteLength(markdownContent, 'utf8')
      })
      .select()
      .single();
    
    if (docError) {
      console.error('SAFE MODE: ERROR CREATING DOCUMENT RECORD:', docError);
      return NextResponse.json(
        { error: `Failed to create document: ${docError.message}` },
        { status: 500 }
      );
    }

    console.log('SAFE MODE: DOCUMENT RECORD CREATED:', document.id);

    // VECTORIZE THE MARKDOWN
    try {
      const vectorizationService = new VectorizationService();
      await vectorizationService.vectorizeUploadedMarkdown(document.id, markdownContent);
      
      console.log('SAFE MODE: VECTORIZATION COMPLETE FOR DOCUMENT:', document.id);
      
      return NextResponse.json({
        success: true,
        documentId: document.id,
        documentName: fileName,
        message: 'Safe mode document uploaded and vectorized successfully'
      });
      
    } catch (vectorizationError) {
      console.error('SAFE MODE: VECTORIZATION ERROR:', vectorizationError);
      
      // CLEAN UP DOCUMENT RECORD IF VECTORIZATION FAILED
      await serviceClient
        .from('team_documents')
        .delete()
        .eq('id', document.id);
      
      return NextResponse.json(
        { error: 'Failed to vectorize document content' },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('SAFE MODE UPLOAD ERROR:', error);
    return NextResponse.json(
      { error: 'Failed to process safe mode upload' },
      { status: 500 }
    );
  }
}
