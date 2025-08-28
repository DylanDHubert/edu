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

    // CHECK FOR ADMIN STATUS FIRST - ADMINS GET AUTOMATIC ACCESS
    const serviceClient = createServiceClient();
    const { data: adminUser, error: adminError } = await serviceClient
      .from('admin_users')
      .select('id')
      .eq('email', user.email)
      .single();

    const isAdmin = !adminError && !!adminUser;

    // Check if user has any team memberships
    const { data: memberships, error: membershipError } = await supabase
      .from('team_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);

    const hasTeamMemberships = !membershipError && memberships && memberships.length > 0;

    // Determine if user has access
    // ANY AUTHENTICATED USER CAN ACCESS THE APP AND CREATE TEAMS
    const hasAccess = true; // All authenticated users have access

    return NextResponse.json({
      success: true,
      hasAccess,
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
