import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { sendMessage, getAssistantId } from '../../../utils/openai';
import { PortfolioType } from '../../../utils/openai';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { threadId, message, portfolioType } = await request.json();
    
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
    
    // SEND MESSAGE WITH TIMEOUT
    const messages = await sendMessage(threadId, message, assistantId);
    
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