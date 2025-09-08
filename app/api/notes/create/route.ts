import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';
import { verifyUserAuth, verifyTeamAccess } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const content = formData.get('content') as string;
    const is_shared = formData.get('is_shared') === 'true';
    const is_portfolio_shared = formData.get('is_portfolio_shared') === 'true';
    
    // Team context
    const team_id = formData.get('team_id') as string | null;
    const account_id = formData.get('account_id') as string | null;
    const portfolio_id = formData.get('portfolio_id') as string | null;
    
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

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const { user, supabase } = await verifyUserAuth(cookieStore);

    // VALIDATE REQUIRED FIELDS
    if (!title || !content) {
      return handleValidationError('Title and content are required');
    }

    // VERIFY TEAM ACCESS IF TEAM CONTEXT IS PROVIDED
    if (team_id) {
      await verifyTeamAccess(team_id, user.id);
    }

    // HANDLE IMAGE UPLOADS
    const images: Array<{url: string, description: string}> = [];

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

      console.log('🔍 REGULAR NOTE IMAGE UPLOAD SUCCESS:');
      console.log('  📁 Storage file path:', fileName);
      console.log('  🔗 Custom API URL:', imageUrl);
      console.log('  📝 Description:', imageDescription.trim());

      images.push({
        url: imageUrl,
        description: imageDescription.trim()
      });
      
      console.log('  💾 Storing in database:', JSON.stringify({
        url: imageUrl,
        description: imageDescription.trim()
      }, null, 2));
    }

    // CREATE NOTE
    const noteData: any = {
      user_id: user.id,
      title: title.trim(),
      content: content.trim(),
      images: images.length > 0 ? images : null,
      is_shared: is_shared || false,
      is_portfolio_shared: is_portfolio_shared || false
    };

    // Add team context
    noteData.team_id = team_id;
    noteData.portfolio_id = portfolio_id;
    
    // Handle account_id based on portfolio sharing
    if (is_portfolio_shared) {
      noteData.account_id = null; // Portfolio-shared notes have no specific account
    } else {
      noteData.account_id = account_id;
    }

    // Get the portfolio name from the portfolio_id and use it as portfolio_type
    const { data: portfolioData, error: portfolioError } = await supabase
      .from('team_portfolios')
      .select('name')
      .eq('id', portfolio_id)
      .single();

    if (portfolioError || !portfolioData) {
      return NextResponse.json(
        { error: 'Invalid portfolio ID' },
        { status: 400 }
      );
    }

    noteData.portfolio_type = portfolioData.name; // Use portfolio name directly

    const { data, error } = await supabase
      .from('notes')
      .insert(noteData)
      .select()
      .single();

    if (error) {
      console.error('ERROR CREATING NOTE:', error);
      return NextResponse.json(
        { error: 'FAILED TO CREATE NOTE' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in create note route:', error);
    return handleDatabaseError(error, 'create note');
  }
} 