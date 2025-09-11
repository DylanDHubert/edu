import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyUserAuth } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';
import { NotesService } from '../../../services/notes-service';
import { CreateNoteRequest } from '../../../types/notes';
import { sanitizeInput } from '../../../utils/security';
import { rateLimitMiddleware, RATE_LIMITS } from '../../../utils/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // APPLY RATE LIMITING FOR NOTES CREATION
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

    // VALIDATE REQUIRED FIELDS
    if (!parsedData.title || !parsedData.content) {
      return handleValidationError('Title and content are required');
    }

    // SANITIZE USER INPUT TO PREVENT XSS
    const sanitizedTitle = sanitizeInput(parsedData.title);
    const sanitizedContent = sanitizeInput(parsedData.content);

    // CREATE NOTE REQUEST
    const createRequest: CreateNoteRequest = {
      title: sanitizedTitle,
      content: sanitizedContent,
      is_shared: parsedData.is_shared,
      is_portfolio_shared: parsedData.is_portfolio_shared,
      team_id: parsedData.team_id || undefined,
      account_id: parsedData.account_id || undefined,
      portfolio_id: parsedData.portfolio_id || undefined,
      imageFiles: parsedData.imageFiles,
      imageDescriptions: parsedData.imageDescriptions
    };

    // CREATE NOTE
    const result = await notesService.createNote(createRequest, user.id);

    if (result.success) {
      // CONTEXT UPDATE DISABLED FOR NOW - NOTES WILL BE AVAILABLE IN NEW CHATS ONLY
      return NextResponse.json(result.note);
    } else {
      return handleDatabaseError(new Error(result.error), 'create note');
    }

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in create note route:', error);
    return handleDatabaseError(error, 'create note');
  }
}