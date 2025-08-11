import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { threadId } = await request.json();
    
    if (!threadId) {
      return NextResponse.json(
        { error: 'THREAD ID IS REQUIRED' },
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

    // GET RATINGS FOR THIS THREAD
    const { data: ratings, error: ratingsError } = await supabase
      .from('message_ratings')
      .select('message_id, rating, portfolio_type, response_time_ms, citations, feedback_text')
      .eq('thread_id', threadId)
      .eq('user_id', user.id);

    if (ratingsError) {
      console.error('ERROR LOADING RATINGS:', ratingsError);
      return NextResponse.json(
        { error: 'FAILED TO LOAD RATINGS' },
        { status: 500 }
      );
    }

    // CONVERT TO OBJECT FOR EASY LOOKUP
    const ratingsMap = (ratings || []).reduce((acc, rating) => {
      acc[rating.message_id] = {
        rating: rating.rating,
        portfolioType: rating.portfolio_type,
        responseTimeMs: rating.response_time_ms,
        citations: rating.citations || [],
        feedbackText: rating.feedback_text || null
      };
      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json({ 
      ratings: ratingsMap 
    });
  } catch (error) {
    console.error('ERROR LOADING RATINGS:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
} 