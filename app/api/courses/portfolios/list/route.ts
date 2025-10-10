import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithcourseAccess } from '../../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../../utils/error-responses';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId');

    if (!courseId) {
      return handleValidationError('course ID is required');
    }

    // AUTHENTICATE USER AND VERIFY course ACCESS
    const { user, membership, serviceClient } = await authenticateWithcourseAccess(courseId);

    // Load existing portfolios and their documents using service client
    const { data: portfoliosData, error: portfoliosError } = await serviceClient
      .from('course_portfolios')
      .select(`
        *,
        course_documents (
          id,
          filename,
          original_name,
          file_size
        )
      `)
      .eq('course_id', courseId)
      .order('created_at');

    if (portfoliosError) {
      return handleDatabaseError(portfoliosError, 'load portfolios');
    }

    return NextResponse.json({
      success: true,
      portfolios: portfoliosData || []
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'course_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in portfolios list API:', error);
    return handleDatabaseError(error, 'fetch portfolios list');
  }
}
