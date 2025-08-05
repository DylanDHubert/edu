import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { getThreadMessages } from '../../../utils/openai';
import { PortfolioType } from '../../../utils/openai';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { threadId, portfolioType } = await request.json();
    
    if (!threadId || !portfolioType) {
      return NextResponse.json(
        { error: 'THREAD ID AND PORTFOLIO TYPE ARE REQUIRED' },
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

    // GET MESSAGES FROM THREAD
    const messages = await getThreadMessages(threadId);
    
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('ERROR LOADING MESSAGES:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
} 