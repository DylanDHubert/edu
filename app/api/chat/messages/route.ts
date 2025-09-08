import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyUserAuth } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';
import { ChatService } from '../../../services/chat-service';
import { GetMessagesRequest } from '../../../types/chat';

export async function POST(request: NextRequest) {
  try {
    const { threadId, portfolioType } = await request.json();
    
    if (!threadId) {
      return handleValidationError('Thread ID is required');
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const { user } = await verifyUserAuth(cookieStore);

    // CREATE GET MESSAGES REQUEST
    const getMessagesRequest: GetMessagesRequest = {
      threadId,
      portfolioType
    };

    // GET MESSAGES
    const chatService = new ChatService();
    const result = await chatService.getMessages(getMessagesRequest, user.id);

    if (result.success) {
      return NextResponse.json({ 
        messages: result.messages 
      });
    } else {
      return handleDatabaseError(new Error(result.error), 'get messages');
    }

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error getting messages:', error);
    return handleDatabaseError(error, 'get messages');
  }
}