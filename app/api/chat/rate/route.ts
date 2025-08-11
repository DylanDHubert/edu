import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { threadId, messageId, rating, portfolioType, responseTimeMs, citations, feedbackText } = await request.json();
    
    if (!threadId || !messageId || rating === undefined || !portfolioType) {
      return NextResponse.json(
        { error: 'THREAD ID, MESSAGE ID, RATING, AND PORTFOLIO TYPE ARE REQUIRED' },
        { status: 400 }
      );
    }

    // VALIDATE RATING VALUE
    if (rating !== 1 && rating !== -1) {
      return NextResponse.json(
        { error: 'RATING MUST BE 1 (THUMBS UP) OR -1 (THUMBS DOWN)' },
        { status: 400 }
      );
    }

    // VALIDATE PORTFOLIO TYPE
    if (!['hip', 'knee', 'ts_knee'].includes(portfolioType)) {
      return NextResponse.json(
        { error: 'INVALID PORTFOLIO TYPE' },
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

    // UPSERT RATING (INSERT OR UPDATE IF EXISTS)
    const { data: ratingData, error: ratingError } = await supabase
      .from('message_ratings')
      .upsert({
        user_id: user.id,
        thread_id: threadId,
        message_id: messageId,
        rating: rating,
        portfolio_type: portfolioType,
        response_time_ms: responseTimeMs || null,
        citations: citations || [],
        feedback_text: feedbackText || null
      }, {
        onConflict: 'user_id,message_id'
      })
      .select()
      .single();

    if (ratingError) {
      console.error('ERROR SAVING RATING:', ratingError);
      return NextResponse.json(
        { error: 'FAILED TO SAVE RATING' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      rating: ratingData 
    });
  } catch (error) {
    console.error('ERROR RATING MESSAGE:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
} 