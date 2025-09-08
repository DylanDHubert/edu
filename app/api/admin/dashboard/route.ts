import { NextRequest, NextResponse } from 'next/server';
import { authenticateAsAdmin } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError } from '../../../utils/error-responses';

export async function GET(request: NextRequest) {
  try {
    // AUTHENTICATE USER AS ADMIN
    const { user, serviceClient } = await authenticateAsAdmin();

    // Load teams with member counts using service client
    const { data: teamsData, error: teamsError } = await serviceClient
      .from('teams')
      .select(`
        *,
        team_members(count)
      `)
      .order('created_at', { ascending: false });

    if (teamsError) {
      return handleDatabaseError(teamsError, 'load teams data');
    }

    // Format teams data
    const formattedTeams = teamsData?.map((team: any) => ({
      ...team,
      member_count: team.team_members?.[0]?.count || 0,
      status: team.team_members?.[0]?.count > 0 ? 'Active' : 'Pending'
    })) || [];

    // Calculate stats
    const totalTeams = formattedTeams.length;
    const totalMembers = formattedTeams.reduce((sum: number, team: any) => sum + team.member_count, 0);
    const activeTeams = formattedTeams.filter((team: any) => team.member_count > 0).length;

    return NextResponse.json({
      success: true,
      data: {
        teams: formattedTeams,
        stats: {
          totalTeams,
          totalMembers,
          activeTeams
        }
      }
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'ADMIN_ACCESS_REQUIRED'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in admin dashboard API:', error);
    return handleDatabaseError(error, 'fetch admin dashboard data');
  }
}
