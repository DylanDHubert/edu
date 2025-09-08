import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithTeamAccess } from '../../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../../utils/error-responses';
import { PortfolioService } from '../../../../services/portfolio-service';

export async function POST(request: NextRequest) {
  try {
    const { portfolioId, teamId } = await request.json();

    // VALIDATE REQUIRED FIELDS
    if (!portfolioId || !teamId) {
      return handleValidationError('Portfolio ID and Team ID are required');
    }

    // AUTHENTICATE USER AND VERIFY TEAM ACCESS
    const { user, membership, serviceClient } = await authenticateWithTeamAccess(teamId);

    // VERIFY USER IS MANAGER
    if (membership.role !== 'manager') {
      return handleAuthError(new Error('INSUFFICIENT_PERMISSIONS'));
    }

    // DELETE PORTFOLIO USING SERVICE
    const portfolioService = new PortfolioService();
    const result = await portfolioService.deletePortfolio({
      portfolioId,
      teamId
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Portfolio deleted successfully'
      });
    } else {
      return handleDatabaseError(new Error(result.error), 'delete portfolio');
    }

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in portfolio delete route:', error);
    return handleDatabaseError(error, 'delete portfolio');
  }
}
