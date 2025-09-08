import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

    // Verify user authentication
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Create service client for team data access
    const serviceClient = createServiceClient();

    // Verify user is a member of this team - USE SERVICE CLIENT
    const { data: membership, error: membershipError } = await serviceClient
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: 'You do not have access to this team' },
        { status: 403 }
      );
    }

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

    // Check for errors
    if (teamData.error) {
      console.error('Error fetching team data:', teamData.error);
      return NextResponse.json(
        { error: 'Failed to load team information' },
        { status: 500 }
      );
    }

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
        members: members.data || [],
        invitations: invitations.data || [],
        stats,
        userRole: membership.role
      }
    });

  } catch (error) {
    console.error('Error in team data API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
