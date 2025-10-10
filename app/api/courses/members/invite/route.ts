import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { courseId, invites } = await request.json();

    // Validate required fields
    if (!courseId || !invites || !Array.isArray(invites)) {
      return NextResponse.json(
        { error: 'course ID and invites array are required' },
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

    // Verify user is a manager of this course - USE SERVICE CLIENT TO AVOID RLS CIRCULAR REFERENCE
    const serviceClient = createServiceClient();
    const { data: courseMember, error: memberError } = await serviceClient
      .from('course_members')
      .select('role')
      .eq('course_id', courseId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberError || !courseMember || courseMember.role !== 'manager') {
      return NextResponse.json(
        { error: 'Manager access required' },
        { status: 403 }
      );
    }

    // Get course info - USE SERVICE CLIENT
    const { data: course, error: courseError } = await serviceClient
      .from('courses')
      .select('name')
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      return NextResponse.json(
        { error: 'course not found' },
        { status: 404 }
      );
    }

    // Process each invitation
    const sentInvitations = [];
    const errors = [];

    for (const invite of invites) {
      try {
        // Validate invite data
        if (!invite.email || !invite.name || !invite.role) {
          errors.push(`Invalid invite data for ${invite.email || 'unknown'}`);
          continue;
        }

        // Check if invitation already exists - USE SERVICE CLIENT
        const { data: existingInvitation } = await serviceClient
          .from('course_member_invitations')
          .select('id')
          .eq('course_id', courseId)
          .eq('email', invite.email.toLowerCase())
          .eq('status', 'pending')
          .single();

        if (existingInvitation) {
          errors.push(`An invitation for ${invite.email} already exists`);
          continue;
        }

        // Generate invitation token
        const invitationToken = generateInvitationToken();

        // Create course member invitation record - USE SERVICE CLIENT
        const { data: invitation, error: invitationError } = await serviceClient
          .from('course_member_invitations')
          .insert({
            course_id: courseId,
            email: invite.email.toLowerCase(),
            name: invite.name,
            role: invite.role,
            invitation_token: invitationToken,
            invited_by: user.id,
            status: 'pending'
          })
          .select()
          .single();

        if (invitationError) {
          console.error('Error creating invitation:', invitationError);
          errors.push(`Failed to create invitation for ${invite.email}`);
          continue;
        }

        sentInvitations.push({
          email: invite.email,
          name: invite.name,
          role: invite.role,
          invitationId: invitation.id
        });

      } catch (error) {
        console.error('Error processing invitation:', error);
        errors.push(`Failed to process invitation for ${invite.email}`);
      }
    }

    return NextResponse.json({
      success: true,
      sentInvitations,
      errors: errors.length > 0 ? errors : undefined,
      message: `${sentInvitations.length} invitation(s) created successfully${errors.length > 0 ? ` with ${errors.length} error(s)` : ''}.`
    });

  } catch (error) {
    console.error('Error in course member invitation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to generate a secure invitation token
function generateInvitationToken(): string {
  return crypto.randomUUID();
}

 