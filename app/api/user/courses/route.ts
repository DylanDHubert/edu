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

    // Create service client for course data access
    const serviceClient = createServiceClient();

    // Load user's course memberships with course data using service client
    const { data: memberships, error: membershipError } = await serviceClient
      .from('course_members')
      .select(`
        *,
        courses (
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
      console.error('Error loading course memberships:', membershipError);
      return NextResponse.json(
        { error: 'Failed to load course memberships' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      memberships: memberships || []
    });

  } catch (error) {
    console.error('Error in user courses API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
