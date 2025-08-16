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

    return NextResponse.json({
      success: true,
      hasManagerPrivileges,
      userEmail: user.email
    });

  } catch (error) {
    console.error('Error checking manager privileges:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
