import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { invitationToken } = await request.json();

    // Validate required fields
    if (!invitationToken) {
      return NextResponse.json(
        { error: 'Invitation token is required' },
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

    // Find the invitation by token
    const { data: invitation, error: inviteError } = await supabase
      .from('manager_invitations')
      .select('*')
      .eq('invitation_token', invitationToken)
      .eq('status', 'pending')
      .single();

    if (inviteError || !invitation) {
      return NextResponse.json(
        { error: 'Invitation not found or has been used' },
        { status: 404 }
      );
    }

    // Check if invitation has expired
    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);
    if (now > expiresAt) {
      // Mark as expired
      await supabase
        .from('manager_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);

      return NextResponse.json(
        { error: 'This invitation has expired' },
        { status: 410 }
      );
    }

    // Verify email matches the logged-in user
    if (user.email !== invitation.email) {
      return NextResponse.json(
        { error: 'Email mismatch. Please log in with the invited email address.' },
        { status: 403 }
      );
    }

    // Accept the invitation
    const { data: updatedInvitation, error: updateError } = await supabase
      .from('manager_invitations')
      .update({ 
        status: 'accepted',
        accepted_at: new Date().toISOString()
      })
      .eq('id', invitation.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error accepting invitation:', updateError);
      return NextResponse.json(
        { error: 'Failed to accept invitation' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      invitation: updatedInvitation,
      message: 'Invitation accepted successfully. You can now create your team.'
    });

  } catch (error) {
    console.error('Error in accepting invitation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 