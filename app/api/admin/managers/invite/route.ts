import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';
import { sendManagerInvitationEmail } from '../../../../utils/email';

export async function POST(request: NextRequest) {
  try {
    const { managerEmail, managerName } = await request.json();
    
    // Validate required fields
    if (!managerEmail || !managerName) {
      return NextResponse.json(
        { error: 'Manager email and manager name are required' },
        { status: 400 }
      );
    }

    // Verify admin authentication
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const { data: adminUser, error: adminError } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', user.email)
      .single();

    if (adminError || !adminUser) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Check if manager is already invited or exists
    const { data: existingInvitation, error: inviteCheckError } = await supabase
      .from('manager_invitations')
      .select('id, status')
      .eq('email', managerEmail)
      .single();

    if (existingInvitation && existingInvitation.status === 'pending') {
      return NextResponse.json(
        { error: 'This person already has a pending invitation' },
        { status: 400 }
      );
    }

    if (existingInvitation && existingInvitation.status === 'accepted') {
      return NextResponse.json(
        { error: 'This person is already a team manager' },
        { status: 400 }
      );
    }

    // Generate invitation token
    const invitationToken = generateInvitationToken();
    
    console.log('=== MANAGER INVITATION CREATION DEBUG ===');
    console.log('Creating invitation for:', managerEmail);
    console.log('Token generated:', invitationToken);
    console.log('Token length:', invitationToken.length);

    // Create manager invitation record
    const { data: invitation, error: invitationError } = await supabase
      .from('manager_invitations')
      .insert({
        email: managerEmail,
        name: managerName,
        invitation_token: invitationToken,
        invited_by: user.id,
        status: 'pending'
      })
      .select()
      .single();
      
    console.log('Invitation creation result:', invitation);
    console.log('Invitation creation error:', invitationError);

    if (invitationError) {
      console.error('Error creating invitation:', invitationError);
      return NextResponse.json(
        { error: 'Failed to create invitation' },
        { status: 500 }
      );
    }

    // Send invitation email
    try {
      await sendManagerInvitationEmail({
        managerEmail,
        managerName,
        invitationToken,
        invitedBy: adminUser.name || adminUser.email
      });
    } catch (emailError) {
      console.error('Error sending invitation email:', emailError);
      // Don't fail the request if email fails, just log it
    }

    return NextResponse.json({
      success: true,
      invitation,
      message: `Invitation sent to ${managerEmail} successfully.`
    });

  } catch (error) {
    console.error('Error in manager invitation:', error);
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

 