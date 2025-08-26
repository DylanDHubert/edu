import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { chatId, title } = await request.json();
    
    if (!chatId || !title) {
      return NextResponse.json(
        { error: 'Chat ID and title are required' },
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

    // VERIFY USER OWNS THIS CHAT
    const { data: chatHistory, error: ownershipError } = await supabase
      .from('chat_history')
      .select('user_id')
      .eq('id', chatId)
      .eq('user_id', user.id)
      .single();

    if (ownershipError || !chatHistory) {
      return NextResponse.json(
        { error: 'CHAT NOT FOUND OR ACCESS DENIED' },
        { status: 404 }
      );
    }

    // UPDATE CHAT TITLE
    const { error: updateError } = await supabase
      .from('chat_history')
      .update({ title: title })
      .eq('id', chatId);

    if (updateError) {
      console.error('ERROR UPDATING CHAT TITLE:', updateError);
      return NextResponse.json(
        { error: 'FAILED TO UPDATE CHAT TITLE' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('ERROR IN UPDATE TITLE ROUTE:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
} 