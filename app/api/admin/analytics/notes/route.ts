import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';

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

    // Parse query parameters
    const url = new URL(request.url);
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');
    const teamId = url.searchParams.get('team_id');

    console.log('🔍 Admin Analytics - Notes Request:', { startDate, endDate, teamId });

    const startTime = Date.now();

    // Get notes
    let notesQuery = serviceClient
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply filters
    if (startDate) {
      notesQuery = notesQuery.gte('created_at', startDate);
    }
    if (endDate) {
      notesQuery = notesQuery.lte('created_at', endDate);
    }
    if (teamId) {
      notesQuery = notesQuery.eq('team_id', teamId);
    }

    const { data: notes, error: notesError } = await notesQuery;

    if (notesError) {
      console.error('Error fetching notes:', notesError);
      return NextResponse.json({ error: 'Failed to fetch notes data' }, { status: 500 });
    }

    console.log(`📝 Found ${notes?.length || 0} notes`);

    // Get user emails
    const userIds = [...new Set(notes?.map(note => note.user_id).filter(Boolean) || [])];
    const { data: users, error: userError } = await serviceClient.auth.admin.listUsers();
    
    const userMap: Record<string, string> = {};
    if (!userError && users?.users) {
      users.users.forEach(u => {
        if (u.id && u.email) {
          userMap[u.id] = u.email;
        }
      });
    }

    // Get team names
    const teamIds = [...new Set(notes?.map(note => note.team_id).filter(Boolean) || [])];
    const { data: teams } = await serviceClient
      .from('teams')
      .select('id, name')
      .in('id', teamIds);
    
    const teamMap: Record<string, string> = {};
    teams?.forEach(team => {
      teamMap[team.id] = team.name;
    });

    // Get account names
    const accountIds = [...new Set(notes?.map(note => note.account_id).filter(Boolean) || [])];
    const { data: accounts } = await serviceClient
      .from('team_accounts')
      .select('id, name')
      .in('id', accountIds);
    
    const accountMap: Record<string, string> = {};
    accounts?.forEach(account => {
      accountMap[account.id] = account.name;
    });

    // Get portfolio names
    const portfolioIds = [...new Set(notes?.map(note => note.portfolio_id).filter(Boolean) || [])];
    const { data: portfolios } = await serviceClient
      .from('team_portfolios')
      .select('id, name')
      .in('id', portfolioIds);
    
    const portfolioMap: Record<string, string> = {};
    portfolios?.forEach(portfolio => {
      portfolioMap[portfolio.id] = portfolio.name;
    });

    // Process notes data
    const enrichedNotes = (notes || []).map(note => {
      // Process images if they exist
      let processedImages: any[] = [];
      if (note.images && Array.isArray(note.images)) {
        processedImages = note.images.map((img: any) => {
          // If it's a Supabase Storage URL, convert to our API endpoint
          if (img.url && img.url.includes('supabase')) {
            // Extract filename from Supabase URL
            const urlParts = img.url.split('/');
            const filename = urlParts[urlParts.length - 1];
            return {
              ...img,
              api_url: `/api/images/${encodeURIComponent(filename)}`,
              original_url: img.url
            };
          }
          return {
            ...img,
            api_url: img.url,
            original_url: img.url
          };
        });
      }

      return {
        note_id: note.id,
        user_email: userMap[note.user_id] || 'Unknown',
        team_name: teamMap[note.team_id] || 'Unknown',
        account_name: accountMap[note.account_id] || 'Unknown',
        portfolio_name: portfolioMap[note.portfolio_id] || 'Unknown',
        portfolio_type: note.portfolio_type,
        title: note.title,
        content: note.content,
        is_shared: note.is_shared,
        is_portfolio_shared: note.is_portfolio_shared,
        images: processedImages,
        image_count: processedImages.length,
        created_at: note.created_at,
        updated_at: note.updated_at
      };
    });

    const processingTime = Date.now() - startTime;

    // Calculate some basic stats
    const stats = {
      total_notes: enrichedNotes.length,
      notes_with_images: enrichedNotes.filter(note => note.image_count > 0).length,
      shared_notes: enrichedNotes.filter(note => note.is_shared).length,
      total_images: enrichedNotes.reduce((sum, note) => sum + note.image_count, 0)
    };

    console.log(`✅ Notes processing complete: ${enrichedNotes.length} notes, ${stats.total_images} images, ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      data: enrichedNotes,
      metadata: {
        ...stats,
        processing_time_ms: processingTime,
        filters_applied: {
          start_date: startDate,
          end_date: endDate,
          team_id: teamId
        }
      }
    });

  } catch (error) {
    console.error('Error in notes analytics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 