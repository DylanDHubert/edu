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

    // CHECK FOR ADMIN STATUS FIRST - ADMINS GET AUTOMATIC MANAGER PRIVILEGES
    const serviceClient = createServiceClient();
    const { data: adminUser, error: adminError } = await serviceClient
      .from('admin_users')
      .select('id')
      .eq('email', user.email)
      .single();

    const isAdmin = !adminError && !!adminUser;

    // Check if user has manager privileges using service client to bypass RLS
    const { data: invitation, error: inviteError } = await serviceClient
      .from('manager_invitations')
      .select('id')
      .eq('email', user.email)
      .eq('status', 'completed')
      .single();

    // ADMINS GET AUTOMATIC MANAGER PRIVILEGES
    const hasManagerPrivileges = isAdmin || (!inviteError && !!invitation);

    // Check if user has any team memberships
    const { data: memberships, error: membershipError } = await supabase
      .from('team_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);

    const hasTeamMemberships = !membershipError && memberships && memberships.length > 0;

    // Determine if user has access
    // ADMINS ALWAYS HAVE ACCESS REGARDLESS OF TEAM MEMBERSHIPS
    const hasAccess = isAdmin || hasManagerPrivileges || hasTeamMemberships;

    return NextResponse.json({
      success: true,
      hasAccess,
      hasManagerPrivileges,
      hasTeamMemberships,
      isAdmin,
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
