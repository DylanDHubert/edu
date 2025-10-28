import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { createServiceClient } from '../../../utils/supabase/server';
import { createThread } from '../../../utils/openai';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


export async function POST(request: NextRequest) {
  try {
    const { courseId, portfolioId, assistantId, title, initialMessage } = await request.json();
    
    console.log('🎯 CREATE-course received params:', { courseId, portfolioId, assistantId, title });
    
    if (!courseId || !portfolioId || !assistantId || !title) {
      return NextResponse.json(
        { error: 'course ID, Portfolio ID, Assistant ID, and Title are required' },
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

    // VERIFY USER IS A MEMBER OF THIS course (USE SERVICE CLIENT TO BYPASS RLS)
    const serviceClient = createServiceClient();
    const { data: courseMember, error: memberError } = await serviceClient
      .from('course_members')
      .select('role')
      .eq('course_id', courseId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberError || !courseMember) {
      return NextResponse.json(
        { error: 'Access denied to this course' },
        { status: 403 }
      );
    }

    // GET PORTFOLIO INFO TO FIND VECTOR STORE ID (USE SERVICE CLIENT FOR RLS)
    console.log('🔍 Looking for portfolio vector store:', portfolioId);
    const { data: portfolioData, error: portfolioError } = await serviceClient
      .from('course_portfolios')
      .select('vector_store_id')
      .eq('id', portfolioId)
      .single();

    console.log('📋 Portfolio query result:', { portfolioData, portfolioError });

    if (portfolioError) {
      console.log('❌ Portfolio lookup failed:', { portfolioError });
      return NextResponse.json(
        { error: 'Portfolio not found' },
        { status: 404 }
      );
    }

    // Handle case where no vector store exists yet (documents still processing)
    if (!portfolioData?.vector_store_id) {
      console.log('⚠️ No vector store found - documents may still be processing');
      // Continue without vector store - assistant will work but without file search
    }

    // Skip knowledge update - no manual knowledge system


    // CREATE NEW THREAD WITH INITIAL CONTEXT TO PRIME FILE SEARCH BEHAVIOR
    const initialContext = `I am ready to help with course topics and materials. I will ALWAYS use file search to find relevant information from documents and knowledge sources before responding. This ensures I provide accurate, evidence-based responses.`;
    const thread = await createThread(initialContext);
    
    // ADD VISIBLE WELCOME MESSAGE TO THE THREAD
    const welcomeMessage = `Hello! I'm your HHB Assistant specializing in educational content. I'm ready to help you with any questions about course topics, materials, or concepts. I'll search through our knowledge base to provide you with accurate information. What would you like to know?`;
    
    await client.beta.threads.messages.create(thread.id, {
      role: 'assistant',
      content: welcomeMessage,
      metadata: { 
        visible: 'true',
        messageType: 'welcome_message' 
      }
    });
    
    // SAVE TO DATABASE - Using service client to bypass RLS (we've already verified user access)
    const { data: chatHistory, error: dbError } = await serviceClient
      .from('chat_history')
      .insert({
        user_id: user.id,
        course_id: courseId,
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
      course_id: courseId,
      portfolio_id: portfolioId,
      assistant_id: assistantId,
      created_at: chatHistory.created_at
    });

  } catch (error) {
    console.error('ERROR CREATING course CHAT:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
} 