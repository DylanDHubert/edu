import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../utils/supabase/server';
import { createThread } from '../../../utils/openai';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { createAccountPortfolioKnowledgeText, createGeneralKnowledgeText, filterSurgeonInfoByPortfolio } from '../../../utils/knowledge-generator';

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
    // USE SERVICE CLIENT TO BYPASS RLS FOR KNOWLEDGE QUERIES
    const serviceClient = createServiceClient();
    
    // Get team and portfolio names
    const [teamResult, portfolioResult, accountResult] = await Promise.all([
      serviceClient.from('teams').select('name').eq('id', teamId).single(),
      serviceClient.from('team_portfolios').select('name').eq('id', portfolioId).single(),
      serviceClient.from('team_accounts').select('name').eq('id', accountId).single()
    ]);

    // Get all knowledge data
    const [portfolioSpecificKnowledgeResult, accountLevelKnowledgeResult, generalKnowledgeResult] = await Promise.all([
      // Portfolio-specific knowledge (inventory, instruments, technical) - these have portfolio_id set
      serviceClient
        .from('team_knowledge')
        .select('*')
        .eq('team_id', teamId)
        .eq('account_id', accountId)
        .eq('portfolio_id', portfolioId),
      
      // Account-level knowledge (access & misc only) - these have portfolio_id = null
      serviceClient
        .from('team_knowledge')
        .select('*')
        .eq('team_id', teamId)
        .eq('account_id', accountId)
        .is('portfolio_id', null),
      
      // General team knowledge (surgeon info) - these have both account_id and portfolio_id = null
      serviceClient
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

    // Knowledge data processed

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

    // CREATE NEW THREAD
    const thread = await createThread();
    
    // INJECT TEAM KNOWLEDGE AS FIRST MESSAGE (HIDDEN FROM USER)
    const teamKnowledgeContext = await getTeamKnowledgeForContext(supabase, teamId, accountId, portfolioId);
    
    if (teamKnowledgeContext) {
      // Send team knowledge as a HIDDEN system message
      // This establishes the context for the entire conversation
      await client.beta.threads.messages.create(thread.id, {
        role: 'user',
        content: teamKnowledgeContext,
        metadata: {
          isSystemContext: 'true',
          hidden: 'true', // HIDDEN FROM USER
          messageType: 'team_knowledge_context'
        }
      });
    }
    
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