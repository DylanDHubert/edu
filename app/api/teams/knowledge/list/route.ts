import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const type = searchParams.get('type'); // 'general', 'account', 'portfolio'

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

    // Build query based on type
    let query = serviceClient
      .from('team_knowledge')
      .select('*')
      .eq('team_id', teamId);

    if (type === 'general') {
      query = query.is('account_id', null).is('portfolio_id', null);
    } else if (type === 'account') {
      query = query.not('account_id', 'is', null);
    } else if (type === 'portfolio') {
      query = query.not('portfolio_id', 'is', null);
    }

    const { data: knowledgeData, error: knowledgeError } = await query.order('created_at');

    if (knowledgeError) {
      console.error('Error loading knowledge:', knowledgeError);
      return NextResponse.json(
        { error: 'Failed to load knowledge' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      knowledge: knowledgeData || []
    });

  } catch (error) {
    console.error('Error in knowledge list API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
