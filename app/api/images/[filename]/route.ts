import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    
    console.log('🖼️ PROXY API CALLED:', {
      filename: filename,
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries())
    });
    
    if (!filename) {
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
    const decodedFilename = decodeURIComponent(filename);
    console.log('🖼️ FETCHING IMAGE:', decodedFilename);
    
    // FIRST, LIST ALL FILES IN THE BUCKET TO SEE WHAT EXISTS
    const { data: listData, error: listError } = await supabase.storage
      .from('user_note_images')
      .list('', { limit: 100 });
    
    if (listData) {
      console.log('📁 FILES IN STORAGE BUCKET:', listData.map(f => f.name));
    }
    
    // FETCH THE IMAGE FROM SUPABASE STORAGE
    const { data, error } = await supabase.storage
      .from('user_note_images')
      .download(decodedFilename);

    if (error) {
      console.error('❌ ERROR FETCHING IMAGE:', error);
      return NextResponse.json(
        { error: 'IMAGE NOT FOUND' },
        { status: 404 }
      );
    }

    console.log('✅ IMAGE FETCHED SUCCESSFULLY:', decodedFilename);

    // CONVERT TO ARRAY BUFFER
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // DETERMINE CONTENT TYPE BASED ON FILE EXTENSION
    const extension = decodedFilename.split('.').pop()?.toLowerCase();
    let contentType = 'image/jpeg'; // DEFAULT
    
    switch (extension) {
      case 'png':
        contentType = 'image/png';
        break;
      case 'gif':
        contentType = 'image/gif';
        break;
      case 'webp':
        contentType = 'image/webp';
        break;
      case 'jpg':
      case 'jpeg':
      default:
        contentType = 'image/jpeg';
        break;
    }

    console.log('✅ RETURNING IMAGE:', {
      filename: decodedFilename,
      contentType: contentType,
      size: buffer.length
    });

    // RETURN THE IMAGE WITH PROPER HEADERS
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // CACHE FOR 1 HOUR
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('❌ ERROR IN IMAGE PROXY ROUTE:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
}
