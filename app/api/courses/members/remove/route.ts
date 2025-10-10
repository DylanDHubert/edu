import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithcourseAccess } from '../../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../../utils/error-responses';

export async function POST(request: NextRequest) {
  try {
    const { memberId, courseId } = await request.json();

    // VALIDATE REQUIRED FIELDS
    if (!memberId || !courseId) {
      return handleValidationError('Member ID and course ID are required');
    }

    // AUTHENTICATE USER AND VERIFY MANAGER ACCESS
    const { user, membership, serviceClient } = await authenticateWithcourseAccess(courseId, 'manager');

    // First, check if the member being removed is the original manager
    const { data: memberToRemove, error: fetchError } = await serviceClient
      .from('course_members')
      .select('is_original_manager, role, user_id')
      .eq('id', memberId)
      .eq('course_id', courseId)
      .single();

    if (fetchError) {
      return handleDatabaseError(fetchError, 'fetch member information');
    }

    if (!memberToRemove) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    // Prevent removal of original manager
    if (memberToRemove.is_original_manager) {
      return NextResponse.json(
        { error: 'Cannot remove the original course manager. They are the course owner and cannot be removed.' },
        { status: 400 }
      );
    }

    // Prevent self-removal
    if (memberToRemove.user_id === user.id) {
      return NextResponse.json(
        { error: 'You cannot remove yourself from the course.' },
        { status: 400 }
      );
    }

    // Remove the member by updating status to 'inactive'
    const { error: removeError } = await serviceClient
      .from('course_members')
      .update({ status: 'inactive' })
      .eq('id', memberId)
      .eq('course_id', courseId);

    if (removeError) {
      return handleDatabaseError(removeError, 'remove course member');
    }

    return NextResponse.json({
      success: true,
      message: 'course member removed successfully',
      memberRole: memberToRemove.role
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'course_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in member removal route:', error);
    return handleDatabaseError(error, 'remove course member');
  }
}
