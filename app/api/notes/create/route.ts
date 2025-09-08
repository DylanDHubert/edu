import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyUserAuth } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';
import { NotesService } from '../../../services/notes-service';
import { CreateNoteRequest } from '../../../types/notes';

export async function POST(request: NextRequest) {
  try {
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

    // CREATE NOTE REQUEST
    const createRequest: CreateNoteRequest = {
      title: parsedData.title,
      content: parsedData.content,
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