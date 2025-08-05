import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function DELETE(request: NextRequest) {
  try {
    const { chatId } = await request.json();
    
    if (!chatId) {
      return NextResponse.json(
        { error: 'CHAT ID IS REQUIRED' },
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
      .select('*')
      .eq('id', chatId)
      .eq('user_id', user.id)
      .single();

    if (ownershipError || !chatHistory) {
      return NextResponse.json(
        { error: 'CHAT NOT FOUND OR ACCESS DENIED' },
        { status: 404 }
      );
    }

    // DELETE THE CHAT
    const { error: deleteError } = await supabase
      .from('chat_history')
      .delete()
      .eq('id', chatId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('DATABASE ERROR:', deleteError);
      return NextResponse.json(
        { error: 'FAILED TO DELETE CHAT' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('ERROR DELETING CHAT:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
} 