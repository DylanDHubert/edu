import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');

    if (!teamId) {
      return NextResponse.json(
        { error: 'Team ID is required' },
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

    // Create service client for team membership check
    const serviceClient = createServiceClient();

    // Check if user is already a member of this team using service client
    const { data: existingMember, error: membershipError } = await serviceClient
      .from('team_members')
      .select('*')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (membershipError && membershipError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is expected if user is not a member
      console.error('Error checking membership:', membershipError);
      return NextResponse.json(
        { error: 'Failed to check membership' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      isMember: !!existingMember,
      membership: existingMember || null
    });

  } catch (error) {
    console.error('Error in check membership API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
