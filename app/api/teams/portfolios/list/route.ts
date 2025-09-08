import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
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

    // Create service client for team data access
    const serviceClient = createServiceClient();

    // Verify user is a member of this team - USE SERVICE CLIENT
    const { data: membership, error: membershipError } = await serviceClient
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: 'You do not have access to this team' },
        { status: 403 }
      );
    }

    // Load existing portfolios and their documents using service client
    const { data: portfoliosData, error: portfoliosError } = await serviceClient
      .from('team_portfolios')
      .select(`
        *,
        team_documents (
          id,
          filename,
          original_name
        )
      `)
      .eq('team_id', teamId)
      .order('created_at');

    if (portfoliosError) {
      console.error('Error loading portfolios:', portfoliosError);
      return NextResponse.json(
        { error: 'Failed to load existing portfolios' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      portfolios: portfoliosData || []
    });

  } catch (error) {
    console.error('Error in portfolios list API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
