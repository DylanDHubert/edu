import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const threadId = searchParams.get('threadId');

    if (!threadId) {
      return NextResponse.json(
        { error: 'Thread ID is required' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // FETCH SOURCES FOR ALL MESSAGES IN THIS THREAD
    const { data: sources, error } = await supabase
      .from('message_sources')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('ERROR FETCHING SOURCES:', error);
      return NextResponse.json(
        { error: 'Failed to fetch sources' },
        { status: 500 }
      );
    }

    // GROUP SOURCES BY MESSAGE ID
    const sourcesByMessage: Record<string, any[]> = {};
    
    (sources || []).forEach((source) => {
      if (!sourcesByMessage[source.openai_message_id]) {
        sourcesByMessage[source.openai_message_id] = [];
      }
      
      sourcesByMessage[source.openai_message_id].push({
        documentName: source.document_name,
        docId: source.document_id,
        pageStart: source.page_start,
        pageEnd: source.page_end,
        relevanceScore: source.relevance_score
      });
    });

    return NextResponse.json({ sources: sourcesByMessage });
  } catch (error) {
    console.error('ERROR IN SOURCES API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

