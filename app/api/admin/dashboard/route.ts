import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
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

    // Create service client for admin operations
    const serviceClient = createServiceClient();

    // Check admin access using service client
    const { data: adminData, error: adminError } = await serviceClient
      .from('admin_users')
      .select('*')
      .eq('email', user.email)
      .single();

    if (adminError || !adminData) {
      return NextResponse.json(
        { error: 'Admin access denied' },
        { status: 403 }
      );
    }

    // Load teams with member counts using service client
    const { data: teamsData, error: teamsError } = await serviceClient
      .from('teams')
      .select(`
        *,
        team_members(count)
      `)
      .order('created_at', { ascending: false });

    if (teamsError) {
      console.error('Error loading teams:', teamsError);
      return NextResponse.json(
        { error: 'Failed to load teams data' },
        { status: 500 }
      );
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
    console.error('Error in admin dashboard API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
