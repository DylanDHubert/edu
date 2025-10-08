import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithTeamAccess } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';
import { AssistantService } from '../../../services/assistant-service';
import { CreateAssistantRequest } from '../../../types/assistant';

export async function POST(request: NextRequest) {
  try {
    const { teamId, portfolioId } = await request.json();

    // VALIDATE REQUIRED FIELDS
    if (!teamId || !portfolioId) {
      return handleValidationError('Team ID and Portfolio ID are required');
    }

    // AUTHENTICATE USER AND VERIFY TEAM ACCESS
    const { user, membership, serviceClient } = await authenticateWithTeamAccess(teamId);

    // CREATE ASSISTANT SERVICE AND DELEGATE TO IT
    const assistantService = new AssistantService();
    const result = await assistantService.createDynamicAssistant({
      teamId,
      portfolioId,
      userId: user.id
    });

    // RETURN RESULT
    if (result.success) {
      return NextResponse.json({
        success: true,
        assistantId: result.assistantId
      });
    } else {
      return handleDatabaseError(new Error(result.error), 'create dynamic assistant');
    }

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in create dynamic assistant route:', error);
    return handleDatabaseError(error, 'create dynamic assistant');
  }
}