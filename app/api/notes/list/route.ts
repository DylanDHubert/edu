import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyUserAuth } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError } from '../../../utils/error-responses';
import { NotesService } from '../../../services/notes-service';

export async function GET(request: NextRequest) {
  try {
    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const { user } = await verifyUserAuth(cookieStore);

    // GET USER NOTES
    const notesService = new NotesService();
    const result = await notesService.getUserNotes(user.id);

    if (result.success) {
      return NextResponse.json({ notes: result.notes });
    } else {
      return handleDatabaseError(new Error(result.error), 'load notes');
    }

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in list notes route:', error);
    return handleDatabaseError(error, 'load notes');
  }
}