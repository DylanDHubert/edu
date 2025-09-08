import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyUserAuth } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';
import { NotesService } from '../../../services/notes-service';

export async function DELETE(request: NextRequest) {
  return handleDelete(request);
}

export async function POST(request: NextRequest) {
  return handleDelete(request);
}

async function handleDelete(request: NextRequest) {
  try {
    const body = await request.json();
    const noteId = body.id || body.noteId; // Handle both parameter names
    
    if (!noteId) {
      return handleValidationError('Note ID is required');
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const { user } = await verifyUserAuth(cookieStore);

    // DELETE NOTE
    const notesService = new NotesService();
    const result = await notesService.deleteNote(noteId, user.id);

    if (result.success) {
      return NextResponse.json({ success: true });
    } else {
      return handleDatabaseError(new Error(result.error), 'delete note');
    }

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in delete note route:', error);
    return handleDatabaseError(error, 'delete note');
  }
}