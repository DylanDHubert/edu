import { NextRequest, NextResponse } from 'next/server';
import { DocumentProcessingService } from '../../services/document-processing-service';

export async function POST(request: NextRequest) {
  try {
    const { teamId, portfolioId, documentId } = await request.json();

    // VALIDATE REQUIRED FIELDS
    if (!teamId || !portfolioId || !documentId) {
      return NextResponse.json(
        { error: 'Team ID, portfolio ID, and document ID are required' },
        { status: 400 }
      );
    }

    console.log(`STARTING BACKGROUND PROCESSING: ${documentId}`);

    // PROCESS DOCUMENT WITH LLAMAPARSE
    const processingService = new DocumentProcessingService();
    const result = await processingService.processDocument(teamId, portfolioId, documentId);

    if (result.success) {
      console.log(`BACKGROUND PROCESSING COMPLETED: ${documentId} -> ${result.openaiFileId}`);
      return NextResponse.json({
        success: true,
        message: 'Document processed successfully',
        openaiFileId: result.openaiFileId
      });
    } else {
      console.error(`BACKGROUND PROCESSING FAILED: ${documentId} - ${result.error}`);
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 });
    }

  } catch (error) {
    console.error('ERROR IN PROCESS DOCUMENT ROUTE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
