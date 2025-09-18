import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { createServiceClient } from '../../../utils/supabase/server';
import { createThread } from '../../../utils/openai';
import { cookies } from 'next/headers';
import { KnowledgeUpdateService } from '../../../services/knowledge-update-service';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


export async function POST(request: NextRequest) {
  try {
    const { teamId, accountId, portfolioId, assistantId, title, initialMessage } = await request.json();
    
    console.log('🎯 CREATE-TEAM received params:', { teamId, accountId, portfolioId, assistantId, title });
    
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

    // GET ASSISTANT INFO TO FIND VECTOR STORE ID (USE SERVICE CLIENT FOR RLS)
    console.log('🔍 Looking for assistant:', assistantId);
    const serviceClient = createServiceClient();
    const { data: assistantData, error: assistantError } = await serviceClient
      .from('team_assistants')
      .select('portfolio_vector_store_id')
      .eq('assistant_id', assistantId)
      .single();

    console.log('📋 Assistant query result:', { assistantData, assistantError });

    if (assistantError || !assistantData?.portfolio_vector_store_id) {
      console.log('❌ Assistant lookup failed:', { assistantError, assistantData });
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


    // CREATE NEW THREAD WITH INITIAL CONTEXT TO PRIME FILE SEARCH BEHAVIOR
    const initialContext = `I am ready to help with surgical procedures. I will ALWAYS use file search to find relevant information from documents and knowledge sources before responding. This ensures I provide accurate, evidence-based responses.`;
    const thread = await createThread(initialContext);
    
    // ADD VISIBLE WELCOME MESSAGE TO THE THREAD
    const welcomeMessage = `Hello! I'm your HHB Assistant specializing in surgical procedures. I'm ready to help you with any questions about procedures, equipment, or protocols. I'll search through our knowledge base to provide you with accurate, evidence-based information. What would you like to know?`;
    
    await client.beta.threads.messages.create(thread.id, {
      role: 'assistant',
      content: welcomeMessage,
      metadata: { 
        visible: 'true',
        messageType: 'welcome_message' 
      }
    });
    
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