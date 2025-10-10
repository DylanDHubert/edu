import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { courseId, portfolios } = await request.json();

    // Validate required fields
    if (!courseId || !portfolios || !Array.isArray(portfolios)) {
      return NextResponse.json(
        { error: 'course ID and portfolios array are required' },
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

    // USE SERVICE CLIENT TO BYPASS RLS FOR MEMBERSHIP CHECK
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

    // Get course info for naming vector stores - USE SERVICE CLIENT TO BYPASS RLS
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

    // Validate portfolios
    for (const portfolio of portfolios) {
      if (!portfolio.name || !portfolio.name.trim()) {
        return NextResponse.json(
          { error: 'All portfolios must have a name' },
          { status: 400 }
        );
      }
    }

    // Check for duplicate portfolio names
    const portfolioNames = portfolios.map((p: any) => p.name.trim().toLowerCase());
    const uniqueNames = new Set(portfolioNames);
    if (portfolioNames.length !== uniqueNames.size) {
      return NextResponse.json(
        { error: 'Portfolio names must be unique' },
        { status: 400 }
      );
    }

    // Create portfolios in database using service client
    const createdPortfolios = [];
    
    for (const portfolio of portfolios) {
      const { data: createdPortfolio, error: portfolioError } = await serviceClient
        .from('course_portfolios')
        .insert({
          course_id: courseId,
          name: portfolio.name.trim(),
          description: portfolio.description?.trim() || null
        })
        .select()
        .single();

      if (portfolioError) {
        console.error('Error creating portfolio:', portfolioError);
        return NextResponse.json(
          { error: 'Failed to create portfolio: ' + portfolio.name },
          { status: 500 }
        );
      }

      createdPortfolios.push(createdPortfolio);
    }

    return NextResponse.json({
      success: true,
      portfolios: createdPortfolios,
      message: `${createdPortfolios.length} portfolio(s) created successfully.`
    });

  } catch (error) {
    console.error('Error in portfolio creation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 