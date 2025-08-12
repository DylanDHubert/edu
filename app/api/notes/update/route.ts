import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function PUT(request: NextRequest) {
  try {
    const formData = await request.formData();
    const noteId = formData.get('noteId') as string;
    const portfolio_type = formData.get('portfolio_type') as string;
    const title = formData.get('title') as string;
    const content = formData.get('content') as string;
    const is_shared = formData.get('is_shared') === 'true';
    const tags = formData.get('tags') ? JSON.parse(formData.get('tags') as string) : null;
    const imageFile = formData.get('image') as File | null;
    const removeImage = formData.get('removeImage') === 'true';
    
    if (!noteId || !portfolio_type || !title || !content) {
      return NextResponse.json(
        { error: 'NOTE ID, PORTFOLIO TYPE, TITLE, AND CONTENT ARE REQUIRED' },
        { status: 400 }
      );
    }

    // VALIDATE PORTFOLIO TYPE
    const validPortfolioTypes = ['general', 'hip', 'knee', 'ts_knee'];
    if (!validPortfolioTypes.includes(portfolio_type)) {
      return NextResponse.json(
        { error: 'INVALID PORTFOLIO TYPE' },
        { status: 400 }
      );
    }

    // VALIDATE TAGS IF PROVIDED
    if (tags) {
      const validTagNames = ['account', 'team', 'priority', 'status'];
      const providedTagNames = Object.keys(tags);
      const invalidTags = providedTagNames.filter(name => !validTagNames.includes(name));
      
      if (invalidTags.length > 0) {
        return NextResponse.json(
          { error: `INVALID TAG NAMES: ${invalidTags.join(', ')}` },
          { status: 400 }
        );
      }
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

    // HANDLE IMAGE UPLOAD/REMOVAL
    let imageUrl = existingNote.image_url;

    // DELETE OLD IMAGE IF REMOVING OR REPLACING
    if ((removeImage || imageFile) && existingNote.image_url) {
      try {
        // EXTRACT FILENAME FROM URL
        const urlParts = existingNote.image_url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const fullPath = `${user.id}/${fileName}`;

        // DELETE FROM STORAGE
        const { error: deleteError } = await supabase.storage
          .from('user_note_images')
          .remove([fullPath]);

        if (deleteError) {
          console.error('ERROR DELETING OLD IMAGE:', deleteError);
          // DON'T FAIL THE REQUEST IF DELETE FAILS
        }
      } catch (error) {
        console.error('ERROR PROCESSING OLD IMAGE:', error);
      }
    }

    // SET IMAGE URL TO NULL IF REMOVING
    if (removeImage) {
      imageUrl = null;
    }

    // UPLOAD NEW IMAGE IF PROVIDED
    if (imageFile && imageFile.size > 0) {
      // VALIDATE FILE TYPE
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(imageFile.type)) {
        return NextResponse.json(
          { error: 'INVALID FILE TYPE. ONLY JPEG, PNG, GIF, AND WEBP ARE ALLOWED' },
          { status: 400 }
        );
      }

      // VALIDATE FILE SIZE (5MB MAX)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (imageFile.size > maxSize) {
        return NextResponse.json(
          { error: 'FILE TOO LARGE. MAXIMUM SIZE IS 5MB' },
          { status: 400 }
        );
      }

      // GENERATE UNIQUE FILENAME (FLAT STORAGE)
      const fileExtension = imageFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;

      // UPLOAD TO SUPABASE STORAGE
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('user_note_images')
        .upload(fileName, imageFile);

      if (uploadError) {
        console.error('ERROR UPLOADING IMAGE:', uploadError);
        return NextResponse.json(
          { error: 'FAILED TO UPLOAD IMAGE' },
          { status: 500 }
        );
      }

      // GET PUBLIC URL
      const { data: urlData } = supabase.storage
        .from('user_note_images')
        .getPublicUrl(fileName);

      imageUrl = urlData.publicUrl;
    }

    // UPDATE NOTE
    const { data, error } = await supabase
      .from('notes')
      .update({
        portfolio_type,
        title: title.trim(),
        content: content.trim(),
        image_url: imageUrl,
        is_shared: is_shared || false
      })
      .eq('id', noteId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('ERROR UPDATING NOTE:', error);
      return NextResponse.json(
        { error: 'FAILED TO UPDATE NOTE' },
        { status: 500 }
      );
    }

    // UPDATE TAGS
    // FIRST DELETE EXISTING TAGS
    const { error: deleteTagsError } = await supabase
      .from('note_tags')
      .delete()
      .eq('note_id', noteId);

    if (deleteTagsError) {
      console.error('ERROR DELETING OLD TAGS:', deleteTagsError);
    }

    // THEN CREATE NEW TAGS IF PROVIDED
    if (tags && Object.keys(tags).length > 0) {
      const tagEntries = Object.entries(tags)
        .filter(([_, value]) => value && typeof value === 'string' && value.trim() !== '')
        .map(([tag_name, tag_value]) => ({
          note_id: noteId,
          tag_name,
          tag_value: (tag_value as string).trim()
        }));

      if (tagEntries.length > 0) {
        const { error: tagError } = await supabase
          .from('note_tags')
          .insert(tagEntries);

        if (tagError) {
          console.error('ERROR CREATING TAGS:', tagError);
          // NOTE: WE DON'T FAIL THE REQUEST IF TAGS FAIL, JUST LOG THE ERROR
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