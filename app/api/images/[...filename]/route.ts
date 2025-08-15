import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string[] }> }
) {
  console.log('🚨🚨🚨 IMAGE ENDPOINT CALLED - NEW VERSION 🚨🚨🚨');
  try {
    const { filename } = await params;
    console.log('🔥 UPDATED IMAGE ENDPOINT CALLED!');
    console.log('🖼️ FILENAME ARRAY REQUESTED:', filename);
    
    // Join the filename array to get the full path
    const fullPath = filename.join('/');
    console.log('🖼️ FULL PATH:', fullPath);
    
    console.log('🖼️ PROXY API CALLED:', {
      filename: filename,
      fullPath: fullPath,
      url: request.url,
      method: request.method
    });
    
    if (!filename || filename.length === 0) {
      console.log('❌ NO FILENAME PROVIDED');
      return NextResponse.json(
        { error: 'FILENAME IS REQUIRED' },
        { status: 400 }
      );
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.log('❌ AUTH ERROR:', authError);
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    console.log('✅ USER AUTHENTICATED:', user.id);

    // DECODE THE FILENAME (IT'S URL ENCODED)
    const decodedFilename = decodeURIComponent(fullPath);
    console.log('🖼️ FETCHING IMAGE:', decodedFilename);
    
    // DETERMINE IMAGE TYPE BASED ON PATH STRUCTURE
    let imageType = 'UNKNOWN';
    let bucketName = 'user_note_images'; // DEFAULT TO THE SINGLE BUCKET
    let filePath = decodedFilename;
    
    if (decodedFilename.startsWith('team-')) {
      imageType = 'TEAM IMAGE';
      console.log('🖼️ IMAGE TYPE:', imageType);
      console.log('🖼️ USING BUCKET:', bucketName);
      console.log('🖼️ FILE PATH:', filePath);
    } else {
      imageType = 'USER NOTE IMAGE';
      console.log('🖼️ IMAGE TYPE:', imageType);
      console.log('🖼️ USING BUCKET:', bucketName);
      console.log('🖼️ FILE PATH:', filePath);
    }
    
    // FETCH THE IMAGE FROM SUPABASE STORAGE
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(filePath);

    if (error) {
      console.log('❌ SUPABASE STORAGE ERROR:', error);
      return NextResponse.json(
        { error: 'IMAGE NOT FOUND', details: error.message },
        { status: 404 }
      );
    }

    if (!data) {
      console.log('❌ NO DATA RETURNED FROM SUPABASE');
      return NextResponse.json(
        { error: 'IMAGE DATA NOT AVAILABLE' },
        { status: 404 }
      );
    }

    console.log('✅ IMAGE FOUND AND RETURNED');

    // GET THE CONTENT TYPE BASED ON FILE EXTENSION
    const extension = filePath.split('.').pop()?.toLowerCase() || '';
    const contentType = extension === 'jpeg' || extension === 'jpg' 
      ? 'image/jpeg' 
      : extension === 'png' 
        ? 'image/png' 
        : extension === 'gif' 
          ? 'image/gif' 
          : 'application/octet-stream';

    // CONVERT BLOB TO ARRAY BUFFER
    const arrayBuffer = await data.arrayBuffer();

    // RETURN THE IMAGE
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });

  } catch (error) {
    console.log('❌ UNEXPECTED ERROR:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
}
