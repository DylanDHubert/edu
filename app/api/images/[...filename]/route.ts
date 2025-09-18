import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string[] }> }
) {
  try {
    const { filename } = await params;
    
    // JOIN THE FILENAME ARRAY TO GET THE FULL PATH
    const fullPath = filename.join('/');
    
    if (!filename || filename.length === 0) {
      return NextResponse.json(
        { error: 'Filename is required' },
        { status: 400 }
      );
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // DECODE THE FILENAME (IT'S URL ENCODED)
    const decodedFilename = decodeURIComponent(fullPath);
    
    // DETERMINE IMAGE TYPE AND CONSTRUCT PROPER STORAGE PATH
    let imageType = 'UNKNOWN';
    let bucketName = 'user_note_images'; // DEFAULT TO THE SINGLE BUCKET
    let filePath = '';
    
    console.log('🔍 ANALYZING PATH STRUCTURE:');
    console.log('  📄 Decoded filename:', decodedFilename);
    console.log('  📏 Path segments:', filename);
    
    if (filename.length >= 7 && filename[0] === 'teams' && filename[2] === 'portfolios' && filename[4] === 'screenshots') {
      // SCREENSHOT: /api/images/teams/{teamId}/portfolios/{portfolioId}/screenshots/{documentId}/page_X.jpg
      imageType = 'DOCUMENT SCREENSHOT';
      const teamId = filename[1];
      const portfolioId = filename[3];
      const documentId = filename[5];
      const pageFilename = filename[6];
      filePath = `teams/${teamId}/portfolios/${portfolioId}/screenshots/${documentId}/${pageFilename}`;
      bucketName = 'user_note_images'; // SAME BUCKET AS OTHER IMAGES
      
      // VERIFY USER HAS ACCESS TO THIS TEAM/PORTFOLIO
      const { data: teamMember, error: memberError } = await supabase
        .from('team_members')
        .select('role')
        .eq('team_id', teamId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();
        
      if (memberError || !teamMember) {
        return NextResponse.json(
          { error: 'Access denied to this team' },
          { status: 403 }
        );
      }
      
    } else if (filename.length >= 3 && filename[1] === 'instruments') {
      // TEAM IMAGE: /api/images/{teamId}/instruments/{filename}
      imageType = 'TEAM INSTRUMENT IMAGE';
      const teamId = filename[0];
      const actualFilename = filename[2];
      filePath = `${teamId}/instruments/${actualFilename}`;
      
    } else if (filename.length === 2) {
      // NOTE IMAGE: /api/images/{userId}/{filename}
      // This matches the storage path: userId/filename
      imageType = 'USER NOTE IMAGE';
      const userId = filename[0];
      const actualFilename = filename[1];
      filePath = `${userId}/${actualFilename}`;
      
    } else {
      // INVALID PATH - return error
      return NextResponse.json(
        { error: 'Invalid image path format. Expected: /api/images/{userId}/{filename}, /api/images/{teamId}/instruments/{filename}, or /api/images/teams/{teamId}/portfolios/{portfolioId}/screenshots/{documentId}/page_X.jpg' },
        { status: 400 }
      );
    }
    
    console.log('🔍 FETCHING IMAGE:');
    console.log('  📦 Bucket:', bucketName);
    console.log('  📁 File path:', filePath);
    console.log('  🏷️ Image type:', imageType);
    
    // FETCH THE IMAGE FROM SUPABASE STORAGE
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(filePath);

    if (error) {
      console.error('❌ STORAGE ERROR:', error);
      return NextResponse.json(
        { error: 'Image not found', details: error.message },
        { status: 404 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'IMAGE DATA NOT AVAILABLE' },
        { status: 404 }
      );
    }

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
    console.error('Error in image endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
