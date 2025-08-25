import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

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
      return NextResponse.json(
        { error: 'NOTE ID IS REQUIRED' },
        { status: 400 }
      );
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // GET NOTE TO CHECK FOR IMAGES BEFORE DELETING
    const { data: note, error: fetchError } = await supabase
      .from('notes')
      .select('images')
      .eq('id', noteId)
      .eq('user_id', user.id)
      .single();

    if (fetchError) {
      console.error('ERROR FETCHING NOTE:', fetchError);
      return NextResponse.json(
        { error: 'NOTE NOT FOUND OR ACCESS DENIED' },
        { status: 404 }
      );
    }

    // DELETE ASSOCIATED IMAGES IF THEY EXIST
    if (note.images && Array.isArray(note.images) && note.images.length > 0) {
      try {
        // DELETE ALL IMAGES IN THE ARRAY
        for (const image of note.images) {
          if (image.url) {
            // EXTRACT USER ID AND FILENAME FROM API URL
            const urlParts = image.url.split('/');
            if (urlParts.length >= 4 && urlParts[1] === 'api' && urlParts[2] === 'images') {
              const userId = urlParts[3];
              const fileName = urlParts[4];
              const storagePath = `${userId}/${fileName}`;
              
              console.log('🗑️ DELETING IMAGE FROM STORAGE:', storagePath);
              
              const { error: deleteImageError } = await supabase.storage
                .from('user_note_images')
                .remove([storagePath]);

              if (deleteImageError) {
                console.error('ERROR DELETING IMAGE:', deleteImageError);
              }
            }
          }
        }
      } catch (error) {
        console.error('ERROR PROCESSING IMAGES DELETE:', error);
      }
    }

    // DELETE NOTE (ENSURE USER OWNS THE NOTE)
    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', noteId)
      .eq('user_id', user.id); // ENSURE USER OWNS THE NOTE

    if (error) {
      console.error('ERROR DELETING NOTE:', error);
      return NextResponse.json(
        { error: 'FAILED TO DELETE NOTE' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('ERROR IN DELETE NOTE ROUTE:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
} 