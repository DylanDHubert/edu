import { NextRequest, NextResponse } from 'next/server';
import { authenticateWithTeamAccess } from '../../../../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../../../../utils/error-responses';
import { DocumentProcessingService } from '../../../../../../services/document-processing-service';
import { createServiceClient } from '../../../../../../utils/supabase/server';

interface TeamDocument {
  id: string;
  original_name: string;
  file_size: number | null;
  created_at: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ portfolioId: string }> }
) {
  try {
    const { portfolioId } = await params;
    const url = new URL(request.url);
    const teamId = url.searchParams.get('teamId');

    // VALIDATE REQUIRED FIELDS
    if (!teamId || !portfolioId) {
      return handleValidationError('Team ID and Portfolio ID are required');
    }

    // AUTHENTICATE USER AND VERIFY TEAM ACCESS
    const { user, membership, serviceClient } = await authenticateWithTeamAccess(teamId);

    // GET ALL DOCUMENTS FOR THIS PORTFOLIO
    const { data: documents, error: documentsError } = await serviceClient
      .from('team_documents')
      .select('id, original_name, file_size, created_at')
      .eq('team_id', teamId)
      .eq('portfolio_id', portfolioId)
      .order('created_at', { ascending: false });

    if (documentsError) {
      console.error('ERROR FETCHING DOCUMENTS:', documentsError);
      return handleDatabaseError(documentsError, 'fetch portfolio documents');
    }

    // GET PROCESSING STATUS FOR EACH DOCUMENT
    const processingService = new DocumentProcessingService();
    const documentsWithStatus = await Promise.all(
      (documents || []).map(async (doc: TeamDocument) => {
        const status = await processingService.getProcessingStatus(doc.id);
        return {
          id: doc.id,
          original_name: doc.original_name,
          file_size: doc.file_size,
          created_at: doc.created_at,
          status: status?.status || 'pending',
          progress: status?.progress || 0,
          error: status?.error || null,
          updated_at: status?.updatedAt || doc.created_at
        };
      })
    );

    // CALCULATE SUMMARY STATISTICS
    const totalDocuments = documentsWithStatus.length;
    const completedDocuments = documentsWithStatus.filter(doc => doc.status === 'completed').length;
    const pendingDocuments = documentsWithStatus.filter(doc => doc.status === 'pending').length;
    const processingDocuments = documentsWithStatus.filter(doc => doc.status === 'processing').length;
    const failedDocuments = documentsWithStatus.filter(doc => doc.status === 'failed').length;

    return NextResponse.json({
      success: true,
      documents: documentsWithStatus,
      summary: {
        total: totalDocuments,
        completed: completedDocuments,
        pending: pendingDocuments,
        processing: processingDocuments,
        failed: failedDocuments,
        isComplete: pendingDocuments === 0 && processingDocuments === 0 && totalDocuments > 0
      }
    });

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in portfolio documents status route:', error);
    return handleDatabaseError(error, 'get portfolio documents status');
  }
}
