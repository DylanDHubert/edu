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
    const is_portfolio_shared = formData.get('is_portfolio_shared') === 'true';
    
    // Team context
    const team_id = formData.get('team_id') as string | null;
    const account_id = formData.get('account_id') as string | null;
    const portfolio_id = formData.get('portfolio_id') as string | null;
    
    // HANDLE EXISTING IMAGES
    const existingImagesJson = formData.get('existing_images') as string;
    const existingImages = existingImagesJson ? JSON.parse(existingImagesJson) : [];
    
    // HANDLE NEW IMAGES
    const imageFiles: File[] = [];
    const imageDescriptions: string[] = [];
    
    // EXTRACT ALL NEW IMAGE FILES AND DESCRIPTIONS FROM FORMDATA
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

    // HANDLE NEW IMAGE UPLOADS
    const newImages: Array<{url: string, description: string}> = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const imageFile = imageFiles[i];
      const imageDescription = imageDescriptions[i];

      if (!imageFile || !imageDescription.trim()) {
        continue;
      }

      // GENERATE UNIQUE FILENAME
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2);
      const fileExtension = imageFile.name.split('.').pop() || 'jpg';
      const fileName = `${user.id}/${timestamp}_${random}.${fileExtension}`;

      // UPLOAD TO SUPABASE STORAGE
      const { error: uploadError } = await supabase.storage
        .from('user_note_images')
        .upload(fileName, imageFile);

      if (uploadError) {
        console.error('ERROR UPLOADING IMAGE:', uploadError);
        return NextResponse.json(
          { error: 'FAILED TO UPLOAD IMAGE' },
          { status: 500 }
        );
      }

      // GENERATE CUSTOM API URL INSTEAD OF SUPABASE PUBLIC URL
      const imageUrl = `/api/images/${user.id}/${timestamp}_${random}.${fileExtension}`;

      console.log('🔍 NOTE UPDATE - NEW IMAGE UPLOAD SUCCESS:');
      console.log('  📁 Storage file path:', fileName);
      console.log('  🔗 Custom API URL:', imageUrl);
      console.log('  📝 Description:', imageDescription.trim());

      newImages.push({
        url: imageUrl,
        description: imageDescription.trim()
      });
    }

    // COMBINE EXISTING AND NEW IMAGES
    const allImages = [...existingImages, ...newImages];

    // UPDATE NOTE
    const updateData: any = {
      title: title.trim(),
      content: content.trim(),
      is_shared: is_shared || false,
      is_portfolio_shared: is_portfolio_shared || false,
      images: allImages.length > 0 ? allImages : null,
      updated_at: new Date().toISOString()
    };

    // Add team context if provided
    if (team_id) updateData.team_id = team_id;
    if (portfolio_id) updateData.portfolio_id = portfolio_id;
    
    // Handle account_id based on portfolio sharing
    if (is_portfolio_shared) {
      updateData.account_id = null; // Portfolio-shared notes have no specific account
    } else if (account_id) {
      updateData.account_id = account_id;
    }

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

    return NextResponse.json(data);
  } catch (error) {
    console.error('ERROR IN UPDATE NOTE ROUTE:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
} 