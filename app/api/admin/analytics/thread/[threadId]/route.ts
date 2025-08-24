import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../../utils/supabase/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  project: 'proj_lNxW2HsF47ntT5fS2ESTf1tW'
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    // Verify admin authentication
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin access
    const serviceClient = createServiceClient();
    const { data: adminUser, error: adminError } = await serviceClient
      .from('admin_users')
      .select('id')
      .eq('email', user.email)
      .single();

    if (adminError || !adminUser) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { threadId } = await params;
    console.log(`🔍 Admin requesting full thread: ${threadId}`);

    // Get chat context from database
    const { data: chatHistory, error: chatError } = await serviceClient
      .from('chat_history')
      .select('*')
      .eq('thread_id', threadId)
      .single();

    if (chatError || !chatHistory) {
      return NextResponse.json({ error: 'Chat history not found' }, { status: 404 });
    }

    // Get team/account/portfolio context
    const [teamsData, accountsData, portfoliosData] = await Promise.all([
      serviceClient.from('teams').select('id, name').eq('id', chatHistory.team_id).single(),
      serviceClient.from('team_accounts').select('id, name').eq('id', chatHistory.account_id).single(),
      serviceClient.from('team_portfolios').select('id, name').eq('id', chatHistory.portfolio_id).single()
    ]);

    // Get user email
    const { data: users, error: userError } = await serviceClient.auth.admin.listUsers();
    const userEmail = users?.users?.find((u: any) => u.id === chatHistory.user_id)?.email || 'Unknown';

    // Get all message ratings for this thread
    const { data: ratings, error: ratingsError } = await serviceClient
      .from('message_ratings')
      .select('*')
      .eq('thread_id', threadId);

    const ratingsMap: Record<string, any> = {};
    ratings?.forEach((rating: any) => {
      ratingsMap[rating.message_id] = rating;
    });

    // Fetch messages from OpenAI
    let messages;
    try {
      const response = await client.beta.threads.messages.list(threadId);
      messages = response.data.reverse(); // Chronological order
    } catch (openaiError: any) {
      if (openaiError.status === 404) {
        return NextResponse.json({ 
          error: 'Thread not found in OpenAI (may have been deleted)' 
        }, { status: 404 });
      }
      throw openaiError;
    }

    // Process messages into conversation format
    const conversation = messages.map(message => {
      const content = extractTextContent(message);
      const rating = ratingsMap[message.id];

      return {
        id: message.id,
        role: message.role,
        content: content,
        timestamp: new Date(message.created_at * 1000).toISOString(),
        feedback: rating ? {
          rating: rating.rating,
          text_feedback: rating.feedback_text || null,
          feedback_timestamp: rating.created_at,
          response_time_ms: rating.response_time_ms
        } : null
      };
    });

    // Calculate conversation stats
    const userMessages = conversation.filter(m => m.role === 'user').length;
    const assistantMessages = conversation.filter(m => m.role === 'assistant').length;
    const messagesWithFeedback = conversation.filter(m => m.feedback).length;

    const threadData = {
      thread_id: threadId,
      chat_title: chatHistory.title,
      user_email: userEmail,
      team_name: teamsData.data?.name || 'Unknown',
      account_name: accountsData.data?.name || 'Unknown',
      portfolio_name: portfoliosData.data?.name || 'Unknown',
      created_at: chatHistory.created_at,
      updated_at: chatHistory.updated_at,
      conversation: conversation,
      stats: {
        total_messages: conversation.length,
        user_messages: userMessages,
        assistant_messages: assistantMessages,
        exchanges: Math.min(userMessages, assistantMessages),
        messages_with_feedback: messagesWithFeedback
      }
    };

    console.log(`✅ Thread loaded: ${conversation.length} messages, ${threadData.stats.exchanges} exchanges`);

    return NextResponse.json({
      success: true,
      data: threadData
    });

  } catch (error) {
    console.error('Error loading thread:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function extractTextContent(message: any) {
  if (!message.content || message.content.length === 0) return '';
  
  return message.content
    .filter((content: any) => content.type === 'text')
    .map((content: any) => {
      let text = content.text.value;
      
      // Clean up the system prompts/notes that appear in user messages
      text = text.replace(/ADDITIONAL NOTES FOR REFERENCE.*?USER MESSAGE: /g, '');
      text = text.replace(/.*?USER MESSAGE: /g, '');
      
      // Process citations in assistant responses
      if (content.text.annotations) {
        content.text.annotations.forEach((annotation: any, idx: number) => {
          if (annotation.type === 'file_citation') {
            text = text.replace(annotation.text, `[${idx + 1}]`);
          }
        });
      }
      
      return text.trim();
    })
    .join('\n');
} 