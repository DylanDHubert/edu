import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

// CREATE NEW TEAM INVITATION
export async function POST(request: NextRequest) {
  try {
    const { teamId, email, name, role } = await request.json();

    // Validate required fields
    if (!teamId || !email || !name || !role) {
      return NextResponse.json(
        { error: 'Team ID, email, name, and role are required' },
        { status: 400 }
      );
    }

    // Validate role
    if (!['manager', 'member'].includes(role)) {
      return NextResponse.json(
        { error: 'Role must be either "manager" or "member"' },
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

    // Verify user is a manager of this team - USE SERVICE CLIENT TO AVOID RLS CIRCULAR REFERENCE
    const serviceClient = createServiceClient();
    const { data: teamMember, error: memberError } = await serviceClient
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberError || !teamMember || teamMember.role !== 'manager') {
      return NextResponse.json(
        { error: 'Manager access required' },
        { status: 403 }
      );
    }



    // Check if invitation already exists - USE SERVICE CLIENT
    const { data: existingInvitation } = await serviceClient
      .from('team_member_invitations')
      .select('id')
      .eq('team_id', teamId)
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .single();

    if (existingInvitation) {
      return NextResponse.json(
        { error: 'An invitation for this email already exists' },
        { status: 400 }
      );
    }

    // Generate invitation token
    const invitationToken = generateInvitationToken();

    // Create invitation - USE SERVICE CLIENT
    const { data: invitation, error: invitationError } = await serviceClient
      .from('team_member_invitations')
      .insert({
        team_id: teamId,
        email: email.toLowerCase(),
        name: name.trim(),
        role: role,
        invitation_token: invitationToken,
        invited_by: user.id,
        status: 'pending'
      })
      .select()
      .single();

    if (invitationError) {
      console.error('Error creating invitation:', invitationError);
      return NextResponse.json(
        { error: 'Failed to create invitation' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      invitation,
      message: `Invitation sent to ${email} successfully.`
    });

  } catch (error) {
    console.error('Error creating team invitation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET PENDING INVITATIONS FOR CURRENT USER
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

    // USE SERVICE CLIENT TO BYPASS RLS FOR TEAM DATA
    const serviceClient = createServiceClient();

    // Get pending invitations for this user's email
    const { data: invitations, error: invitationsError } = await serviceClient
      .from('team_member_invitations')
      .select(`
        *,
        teams:team_id (
          id,
          name,
          description,
          location
        )
      `)
      .eq('email', user.email?.toLowerCase())
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (invitationsError) {
      console.error('Error fetching invitations:', invitationsError);
      return NextResponse.json(
        { error: 'Failed to fetch invitations' },
        { status: 500 }
      );
    }

    // DEBUG: LOG THE INVITATIONS DATA TO SEE WHAT'S BEING RETURNED
    console.log('DEBUG: Fetched invitations:', JSON.stringify(invitations, null, 2));

    return NextResponse.json({
      success: true,
      invitations: invitations || []
    });

  } catch (error) {
    console.error('Error fetching team invitations:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to generate a secure invitation token
function generateInvitationToken(): string {
  return crypto.randomUUID();
}
