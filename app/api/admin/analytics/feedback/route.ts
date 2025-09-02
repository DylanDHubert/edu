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
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');
    const teamId = url.searchParams.get('team_id');

    console.log('🔍 Admin Analytics - Feedback Request:', { startDate, endDate, teamId });

    const startTime = Date.now();

    // Get message ratings with written feedback
    let ratingsQuery = serviceClient
      .from('message_ratings')
      .select(`
        *,
        chat_history!inner(
          thread_id,
          title,
          user_id,
          team_id,
          account_id,
          portfolio_id
        )
      `)
      .not('feedback_text', 'is', null)
      .neq('feedback_text', '')
      .order('created_at', { ascending: false });

    // Apply filters
    if (startDate) {
      ratingsQuery = ratingsQuery.gte('created_at', startDate);
    }
    if (endDate) {
      ratingsQuery = ratingsQuery.lte('created_at', endDate);
    }
    if (teamId) {
      ratingsQuery = ratingsQuery.eq('team_id', teamId);
    }

    const { data: feedbackRatings, error: ratingsError } = await ratingsQuery;

    if (ratingsError) {
      console.error('Error fetching feedback ratings:', ratingsError);
      return NextResponse.json({ error: 'Failed to fetch feedback data' }, { status: 500 });
    }

    console.log(`📝 Found ${feedbackRatings?.length || 0} feedback records`);

    // Get user emails
    const userIds = [...new Set(feedbackRatings?.map(rating => rating.chat_history?.user_id).filter(Boolean) || [])];
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
    const teamIds = [...new Set(feedbackRatings?.map(rating => rating.chat_history?.team_id).filter(Boolean) || [])];
    const { data: teams } = await serviceClient
      .from('teams')
      .select('id, name')
      .in('id', teamIds);
    
    const teamMap: Record<string, string> = {};
    teams?.forEach(team => {
      teamMap[team.id] = team.name;
    });

    // Get account names
    const accountIds = [...new Set(feedbackRatings?.map(rating => rating.chat_history?.account_id).filter(Boolean) || [])];
    const { data: accounts } = await serviceClient
      .from('team_accounts')
      .select('id, name')
      .in('id', accountIds);
    
    const accountMap: Record<string, string> = {};
    accounts?.forEach(account => {
      accountMap[account.id] = account.name;
    });

    // Get portfolio names
    const portfolioIds = [...new Set(feedbackRatings?.map(rating => rating.chat_history?.portfolio_id).filter(Boolean) || [])];
    const { data: portfolios } = await serviceClient
      .from('team_portfolios')
      .select('id, name')
      .in('id', portfolioIds);
    
    const portfolioMap: Record<string, string> = {};
    portfolios?.forEach(portfolio => {
      portfolioMap[portfolio.id] = portfolio.name;
    });

    // Process ALL feedback (including from deleted assistants)
    // We'll handle data source selection per thread when fetching messages

    // Process feedback data and get original messages
    const enrichedFeedback: any[] = [];
    let threadsWithErrors = 0;

    for (const rating of feedbackRatings || []) {
      try {
        const chatHistory = rating.chat_history;
        if (!chatHistory) continue;

        // Get the original messages from OpenAI or archived data
        let messages = await getThreadMessages(chatHistory.thread_id);
        let isArchived = false;
        
        if (!messages) {
          // Try archived messages
          messages = await getArchivedMessages(serviceClient, chatHistory.thread_id);
          isArchived = true;
        }
        
        if (!messages) {
          console.log(`❌ No messages found for thread ${chatHistory.thread_id} in OpenAI or archive`);
          threadsWithErrors++;
          continue;
        }
        
        console.log(`📍 Using ${isArchived ? 'archived' : 'live'} data for feedback thread ${chatHistory.thread_id}`);

        // Find the specific message that was rated
        const ratedMessage = messages.find(msg => msg.id === rating.message_id);
        const userMessage = findPrecedingUserMessage(messages, rating.message_id);

        if (!ratedMessage || !userMessage) {
          console.log(`Could not find message context for rating ${rating.id}`);
          continue;
        }

        const feedbackData = {
          feedback_id: rating.id,
          user_email: userMap[chatHistory.user_id] || 'Unknown',
          team_name: teamMap[chatHistory.team_id] || 'Unknown',
          account_name: accountMap[chatHistory.account_id] || 'Unknown',
          portfolio_name: portfolioMap[chatHistory.portfolio_id] || 'Unknown',
          chat_title: chatHistory.title,
          thread_id: chatHistory.thread_id,
          timestamp: rating.created_at,
          rating: rating.rating,
          written_feedback: rating.feedback_text,
          response_time_ms: rating.response_time_ms,
          original_query: extractTextContent(userMessage),
          ai_response: extractTextContent(ratedMessage),
          message_timestamp: new Date(ratedMessage.created_at * 1000).toISOString()
        };

        enrichedFeedback.push(feedbackData);

      } catch (error) {
        console.error(`Error processing feedback rating ${rating.id}:`, error);
        threadsWithErrors++;
      }
    }

    const processingTime = Date.now() - startTime;

    console.log(`✅ Feedback processing complete: ${enrichedFeedback.length} feedback items, ${threadsWithErrors} errors, ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      data: enrichedFeedback,
      metadata: {
        total_feedback_ratings: feedbackRatings?.length || 0,
        processed_feedback: enrichedFeedback.length,
        threads_with_errors: threadsWithErrors,
        processing_time_ms: processingTime,
        filters_applied: {
          start_date: startDate,
          end_date: endDate,
          team_id: teamId
        }
      }
    });

  } catch (error) {
    console.error('Error in feedback analytics:', error);
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

function findPrecedingUserMessage(messages: any[], assistantMessageId: string) {
  const assistantIndex = messages.findIndex(msg => msg.id === assistantMessageId);
  if (assistantIndex === -1) return null;
  
  // Look backwards for the preceding user message
  for (let i = assistantIndex - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i];
    }
  }
  return null;
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