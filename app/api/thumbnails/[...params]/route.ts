// THUMBNAIL API: SERVES SCREENSHOTS AND PDFS FROM SUPABASE STORAGE
// CLEAN API FOR FRONTEND TO ACCESS DOCUMENT ASSETS

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ThumbnailService } from '../../../services/thumbnail-service';
import { createClient } from '../../../utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ params: string[] }> }
) {
  try {
    const { params: pathParams } = await params;
    
    if (!pathParams || pathParams.length < 2) {
      return NextResponse.json(
        { error: 'Invalid path. Expected: /api/thumbnails/screenshot/{teamId}/{portfolioId}/{documentId}/{pageNumber} or /api/thumbnails/pdf/{teamId}/{portfolioId}/{documentId}' },
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

    const thumbnailService = new ThumbnailService();
    const [type, teamId, portfolioId, documentId, ...rest] = pathParams;

    console.log('🔍 THUMBNAIL API: REQUEST');
    console.log('  🏷️ Type:', type);
    console.log('  👤 User:', user.id);
    console.log('  🏢 Team:', teamId);
    console.log('  📁 Portfolio:', portfolioId);
    console.log('  📄 Document:', documentId);

    // VERIFY USER HAS ACCESS TO TEAM
    const hasAccess = await thumbnailService.verifyUserAccess(user.id, teamId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Access denied to this team' },
        { status: 403 }
      );
    }

    if (type === 'screenshot') {
      // SCREENSHOT: /api/thumbnails/screenshot/{teamId}/{portfolioId}/{documentId}/{pageNumber}
      if (pathParams.length !== 5) {
        return NextResponse.json(
          { error: 'Invalid screenshot path. Expected: /api/thumbnails/screenshot/{teamId}/{portfolioId}/{documentId}/{pageNumber}' },
          { status: 400 }
        );
      }

      const pageNumber = parseInt(rest[0]);
      if (isNaN(pageNumber)) {
        return NextResponse.json(
          { error: 'Invalid page number' },
          { status: 400 }
        );
      }

      const result = await thumbnailService.getScreenshotThumbnail(
        teamId,
        portfolioId,
        documentId,
        pageNumber
      );

      return new NextResponse(result.data, {
        status: 200,
        headers: {
          'Content-Type': result.contentType,
          'Content-Disposition': `inline; filename="${result.filename}"`,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });

    } else if (type === 'pdf') {
      // PDF: /api/thumbnails/pdf/{teamId}/{portfolioId}/{documentId}
      if (pathParams.length !== 4) {
        return NextResponse.json(
          { error: 'Invalid PDF path. Expected: /api/thumbnails/pdf/{teamId}/{portfolioId}/{documentId}' },
          { status: 400 }
        );
      }

      const result = await thumbnailService.getPDFDocument(
        teamId,
        portfolioId,
        documentId
      );

      return new NextResponse(result.data, {
        status: 200,
        headers: {
          'Content-Type': result.contentType,
          'Content-Disposition': `inline; filename="${result.filename}"`,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });

    } else {
      return NextResponse.json(
        { error: 'Invalid type. Expected: screenshot or pdf' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('THUMBNAIL API ERROR:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
