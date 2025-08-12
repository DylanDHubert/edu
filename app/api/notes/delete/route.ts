import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    
    if (!id) {
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

    // GET NOTE TO CHECK FOR IMAGE BEFORE DELETING
    const { data: note, error: fetchError } = await supabase
      .from('notes')
      .select('image_url')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError) {
      console.error('ERROR FETCHING NOTE:', fetchError);
      return NextResponse.json(
        { error: 'NOTE NOT FOUND OR ACCESS DENIED' },
        { status: 404 }
      );
    }

    // DELETE ASSOCIATED IMAGE IF IT EXISTS
    if (note.image_url) {
      try {
        // EXTRACT FILENAME FROM URL (FLAT STORAGE)
        const urlParts = note.image_url.split('/');
        const fileName = urlParts[urlParts.length - 1];

        // DELETE FROM STORAGE
        const { error: deleteImageError } = await supabase.storage
          .from('user_note_images')
          .remove([fileName]);

        if (deleteImageError) {
          console.error('ERROR DELETING IMAGE:', deleteImageError);
          // DON'T FAIL THE REQUEST IF IMAGE DELETE FAILS
        }
      } catch (error) {
        console.error('ERROR PROCESSING IMAGE DELETE:', error);
        // DON'T FAIL THE REQUEST IF IMAGE DELETE FAILS
      }
    }

    // DELETE NOTE (ENSURE USER OWNS THE NOTE)
    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id)
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