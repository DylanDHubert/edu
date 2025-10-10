import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithcourseAccess } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';
import { AssistantService } from '../../../services/assistant-service';
import { CreateAssistantRequest } from '../../../types/assistant';

export async function POST(request: NextRequest) {
  try {
    const { courseId, portfolioId } = await request.json();

    // VALIDATE REQUIRED FIELDS
    if (!courseId || !portfolioId) {
      return handleValidationError('course ID and Portfolio ID are required');
    }

    // AUTHENTICATE USER AND VERIFY course ACCESS
    const { user, membership, serviceClient } = await authenticateWithcourseAccess(courseId);

    // CREATE ASSISTANT SERVICE AND DELEGATE TO IT
    const assistantService = new AssistantService();
    const result = await assistantService.createDynamicAssistant({
      courseId,
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
    if (error instanceof Error && ['UNAUTHORIZED', 'course_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in create dynamic assistant route:', error);
    return handleDatabaseError(error, 'create dynamic assistant');
  }
}