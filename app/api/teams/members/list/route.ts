import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
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

    // Create service client for team membership checks - AVOID RLS CIRCULAR REFERENCE
    const serviceClient = createServiceClient();

    // Verify user is a manager of this team - USE SERVICE CLIENT
    const { data: membership, error: membershipError } = await serviceClient
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

    // Get team members first - USE SERVICE CLIENT
    const { data: members, error: membersError } = await serviceClient
      .from('team_members')
      .select('*')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (membersError) {
      console.error('Error loading team members:', membersError);
      return NextResponse.json(
        { error: 'Failed to load team members' },
        { status: 500 }
      );
    }

    // Use the same service client for user lookups
    const supabaseAdmin = serviceClient;

    // Fetch real user data for each team member
    const membersWithUserData = await Promise.all((members || []).map(async (member) => {
      try {
        // Get user data from Supabase auth using admin client
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
        
        if (userError || !userData.user) {
          console.warn(`Could not fetch user data for user_id: ${member.user_id}`, userError);
          // Fallback to UUID fragment if user lookup fails
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
            email: `${shortId}@unknown.com`,
            full_name: `Unknown User (${shortId})`
          };
        }

        // Extract real user information
        const realUser = userData.user;
        const email = realUser.email || '';
        const fullName = realUser.user_metadata?.full_name || 
                        realUser.user_metadata?.name || 
                        realUser.email || 
                        'Unknown User';

        return {
          id: member.id,
          team_id: member.team_id,
          user_id: member.user_id,
          role: member.role,
          status: member.status,
          is_original_manager: member.is_original_manager,
          created_at: member.created_at,
          updated_at: member.updated_at,
          email: email,
          full_name: fullName
        };
      } catch (error) {
        console.error(`Error fetching user data for ${member.user_id}:`, error);
        // Fallback to UUID fragment if there's an exception
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
          email: `${shortId}@unknown.com`,
          full_name: `Unknown User (${shortId})`
        };
      }
    }));

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
