import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    console.log('=== MANAGER INVITATION VALIDATION DEBUG ===');
    console.log('Token received:', token);
    console.log('Token length:', token?.length);

    if (!token) {
      console.log('No token provided');
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Use service role client to bypass RLS
    const supabase = createServiceClient();

    // Find the manager invitation
    console.log('Searching for invitation with token:', token);
    
    // Test RLS by trying different queries
    console.log('=== RLS TESTING ===');
    
    // Test 1: Can we query the table at all?
    console.log('Test 1: Basic table access...');
    const { data: allInvitations, error: testError } = await supabase
      .from('manager_invitations')
      .select('invitation_token, status')
      .limit(5);
    
    console.log('Test 1 result:', allInvitations);
    console.log('Test 1 error:', testError);
    
    // Test 2: Can we find any pending invitations?
    console.log('Test 2: Pending invitations...');
    const { data: pendingInvitations, error: pendingError } = await supabase
      .from('manager_invitations')
      .select('invitation_token, status')
      .eq('status', 'pending')
      .limit(5);
    
    console.log('Test 2 result:', pendingInvitations);
    console.log('Test 2 error:', pendingError);
    
    // Test 3: Try the specific token query
    console.log('Test 3: Specific token query...');
    const { data: invitation, error: inviteError } = await supabase
      .from('manager_invitations')
      .select('*')
      .eq('invitation_token', token)
      .eq('status', 'pending')
      .single();

    console.log('Query result - invitation:', invitation);
    console.log('Query result - error:', inviteError);

    if (inviteError || !invitation) {
      console.log('Invitation not found or error occurred');
      console.log('Error details:', inviteError);
      return NextResponse.json(
        { error: 'Invalid or expired invitation' },
        { status: 404 }
      );
    }

    // Check if invitation has expired
    console.log('Checking expiration...');
    console.log('Invitation expires_at:', invitation.expires_at);
    console.log('Invitation status:', invitation.status);
    
    const expiresAt = new Date(invitation.expires_at);
    const now = new Date();
    
    console.log('Parsed expiresAt:', expiresAt);
    console.log('Current time:', now);
    console.log('Is expired?', now > expiresAt);
    
    if (now > expiresAt) {
      console.log('Invitation has expired');
      return NextResponse.json(
        { error: 'This invitation has expired' },
        { status: 400 }
      );
    }
    
    console.log('Invitation is valid');

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        name: invitation.name,
        status: invitation.status,
        expires_at: invitation.expires_at
      }
    });

  } catch (error) {
    console.error('Error validating manager invitation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
