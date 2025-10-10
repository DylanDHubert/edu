import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyUserAuth } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';
import { ChatService } from '../../../services/chat-service';
import { RateMessageRequest } from '../../../types/chat';

export async function POST(request: NextRequest) {
  try {
    const { threadId, messageId, rating, courseId, portfolioId, responseTimeMs, feedbackText } = await request.json();
    
    if (!threadId || !messageId || !courseId || !portfolioId) {
      return handleValidationError('Thread ID, message ID, course ID, and portfolio ID are required');
    }

    // VALIDATE RATING VALUE (ALLOW NULL/UNDEFINED FOR FEEDBACK-ONLY UPDATES)
    if (rating !== undefined && rating !== null && rating !== 1 && rating !== -1) {
      return handleValidationError('Rating must be 1 (thumbs up) or -1 (thumbs down)');
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const { user } = await verifyUserAuth(cookieStore);

    // CREATE RATE MESSAGE REQUEST
    const rateRequest: RateMessageRequest = {
      threadId,
      messageId,
      rating,
      courseId,
      portfolioId,
      responseTimeMs,
      feedbackText
    };

    // RATE MESSAGE
    const chatService = new ChatService();
    const result = await chatService.rateMessage(rateRequest, user.id);

    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        rating: result.rating 
      });
    } else {
      return handleDatabaseError(new Error(result.error), 'save message rating');
    }

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'course_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error rating message:', error);
    return handleDatabaseError(error, 'save message rating');
  }
}