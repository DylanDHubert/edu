import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithTeamAccess } from '../../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../../utils/error-responses';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const type = searchParams.get('type'); // 'general', 'account', 'portfolio'

    if (!teamId) {
      return handleValidationError('Team ID is required');
    }

    // AUTHENTICATE USER AND VERIFY TEAM ACCESS
    const { user, membership, serviceClient } = await authenticateWithTeamAccess(teamId);

    // Build query based on type
    let query = serviceClient
      .from('team_knowledge')
      .select('*')
      .eq('team_id', teamId);

    if (type === 'general') {
      query = query.is('account_id', null).is('portfolio_id', null);
    } else if (type === 'account') {
      query = query.not('account_id', 'is', null);
    } else if (type === 'portfolio') {
      query = query.not('portfolio_id', 'is', null);
    }

    const { data: knowledgeData, error: knowledgeError } = await query.order('created_at');

    if (knowledgeError) {
      return handleDatabaseError(knowledgeError, 'load knowledge');
    }

    return NextResponse.json({
      success: true,
      knowledge: knowledgeData || []
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in knowledge list API:', error);
    return handleDatabaseError(error, 'fetch knowledge list');
  }
}
