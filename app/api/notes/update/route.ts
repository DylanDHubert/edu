import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const noteId = formData.get('noteId') as string;
    const title = formData.get('title') as string;
    const content = formData.get('content') as string;
    const is_shared = formData.get('is_shared') === 'true';
    const tags = formData.get('tags') ? JSON.parse(formData.get('tags') as string) : null;

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

    // VALIDATE REQUIRED FIELDS
    if (!noteId || !title || !content) {
      return NextResponse.json(
        { error: 'NOTE ID, TITLE, AND CONTENT ARE REQUIRED' },
        { status: 400 }
      );
    }

    // VERIFY USER OWNS THIS NOTE
    const { data: existingNote, error: ownershipError } = await supabase
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .eq('user_id', user.id)
      .single();

    if (ownershipError || !existingNote) {
      return NextResponse.json(
        { error: 'NOTE NOT FOUND OR ACCESS DENIED' },
        { status: 404 }
      );
    }

    // UPDATE NOTE
    const updateData = {
      title: title.trim(),
      content: content.trim(),
      is_shared: is_shared || false,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('notes')
      .update(updateData)
      .eq('id', noteId)
      .select()
      .single();

    if (error) {
      console.error('ERROR UPDATING NOTE:', error);
      return NextResponse.json(
        { error: 'FAILED TO UPDATE NOTE' },
        { status: 500 }
      );
    }

    // UPDATE TAGS IF PROVIDED
    if (tags && Array.isArray(tags)) {
      // DELETE EXISTING TAGS
      await supabase
        .from('note_tags')
        .delete()
        .eq('note_id', noteId);

      // INSERT NEW TAGS
      if (tags.length > 0) {
        const tagData = tags.map(tag => ({
          note_id: noteId,
          tag: tag.trim()
        }));

        const { error: tagError } = await supabase
          .from('note_tags')
          .insert(tagData);

        if (tagError) {
          console.error('ERROR UPDATING TAGS:', tagError);
          // Don't fail the note update if tags fail
        }
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('ERROR IN UPDATE NOTE ROUTE:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
} 