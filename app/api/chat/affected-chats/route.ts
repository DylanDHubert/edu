import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyUserAuth } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';
import { createClient } from '../../../utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { teamId, accountId, portfolioId } = await request.json();
    
    if (!teamId || !accountId || !portfolioId) {
      return handleValidationError('Team ID, Account ID, and Portfolio ID are required');
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const { user } = await verifyUserAuth(cookieStore);

    // VERIFY USER IS A MEMBER OF THIS TEAM
    const supabase = await createClient(cookieStore);
    const { data: teamMember, error: memberError } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberError || !teamMember) {
      return NextResponse.json(
        { error: 'Access denied to this team' },
        { status: 403 }
      );
    }

    // GET AFFECTED CHATS FOR THIS TEAM/ACCOUNT/PORTFOLIO COMBINATION
    const { data: affectedChats, error: chatsError } = await supabase
      .from('chat_history')
      .select('id, thread_id, title, created_at')
      .eq('team_id', teamId)
      .eq('account_id', accountId)
      .eq('portfolio_id', portfolioId)
      .order('created_at', { ascending: false });

    if (chatsError) {
      console.error('❌ Error fetching affected chats:', chatsError);
      return handleDatabaseError(new Error('Failed to fetch affected chats'), 'get affected chats');
    }

    return NextResponse.json({ 
      affectedChats: affectedChats || [],
      count: affectedChats?.length || 0
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in affected chats route:', error);
    return handleDatabaseError(error, 'get affected chats');
  }
}
