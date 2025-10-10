import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithcourseAccess } from '../../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError } from '../../../../utils/error-responses';
import { createClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params;

    // AUTHENTICATE USER AND VERIFY course ACCESS
    const { user, membership, serviceClient } = await authenticateWithcourseAccess(courseId);

    // Fetch all course data using service client
    const [
      courseData,
      portfolios,
      accounts,
      documents,
      knowledge,
      members,
      invitations
    ] = await Promise.all([
      // course basic info
      serviceClient
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single(),

      // course portfolios with documents
      serviceClient
        .from('course_portfolios')
        .select(`
          *,
          course_documents (
            id,
            filename,
            original_name
          )
        `)
        .eq('course_id', courseId)
        .order('created_at', { ascending: false }),

      // course accounts
      serviceClient
        .from('course_accounts')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false }),

      // course documents
      serviceClient
        .from('course_documents')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false }),

      // course knowledge
      serviceClient
        .from('course_knowledge')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false }),

      // course members
      serviceClient
        .from('course_members')
        .select('*')
        .eq('course_id', courseId)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),

      // Pending invitations
      serviceClient
        .from('course_member_invitations')
        .select('*')
        .eq('course_id', courseId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    ]);

    // CHECK FOR ERRORS
    if (courseData.error) {
      return handleDatabaseError(courseData.error, 'load course information');
    }

    // RETURN MEMBERS DATA AS IS
    const membersWithEmails = members.data || [];

    // Calculate statistics
    const stats = {
      portfolios: portfolios.data?.length || 0,
      accounts: accounts.data?.length || 0,
      documents: documents.data?.length || 0,
      knowledgeItems: knowledge.data?.length || 0,
      courseMembers: members.data?.length || 0,
      pendingInvitations: invitations.data?.length || 0
    };

    return NextResponse.json({
      success: true,
      data: {
        course: courseData.data,
        portfolios: portfolios.data || [],
        accounts: accounts.data || [],
        documents: documents.data || [],
        knowledge: knowledge.data || [],
        members: membersWithEmails,
        invitations: invitations.data || [],
        stats,
        userRole: membership.role,
        isOriginalManager: membership.is_original_manager
      }
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'course_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in course data API:', error);
    return handleDatabaseError(error, 'fetch course data');
  }
}
