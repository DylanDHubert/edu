import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { teamId, portfolios } = await request.json();

    // Validate required fields
    if (!teamId || !portfolios || !Array.isArray(portfolios)) {
      return NextResponse.json(
        { error: 'Team ID and portfolios array are required' },
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

    // Verify user is a manager of this team
    const { data: teamMember, error: memberError } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberError || !teamMember || teamMember.role !== 'manager') {
      return NextResponse.json(
        { error: 'Manager access required' },
        { status: 403 }
      );
    }

    // Get team info for naming vector stores
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('name')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { error: 'Team not found' },
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
    const serviceClient = createServiceClient();
    const createdPortfolios = [];
    
    for (const portfolio of portfolios) {
      const { data: createdPortfolio, error: portfolioError } = await serviceClient
        .from('team_portfolios')
        .insert({
          team_id: teamId,
          name: portfolio.name.trim(),
          description: portfolio.description?.trim() || null,
          // Vector store will be created after file upload
          vector_store_id: null,
          vector_store_name: null
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