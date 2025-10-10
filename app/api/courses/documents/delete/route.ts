import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithcourseAccess } from '../../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../../utils/error-responses';
import { PortfolioService } from '../../../../services/portfolio-service';

export async function POST(request: NextRequest) {
  try {
    const { documentId, courseId } = await request.json();

    // VALIDATE REQUIRED FIELDS
    if (!documentId || !courseId) {
      return handleValidationError('Document ID and course ID are required');
    }

    // AUTHENTICATE USER AND VERIFY course ACCESS
    const { user, membership, serviceClient } = await authenticateWithcourseAccess(courseId);

    // VERIFY USER IS MANAGER
    if (membership.role !== 'manager') {
      return handleAuthError(new Error('INSUFFICIENT_PERMISSIONS'));
    }

    // DELETE DOCUMENT USING SERVICE
    const portfolioService = new PortfolioService();
    const result = await portfolioService.deleteDocument({
      documentId,
      courseId
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Document deleted successfully'
      });
    } else {
      return handleDatabaseError(new Error(result.error), 'delete document');
    }

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'course_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in document delete route:', error);
    return handleDatabaseError(error, 'delete document');
  }
}
