import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyUserAuth } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';
import { NotesService } from '../../../services/notes-service';
import { UpdateNoteRequest } from '../../../types/notes';
import { sanitizeInput } from '../../../utils/security';
import { rateLimitMiddleware, RATE_LIMITS } from '../../../utils/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // APPLY RATE LIMITING FOR NOTES UPDATE
    const rateLimitResponse = rateLimitMiddleware(request, RATE_LIMITS.SENSITIVE);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const formData = await request.formData();
    
    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const { user } = await verifyUserAuth(cookieStore);

    // PARSE FORM DATA
    const notesService = new NotesService();
    const parsedData = notesService.parseFormData(formData);
    const existingImages = notesService.parseExistingImages(formData);

    // VALIDATE REQUIRED FIELDS
    if (!parsedData.title || !parsedData.content) {
      return handleValidationError('Title and content are required');
    }

    // SANITIZE USER INPUT TO PREVENT XSS
    const sanitizedTitle = sanitizeInput(parsedData.title);
    const sanitizedContent = sanitizeInput(parsedData.content);

    // UPDATE NOTE REQUEST
    const updateRequest: UpdateNoteRequest = {
      noteId: formData.get('noteId') as string,
      title: sanitizedTitle,
      content: sanitizedContent,
      is_shared: parsedData.is_shared,
      is_portfolio_shared: parsedData.is_portfolio_shared,
      team_id: parsedData.team_id || undefined,
      account_id: parsedData.account_id || undefined,
      portfolio_id: parsedData.portfolio_id || undefined,
      existingImages,
      imageFiles: parsedData.imageFiles,
      imageDescriptions: parsedData.imageDescriptions
    };

    // UPDATE NOTE
    const result = await notesService.updateNote(updateRequest, user.id);

    if (result.success) {
      return NextResponse.json(result.note);
    } else {
      return handleDatabaseError(new Error(result.error), 'update note');
    }

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in update note route:', error);
    return handleDatabaseError(error, 'update note');
  }
}