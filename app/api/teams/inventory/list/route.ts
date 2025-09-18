import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithTeamAccess } from '../../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../../utils/error-responses';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');

    if (!teamId) {
      return handleValidationError('Team ID is required');
    }

    // AUTHENTICATE USER AND VERIFY TEAM ACCESS
    const { user, membership, serviceClient } = await authenticateWithTeamAccess(teamId);

    // Load existing inventory documents using service client
    const { data: inventoryDocuments, error: inventoryError } = await serviceClient
      .from('team_documents')
      .select(`
        id,
        filename,
        original_name,
        file_size,
        openai_file_id,
        created_at,
        uploaded_by
      `)
      .eq('team_id', teamId)
      .eq('document_type', 'inventory')
      .order('created_at', { ascending: false });

    if (inventoryError) {
      return handleDatabaseError(inventoryError, 'load inventory documents');
    }

    return NextResponse.json({
      success: true,
      inventoryDocuments: inventoryDocuments || []
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in inventory list API:', error);
    return handleDatabaseError(error, 'fetch inventory list');
  }
}
