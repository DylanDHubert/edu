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
    // HANDLE MULTIPLE IMAGES
    const imageFiles: File[] = [];
    const imageDescriptions: string[] = [];
    
    // EXTRACT ALL IMAGE FILES AND DESCRIPTIONS FROM FORMDATA
    const imageEntries: {[key: string]: {file?: File, description?: string}} = {};
    
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('image_') && value instanceof File) {
        const index = key.replace('image_', '');
        if (!imageEntries[index]) imageEntries[index] = {};
        imageEntries[index].file = value;
      }
      if (key.startsWith('image_description_') && typeof value === 'string') {
        const index = key.replace('image_description_', '');
        if (!imageEntries[index]) imageEntries[index] = {};
        imageEntries[index].description = value;
      }
    }
    
    // CONVERT TO ARRAYS IN CORRECT ORDER
    Object.keys(imageEntries).sort().forEach(index => {
      const entry = imageEntries[index];
      if (entry.file && entry.description) {
        imageFiles.push(entry.file);
        imageDescriptions.push(entry.description);
      }
    });
    
    // BACKWARD COMPATIBILITY: HANDLE SINGLE IMAGE
    const imageFile = formData.get('image') as File | null;
    const removeImage = formData.get('removeImage') === 'true';
    let imageDescription = formData.get('image_description') as string | null;
    
    if (imageFile && imageDescription) {
      imageFiles.push(imageFile);
      imageDescriptions.push(imageDescription);
    }
    
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
      const validTagNames = ['account', 'team'];
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

    // HANDLE MULTIPLE IMAGES UPLOAD/REMOVAL
    let images = existingNote.images || [];
    
    // DELETE OLD IMAGES IF REMOVING ALL OR REPLACING
    if ((removeImage || imageFiles.length > 0) && existingNote.images && existingNote.images.length > 0) {
      try {
        // DELETE ALL EXISTING IMAGES FROM STORAGE
        for (const image of existingNote.images) {
          if (image.url) {
            const urlParts = image.url.split('/');
            const fileName = urlParts[urlParts.length - 1];
            
            const { error: deleteError } = await supabase.storage
              .from('user_note_images')
              .remove([fileName]);

            if (deleteError) {
              console.error('ERROR DELETING OLD IMAGE:', deleteError);
              // DON'T FAIL THE REQUEST IF DELETE FAILS
            }
          }
        }
      } catch (error) {
        console.error('ERROR PROCESSING OLD IMAGES:', error);
      }
    }

    // SET IMAGES TO EMPTY ARRAY IF REMOVING ALL
    if (removeImage) {
      images = [];
    }

    // VALIDATE IMAGE DESCRIPTIONS IF NEW IMAGES ARE PROVIDED
    if (imageFiles.length > 0) {
      if (imageFiles.length !== imageDescriptions.length) {
        return NextResponse.json(
          { error: 'EACH IMAGE MUST HAVE A DESCRIPTION' },
          { status: 400 }
        );
      }
      
      for (let i = 0; i < imageDescriptions.length; i++) {
        if (!imageDescriptions[i] || imageDescriptions[i].trim() === '') {
          return NextResponse.json(
            { error: 'ALL IMAGES MUST HAVE DESCRIPTIONS' },
            { status: 400 }
          );
        }
      }
    }

    // UPLOAD NEW IMAGES IF PROVIDED
    if (imageFiles.length > 0) {
      const newImages: Array<{url: string, description: string}> = [];
      
      for (let i = 0; i < imageFiles.length; i++) {
        const imageFile = imageFiles[i];
        const imageDescription = imageDescriptions[i];
        
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

        newImages.push({
          url: urlData.publicUrl,
          description: imageDescription.trim()
        });
      }
      
      images = newImages;
    }

    // FINAL VALIDATION: ENSURE ALL IMAGES HAVE DESCRIPTIONS
    if (images.length > 0) {
      for (const image of images) {
        if (!image.description || image.description.trim() === '') {
          return NextResponse.json(
            { error: 'ALL IMAGES MUST HAVE DESCRIPTIONS' },
            { status: 400 }
          );
        }
      }
    }

    // UPDATE NOTE
    const { data, error } = await supabase
      .from('notes')
      .update({
        portfolio_type,
        title: title.trim(),
        content: content.trim(),
        images: images.length > 0 ? images : null,
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