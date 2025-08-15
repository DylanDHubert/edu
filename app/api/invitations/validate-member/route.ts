import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Use server-side client to bypass RLS
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);

    // Find the team member invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_member_invitations')
      .select(`
        *,
        teams:team_id (
          name
        )
      `)
      .eq('invitation_token', token)
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

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        team_id: invitation.team_id,
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        status: invitation.status,
        expires_at: invitation.expires_at,
        team_name: invitation.teams?.name || 'Unknown Team'
      }
    });

  } catch (error) {
    console.error('Error validating member invitation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
