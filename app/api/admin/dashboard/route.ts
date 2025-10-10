import { NextRequest, NextResponse } from 'next/server';
import { authenticateAsAdmin } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError } from '../../../utils/error-responses';

export async function GET(request: NextRequest) {
  try {
    // AUTHENTICATE USER AS ADMIN
    const { user, serviceClient } = await authenticateAsAdmin();

    // Load courses with member counts using service client
    const { data: coursesData, error: coursesError } = await serviceClient
      .from('courses')
      .select(`
        *,
        course_members(count)
      `)
      .order('created_at', { ascending: false });

    if (coursesError) {
      return handleDatabaseError(coursesError, 'load courses data');
    }

    // Format courses data
    const formattedcourses = coursesData?.map((course: any) => ({
      ...course,
      member_count: course.course_members?.[0]?.count || 0,
      status: course.course_members?.[0]?.count > 0 ? 'Active' : 'Pending'
    })) || [];

    // Calculate stats
    const totalcourses = formattedcourses.length;
    const totalMembers = formattedcourses.reduce((sum: number, course: any) => sum + course.member_count, 0);
    const activecourses = formattedcourses.filter((course: any) => course.member_count > 0).length;

    return NextResponse.json({
      success: true,
      data: {
        courses: formattedcourses,
        stats: {
          totalcourses,
          totalMembers,
          activecourses
        }
      }
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'ADMIN_ACCESS_REQUIRED'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in admin dashboard API:', error);
    return handleDatabaseError(error, 'fetch admin dashboard data');
  }
}
