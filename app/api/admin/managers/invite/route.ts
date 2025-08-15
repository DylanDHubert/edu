import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';

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

// Helper function to send invitation email
async function sendManagerInvitationEmail({
  managerEmail,
  managerName,
  invitationToken,
  invitedBy
}: {
  managerEmail: string;
  managerName: string;
  invitationToken: string;
  invitedBy: string;
}) {
  // For now, we'll just log the invitation details
  // In a real implementation, you'd integrate with an email service like SendGrid, Resend, etc.
  
  const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/manager?token=${invitationToken}`;
  
  console.log('=== MANAGER INVITATION EMAIL ===');
  console.log(`To: ${managerEmail}`);
  console.log(`Subject: You've been invited to become a Team Manager - HHB RAG Assistant`);
  console.log(`
Dear ${managerName},

You have been invited by ${invitedBy} to become a Team Manager on the HHB RAG Assistant platform.

As a Team Manager, you will be able to:
- Create and manage your own team
- Set up custom portfolios and upload documents
- Create accounts and manage team knowledge
- Invite and manage team members
- Configure AI assistants for your team

To accept this invitation and create your team, please click the link below:
${inviteLink}

This invitation link is unique to you and will expire in 7 days.

If you don't have an account yet, you'll be able to sign up using this email address.

Best regards,
The HHB Team
  `);
  console.log('=== END EMAIL ===');

  // TODO: Replace with actual email sending logic
  // Example with Resend:
  /*
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'noreply@hhb.com',
    to: managerEmail,
    subject: `You've been invited to become a Team Manager - HHB RAG Assistant`,
    html: emailTemplate
  });
  */
} 