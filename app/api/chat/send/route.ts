import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../utils/supabase/server';
import { sendMessage, sendMessageStreaming } from '../../../utils/openai';
import { cookies } from 'next/headers';
import { getNotesForTeamContext, formatNotesForContext } from '../../../utils/notes-server';
import { verifyUserAuth, verifyTeamAccess } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    const { user, supabase } = await verifyUserAuth(cookieStore);

    // VERIFY USER OWNS THIS THREAD
    const { data: chatHistory, error: ownershipError } = await supabase
      .from('chat_history')
      .select('*')
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
      .single();

    if (ownershipError || !chatHistory) {
      return handleDatabaseError(ownershipError, 'verify thread ownership');
    }

    // GET NOTES FOR TEAM CONTEXT
    let notes = [];
    notes = await getNotesForTeamContext(teamId, accountId, portfolioId, user.id);
    
    const notesContext = formatNotesForContext(notes);
    
    // COMBINE NOTES AND MESSAGE (team knowledge is already in thread from creation)
    let fullContext = '';
    if (notesContext) {
      fullContext += notesContext;
    }
    
    const messageWithContext = fullContext ? `${fullContext}USER MESSAGE: ${message}` : message;
    
    // IF STREAMING IS REQUESTED, RETURN STREAMING RESPONSE
    if (streaming) {
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        async start(controller) {
          try {
            let finalContent = '';
            
            await sendMessageStreaming(
              threadId, 
              messageWithContext, 
              assistantId,
              (content: string, citations: string[], step?: string) => {
                finalContent = content; // CAPTURE FINAL CONTENT
                
                try {
                  // SEND STREAMING UPDATE WITH SAFE JSON HANDLING
                  const data = JSON.stringify({
                    type: 'update',
                    content,
                    citations,
                    step
                  });
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch (jsonError) {
                  console.error('JSON stringify error:', jsonError);
                  // FALLBACK: SEND A SAFE VERSION
                  const safeData = JSON.stringify({
                    type: 'update',
                    content: content.replace(/[\u0000-\u001F\u007F-\u009F]/g, ''), // REMOVE CONTROL CHARACTERS
                    citations: citations || [],
                    step: step || ''
                  });
                  controller.enqueue(encoder.encode(`data: ${safeData}\n\n`));
                }
              }
            );
            
            // SEND COMPLETION SIGNAL
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
            controller.close();
          } catch (error) {
            const errorData = JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'UNKNOWN ERROR'
            });
            controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // NON-STREAMING RESPONSE
    const messages = await sendMessage(threadId, messageWithContext, assistantId);
    
    return NextResponse.json({ messages });
  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in chat send route:', error);
    return handleDatabaseError(error, 'process chat message');
  }
} 