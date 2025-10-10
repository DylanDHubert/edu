import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyUserAuth } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';
import { ChatService } from '../../../services/chat-service';
import { GetRatingsRequest } from '../../../types/chat';

export async function POST(request: NextRequest) {
  try {
    const { threadId } = await request.json();
    
    if (!threadId) {
      return handleValidationError('Thread ID is required');
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const { user } = await verifyUserAuth(cookieStore);

    // CREATE GET RATINGS REQUEST
    const getRatingsRequest: GetRatingsRequest = {
      threadId
    };

    // GET RATINGS
    const chatService = new ChatService();
    const result = await chatService.getRatings(getRatingsRequest, user.id);

    if (result.success) {
      return NextResponse.json({ 
        ratings: result.ratings 
      });
    } else {
      return handleDatabaseError(new Error(result.error), 'load ratings');
    }

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'course_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error loading ratings:', error);
    return handleDatabaseError(error, 'load ratings');
  }
}