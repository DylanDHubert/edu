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

    const { courseId, portfolioId, fileName, fileSize } = await request.json();

    // Validate required fields
    if (!courseId || !portfolioId || !fileName || !fileSize) {
      return NextResponse.json(
        { error: 'course ID, portfolio ID, file name, and file size are required' },
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

    // USE SERVICE CLIENT TO BYPASS RLS FOR MEMBERSHIP CHECK
    const serviceClient = createServiceClient();
    const { data: courseMember, error: memberError } = await serviceClient
      .from('course_members')
      .select('role')
      .eq('course_id', courseId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberError || !courseMember || courseMember.role !== 'manager') {
      return NextResponse.json(
        { error: 'Manager access required' },
        { status: 403 }
      );
    }

    // Verify portfolio exists using service client
    const { data: portfolio, error: portfolioError } = await serviceClient
      .from('course_portfolios')
      .select('id')
      .eq('id', portfolioId)
      .eq('course_id', courseId)
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
    const fileExtension = fileName.toLowerCase().endsWith('.md') ? '.md' : '.pdf';
    const uniqueFileName = `${timestamp}_${random}${fileExtension}`;
    const filePath = `courses/${courseId}/portfolios/${portfolioId}/${uniqueFileName}`;

    // Generate signed upload URL (valid for 1 hour) - USE SERVICE CLIENT FOR STORAGE
    const { data: signedUrlData, error: signedUrlError } = await serviceClient.storage
      .from('course-documents')
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
