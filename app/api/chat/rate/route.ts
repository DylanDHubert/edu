import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';
import { verifyUserAuth, verifyTeamAccess } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';

export async function POST(request: NextRequest) {
  try {
    const { threadId, messageId, rating, teamId, accountId, portfolioId, responseTimeMs, citations, feedbackText } = await request.json();
    
    if (!threadId || !messageId || !teamId || !accountId || !portfolioId) {
      return handleValidationError('Thread ID, message ID, team ID, account ID, and portfolio ID are required');
    }

    // VALIDATE RATING VALUE (ALLOW NULL/UNDEFINED FOR FEEDBACK-ONLY UPDATES)
    if (rating !== undefined && rating !== null && rating !== 1 && rating !== -1) {
      return handleValidationError('Rating must be 1 (thumbs up) or -1 (thumbs down)');
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

    // VERIFY USER HAS ACCESS TO THIS TEAM
    await verifyTeamAccess(teamId, user.id);

    // UPSERT RATING (INSERT OR UPDATE IF EXISTS)
    const upsertData: any = {
      user_id: user.id,
      thread_id: threadId,
      message_id: messageId,
      team_id: teamId,
      account_id: accountId,
      portfolio_id: portfolioId,
      response_time_ms: responseTimeMs || null,
      citations: citations || [],
      feedback_text: feedbackText || null
    };
    
    // ONLY INCLUDE RATING IF IT'S PROVIDED
    if (rating !== undefined && rating !== null) {
      upsertData.rating = rating;
    }
    
    const { data: ratingData, error: ratingError } = await supabase
      .from('message_ratings')
      .upsert(upsertData, {
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
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error rating message:', error);
    return handleDatabaseError(error, 'save message rating');
  }
} 