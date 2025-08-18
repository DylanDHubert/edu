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
    
    console.log('🔍 DEBUGGING IMAGE REQUEST:');
    console.log('  📥 Raw filename array:', JSON.stringify(filename));
    console.log('  📄 Joined full path:', fullPath);
    console.log('  🌐 Full request URL:', request.url);
    console.log('  📏 Path segments count:', filename.length);
    console.log('  🔤 Path segments:', filename.map((segment, i) => `[${i}]: ${segment}`));
    
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
    
    // DETERMINE IMAGE TYPE AND CONSTRUCT PROPER STORAGE PATH
    let imageType = 'UNKNOWN';
    let bucketName = 'user_note_images'; // DEFAULT TO THE SINGLE BUCKET
    let filePath = '';
    
    console.log('🔍 ANALYZING PATH STRUCTURE:');
    console.log('  📄 Decoded filename:', decodedFilename);
    console.log('  📏 Path segments:', filename);
    
    if (filename.length >= 3 && filename[1] === 'instruments') {
      // TEAM IMAGE: /api/images/{teamId}/instruments/{filename}
      imageType = 'TEAM INSTRUMENT IMAGE';
      const teamId = filename[0];
      const actualFilename = filename[2];
      filePath = `${teamId}/instruments/${actualFilename}`;
      
      console.log('🏢 DETECTED TEAM IMAGE:');
      console.log('  🆔 Team ID:', teamId);
      console.log('  📁 Filename:', actualFilename);
      console.log('  🎯 Constructed path:', filePath);
      
    } else if (filename.length === 1) {
      // NOTE IMAGE: /api/images/{filename} 
      // Need to reconstruct: note_images/{userId}/{filename}
      imageType = 'USER NOTE IMAGE';
      const actualFilename = filename[0];
      filePath = `note_images/${user.id}/${actualFilename}`;
      
      console.log('📝 DETECTED NOTE IMAGE:');
      console.log('  👤 User ID:', user.id);
      console.log('  📁 Filename:', actualFilename);
      console.log('  🎯 Constructed path:', filePath);
      
    } else {
      // FALLBACK - try the original logic for other cases
      imageType = 'FALLBACK';
      filePath = decodedFilename;
      
      console.log('🔄 USING FALLBACK PATH:');
      console.log('  📁 Original path:', filePath);
    }
    
    console.log('🖼️ FINAL IMAGE PROCESSING:');
    console.log('  📂 Image type:', imageType);
    console.log('  🪣 Bucket:', bucketName);
    console.log('  📍 Storage path:', filePath);
    
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
