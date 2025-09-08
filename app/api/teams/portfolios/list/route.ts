import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithTeamAccess } from '../../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../../utils/error-responses';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');

    if (!teamId) {
      return handleValidationError('Team ID is required');
    }

    // AUTHENTICATE USER AND VERIFY TEAM ACCESS
    const { user, membership, serviceClient } = await authenticateWithTeamAccess(teamId);

    // Load existing portfolios and their documents using service client
    const { data: portfoliosData, error: portfoliosError } = await serviceClient
      .from('team_portfolios')
      .select(`
        *,
        team_documents (
          id,
          filename,
          original_name
        )
      `)
      .eq('team_id', teamId)
      .order('created_at');

    if (portfoliosError) {
      return handleDatabaseError(portfoliosError, 'load portfolios');
    }

    return NextResponse.json({
      success: true,
      portfolios: portfoliosData || []
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in portfolios list API:', error);
    return handleDatabaseError(error, 'fetch portfolios list');
  }
}
