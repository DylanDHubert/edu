import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';
import { rateLimitMiddleware, RATE_LIMITS } from '../../../utils/rate-limit';
import { sanitizeInput } from '../../../utils/security';

export async function POST(request: NextRequest) {
  try {
    // APPLY RATE LIMITING FOR course CREATION
    const rateLimitResponse = rateLimitMiddleware(request, RATE_LIMITS.SENSITIVE);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { name, description, location } = await request.json();

    // Validate required fields
    if (!name || !location) {
      return NextResponse.json(
        { error: 'course name and location are required' },
        { status: 400 }
      );
    }

    // SANITIZE USER INPUT TO PREVENT XSS
    const sanitizedName = sanitizeInput(name);
    const sanitizedDescription = description ? sanitizeInput(description) : '';
    const sanitizedLocation = sanitizeInput(location);

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

    // ANY AUTHENTICATED USER CAN CREATE courseS NOW
    
    const serviceClient = createServiceClient();

    // Create the course - USE SERVICE CLIENT TO BYPASS RLS
    const { data: course, error: courseError } = await serviceClient
      .from('courses')
      .insert({
        name: sanitizedName,
        description: sanitizedDescription || null,
        location: sanitizedLocation,
        created_by: user.id
      })
      .select()
      .single();

    if (courseError) {
      console.error('Error creating course:', courseError);
      return NextResponse.json(
        { error: 'Failed to create course' },
        { status: 500 }
      );
    }

    // Add the user as the original manager of the course - USE SERVICE CLIENT TO BYPASS RLS
    const { error: memberError } = await serviceClient
      .from('course_members')
      .insert({
        course_id: course.id,
        user_id: user.id,
        role: 'manager',
        status: 'active',
        invited_by: user.id,
        is_original_manager: true
      });

    if (memberError) {
      console.error('Error adding course member:', memberError);
      // If course member creation fails, we should clean up the course - USE SERVICE CLIENT TO BYPASS RLS
      await serviceClient.from('courses').delete().eq('id', course.id);
      return NextResponse.json(
        { error: 'Failed to set up course membership' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      course: {
        id: course.id,
        name: course.name,
        description: course.description,
        location: course.location,
        created_at: course.created_at
      },
      message: `course "${course.name}" created successfully.`
    });

  } catch (error) {
    console.error('Error in course creation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 