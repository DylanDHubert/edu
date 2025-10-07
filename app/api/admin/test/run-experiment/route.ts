import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';
import { ChunksExperimentService } from '../../../../services/chunks-experiment-service';
import { experimentCache } from '../../../../services/experiment-cache-service';

export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin access
    const serviceClient = createServiceClient();
    const { data: adminUser, error: adminError } = await serviceClient
      .from('admin_users')
      .select('id')
      .eq('email', user.email)
      .single();

    if (adminError || !adminUser) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { assistantId, query, forceRefresh = false } = body;

    if (!assistantId || !query) {
      return NextResponse.json(
        { error: 'assistantId and query are required' },
        { status: 400 }
      );
    }

    console.log('🧪 Experiment request:', { assistantId, queryLength: query.length, forceRefresh });

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cachedResult = await experimentCache.get(assistantId, query);
      if (cachedResult) {
        console.log('📋 Returning cached experiment result');
        return NextResponse.json({
          success: true,
          result: cachedResult.result,
          metadata: {
            ...cachedResult.metadata,
            cached: true,
            cacheKey: experimentCache.generateKey(assistantId, query)
          },
          sources: cachedResult.sources || []
        });
      }
    }

    // Run fresh experiment
    console.log('🚀 Running fresh experiment...');
    const experimentService = new ChunksExperimentService(assistantId, query);
    const experimentResult = await experimentService.run();

    // Cache the result
    await experimentCache.set(assistantId, query, experimentResult);

    // Clean up expired cache entries periodically
    if (Math.random() < 0.1) { // 10% chance to run cleanup
      await experimentCache.cleanup();
    }

    console.log('✅ Experiment completed and cached');

    return NextResponse.json({
      success: true,
      result: experimentResult.result,
      metadata: {
        ...experimentResult.metadata,
        cached: false,
        cacheKey: experimentCache.generateKey(assistantId, query)
      },
      sources: experimentResult.sources || []
    });

  } catch (error: any) {
    console.error('❌ Experiment failed:', error);
    
    return NextResponse.json(
      { 
        error: 'Experiment failed',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint for cache stats (useful for debugging)
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin access
    const serviceClient = createServiceClient();
    const { data: adminUser, error: adminError } = await serviceClient
      .from('admin_users')
      .select('id')
      .eq('email', user.email)
      .single();

    if (adminError || !adminUser) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const stats = await experimentCache.getStats();
    return NextResponse.json({
      success: true,
      stats
    });

  } catch (error: any) {
    console.error('❌ Failed to get cache stats:', error);
    return NextResponse.json(
      { error: 'Failed to get cache stats' },
      { status: 500 }
    );
  }
}

// DELETE endpoint to clear cache
export async function DELETE(request: NextRequest) {
  try {
    // Verify admin authentication
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin access
    const serviceClient = createServiceClient();
    const { data: adminUser, error: adminError } = await serviceClient
      .from('admin_users')
      .select('id')
      .eq('email', user.email)
      .single();

    if (adminError || !adminUser) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await experimentCache.clear();
    
    return NextResponse.json({
      success: true,
      message: 'Cache cleared successfully'
    });

  } catch (error: any) {
    console.error('❌ Failed to clear cache:', error);
    return NextResponse.json(
      { error: 'Failed to clear cache' },
      { status: 500 }
    );
  }
}
