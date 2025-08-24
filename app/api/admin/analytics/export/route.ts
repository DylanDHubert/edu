import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';

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
      .select('id, email')
      .eq('email', user.email)
      .single();

    if (adminError || !adminUser) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Parse request body
    const { dataType, filters, data } = await request.json();

    if (!dataType || !data) {
      return NextResponse.json(
        { error: 'Data type and data are required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Admin Export Request: ${dataType}, ${data.length} records`);

    // Create export configuration
    const exportConfig = {
      exported_at: new Date().toISOString(),
      exported_by: adminUser.email,
      data_type: dataType,
      filters: filters || {},
      total_records: data.length,
      export_version: '1.0'
    };

    // Create the export object
    const exportData = {
      config: exportConfig,
      data: data
    };

    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `hhb_${dataType}_export_${timestamp}.json`;

    console.log(`✅ Export created: ${filename}, ${data.length} records`);

    // Return the JSON data with proper headers for download
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error) {
    console.error('Error in export:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 