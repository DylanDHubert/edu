import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const content = formData.get('content') as string;
    const is_shared = formData.get('is_shared') === 'true';
    const tags = formData.get('tags') ? JSON.parse(formData.get('tags') as string) : null;
    
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
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // VALIDATE REQUIRED FIELDS
    if (!title || !content) {
      return NextResponse.json(
        { error: 'TITLE AND CONTENT ARE REQUIRED' },
        { status: 400 }
      );
    }

    // VALIDATE TEAM CONTEXT
    const hasTeamContext = team_id && account_id && portfolio_id;
    if (!hasTeamContext) {
      return NextResponse.json(
        { error: 'TEAM CONTEXT IS REQUIRED' },
        { status: 400 }
      );
    }

    // VERIFY USER IS A MEMBER OF THIS TEAM
    const { data: teamMember, error: memberError } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', team_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberError || !teamMember) {
      return NextResponse.json(
        { error: 'ACCESS DENIED TO THIS TEAM' },
        { status: 403 }
      );
    }

    // UPLOAD IMAGES
    const images: Array<{url: string, description: string}> = [];
    
    for (let i = 0; i < imageFiles.length; i++) {
      const imageFile = imageFiles[i];
      const imageDescription = imageDescriptions[i];
      
      if (!imageDescription.trim()) {
        return NextResponse.json(
          { error: 'ALL IMAGES MUST HAVE DESCRIPTIONS' },
          { status: 400 }
        );
      }

      // GENERATE UNIQUE FILENAME
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const fileExtension = imageFile.name.split('.').pop();
      const fileName = `note_images/${user.id}/${timestamp}_${randomString}.${fileExtension}`;

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

      images.push({
        url: urlData.publicUrl,
        description: imageDescription.trim()
      });
    }

    // CREATE NOTE
    const noteData: any = {
      user_id: user.id,
      title: title.trim(),
      content: content.trim(),
      images: images.length > 0 ? images : null,
      is_shared: is_shared || false
    };

    // Add team context
    noteData.team_id = team_id;
    noteData.account_id = account_id;
    noteData.portfolio_id = portfolio_id;

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

    // CREATE TAGS IF PROVIDED
    if (tags && Array.isArray(tags) && tags.length > 0) {
      const tagData = tags.map(tag => ({
        note_id: data.id,
        tag: tag.trim()
      }));

      const { error: tagError } = await supabase
        .from('note_tags')
        .insert(tagData);

      if (tagError) {
        console.error('ERROR CREATING TAGS:', tagError);
        // Don't fail the note creation if tags fail
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