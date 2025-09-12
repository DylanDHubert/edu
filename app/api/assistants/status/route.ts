import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithTeamAccess } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';
import { ContextGeneratorService } from '../../../services/context-generator-service';

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

    // CHECK IF ASSISTANT EXISTS
    const { data: existingAssistant, error: assistantError } = await serviceClient
      .from('team_assistants')
      .select('*')
      .eq('team_id', teamId)
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

    // CHECK IF CACHE IS STALE
    const contextService = new ContextGeneratorService();
    const isStale = await contextService.checkIfCacheIsStale(teamId, portfolioId);

    return NextResponse.json({
      success: true,
      status: isStale ? 'outdated' : 'ready',
      exists: true,
      upToDate: !isStale
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in assistant status route:', error);
    return handleDatabaseError(error, 'check assistant status');
  }
}