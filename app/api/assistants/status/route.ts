import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithcourseAccess } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const courseId = url.searchParams.get('courseId');
    const portfolioId = url.searchParams.get('portfolioId');

    // VALIDATE REQUIRED FIELDS
    if (!courseId || !portfolioId) {
      return handleValidationError('course ID and Portfolio ID are required');
    }

    // AUTHENTICATE USER AND VERIFY course ACCESS
    const { user, membership, serviceClient } = await authenticateWithcourseAccess(courseId);

    // CHECK IF ASSISTANT EXISTS
    const { data: existingAssistant, error: assistantError } = await serviceClient
      .from('course_assistants')
      .select('*')
      .eq('course_id', courseId)
      .eq('portfolio_id', portfolioId)
      .single();

    if (assistantError || !existingAssistant) {
      // NO ASSISTANT EXISTS
      return NextResponse.json({
        success: true,
        status: 'none',
        exists: false,
        upToDate: false
      });
    }

    // Skip cache staleness check - no manual knowledge system
    return NextResponse.json({
      success: true,
      status: 'ready',
      exists: true,
      upToDate: true
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'course_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in assistant status route:', error);
    return handleDatabaseError(error, 'check assistant status');
  }
}