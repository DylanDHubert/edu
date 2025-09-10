import { NextRequest, NextResponse } from 'next/server';
import { authenticateAsAdmin } from '../../../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError } from '../../../../../utils/error-responses';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

    // AUTHENTICATE USER AS ADMIN
    const { user, serviceClient } = await authenticateAsAdmin();

    // Fetch all team data using service client (admin has access to all teams)
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
      
      // Portfolios
      serviceClient
        .from('team_portfolios')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at'),
      
      // Accounts
      serviceClient
        .from('team_accounts')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at'),
      
      // Documents
      serviceClient
        .from('team_documents')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at'),
      
      // Knowledge
      serviceClient
        .from('team_knowledge')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at'),
      
      // Team members
      serviceClient
        .from('team_members')
        .select('*')
        .eq('team_id', teamId)
        .eq('status', 'active')
        .order('created_at'),
      
      // Pending invitations
      serviceClient
        .from('team_invitations')
        .select('*')
        .eq('team_id', teamId)
        .eq('status', 'pending')
        .order('created_at')
    ]);

    if (teamData.error) {
      return handleDatabaseError(teamData.error, 'load team data');
    }

    if (!teamData.data) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Get user emails for team members
    const membersWithEmails = await Promise.all(
      (members.data || []).map(async (member: any) => {
        try {
          const { data: userData, error: userError } = await serviceClient.auth.admin.getUserById(member.user_id);
          
          if (userError || !userData.user) {
            console.warn(`Could not fetch user data for user_id: ${member.user_id}`, userError);
            const shortId = member.user_id.slice(0, 8);
            return {
              ...member,
              email: `${shortId}@unknown.com`,
              full_name: `Unknown User (${shortId})`
            };
          }

          const realUser = userData.user;
          const email = realUser.email || '';
          const fullName = realUser.user_metadata?.full_name || 
                          realUser.user_metadata?.name || 
                          realUser.email || 
                          'Unknown User';

          return {
            ...member,
            email: email,
            full_name: fullName
          };
        } catch (error) {
          console.error(`Error fetching user data for member ${member.user_id}:`, error);
          const shortId = member.user_id.slice(0, 8);
          return {
            ...member,
            email: `${shortId}@unknown.com`,
            full_name: `Unknown User (${shortId})`
          };
        }
      })
    );

    // Calculate stats
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
        userRole: 'manager', // ADMIN USERS GET MANAGER ROLE FOR FULL ACCESS
        isOriginalManager: false // ADMINS ARE NOT ORIGINAL MANAGERS
      }
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'ADMIN_ACCESS_REQUIRED'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in admin team data API:', error);
    return handleDatabaseError(error, 'fetch admin team data');
  }
}
