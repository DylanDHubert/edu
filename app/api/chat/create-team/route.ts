import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { createThread } from '../../../utils/openai';
import { cookies } from 'next/headers';
import { KnowledgeUpdateService } from '../../../services/knowledge-update-service';


export async function POST(request: NextRequest) {
  try {
    const { teamId, accountId, portfolioId, assistantId, title, initialMessage } = await request.json();
    
    if (!teamId || !accountId || !portfolioId || !assistantId || !title) {
      return NextResponse.json(
        { error: 'Team ID, Account ID, Portfolio ID, Assistant ID, and Title are required' },
        { status: 400 }
      );
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

    // VERIFY USER IS A MEMBER OF THIS TEAM
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

    // GET ASSISTANT INFO TO FIND VECTOR STORE ID
    const { data: assistantData, error: assistantError } = await supabase
      .from('team_assistants')
      .select('portfolio_vector_store_id')
      .eq('assistant_id', assistantId)
      .single();

    if (assistantError || !assistantData?.portfolio_vector_store_id) {
      return NextResponse.json(
        { error: 'Assistant or vector store not found' },
        { status: 404 }
      );
    }

    // UPDATE KNOWLEDGE IN VECTOR STORE IF STALE
    const knowledgeUpdateService = new KnowledgeUpdateService();
    const updateResult = await knowledgeUpdateService.updateKnowledgeIfStale(
      teamId,
      accountId,
      portfolioId,
      assistantData.portfolio_vector_store_id,
      user.id
    );

    if (!updateResult.success) {
      console.error('Failed to update knowledge:', updateResult.error);
      return NextResponse.json(
        { error: 'Failed to update team knowledge' },
        { status: 500 }
      );
    }

    // CREATE NEW THREAD (NO CONTEXT INJECTION NEEDED - KNOWLEDGE IS IN VECTOR STORE)
    const thread = await createThread();
    
    // SAVE TO DATABASE - Using team-based schema
    const { data: chatHistory, error: dbError } = await supabase
      .from('chat_history')
      .insert({
        user_id: user.id,
        team_id: teamId,
        account_id: accountId,
        portfolio_id: portfolioId,
        assistant_id: assistantId,
        thread_id: thread.id,
        title: title
      })
      .select()
      .single();

    if (dbError) {
      console.error('DATABASE ERROR:', dbError);
      return NextResponse.json(
        { error: 'FAILED TO SAVE CHAT HISTORY' },
        { status: 500 }
      );
    }

    // UPDATE CHAT TITLE WITH THE INITIAL MESSAGE (BUT DON'T ADD TO THREAD YET)
    const chatTitle = title.length > 50 ? title.substring(0, 50) + '...' : title;
    
    const { error: updateError } = await supabase
      .from('chat_history')
      .update({ title: chatTitle })
      .eq('id', chatHistory.id);

    if (updateError) {
      console.error('ERROR UPDATING CHAT TITLE:', updateError);
    }

    return NextResponse.json({
      id: chatHistory.id,
      thread_id: thread.id,
      title: chatTitle,
      team_id: teamId,
      account_id: accountId,
      portfolio_id: portfolioId,
      assistant_id: assistantId,
      created_at: chatHistory.created_at
    });

  } catch (error) {
    console.error('ERROR CREATING TEAM CHAT:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
} 