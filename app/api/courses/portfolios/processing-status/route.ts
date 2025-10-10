import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithcourseAccess } from '../../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../../utils/error-responses';
import { JobQueueService } from '../../../../services/job-queue-service';

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

    // CHECK PROCESSING STATUS USING JOB QUEUE (GROUND TRUTH)
    const jobQueueService = new JobQueueService();
    const status = await jobQueueService.isPortfolioProcessingComplete(courseId, portfolioId);

    return NextResponse.json({
      success: true,
      ...status
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'course_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in portfolio processing status route:', error);
    return handleDatabaseError(error, 'check portfolio processing status');
  }
}
