import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { portfolio_type, title, content, is_shared } = await request.json();
    
    if (!portfolio_type || !title || !content) {
      return NextResponse.json(
        { error: 'PORTFOLIO TYPE, TITLE, AND CONTENT ARE REQUIRED' },
        { status: 400 }
      );
    }

    // VALIDATE PORTFOLIO TYPE
    const validPortfolioTypes = ['general', 'hip', 'knee', 'ts_knee'];
    if (!validPortfolioTypes.includes(portfolio_type)) {
      return NextResponse.json(
        { error: 'INVALID PORTFOLIO TYPE' },
        { status: 400 }
      );
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // CREATE NOTE
    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: user.id,
        portfolio_type,
        title: title.trim(),
        content: content.trim(),
        is_shared: is_shared || false
      })
      .select()
      .single();

    if (error) {
      console.error('ERROR CREATING NOTE:', error);
      return NextResponse.json(
        { error: 'FAILED TO CREATE NOTE' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('ERROR IN CREATE NOTE ROUTE:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
} 