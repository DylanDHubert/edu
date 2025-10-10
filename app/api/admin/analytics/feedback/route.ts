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
    const { searchParams } = new URL(request.url);
    const courseFilter = searchParams.get('course');
    const accountFilter = searchParams.get('account');
    const portfolioFilter = searchParams.get('portfolio');
    const format = searchParams.get('format'); // 'display' | 'experiment'

    console.log('🔄 Loading feedback analytics...', { format });

    // Step 1: Get message ratings with feedback text
    let ratingsQuery = serviceClient
      .from('message_ratings')
      .select(`
        id,
        user_id,
        thread_id,
        message_id,
        rating,
        feedback_text,
        course_id,
        portfolio_id,
        created_at
      `)
      .not('feedback_text', 'is', null)
      .neq('feedback_text', '');

    // For experiment format, only get negative feedback
    if (format === 'experiment') {
      ratingsQuery = ratingsQuery.eq('rating', -1);
    }

    // Apply filters
    if (courseFilter) ratingsQuery = ratingsQuery.eq('course_id', courseFilter);
    if (portfolioFilter) ratingsQuery = ratingsQuery.eq('portfolio_id', portfolioFilter);

    const { data: ratings, error: ratingsError } = await ratingsQuery.order('created_at', { ascending: false });

    if (ratingsError) {
      console.error('❌ Error fetching ratings:', ratingsError);
      return NextResponse.json({ error: 'Failed to fetch ratings' }, { status: 500 });
    }

    if (!ratings || ratings.length === 0) {
      console.log('ℹ️ No feedback ratings found');
      return NextResponse.json({ data: [] });
    }

    console.log(`✅ Found ${ratings.length} feedback ratings`);

    // Step 2: Get chat history and lookup data
    const threadIds = [...new Set(ratings.map(r => r.thread_id))];
    
    // Get chat history - include assistant_id for experiment format
    const chatHistorySelect = format === 'experiment' 
      ? `thread_id, title, course_id, assistant_id`
      : `thread_id, title, course_id`;
      
    const { data: chatHistory, error: chatError } = await serviceClient
      .from('chat_history')
      .select(chatHistorySelect)
      .in('thread_id', threadIds);

    if (chatError) {
      console.error('❌ Error fetching chat history:', chatError);
      return NextResponse.json({ error: 'Failed to fetch chat history' }, { status: 500 });
    }

    // Get course, account, and portfolio names separately (since ratings has the foreign keys)
    const courseIds = [...new Set(ratings.map(r => r.course_id).filter(Boolean))];
    const portfolioIds = [...new Set(ratings.map(r => r.portfolio_id).filter(Boolean))];

    const [coursesData, portfoliosData] = await Promise.all([
      serviceClient.from('courses').select('id, name').in('id', courseIds),
      serviceClient.from('course_portfolios').select('id, name').in('id', portfolioIds)
    ]);

    // Create lookup maps
    const chatLookup = new Map<string, any>();
    const courseLookup = new Map();
    const portfolioLookup = new Map();

    if (chatHistory) {
      chatHistory.forEach((chat: any) => {
        chatLookup.set(chat.thread_id, chat);
      });
    }

    if (coursesData.data) {
      coursesData.data.forEach(course => {
        courseLookup.set(course.id, course.name);
      });
    }


    if (portfoliosData.data) {
      portfoliosData.data.forEach(portfolio => {
        portfolioLookup.set(portfolio.id, portfolio.name);
      });
    }

    console.log(`📊 Processing ${threadIds.length} unique threads with feedback`);

    // Step 3: Process each feedback rating
    const results = [];
    
    for (const rating of ratings) {
      try {
        console.log(`🔍 Processing feedback: ${rating.id}`);
        
        // Get chat context
        const chatContext = chatLookup.get(rating.thread_id);
        
        // Try to load messages for this thread
        let messages = null;
        let originalQuery = "Message not available (thread archived)";
        let aiResponse = "Message not available (thread archived)";
        
        try {
          // Try to get messages from OpenAI or archived sources
          messages = await getThreadMessages(rating.thread_id);
          
          if (messages && messages.length > 0) {
            // Find the specific message that was rated
            const ratedMessageIndex = messages.findIndex(msg => msg.id === rating.message_id);
            
            if (ratedMessageIndex > 0) {
              // Get the user message that preceded this AI response
              const precedingMessage = findPrecedingUserMessage(messages, ratedMessageIndex);
              if (precedingMessage) {
                originalQuery = extractTextContent(precedingMessage);
              }
              
              // Get the AI response that was rated
              const ratedMessage = messages[ratedMessageIndex];
              if (ratedMessage && ratedMessage.role === 'assistant') {
                aiResponse = extractTextContent(ratedMessage);
              }
            }
          }
        } catch (messageError: any) {
          console.log(`⚠️ Could not load messages for thread ${rating.thread_id}:`, messageError.message);
          // Keep default fallback values
        }

        // Build result object - format based on request type
        const baseResult = {
          id: rating.id,
          thread_id: rating.thread_id,
          message_id: rating.message_id,
          rating: rating.rating,
          feedback_text: rating.feedback_text,
          original_query: originalQuery,
          ai_response: aiResponse,
          created_at: rating.created_at,
          course_name: courseLookup.get(rating.course_id) || 'Unknown course',
          portfolio_name: portfolioLookup.get(rating.portfolio_id) || 'Unknown Portfolio',
          chat_title: chatContext?.title || 'Untitled Chat'
        };

        // Add assistant_id for experiment format
        const result = format === 'experiment' 
          ? { ...baseResult, assistant_id: chatContext?.assistant_id || null }
          : baseResult;

        results.push(result);
        console.log(`✅ Successfully processed feedback: ${rating.id}`);
        
      } catch (error) {
        console.error(`❌ Error processing feedback rating ${rating.id}:`, error);
        
        // Even if processing fails, include the feedback with minimal info
        const chatContext = chatLookup.get(rating.thread_id);
        const errorResult = {
          id: rating.id,
          thread_id: rating.thread_id,
          message_id: rating.message_id,
          rating: rating.rating,
          feedback_text: rating.feedback_text,
          original_query: "Error loading message",
          ai_response: "Error loading message",
          created_at: rating.created_at,
          course_name: courseLookup.get(rating.course_id) || 'Unknown course',
          portfolio_name: portfolioLookup.get(rating.portfolio_id) || 'Unknown Portfolio', 
          chat_title: chatContext?.title || 'Untitled Chat'
        };

        // Add assistant_id for experiment format
        if (format === 'experiment') {
          (errorResult as any).assistant_id = chatContext?.assistant_id || null;
        }

        results.push(errorResult);
      }
    }

    console.log(`✅ Feedback analytics complete: ${results.length} records processed`);

    return NextResponse.json({
      data: results,
      total: results.length,
      summary: {
        total_feedback: results.length,
        positive_feedback: results.filter(r => r.rating > 0).length,
        negative_feedback: results.filter(r => r.rating < 0).length
      }
    });

  } catch (error) {
    console.error('❌ Error in feedback analytics:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to get thread messages (try OpenAI first, then archived)
async function getThreadMessages(threadId: string) {
  try {
    // Try default client first
    console.log(`🔍 Trying to fetch messages for thread ${threadId} from default project...`);
    const defaultMessages = await defaultClient.beta.threads.messages.list(threadId, {
      order: 'asc'
    });
    
    if (defaultMessages.data && defaultMessages.data.length > 0) {
      console.log(`✅ Found ${defaultMessages.data.length} messages in default project`);
      return defaultMessages.data;
    }
  } catch (defaultError: any) {
    console.log(`⚠️ Thread ${threadId} not found in default project:`, defaultError.message);
  }

  try {
    // Try specific project client
    console.log(`🔍 Trying to fetch messages for thread ${threadId} from specific project...`);
    const projectMessages = await projectClient.beta.threads.messages.list(threadId, {
      order: 'asc'
    });
    
    if (projectMessages.data && projectMessages.data.length > 0) {
      console.log(`✅ Found ${projectMessages.data.length} messages in specific project`);
      return projectMessages.data;
    }
  } catch (projectError: any) {
    console.log(`⚠️ Thread ${threadId} not found in specific project:`, projectError.message);
  }

  // Try archived messages as fallback
  try {
    console.log(`🔍 Trying to fetch archived messages for thread ${threadId}...`);
    const serviceClient = createServiceClient();
    const { data: archivedMessages, error } = await serviceClient
      .from('archived_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('message_order', { ascending: true });

    if (error) throw error;

    if (archivedMessages && archivedMessages.length > 0) {
      console.log(`✅ Found ${archivedMessages.length} archived messages`);
      // Convert archived messages to OpenAI format
      return archivedMessages.map(msg => ({
        id: msg.message_id,
        role: msg.role,
        content: [{ type: 'text', text: { value: msg.content } }],
        created_at: Math.floor(new Date(msg.created_at).getTime() / 1000)
      }));
    }
  } catch (archivedError: any) {
    console.log(`⚠️ No archived messages found for thread ${threadId}:`, archivedError.message);
  }

  return null;
}

// Helper function to find the user message that preceded an assistant message
function findPrecedingUserMessage(messages: any[], assistantMessageIndex: number) {
  for (let i = assistantMessageIndex - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i];
    }
  }
  return null;
}

// Helper function to extract text content from a message
function extractTextContent(message: any): string {
  if (!message || !message.content) return 'Content not available';
  
  try {
    if (Array.isArray(message.content)) {
      const textContent = message.content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text?.value || item.text || '')
        .join(' ');
      return textContent || 'Content not available';
    } else if (typeof message.content === 'string') {
      return message.content;
    }
  } catch (error) {
    console.error('Error extracting text content:', error);
  }
  
  return 'Content not available';
} 