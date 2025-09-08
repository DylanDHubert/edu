import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { invitationId } = await request.json();

    if (!invitationId) {
      return NextResponse.json(
        { error: 'Invitation ID is required' },
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

    // Find the invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_member_invitations')
      .select(`
        *,
        teams:team_id (
          name
        )
      `)
      .eq('id', invitationId)
      .eq('status', 'pending')
      .single();

    if (inviteError || !invitation) {
      return NextResponse.json(
        { error: 'Invalid or expired invitation' },
        { status: 404 }
      );
    }

    // Check if invitation has expired
    const expiresAt = new Date(invitation.expires_at);
    const now = new Date();
    
    if (now > expiresAt) {
      return NextResponse.json(
        { error: 'This invitation has expired' },
        { status: 400 }
      );
    }

    // Verify user email matches invitation email
    if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'This invitation is not for your email address' },
        { status: 403 }
      );
    }

    // Create service client for team membership operations - AVOID RLS CIRCULAR REFERENCE
    const serviceClient = createServiceClient();

    // Check if user is already a member of this team - USE SERVICE CLIENT
    const { data: existingMember } = await serviceClient
      .from('team_members')
      .select('*')
      .eq('team_id', invitation.team_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (existingMember) {
      return NextResponse.json(
        { error: 'You are already a member of this team' },
        { status: 400 }
      );
    }

    // Start a transaction to:
    // 1. Create team member record
    // 2. Update invitation status to 'accepted'
    
    // Create team member record - USE SERVICE CLIENT
    const { data: newMember, error: memberError } = await serviceClient
      .from('team_members')
      .insert({
        team_id: invitation.team_id,
        user_id: user.id,
        role: invitation.role,
        status: 'active',
        is_original_manager: false,
        invited_by: invitation.invited_by
      })
      .select()
      .single();

    if (memberError) {
      console.error('Error creating team member:', memberError);
      return NextResponse.json(
        { error: 'Failed to add you to the team' },
        { status: 500 }
      );
    }

    // Update invitation status
    const { error: updateError } = await supabase
      .from('team_member_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('id', invitation.id);

    if (updateError) {
      console.error('Error updating invitation status:', updateError);
      // Don't fail the request since the important part (adding member) succeeded
      // Just log the error
    }

    return NextResponse.json({
      success: true,
      message: `Welcome to ${invitation.teams?.name || 'the team'}!`,
      teamId: invitation.team_id,
      role: invitation.role
    });

  } catch (error) {
    console.error('Error accepting invitation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
