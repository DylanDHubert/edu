import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

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

    // Check if user has manager privileges using service client to bypass RLS
    const serviceClient = createServiceClient();
    const { data: invitation, error: inviteError } = await serviceClient
      .from('manager_invitations')
      .select('id')
      .eq('email', user.email)
      .eq('status', 'completed')
      .single();

    const hasManagerPrivileges = !inviteError && !!invitation;

    // Check if user has any team memberships
    const { data: memberships, error: membershipError } = await supabase
      .from('team_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);

    const hasTeamMemberships = !membershipError && memberships && memberships.length > 0;

    // Determine if user has access
    const hasAccess = hasManagerPrivileges || hasTeamMemberships;

    return NextResponse.json({
      success: true,
      hasAccess,
      hasManagerPrivileges,
      hasTeamMemberships,
      userEmail: user.email
    });

  } catch (error) {
    console.error('Error checking user access:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
