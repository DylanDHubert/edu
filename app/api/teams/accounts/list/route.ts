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

    // Load existing accounts and their knowledge using service client
    const { data: accountsData, error: accountsError } = await serviceClient
      .from('team_accounts')
      .select(`
        *,
        account_portfolios (portfolio_id),
        team_knowledge!team_knowledge_account_id_fkey (*)
      `)
      .eq('team_id', teamId)
      .order('created_at');

    if (accountsError) {
      return handleDatabaseError(accountsError, 'load accounts');
    }

    return NextResponse.json({
      success: true,
      accounts: accountsData || []
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in accounts list API:', error);
    return handleDatabaseError(error, 'fetch accounts list');
  }
}
