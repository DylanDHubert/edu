import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';
import { courseDeletionService } from '../../../../services/course-deletion-service';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params;
    const { confirmation, deleteExternalResources = true } = await request.json();

    // VALIDATE REQUIRED FIELDS
    if (!confirmation) {
      return NextResponse.json(
        { error: 'course name confirmation is required' },
        { status: 400 }
      );
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // VERIFY USER IS ORIGINAL MANAGER OF THIS course
    const serviceClient = createServiceClient();
    const { data: courseMember, error: memberError } = await serviceClient
      .from('course_members')
      .select(`
        *,
        courses!inner(name, created_by)
      `)
      .eq('course_id', courseId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberError || !courseMember) {
      return NextResponse.json(
        { error: 'course membership not found' },
        { status: 404 }
      );
    }

    // CHECK IF USER IS ORIGINAL MANAGER
    if (!courseMember.is_original_manager) {
      return NextResponse.json(
        { error: 'Only the original course manager can delete the course' },
        { status: 403 }
      );
    }

    // VERIFY course NAME CONFIRMATION
    if (confirmation !== courseMember.courses.name) {
      return NextResponse.json(
        { error: 'course name confirmation does not match' },
        { status: 400 }
      );
    }

    // INITIALIZE DELETION SERVICE
    const deletionService = new courseDeletionService(serviceClient);

    // PERFORM course DELETION
    const deletionResult = await deletionService.deletecourse(courseId, {
      deleteExternalResources,
      userId: user.id,
      courseName: courseMember.courses.name
    });

    if (!deletionResult.success) {
      return NextResponse.json(
        { 
          error: 'Failed to delete course',
          details: deletionResult.error,
          partialCleanup: deletionResult.partialCleanup
        },
        { status: 500 }
      );
    }


    return NextResponse.json({
      success: true,
      message: `course "${courseMember.courses.name}" and all associated data deleted successfully`,
      deletedResources: deletionResult.deletedResources,
      cleanupSummary: deletionResult.cleanupSummary
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error during course deletion' },
      { status: 500 }
    );
  }
}
