import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';
import { rateLimitMiddleware, RATE_LIMITS } from '../../../../utils/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // APPLY RATE LIMITING FOR FILE UPLOAD URL GENERATION
    const rateLimitResponse = rateLimitMiddleware(request, RATE_LIMITS.FILE_UPLOAD);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { teamId, portfolioId, fileName, fileSize } = await request.json();

    // Validate required fields
    if (!teamId || !portfolioId || !fileName || !fileSize) {
      return NextResponse.json(
        { error: 'Team ID, portfolio ID, file name, and file size are required' },
        { status: 400 }
      );
    }

    // Validate file size (512MB limit)
    if (fileSize > 512 * 1024 * 1024) {
      return NextResponse.json(
        { error: `File ${fileName} exceeds 512MB limit` },
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

    // Verify portfolio exists using service client
    const serviceClient = createServiceClient();
    const { data: portfolio, error: portfolioError } = await serviceClient
      .from('team_portfolios')
      .select('id')
      .eq('id', portfolioId)
      .eq('team_id', teamId)
      .single();

    if (portfolioError || !portfolio) {
      return NextResponse.json(
        { error: 'Portfolio not found' },
        { status: 404 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const fileExtension = '.pdf';
    const uniqueFileName = `${timestamp}_${random}${fileExtension}`;
    const filePath = `teams/${teamId}/portfolios/${portfolioId}/${uniqueFileName}`;

    // Generate signed upload URL (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('team-documents')
      .createSignedUploadUrl(filePath);

    if (signedUrlError) {
      console.error('Error generating signed URL:', signedUrlError);
      return NextResponse.json(
        { error: 'Failed to generate upload URL' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      uploadUrl: signedUrlData.signedUrl,
      filePath: filePath,
      uniqueFileName: uniqueFileName
    });

  } catch (error) {
    console.error('Error generating upload URL:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
