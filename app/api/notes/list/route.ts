import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
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

    // GET USER'S OWN NOTES
    const { data: userNotes, error: userError } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (userError) {
      console.error('ERROR LOADING USER NOTES:', userError);
      return NextResponse.json(
        { error: 'FAILED TO LOAD USER NOTES' },
        { status: 500 }
      );
    }

    // GET SHARED NOTES
    const { data: sharedNotes, error: sharedError } = await supabase
      .from('notes')
      .select('*')
      .eq('is_shared', true)
      .order('updated_at', { ascending: false });

    if (sharedError) {
      console.error('ERROR LOADING SHARED NOTES:', sharedError);
      return NextResponse.json(
        { error: 'FAILED TO LOAD SHARED NOTES' },
        { status: 500 }
      );
    }

    // COMBINE USER NOTES AND SHARED NOTES
    const allNotes = [...(userNotes || []), ...(sharedNotes || [])];
    
    // REMOVE DUPLICATES (IN CASE USER'S OWN NOTES ARE ALSO SHARED)
    const uniqueNotes = allNotes.filter((note, index, self) => 
      index === self.findIndex(n => n.id === note.id)
    );

    return NextResponse.json({ notes: uniqueNotes });
  } catch (error) {
    console.error('ERROR IN LIST NOTES ROUTE:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
} 