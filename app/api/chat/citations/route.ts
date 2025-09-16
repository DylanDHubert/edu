import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyUserAuth } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';
import { ChatService } from '../../../services/chat-service';
import { StoreCitationsRequest, GetCitationsRequest } from '../../../types/chat';

export async function POST(request: NextRequest) {
  try {
    const { threadId, openaiMessageId, citations } = await request.json();
    
    if (!threadId || !openaiMessageId || !citations) {
      return handleValidationError('Thread ID, OpenAI message ID, and citations are required');
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const { user } = await verifyUserAuth(cookieStore);

    // CREATE STORE CITATIONS REQUEST
    const storeCitationsRequest: StoreCitationsRequest = {
      threadId,
      openaiMessageId,
      citations
    };

    // STORE CITATIONS
    const chatService = new ChatService();
    const result = await chatService.storeMessageCitations(storeCitationsRequest, user.id);

    if (result.success) {
      return NextResponse.json({ 
        success: true,
        message: 'Citations stored successfully'
      });
    } else {
      return handleDatabaseError(new Error(result.error), 'store citations');
    }

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error storing citations:', error);
    return handleDatabaseError(error, 'store citations');
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get('threadId');
    const messageId = searchParams.get('messageId');
    
    if (!threadId && !messageId) {
      return handleValidationError('Thread ID or Message ID is required');
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const { user } = await verifyUserAuth(cookieStore);

    // CREATE GET CITATIONS REQUEST
    const getCitationsRequest: GetCitationsRequest = {
      threadId: threadId || '', // WILL BE DETERMINED FROM MESSAGE ID IF NOT PROVIDED
      messageId: messageId || undefined
    };

    // GET CITATIONS
    const chatService = new ChatService();
    const result = await chatService.getMessageCitations(getCitationsRequest, user.id);

    if (result.success) {
      return NextResponse.json({ 
        citations: result.citations 
      });
    } else {
      return handleDatabaseError(new Error(result.error), 'load citations');
    }

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error loading citations:', error);
    return handleDatabaseError(error, 'load citations');
  }
}
