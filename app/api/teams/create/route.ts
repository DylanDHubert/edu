import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { name, description, location } = await request.json();

    // Validate required fields
    if (!name || !location) {
      return NextResponse.json(
        { error: 'Team name and location are required' },
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

    // Check if user has manager privileges - USE SERVICE CLIENT TO BYPASS RLS
    console.log('=== TEAM CREATION DEBUG ===');
    console.log('User email:', user.email);
    console.log('Checking for manager privileges...');
    
    const serviceClient = createServiceClient();
    const { data: invitation, error: inviteError } = await serviceClient
      .from('manager_invitations')
      .select('*')
      .eq('email', user.email)
      .eq('status', 'completed')
      .single();
      
    console.log('Manager privileges check result:', invitation);
    console.log('Manager privileges check error:', inviteError);

    if (inviteError || !invitation) {
      return NextResponse.json(
        { error: 'Manager privileges required to create teams' },
        { status: 403 }
      );
    }

    // Create the team - USE SERVICE CLIENT TO BYPASS RLS
    const { data: team, error: teamError } = await serviceClient
      .from('teams')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        location: location.trim(),
        created_by: user.id
      })
      .select()
      .single();

    if (teamError) {
      console.error('Error creating team:', teamError);
      return NextResponse.json(
        { error: 'Failed to create team' },
        { status: 500 }
      );
    }

    // Add the user as the original manager of the team - USE SERVICE CLIENT TO BYPASS RLS
    const { error: memberError } = await serviceClient
      .from('team_members')
      .insert({
        team_id: team.id,
        user_id: user.id,
        role: 'manager',
        status: 'active',
        invited_by: user.id,
        is_original_manager: true
      });

    if (memberError) {
      console.error('Error adding team member:', memberError);
      // If team member creation fails, we should clean up the team - USE SERVICE CLIENT TO BYPASS RLS
      await serviceClient.from('teams').delete().eq('id', team.id);
      return NextResponse.json(
        { error: 'Failed to set up team membership' },
        { status: 500 }
      );
    }

    // Note: Manager invitation status is already 'completed', no need to update

    return NextResponse.json({
      success: true,
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        location: team.location,
        created_at: team.created_at
      },
      message: `Team "${team.name}" created successfully.`
    });

  } catch (error) {
    console.error('Error in team creation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 