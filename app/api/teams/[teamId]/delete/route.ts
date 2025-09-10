import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';
import { TeamDeletionService } from '../../../../services/team-deletion-service';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const { confirmation, deleteExternalResources = true } = await request.json();

    // VALIDATE REQUIRED FIELDS
    if (!confirmation) {
      return NextResponse.json(
        { error: 'Team name confirmation is required' },
        { status: 400 }
      );
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // VERIFY USER IS ORIGINAL MANAGER OF THIS TEAM
    const serviceClient = createServiceClient();
    const { data: teamMember, error: memberError } = await serviceClient
      .from('team_members')
      .select(`
        *,
        teams!inner(name, created_by)
      `)
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberError || !teamMember) {
      return NextResponse.json(
        { error: 'Team membership not found' },
        { status: 404 }
      );
    }

    // CHECK IF USER IS ORIGINAL MANAGER
    if (!teamMember.is_original_manager) {
      return NextResponse.json(
        { error: 'Only the original team manager can delete the team' },
        { status: 403 }
      );
    }

    // VERIFY TEAM NAME CONFIRMATION
    if (confirmation !== teamMember.teams.name) {
      return NextResponse.json(
        { error: 'Team name confirmation does not match' },
        { status: 400 }
      );
    }

    // INITIALIZE DELETION SERVICE
    const deletionService = new TeamDeletionService(serviceClient);

    // PERFORM TEAM DELETION
    const deletionResult = await deletionService.deleteTeam(teamId, {
      deleteExternalResources,
      userId: user.id,
      teamName: teamMember.teams.name
    });

    if (!deletionResult.success) {
      return NextResponse.json(
        { 
          error: 'Failed to delete team',
          details: deletionResult.error,
          partialCleanup: deletionResult.partialCleanup
        },
        { status: 500 }
      );
    }


    return NextResponse.json({
      success: true,
      message: `Team "${teamMember.teams.name}" and all associated data deleted successfully`,
      deletedResources: deletionResult.deletedResources,
      cleanupSummary: deletionResult.cleanupSummary
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error during team deletion' },
      { status: 500 }
    );
  }
}
