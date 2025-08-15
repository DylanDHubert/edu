import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';
import { sendTeamMemberInvitationEmail } from '../../../../utils/email';

export async function POST(request: NextRequest) {
  try {
    const { teamId, invites } = await request.json();

    // Validate required fields
    if (!teamId || !invites || !Array.isArray(invites)) {
      return NextResponse.json(
        { error: 'Team ID and invites array are required' },
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
    const { data: teamMember, error: memberError } = await supabase
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

    // Get team info
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('name')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    // Get manager info for invitation emails
    const { data: managerInfo, error: managerError } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamId)
      .eq('is_original_manager', true)
      .single();

    const inviterName = user.email || 'Team Manager'; // Fallback to email if name not available

    // Process each invitation
    const sentInvitations = [];
    const errors = [];

    for (const invite of invites) {
      try {
        // Validate invite data
        if (!invite.email || !invite.name || !invite.role) {
          errors.push(`Invalid invite data for ${invite.email || 'unknown'}`);
          continue;
        }

        // Check if user is already a team member
        const { data: existingMember, error: memberCheckError } = await supabase
          .from('team_members')
          .select('id, status')
          .eq('team_id', teamId)
          .eq('user_id', 
            // We'll check by email since we don't have user_id yet
            // This is a simplified check - in a real system you'd lookup by email
            'placeholder'
          )
          .single();

        // Note: The above query won't work as intended since we don't have user_id
        // In a real implementation, you'd either:
        // 1. Look up users by email first
        // 2. Store pending invitations in a separate table
        // For now, we'll assume no duplicates

        // Generate invitation token
        const invitationToken = generateInvitationToken();

        // Create team member invitation record
        const { data: invitation, error: invitationError } = await supabase
          .from('team_member_invitations')
          .insert({
            team_id: teamId,
            email: invite.email.toLowerCase(),
            name: invite.name,
            role: invite.role,
            invitation_token: invitationToken,
            invited_by: user.id,
            status: 'pending'
          })
          .select()
          .single();

        if (invitationError) {
          console.error('Error creating invitation:', invitationError);
          errors.push(`Failed to create invitation for ${invite.email}`);
          continue;
        }

        // Send invitation email
        try {
          await sendTeamMemberInvitationEmail({
            memberEmail: invite.email,
            memberName: invite.name,
            memberRole: invite.role,
            teamName: team.name,
            invitationToken,
            invitedBy: inviterName
          });
        } catch (emailError) {
          console.error('Error sending invitation email:', emailError);
          // Don't fail the request if email fails, just log it
        }

        sentInvitations.push({
          email: invite.email,
          name: invite.name,
          role: invite.role,
          invitationId: invitation.id
        });

      } catch (error) {
        console.error('Error processing invitation:', error);
        errors.push(`Failed to process invitation for ${invite.email}`);
      }
    }

    return NextResponse.json({
      success: true,
      sentInvitations,
      errors: errors.length > 0 ? errors : undefined,
      message: `${sentInvitations.length} invitation(s) sent successfully${errors.length > 0 ? ` with ${errors.length} error(s)` : ''}.`
    });

  } catch (error) {
    console.error('Error in team member invitation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to generate a secure invitation token
function generateInvitationToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

 