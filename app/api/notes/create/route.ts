import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const portfolio_type = formData.get('portfolio_type') as string;
    const title = formData.get('title') as string;
    const content = formData.get('content') as string;
    const is_shared = formData.get('is_shared') === 'true';
    const tags = formData.get('tags') ? JSON.parse(formData.get('tags') as string) : null;
    const imageFile = formData.get('image') as File | null;
    const imageDescription = formData.get('image_description') as string | null;
    
    if (!portfolio_type || !title || !content) {
      return NextResponse.json(
        { error: 'PORTFOLIO TYPE, TITLE, AND CONTENT ARE REQUIRED' },
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

    // VALIDATE IMAGE DESCRIPTION IF IMAGE IS PROVIDED
    if (imageFile && imageFile.size > 0 && (!imageDescription || imageDescription.trim() === '')) {
      return NextResponse.json(
        { error: 'IMAGE DESCRIPTION IS REQUIRED WHEN UPLOADING AN IMAGE' },
        { status: 400 }
      );
    }

    // UPLOAD IMAGE TO SUPABASE STORAGE IF PROVIDED
    let imageUrl = null;
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

    // CREATE NOTE
    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: user.id,
        portfolio_type,
        title: title.trim(),
        content: content.trim(),
        image_url: imageUrl,
        image_description: imageDescription ? imageDescription.trim() : null,
        is_shared: is_shared || false
      })
      .select()
      .single();

    if (error) {
      console.error('ERROR CREATING NOTE:', error);
      return NextResponse.json(
        { error: 'FAILED TO CREATE NOTE' },
        { status: 500 }
      );
    }

    // CREATE TAGS IF PROVIDED
    if (tags && Object.keys(tags).length > 0) {
      const tagEntries = Object.entries(tags)
        .filter(([_, value]) => value && typeof value === 'string' && value.trim() !== '')
        .map(([tag_name, tag_value]) => ({
          note_id: data.id,
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
    console.error('ERROR IN CREATE NOTE ROUTE:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
} 