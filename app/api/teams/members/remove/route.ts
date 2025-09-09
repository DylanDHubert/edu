import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithTeamAccess } from '../../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../../utils/error-responses';

export async function POST(request: NextRequest) {
  try {
    const { memberId, teamId } = await request.json();

    // VALIDATE REQUIRED FIELDS
    if (!memberId || !teamId) {
      return handleValidationError('Member ID and Team ID are required');
    }

    // AUTHENTICATE USER AND VERIFY MANAGER ACCESS
    const { user, membership, serviceClient } = await authenticateWithTeamAccess(teamId, 'manager');

    // First, check if the member being removed is the original manager
    const { data: memberToRemove, error: fetchError } = await serviceClient
      .from('team_members')
      .select('is_original_manager, role, user_id')
      .eq('id', memberId)
      .eq('team_id', teamId)
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
        { error: 'Cannot remove the original team manager. They are the team owner and cannot be removed.' },
        { status: 400 }
      );
    }

    // Prevent self-removal
    if (memberToRemove.user_id === user.id) {
      return NextResponse.json(
        { error: 'You cannot remove yourself from the team.' },
        { status: 400 }
      );
    }

    // Remove the member by updating status to 'removed'
    const { error: removeError } = await serviceClient
      .from('team_members')
      .update({ status: 'removed' })
      .eq('id', memberId)
      .eq('team_id', teamId);

    if (removeError) {
      return handleDatabaseError(removeError, 'remove team member');
    }

    return NextResponse.json({
      success: true,
      message: 'Team member removed successfully',
      memberRole: memberToRemove.role
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in member removal route:', error);
    return handleDatabaseError(error, 'remove team member');
  }
}
