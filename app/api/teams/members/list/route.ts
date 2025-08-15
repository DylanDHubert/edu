import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');

    if (!teamId) {
      return NextResponse.json(
        { error: 'Team ID is required' },
        { status: 400 }
      );
    }

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

    // Verify user is a manager of this team
    const { data: membership, error: membershipError } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (membershipError || !membership || membership.role !== 'manager') {
      return NextResponse.json(
        { error: 'Manager access required' },
        { status: 403 }
      );
    }

    // Get team members first
    const { data: members, error: membersError } = await supabase
      .from('team_members')
      .select('*')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .order('created_at');

    if (membersError) {
      console.error('Error loading team members:', membersError);
      return NextResponse.json(
        { error: 'Failed to load team members' },
        { status: 500 }
      );
    }

    // Transform the data to include user information
    // For now, we'll show a more readable format of the user ID
    const membersWithUserData = (members || []).map(member => {
      const shortId = member.user_id.slice(0, 8);
      return {
        id: member.id,
        team_id: member.team_id,
        user_id: member.user_id,
        role: member.role,
        status: member.status,
        is_original_manager: member.is_original_manager,
        created_at: member.created_at,
        updated_at: member.updated_at,
        email: `${shortId}@team-member.com`,
        full_name: `Team Member (${shortId})`
      };
    });

    return NextResponse.json({
      success: true,
      members: membersWithUserData
    });

  } catch (error) {
    console.error('Error in team members list:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
