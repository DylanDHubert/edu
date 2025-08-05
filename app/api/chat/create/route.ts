import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { createThread, getAssistantId, sendMessage } from '../../../utils/openai';
import { PortfolioType } from '../../../utils/openai';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { portfolioType, title, initialMessage } = await request.json();
    
    if (!portfolioType || !title) {
      return NextResponse.json(
        { error: 'PORTFOLIO TYPE AND TITLE ARE REQUIRED' },
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

    // GET ASSISTANT ID
    const assistantId = await getAssistantId(portfolioType as PortfolioType);
    
    // CREATE NEW THREAD
    const thread = await createThread();
    
    // SAVE TO DATABASE
    const { data: chatHistory, error: dbError } = await supabase
      .from('chat_history')
      .insert({
        user_id: user.id,
        portfolio_type: portfolioType,
        thread_id: thread.id,
        title: title
      })
      .select()
      .single();

    if (dbError) {
      console.error('DATABASE ERROR:', dbError);
      return NextResponse.json(
        { error: 'FAILED TO SAVE CHAT HISTORY' },
        { status: 500 }
      );
    }

    // UPDATE CHAT TITLE WITH THE INITIAL MESSAGE (BUT DON'T ADD TO THREAD YET)
    if (initialMessage) {
      try {
        // UPDATE CHAT TITLE WITH THE FIRST MESSAGE (TRUNCATED)
        const newTitle = initialMessage.length > 50 
          ? initialMessage.substring(0, 50) + '...' 
          : initialMessage;
        
        await supabase
          .from('chat_history')
          .update({ title: newTitle })
          .eq('id', chatHistory.id);
        
        chatHistory.title = newTitle;
      } catch (error) {
        console.error('ERROR UPDATING CHAT TITLE:', error);
        // CONTINUE EVEN IF TITLE UPDATE FAILS - CHAT IS STILL CREATED
      }
    }

    return NextResponse.json(chatHistory);
  } catch (error) {
    console.error('ERROR CREATING CHAT:', error);
    
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