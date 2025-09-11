import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../../utils/supabase/server';
import { cookies } from 'next/headers';
import { DocumentProcessingService } from '../../../../../services/document-processing-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;

    // VALIDATE DOCUMENT ID
    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
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

    // GET DOCUMENT INFO TO VERIFY ACCESS
    const { data: document, error: docError } = await supabase
      .from('team_documents')
      .select('team_id, portfolio_id, team_members!inner(role)')
      .eq('id', documentId)
      .eq('team_members.user_id', user.id)
      .eq('team_members.status', 'active')
      .single();

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    // GET PROCESSING STATUS
    const processingService = new DocumentProcessingService();
    const status = await processingService.getProcessingStatus(documentId);

    if (!status) {
      return NextResponse.json(
        { error: 'Processing status not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      status: {
        id: status.id,
        status: status.status,
        progress: status.progress,
        error: status.error,
        createdAt: status.createdAt,
        updatedAt: status.updatedAt
      }
    });

  } catch (error) {
    console.error('ERROR IN PROCESSING STATUS ROUTE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;
    const { action } = await request.json();

    // VALIDATE DOCUMENT ID AND ACTION
    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }

    if (action !== 'retry') {
      return NextResponse.json(
        { error: 'Invalid action. Only "retry" is supported.' },
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

    // GET DOCUMENT INFO TO VERIFY ACCESS
    const { data: document, error: docError } = await supabase
      .from('team_documents')
      .select('team_id, portfolio_id, team_members!inner(role)')
      .eq('id', documentId)
      .eq('team_members.user_id', user.id)
      .eq('team_members.status', 'active')
      .single();

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    // VERIFY USER IS MANAGER
    if (document.team_members[0]?.role !== 'manager') {
      return NextResponse.json(
        { error: 'Manager access required' },
        { status: 403 }
      );
    }

    // RETRY PROCESSING
    const processingService = new DocumentProcessingService();
    const result = await processingService.retryJob(
      document.team_id,
      document.portfolio_id,
      documentId
    );

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Processing retry started successfully'
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 });
    }

  } catch (error) {
    console.error('ERROR IN PROCESSING STATUS RETRY ROUTE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
