import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// DEBUG: Log API key status (without exposing the key)
console.log('Resend API Key configured:', !!process.env.RESEND_API_KEY);
console.log('Resend API Key length:', process.env.RESEND_API_KEY?.length || 0);

// SEND MANAGER INVITATION EMAIL
export async function sendManagerInvitationEmail({
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
  const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://hhb.solutions'}/invite/manager?token=${invitationToken}`;
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Team Manager Invitation - HHB RAG Assistant</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px;">
        <h2 style="color: #2c3e50; margin-bottom: 20px;">You've been invited to become a Team Manager - HHB RAG Assistant</h2>
        
        <p>Dear ${managerName},</p>
        
        <p>You have been invited by <strong>${invitedBy}</strong> to become a Team Manager on the HHB RAG Assistant platform.</p>
        
        <h3 style="color: #2c3e50; margin-top: 25px;">As a Team Manager, you will be able to:</h3>
        <ul style="margin-bottom: 25px;">
          <li>Create and manage your own team</li>
          <li>Set up custom portfolios and upload documents</li>
          <li>Create accounts and manage team knowledge</li>
          <li>Invite and manage team members</li>
          <li>Configure AI assistants for your team</li>
        </ul>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteLink}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Accept Invitation</a>
        </div>
        
        <p style="font-size: 14px; color: #666;">This invitation link is unique to you and will expire in 7 days.</p>
        <p style="font-size: 14px; color: #666;">If you don't have an account yet, you'll be able to sign up using this email address.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="margin: 0; font-size: 14px; color: #666;">Best regards,<br>The HHB Team</p>
      </div>
    </body>
    </html>
  `;

  try {
    console.log('Attempting to send manager invitation email to:', managerEmail);
    console.log('Using from address: noreply@hhb.solutions');
    
    const result = await resend.emails.send({
      from: 'noreply@hhb.solutions',
      to: managerEmail,
      subject: 'You\'ve been invited to become a Team Manager - HHB RAG Assistant',
      html: htmlContent,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high'
      }
    });
    
    console.log('Manager invitation email sent successfully to:', managerEmail);
    console.log('Resend response:', result);
  } catch (error) {
    console.error('Error sending manager invitation email:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    throw error;
  }
}

// SEND TEAM MEMBER INVITATION EMAIL
export async function sendTeamMemberInvitationEmail({
  memberEmail,
  memberName,
  memberRole,
  teamName,
  invitationToken,
  invitedBy
}: {
  memberEmail: string;
  memberName: string;
  memberRole: string;
  teamName: string;
  invitationToken: string;
  invitedBy: string;
}) {
  const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://hhb.solutions'}/invite/member?token=${invitationToken}`;
  
  const roleDescription = memberRole === 'manager' ? `
    <h3>As a Team Manager, you will be able to:</h3>
    <ul>
      <li>Edit team knowledge and settings</li>
      <li>Upload and manage documents</li>
      <li>Invite and manage team members</li>
      <li>Access to all team functionality</li>
    </ul>
  ` : `
    <h3>As a Team Member, you will be able to:</h3>
    <ul>
      <li>View team knowledge and documents</li>
      <li>Use AI assistant for searches</li>
      <li>Create and share personal notes</li>
      <li>Read-only access to team settings</li>
    </ul>
  `;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Team Invitation - HHB RAG Assistant</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px;">
        <h2 style="color: #2c3e50; margin-bottom: 20px;">You've been invited to join ${teamName} - HHB RAG Assistant</h2>
        
        <p>Dear ${memberName},</p>
        
        <p>You have been invited by <strong>${invitedBy}</strong> to join the team <strong>"${teamName}"</strong> on the HHB RAG Assistant platform.</p>
        
        <p><strong>Your Role:</strong> ${memberRole === 'manager' ? 'Team Manager' : 'Team Member'}</p>
        
        ${roleDescription}
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteLink}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Accept Invitation</a>
        </div>
        
        <p style="font-size: 14px; color: #666;">This invitation link is unique to you and will expire in 7 days.</p>
        <p style="font-size: 14px; color: #666;">If you don't have an account yet, you'll be able to sign up using this email address.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="margin: 0; font-size: 14px; color: #666;">Best regards,<br>The HHB Team</p>
      </div>
    </body>
    </html>
  `;

  try {
    console.log('Attempting to send team member invitation email to:', memberEmail);
    console.log('Using from address: noreply@hhb.solutions');
    
    const result = await resend.emails.send({
      from: 'noreply@hhb.solutions',
      to: memberEmail,
      subject: `You've been invited to join ${teamName} - HHB RAG Assistant`,
      html: htmlContent,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high'
      }
    });
    
    console.log('Team member invitation email sent successfully to:', memberEmail);
    console.log('Resend response:', result);
  } catch (error) {
    console.error('Error sending team member invitation email:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    throw error;
  }
}
