import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { sendMessage, sendMessageStreaming } from '../../../utils/openai';
import { cookies } from 'next/headers';
import { getNotesForTeamContext, formatNotesForContext } from '../../../utils/notes-server';
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
      return NextResponse.json(
        { error: 'THREAD ID, MESSAGE, ASSISTANT ID, TEAM ID, ACCOUNT ID, AND PORTFOLIO ID ARE REQUIRED' },
        { status: 400 }
      );
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // VERIFY USER OWNS THIS THREAD
    const { data: chatHistory, error: ownershipError } = await supabase
      .from('chat_history')
      .select('*')
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
      .single();

    if (ownershipError || !chatHistory) {
      return NextResponse.json(
        { error: 'THREAD NOT FOUND OR ACCESS DENIED' },
        { status: 404 }
      );
    }

    // GET NOTES FOR TEAM CONTEXT
    let notes = [];
    console.log('🗒️ FETCHING TEAM NOTES:', { teamId, accountId, portfolioId, userId: user.id });
    notes = await getNotesForTeamContext(teamId, accountId, portfolioId, user.id);
    console.log('🗒️ TEAM NOTES FOUND:', notes.length, 'notes');
    
    const notesContext = formatNotesForContext(notes);
    console.log('🗒️ FORMATTED NOTES CONTEXT LENGTH:', notesContext.length, 'characters');
    if (notesContext) {
      console.log('🗒️ NOTES CONTEXT PREVIEW:', notesContext.substring(0, 200) + '...');
    }
    
    // ADD NOTES TO MESSAGE IF AVAILABLE (BUT KEEP ORIGINAL MESSAGE FOR THREAD)
    const messageWithNotes = notesContext ? `${notesContext}USER MESSAGE: ${message}` : message;
    console.log('🗒️ FINAL MESSAGE WITH NOTES LENGTH:', messageWithNotes.length, 'characters');
    
    // IF STREAMING IS REQUESTED, RETURN STREAMING RESPONSE
    if (streaming) {
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        async start(controller) {
          try {
            let finalContent = '';
            
            await sendMessageStreaming(
              threadId, 
              messageWithNotes, 
              assistantId,
              (content: string, citations: string[], step?: string) => {
                finalContent = content; // CAPTURE FINAL CONTENT
                
                // SEND STREAMING UPDATE
                const data = JSON.stringify({
                  type: 'update',
                  content,
                  citations,
                  step
                });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
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
    const messages = await sendMessage(threadId, messageWithNotes, assistantId);
    
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('ERROR IN SEND ROUTE:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
} 