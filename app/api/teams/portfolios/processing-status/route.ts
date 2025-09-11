import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithTeamAccess } from '../../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../../utils/error-responses';
import { JobQueueService } from '../../../../services/job-queue-service';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const teamId = url.searchParams.get('teamId');
    const portfolioId = url.searchParams.get('portfolioId');

    // VALIDATE REQUIRED FIELDS
    if (!teamId || !portfolioId) {
      return handleValidationError('Team ID and Portfolio ID are required');
    }

    // AUTHENTICATE USER AND VERIFY TEAM ACCESS
    const { user, membership, serviceClient } = await authenticateWithTeamAccess(teamId);

    // CHECK PROCESSING STATUS
    const jobQueueService = new JobQueueService();
    const status = await jobQueueService.isPortfolioProcessingComplete(teamId, portfolioId);

    return NextResponse.json({
      success: true,
      ...status
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in portfolio processing status route:', error);
    return handleDatabaseError(error, 'check portfolio processing status');
  }
}
