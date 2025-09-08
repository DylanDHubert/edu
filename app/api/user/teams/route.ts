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

    // Create service client for team data access
    const serviceClient = createServiceClient();

    // Load user's team memberships with team data using service client
    const { data: memberships, error: membershipError } = await serviceClient
      .from('team_members')
      .select(`
        *,
        teams (
          id,
          name,
          description,
          location
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (membershipError) {
      console.error('Error loading team memberships:', membershipError);
      return NextResponse.json(
        { error: 'Failed to load team memberships' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      memberships: memberships || []
    });

  } catch (error) {
    console.error('Error in user teams API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
