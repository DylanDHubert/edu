import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyUserAuth } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';
import { ChatService } from '../../../services/chat-service';
import { SendMessageRequest } from '../../../types/chat';

export async function POST(request: NextRequest) {
  try {
    const { 
      threadId, 
      message, 
      assistantId, 
      teamId, 
      accountId, 
      portfolioId, 
      streaming = false 
    } = await request.json();
    
    if (!threadId || !message || !assistantId || !teamId || !accountId || !portfolioId) {
      return handleValidationError('Thread ID, message, assistant ID, team ID, account ID, and portfolio ID are required');
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const { user } = await verifyUserAuth(cookieStore);

    // CREATE SEND MESSAGE REQUEST
    const sendRequest: SendMessageRequest = {
      threadId,
      message,
      assistantId,
      teamId,
      accountId,
      portfolioId,
      streaming
    };

    // CREATE CHAT SERVICE
    const chatService = new ChatService();

    // IF STREAMING IS REQUESTED, RETURN STREAMING RESPONSE
    if (streaming) {
      const stream = await chatService.sendMessageStreaming(sendRequest, user.id);
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // NON-STREAMING RESPONSE
    const result = await chatService.sendMessage(sendRequest, user.id);
    
    if (result.success) {
      return NextResponse.json({ messages: result.messages });
    } else {
      return handleDatabaseError(new Error(result.error), 'process chat message');
    }

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in chat send route:', error);
    return handleDatabaseError(error, 'process chat message');
  }
}