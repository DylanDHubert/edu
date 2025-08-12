import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { sendMessage, sendMessageStreaming, getAssistantId } from '../../../utils/openai';
import { PortfolioType } from '../../../utils/openai';
import { cookies } from 'next/headers';
import { getNotesForPortfolio, formatNotesForContext } from '../../../utils/notes-server';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { threadId, message, portfolioType, streaming = false } = await request.json();
    
    if (!threadId || !message || !portfolioType) {
      return NextResponse.json(
        { error: 'THREAD ID, MESSAGE, AND PORTFOLIO TYPE ARE REQUIRED' },
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

    // GET ASSISTANT ID
    const assistantId = await getAssistantId(portfolioType as PortfolioType);
    
    // GET NOTES FOR THIS PORTFOLIO
    const notes = await getNotesForPortfolio(portfolioType as PortfolioType, user.id);
    const notesContext = formatNotesForContext(notes);
    
    // ADD NOTES TO MESSAGE IF AVAILABLE (BUT KEEP ORIGINAL MESSAGE FOR THREAD)
    const messageWithNotes = notesContext ? `${notesContext}USER MESSAGE: ${message}` : message;
    
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
            
            // DEBUG LOG: PRINT FINAL AI RESPONSE
            console.log('🤖 STREAMING AI RESPONSE RECEIVED:', {
              finalContent: finalContent,
              containsImageUrl: finalContent.includes('supabase.co/storage'),
              containsImageUrlText: finalContent.includes('IMAGE URL:'),
              containsProxyUrl: finalContent.includes('/api/images/'),
              originalUserMessage: message,
              userAskedAboutImage: message.toLowerCase().includes('image') || message.toLowerCase().includes('see') || message.toLowerCase().includes('show')
            });
            
            // DEBUG: IF USER ASKED ABOUT IMAGE, PRINT FULL RESPONSE
            if (message.toLowerCase().includes('image') || message.toLowerCase().includes('see') || message.toLowerCase().includes('show')) {
              console.log('🔍 FULL STREAMING AI RESPONSE FOR IMAGE QUERY:');
              console.log('---START RESPONSE---');
              console.log(finalContent);
              console.log('---END RESPONSE---');
            }
            
            // DEBUG: CHECK FOR MARKDOWN LINKS IN AI RESPONSE
            const markdownLinkRegex = /\[([^\]]+)\]\(\s*\/api\/images\/[^)]+\.(?:jpg|jpeg|png|gif|webp)\s*\)/gi;
            const markdownMatches = finalContent.match(markdownLinkRegex);
            if (markdownMatches) {
              console.log('🖼️ MARKDOWN LINKS FOUND IN AI RESPONSE:', markdownMatches);
            }
            
            // DEBUG: CHECK FOR PLAIN IMAGE URLS IN AI RESPONSE
            const plainUrlRegex = /\/api\/images\/[^\s]+\.(?:jpg|jpeg|png|gif|webp)/gi;
            const plainMatches = finalContent.match(plainUrlRegex);
            if (plainMatches) {
              console.log('🖼️ PLAIN IMAGE URLS FOUND IN AI RESPONSE:', plainMatches);
              
              // MAKE SERVER-SIDE FETCH TO TEST IMAGE API
              for (const imageUrl of plainMatches) {
                console.log('🚀 SERVER-SIDE: TESTING FETCH TO IMAGE API:', imageUrl);
                try {
                  const imageResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}${imageUrl}`, {
                    method: 'GET',
                    headers: {
                      'Cookie': request.headers.get('cookie') || '', // FORWARD AUTH COOKIES
                    }
                  });
                  
                  console.log('📡 SERVER-SIDE: IMAGE API RESPONSE:', {
                    url: imageUrl,
                    status: imageResponse.status,
                    statusText: imageResponse.statusText,
                    headers: Object.fromEntries(imageResponse.headers.entries())
                  });
                  
                  if (imageResponse.ok) {
                    const blob = await imageResponse.blob();
                    console.log('✅ SERVER-SIDE: IMAGE BLOB RECEIVED:', imageUrl, blob.size, 'bytes');
                  } else {
                    console.log('❌ SERVER-SIDE: IMAGE API FAILED:', imageUrl, imageResponse.status);
                  }
                } catch (error) {
                  console.log('❌ SERVER-SIDE: IMAGE FETCH ERROR:', imageUrl, error);
                }
              }
            }
            
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
    
    // NON-STREAMING RESPONSE (ORIGINAL IMPLEMENTATION)
    const messages = await sendMessage(threadId, messageWithNotes, assistantId);
    
    // DEBUG LOG: PRINT AI RESPONSE
    const lastMessageContent = messages[messages.length - 1]?.content?.[0];
    const lastMessage = lastMessageContent?.type === 'text' ? lastMessageContent.text.value : 'No content';
    console.log('🤖 AI RESPONSE RECEIVED:', {
      messagesCount: messages.length,
      lastMessage: lastMessage,
      containsImageUrl: lastMessage.includes('supabase.co/storage'),
      containsImageUrlText: lastMessage.includes('IMAGE URL:'),
      containsProxyUrl: lastMessage.includes('/api/images/'),
      originalUserMessage: message,
      userAskedAboutImage: message.toLowerCase().includes('image') || message.toLowerCase().includes('see') || message.toLowerCase().includes('show')
    });
    
    // DEBUG: IF USER ASKED ABOUT IMAGE, PRINT FULL RESPONSE
    if (message.toLowerCase().includes('image') || message.toLowerCase().includes('see') || message.toLowerCase().includes('show')) {
      console.log('🔍 FULL AI RESPONSE FOR IMAGE QUERY:');
      console.log('---START RESPONSE---');
      console.log(lastMessage);
      console.log('---END RESPONSE---');
    }
    
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('ERROR SENDING MESSAGE:', error);
    
    // RETURN SPECIFIC ERROR MESSAGES
    if (error instanceof Error) {
      if (error.message.includes('TIMEOUT')) {
        return NextResponse.json(
          { error: 'ASSISTANT RESPONSE TIMEOUT - PLEASE TRY AGAIN' },
          { status: 408 }
        );
      }
      if (error.message.includes('FAILED')) {
        return NextResponse.json(
          { error: 'ASSISTANT PROCESSING FAILED - PLEASE TRY AGAIN' },
          { status: 500 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR - PLEASE TRY AGAIN' },
      { status: 500 }
    );
  }
} 