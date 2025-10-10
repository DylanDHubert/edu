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

    // USE SERVICE CLIENT TO BYPASS RLS FOR course DATA
    const serviceClient = createServiceClient();

    // Find the invitation
    const { data: invitation, error: inviteError } = await serviceClient
      .from('course_member_invitations')
      .select(`
        *,
        courses:course_id (
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

    // Check if user is already a member of this course - USE SERVICE CLIENT
    const { data: existingMember } = await serviceClient
      .from('course_members')
      .select('*')
      .eq('course_id', invitation.course_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (existingMember) {
      return NextResponse.json(
        { error: 'You are already a member of this course' },
        { status: 400 }
      );
    }

    // Start a transaction to:
    // 1. Create course member record
    // 2. Update invitation status to 'accepted'
    
    // Create course member record - USE SERVICE CLIENT
    const { data: newMember, error: memberError } = await serviceClient
      .from('course_members')
      .insert({
        course_id: invitation.course_id,
        user_id: user.id,
        role: invitation.role,
        status: 'active',
        is_original_manager: false,
        invited_by: invitation.invited_by
      })
      .select()
      .single();

    if (memberError) {
      console.error('Error creating course member:', memberError);
      return NextResponse.json(
        { error: 'Failed to add you to the course' },
        { status: 500 }
      );
    }

    // Update invitation status
    const { error: updateError } = await serviceClient
      .from('course_member_invitations')
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
      message: `Welcome to ${invitation.courses?.name || 'the course'}!`,
      courseId: invitation.course_id,
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
