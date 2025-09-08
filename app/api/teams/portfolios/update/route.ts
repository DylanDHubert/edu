import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithTeamAccess } from '../../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../../utils/error-responses';
import { PortfolioService } from '../../../../services/portfolio-service';

export async function POST(request: NextRequest) {
  try {
    const { portfolioId, teamId, name, description } = await request.json();

    // VALIDATE REQUIRED FIELDS
    if (!portfolioId || !teamId || !name) {
      return handleValidationError('Portfolio ID, Team ID, and name are required');
    }

    // AUTHENTICATE USER AND VERIFY TEAM ACCESS
    const { user, membership, serviceClient } = await authenticateWithTeamAccess(teamId);

    // VERIFY USER IS MANAGER
    if (membership.role !== 'manager') {
      return handleAuthError(new Error('INSUFFICIENT_PERMISSIONS'));
    }

    // UPDATE PORTFOLIO USING SERVICE
    const portfolioService = new PortfolioService();
    const result = await portfolioService.updatePortfolio({
      portfolioId,
      teamId,
      name,
      description
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        portfolio: result.portfolio
      });
    } else {
      return handleDatabaseError(new Error(result.error), 'update portfolio');
    }

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in portfolio update route:', error);
    return handleDatabaseError(error, 'update portfolio');
  }
}
