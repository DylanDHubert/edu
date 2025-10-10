import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithcourseAccess, courseMembership } from '../../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../../utils/error-responses';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId');

    if (!courseId) {
      return handleValidationError('course ID is required');
    }

    // AUTHENTICATE USER AND VERIFY MANAGER ACCESS
    const { user, membership, serviceClient } = await authenticateWithcourseAccess(courseId, 'manager');

    // Get course members first - USE SERVICE CLIENT
    const { data: members, error: membersError } = await serviceClient
      .from('course_members')
      .select('*')
      .eq('course_id', courseId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (membersError) {
      return handleDatabaseError(membersError, 'load course members');
    }

    // Use the same service client for user lookups
    const supabaseAdmin = serviceClient;

    // Fetch real user data for each course member
    const membersWithUserData = await Promise.all((members || []).map(async (member: courseMembership) => {
      try {
        // Get user data from Supabase auth using admin client
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
        
        if (userError || !userData.user) {
          console.warn(`Could not fetch user data for user_id: ${member.user_id}`, userError);
          // Fallback to UUID fragment if user lookup fails
          const shortId = member.user_id.slice(0, 8);
          return {
            id: member.id,
            course_id: member.course_id,
            user_id: member.user_id,
            role: member.role,
            status: member.status,
            is_original_manager: member.is_original_manager,
            created_at: member.created_at,
            updated_at: member.updated_at,
            email: `${shortId}@unknown.com`,
            full_name: `Unknown User (${shortId})`
          };
        }

        // Extract real user information
        const realUser = userData.user;
        const email = realUser.email || '';
        const fullName = realUser.user_metadata?.full_name || 
                        realUser.user_metadata?.name || 
                        realUser.email || 
                        'Unknown User';

        return {
          id: member.id,
          course_id: member.course_id,
          user_id: member.user_id,
          role: member.role,
          status: member.status,
          is_original_manager: member.is_original_manager,
          created_at: member.created_at,
          updated_at: member.updated_at,
          email: email,
          full_name: fullName
        };
      } catch (error) {
        console.error(`Error fetching user data for ${member.user_id}:`, error);
        // Fallback to UUID fragment if there's an exception
        const shortId = member.user_id.slice(0, 8);
        return {
          id: member.id,
          course_id: member.course_id,
          user_id: member.user_id,
          role: member.role,
          status: member.status,
          is_original_manager: member.is_original_manager,
          created_at: member.created_at,
          updated_at: member.updated_at,
          email: `${shortId}@unknown.com`,
          full_name: `Unknown User (${shortId})`
        };
      }
    }));

    return NextResponse.json({
      success: true,
      members: membersWithUserData
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'course_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in course members list:', error);
    return handleDatabaseError(error, 'fetch course members');
  }
}
