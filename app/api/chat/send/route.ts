import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { sendMessage, sendMessageStreaming } from '../../../utils/openai';
import { cookies } from 'next/headers';
import { getNotesForTeamContext, formatNotesForContext } from '../../../utils/notes-server';
import { createAccountPortfolioKnowledgeText, createGeneralKnowledgeText, filterSurgeonInfoByPortfolio } from '../../../utils/knowledge-generator';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to get team knowledge for context injection
async function getTeamKnowledgeForContext(
  supabase: any,
  teamId: string,
  accountId: string,
  portfolioId: string
): Promise<string> {
  try {
    // Get team and portfolio names
    const [teamResult, portfolioResult, accountResult] = await Promise.all([
      supabase.from('teams').select('name').eq('id', teamId).single(),
      supabase.from('team_portfolios').select('name').eq('id', portfolioId).single(),
      supabase.from('team_accounts').select('name').eq('id', accountId).single()
    ]);

    // Get all knowledge data
    const [portfolioSpecificKnowledgeResult, accountLevelKnowledgeResult, generalKnowledgeResult] = await Promise.all([
      // Portfolio-specific knowledge (inventory, instruments, technical)
      supabase
        .from('team_knowledge')
        .select('*')
        .eq('team_id', teamId)
        .eq('account_id', accountId)
        .eq('portfolio_id', portfolioId),
      
      // Account-level knowledge (access & misc only)
      supabase
        .from('team_knowledge')
        .select('*')
        .eq('team_id', teamId)
        .eq('account_id', accountId)
        .is('portfolio_id', null),
      
      // General team knowledge (surgeon info)
      supabase
        .from('team_knowledge')
        .select('*')
        .eq('team_id', teamId)
        .is('portfolio_id', null)
        .is('account_id', null)
    ]);

    const allKnowledgeData = [
      ...(portfolioSpecificKnowledgeResult.data || []), 
      ...(accountLevelKnowledgeResult.data || []),
      ...(generalKnowledgeResult.data || [])
    ];

    // Transform knowledge data for text generation
    const inventory = allKnowledgeData
      .filter((k: any) => k.category === 'inventory')
      .map((k: any) => ({ item: k.metadata?.name || k.title || '', quantity: k.metadata?.quantity || 0, notes: '' }));

    const instruments = allKnowledgeData
      .filter((k: any) => k.category === 'instruments')
      .map((k: any) => ({
        name: k.metadata?.name || k.title || '',
        description: k.metadata?.description || k.content || '',
        quantity: k.metadata?.quantity ?? null,
        imageUrl: k.metadata?.image_url || ''
      }));

    const technical = allKnowledgeData
      .filter((k: any) => k.category === 'technical')
      .map((k: any) => ({ title: 'Technical Information', content: k.content || k.metadata?.content || '' }));

    const accessMisc = allKnowledgeData
      .filter((k: any) => k.category === 'access_misc')
      .map((k: any) => ({ title: 'Access Information', content: k.content || k.metadata?.content || '' }));

    // Generate account-specific knowledge text
    let teamKnowledgeText = '';
    
    if (inventory.length > 0 || instruments.length > 0 || technical.length > 0 || accessMisc.length > 0) {
      teamKnowledgeText += createAccountPortfolioKnowledgeText({
        teamName: teamResult.data?.name || 'Team',
        accountName: accountResult.data?.name || 'Account',
        portfolioName: portfolioResult.data?.name || 'Portfolio',
        knowledge: { inventory, instruments, technical, accessMisc }
      });
      teamKnowledgeText += '\n\n';
    }

    // Generate general team knowledge (surgeon info)
    const surgeonKnowledgeData = allKnowledgeData.filter((k: any) => k.category === 'surgeon_info');
    if (surgeonKnowledgeData.length > 0) {
      const filteredSurgeonInfo = filterSurgeonInfoByPortfolio(surgeonKnowledgeData, portfolioResult.data?.name || '');
      
      if (filteredSurgeonInfo.length > 0) {
        teamKnowledgeText += createGeneralKnowledgeText({
          teamName: teamResult.data?.name || 'Team',
          surgeonInfo: filteredSurgeonInfo
        });
      }
    }

    return teamKnowledgeText.trim() ? `TEAM KNOWLEDGE CONTEXT:\n\n${teamKnowledgeText}\n\n` : '';

  } catch (error) {
    console.error('❌ Error generating team knowledge context:', error);
    return '';
  }
}

export async function POST(request: NextRequest) {
  try {
    const { 
      threadId, 
      message, 
      assistantId, 
      teamId, 
      accountId, 
      portfolioId, 
      streaming = false 
    } = await request.json();
    
    if (!threadId || !message || !assistantId || !teamId || !accountId || !portfolioId) {
      return NextResponse.json(
        { error: 'THREAD ID, MESSAGE, ASSISTANT ID, TEAM ID, ACCOUNT ID, AND PORTFOLIO ID ARE REQUIRED' },
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

    // VERIFY USER OWNS THIS THREAD
    const { data: chatHistory, error: ownershipError } = await supabase
      .from('chat_history')
      .select('*')
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
      .single();

    if (ownershipError || !chatHistory) {
      return NextResponse.json(
        { error: 'THREAD NOT FOUND OR ACCESS DENIED' },
        { status: 404 }
      );
    }

    // GET NOTES FOR TEAM CONTEXT
    let notes = [];
    notes = await getNotesForTeamContext(teamId, accountId, portfolioId, user.id);
    
    const notesContext = formatNotesForContext(notes);
    
    // GET TEAM KNOWLEDGE FOR CONTEXT
    const teamKnowledgeContext = await getTeamKnowledgeForContext(supabase, teamId, accountId, portfolioId);
    
    // COMBINE TEAM KNOWLEDGE, NOTES, AND MESSAGE
    let fullContext = '';
    if (teamKnowledgeContext) {
      fullContext += teamKnowledgeContext;
    }
    if (notesContext) {
      fullContext += notesContext;
    }
    
    const messageWithContext = fullContext ? `${fullContext}USER MESSAGE: ${message}` : message;
    
    // IF STREAMING IS REQUESTED, RETURN STREAMING RESPONSE
    if (streaming) {
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        async start(controller) {
          try {
            let finalContent = '';
            
            await sendMessageStreaming(
              threadId, 
              messageWithContext, 
              assistantId,
              (content: string, citations: string[], step?: string) => {
                finalContent = content; // CAPTURE FINAL CONTENT
                
                // SEND STREAMING UPDATE
                const data = JSON.stringify({
                  type: 'update',
                  content,
                  citations,
                  step
                });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              }
            );
            
            // SEND COMPLETION SIGNAL
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
            controller.close();
          } catch (error) {
            const errorData = JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'UNKNOWN ERROR'
            });
            controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // NON-STREAMING RESPONSE
    const messages = await sendMessage(threadId, messageWithContext, assistantId);
    
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('ERROR IN SEND ROUTE:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
} 