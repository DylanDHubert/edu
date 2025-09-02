import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

// Default project client
const defaultClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Specific project client for historical threads
const projectClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  project: 'proj_lNxW2HsF47ntT5fS2ESTf1tW'
});

export async function GET(request: NextRequest) {
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

    // Parse query parameters
    const url = new URL(request.url);
    const feedbackFilter = url.searchParams.get('feedback_filter') || 'all';
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');
    const teamId = url.searchParams.get('team_id');

    console.log('🔍 Admin Analytics - Chat Request:', { feedbackFilter, startDate, endDate, teamId });

    const startTime = Date.now();

    // Get chat history 
    let chatQuery = serviceClient
      .from('chat_history')
      .select(`
        thread_id,
        assistant_id,
        title,
        created_at,
        updated_at,
        team_id,
        account_id,
        portfolio_id,
        user_id
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (startDate) {
      chatQuery = chatQuery.gte('created_at', startDate);
    }
    if (endDate) {
      chatQuery = chatQuery.lte('created_at', endDate);
    }
    if (teamId) {
      chatQuery = chatQuery.eq('team_id', teamId);
    }

    const { data: chats, error: chatError } = await chatQuery;

    if (chatError) {
      console.error('Error fetching chats:', chatError);
      return NextResponse.json({ error: 'Failed to fetch chat data' }, { status: 500 });
    }

    console.log(`📊 Found ${chats?.length || 0} chat records`);

    // Get user emails
    const userIds = [...new Set(chats?.map(chat => chat.user_id) || [])];
    const { data: users, error: userError } = await serviceClient.auth.admin.listUsers();
    
    const userMap: Record<string, string> = {};
    if (!userError && users?.users) {
      users.users.forEach(u => {
        if (u.id && u.email) {
          userMap[u.id] = u.email;
        }
      });
    }

    // Get team names
    const teamIds = [...new Set(chats?.map(chat => chat.team_id).filter(Boolean) || [])];
    const { data: teams } = await serviceClient
      .from('teams')
      .select('id, name')
      .in('id', teamIds);
    
    const teamMap: Record<string, string> = {};
    teams?.forEach(team => {
      teamMap[team.id] = team.name;
    });

    // Get account names
    const accountIds = [...new Set(chats?.map(chat => chat.account_id).filter(Boolean) || [])];
    const { data: accounts } = await serviceClient
      .from('team_accounts')
      .select('id, name')
      .in('id', accountIds);
    
    const accountMap: Record<string, string> = {};
    accounts?.forEach(account => {
      accountMap[account.id] = account.name;
    });

    // Get portfolio names
    const portfolioIds = [...new Set(chats?.map(chat => chat.portfolio_id).filter(Boolean) || [])];
    const { data: portfolios } = await serviceClient
      .from('team_portfolios')
      .select('id, name')
      .in('id', portfolioIds);
    
    const portfolioMap: Record<string, string> = {};
    portfolios?.forEach(portfolio => {
      portfolioMap[portfolio.id] = portfolio.name;
    });

    // Process ALL chats (including those with deleted assistants)
    // We'll handle data source selection per thread
    const allChats = chats || [];
    console.log(`📊 Processing ${allChats.length} total chats (including historical)`);

    // Get all message ratings for feedback
    const { data: ratings, error: ratingsError } = await serviceClient
      .from('message_ratings')
      .select('*');

    const ratingsMap: Record<string, any> = {};
    ratings?.forEach(rating => {
      ratingsMap[rating.message_id] = rating;
    });

    console.log(`📝 Found ${ratings?.length || 0} message ratings`);

    // Process each chat to get messages (from OpenAI or archived)
    const allPairs: any[] = [];
    let threadsWithErrors = 0;

    for (const chat of allChats) {
      try {
        console.log(`🔄 Processing thread: ${chat.thread_id}`);
        
        // Try OpenAI first, then fallback to archived messages
        let messages = await getThreadMessages(chat.thread_id);
        let isArchived = false;
        
        if (!messages) {
          // Try archived messages
          messages = await getArchivedMessages(serviceClient, chat.thread_id);
          isArchived = true;
        }
        
        if (!messages) {
          console.log(`❌ No messages found for thread ${chat.thread_id} in OpenAI or archive`);
          threadsWithErrors++;
          continue;
        }
        
        console.log(`📍 Using ${isArchived ? 'archived' : 'live'} data for thread ${chat.thread_id}`);

        const pairs = extractQueryResponsePairs(messages);
        
        // Add context and feedback to each pair
        pairs.forEach(pair => {
          const feedback = ratingsMap[pair.responseMessageId];
          
          // Apply feedback filter
          if (feedbackFilter !== 'all') {
            if (feedbackFilter === 'positive' && (!feedback || feedback.rating !== 1)) return;
            if (feedbackFilter === 'negative' && (!feedback || feedback.rating !== -1)) return;
            if (feedbackFilter === 'none' && feedback) return;
          }

          const enrichedPair = {
            user_email: userMap[chat.user_id] || 'Unknown',
            team_name: teamMap[chat.team_id] || 'Unknown',
            account_name: accountMap[chat.account_id] || 'Unknown',
            portfolio_name: portfolioMap[chat.portfolio_id] || 'Unknown',
            chat_title: chat.title,
            thread_id: chat.thread_id,
            timestamp: pair.timestamp.toISOString(),
            query: pair.query,
            response: pair.response,
            query_message_id: pair.queryMessageId,
            response_message_id: pair.responseMessageId,
            response_time_ms: pair.responseTime,
            feedback: feedback ? {
              rating: feedback.rating,
              text_feedback: feedback.feedback_text || null,
              feedback_timestamp: feedback.created_at,
              response_time_ms: feedback.response_time_ms
            } : null
          };

          allPairs.push(enrichedPair);
        });

      } catch (error) {
        console.error(`Error processing thread ${chat.thread_id}:`, error);
        threadsWithErrors++;
      }
    }

    const processingTime = Date.now() - startTime;

    console.log(`✅ Processing complete: ${allPairs.length} pairs, ${threadsWithErrors} errors, ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      data: allPairs,
      metadata: {
        total_chats: chats?.length || 0,
        processed_chats: allChats.length,
        total_pairs: allPairs.length,
        threads_with_errors: threadsWithErrors,
        processing_time_ms: processingTime,
        filters_applied: {
          feedback_filter: feedbackFilter,
          start_date: startDate,
          end_date: endDate,
          team_id: teamId
        }
      }
    });

  } catch (error) {
    console.error('Error in chat analytics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function getThreadMessages(threadId: string) {
  // Try default project first
  try {
    console.log(`🔍 Trying default project for thread: ${threadId}`);
    const messages = await defaultClient.beta.threads.messages.list(threadId);
    console.log(`✅ Found thread ${threadId} in default project`);
    return messages.data.reverse(); // Chronological order
  } catch (error: any) {
    if (error.status === 404) {
      console.log(`Thread ${threadId} not found in default project, trying specific project...`);
      
      // Try specific project
      try {
        const messages = await projectClient.beta.threads.messages.list(threadId);
        console.log(`✅ Found thread ${threadId} in specific project`);
        return messages.data.reverse(); // Chronological order
      } catch (projectError: any) {
        if (projectError.status === 404) {
          console.log(`Thread ${threadId} not found in either project - likely from deleted assistant`);
          return null;
        }
        throw projectError;
      }
    }
    throw error;
  }
}

async function getArchivedMessages(serviceClient: any, threadId: string) {
  try {
    console.log(`🗄️ Fetching archived messages for thread: ${threadId}`);
    
    const { data: archivedMessages, error } = await serviceClient
      .from('archived_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('message_order', { ascending: true });

    if (error) {
      console.error(`❌ Error fetching archived messages for ${threadId}:`, error);
      return null;
    }

    if (!archivedMessages || archivedMessages.length === 0) {
      console.log(`ℹ️ No archived messages found for thread ${threadId}`);
      return null;
    }

    // Convert archived messages to OpenAI-like format for compatibility
    const convertedMessages = archivedMessages.map((msg: any) => ({
      id: msg.message_id,
      role: msg.role,
      content: [{ type: 'text', text: { value: msg.content } }],
      created_at: Math.floor(new Date(msg.created_at).getTime() / 1000), // Convert to Unix timestamp
      metadata: { archived: true }
    }));

    console.log(`✅ Retrieved ${convertedMessages.length} archived messages for thread ${threadId}`);
    return convertedMessages;

  } catch (error) {
    console.error(`❌ Error in getArchivedMessages for ${threadId}:`, error);
    return null;
  }
}

function extractQueryResponsePairs(messages: any[]) {
  const pairs = [];
  
  for (let i = 0; i < messages.length - 1; i++) {
    const current = messages[i];
    const next = messages[i + 1];
    
    // Look for user question followed by assistant response
    if (current.role === 'user' && next.role === 'assistant') {
      pairs.push({
        query: extractTextContent(current),
        response: extractTextContent(next),
        queryMessageId: current.id,
        responseMessageId: next.id,
        timestamp: new Date(current.created_at * 1000),
        responseTime: (next.created_at - current.created_at) * 1000 // milliseconds
      });
    }
  }
  
  return pairs;
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