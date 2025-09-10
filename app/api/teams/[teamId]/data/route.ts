import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithTeamAccess } from '../../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError } from '../../../../utils/error-responses';
import { createClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

    // AUTHENTICATE USER AND VERIFY TEAM ACCESS
    const { user, membership, serviceClient } = await authenticateWithTeamAccess(teamId);

    // Fetch all team data using service client
    const [
      teamData,
      portfolios,
      accounts,
      documents,
      knowledge,
      members,
      invitations
    ] = await Promise.all([
      // Team basic info
      serviceClient
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single(),

      // Team portfolios with documents
      serviceClient
        .from('team_portfolios')
        .select(`
          *,
          team_documents (
            id,
            filename,
            original_name
          )
        `)
        .eq('team_id', teamId)
        .order('created_at', { ascending: false }),

      // Team accounts
      serviceClient
        .from('team_accounts')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false }),

      // Team documents
      serviceClient
        .from('team_documents')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false }),

      // Team knowledge
      serviceClient
        .from('team_knowledge')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false }),

      // Team members
      serviceClient
        .from('team_members')
        .select('*')
        .eq('team_id', teamId)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),

      // Pending invitations
      serviceClient
        .from('team_member_invitations')
        .select('*')
        .eq('team_id', teamId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    ]);

    // CHECK FOR ERRORS
    if (teamData.error) {
      return handleDatabaseError(teamData.error, 'load team information');
    }

    // RETURN MEMBERS DATA AS IS
    const membersWithEmails = members.data || [];

    // Calculate statistics
    const stats = {
      portfolios: portfolios.data?.length || 0,
      accounts: accounts.data?.length || 0,
      documents: documents.data?.length || 0,
      knowledgeItems: knowledge.data?.length || 0,
      teamMembers: members.data?.length || 0,
      pendingInvitations: invitations.data?.length || 0
    };

    return NextResponse.json({
      success: true,
      data: {
        team: teamData.data,
        portfolios: portfolios.data || [],
        accounts: accounts.data || [],
        documents: documents.data || [],
        knowledge: knowledge.data || [],
        members: membersWithEmails,
        invitations: invitations.data || [],
        stats,
        userRole: membership.role
      }
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in team data API:', error);
    return handleDatabaseError(error, 'fetch team data');
  }
}
