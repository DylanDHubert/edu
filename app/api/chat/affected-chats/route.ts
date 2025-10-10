import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyUserAuth } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';
import { createClient } from '../../../utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { courseId, portfolioId } = await request.json();
    
    if (!courseId || !portfolioId) {
      return handleValidationError('course ID and Portfolio ID are required');
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const { user } = await verifyUserAuth(cookieStore);

    // VERIFY USER IS A MEMBER OF THIS course
    const supabase = await createClient(cookieStore);
    const { data: courseMember, error: memberError } = await supabase
      .from('course_members')
      .select('role')
      .eq('course_id', courseId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberError || !courseMember) {
      return NextResponse.json(
        { error: 'Access denied to this course' },
        { status: 403 }
      );
    }

    // GET AFFECTED CHATS FOR THIS course/PORTFOLIO COMBINATION
    const { data: affectedChats, error: chatsError } = await supabase
      .from('chat_history')
      .select('id, thread_id, title, created_at')
      .eq('course_id', courseId)
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
    if (error instanceof Error && ['UNAUTHORIZED', 'course_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in affected chats route:', error);
    return handleDatabaseError(error, 'get affected chats');
  }
}
