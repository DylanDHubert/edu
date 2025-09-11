import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyUserAuth } from '../../../utils/auth-helpers';
import { handleAuthError, handleDatabaseError, handleValidationError } from '../../../utils/error-responses';
import { createClient, createServiceClient } from '../../../utils/supabase/server';
import { getNotesForTeamContext, formatNotesForContext } from '../../../utils/notes-server';
import { createAccountPortfolioKnowledgeText, createGeneralKnowledgeText, filterSurgeonInfoByPortfolio } from '../../../utils/knowledge-generator';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to get updated team knowledge context (same as create-team but for updates)
async function getUpdatedTeamKnowledgeForContext(
  teamId: string,
  accountId: string,
  portfolioId: string,
  userId: string
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

    // GET NOTES FOR TEAM CONTEXT
    const notes = await getNotesForTeamContext(teamId, accountId, portfolioId, userId);
    const notesContext = formatNotesForContext(notes);
    
    // COMBINE TEAM KNOWLEDGE AND NOTES
    let combinedContext = '';
    if (teamKnowledgeText.trim()) {
      combinedContext += `TEAM KNOWLEDGE CONTEXT:\n\n${teamKnowledgeText}\n\n`;
    }
    if (notesContext) {
      combinedContext += notesContext;
    }

    return combinedContext;

  } catch (error) {
    console.error('❌ Error generating updated team knowledge context:', error);
    return '';
  }
}

export async function POST(request: NextRequest) {
  try {
    const { teamId, accountId, portfolioId, threadId } = await request.json();
    
    if (!teamId || !accountId || !portfolioId || !threadId) {
      return handleValidationError('Team ID, Account ID, Portfolio ID, and Thread ID are required');
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const { user } = await verifyUserAuth(cookieStore);

    // VERIFY USER IS A MEMBER OF THIS TEAM
    const supabase = await createClient(cookieStore);
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

    // GET UPDATED CONTEXT WITH NOTES
    const updatedContext = await getUpdatedTeamKnowledgeForContext(teamId, accountId, portfolioId, user.id);
    
    if (!updatedContext) {
      return NextResponse.json(
        { error: 'No context to update' },
        { status: 400 }
      );
    }

    // UPDATE THE FIRST CONTEXT MESSAGE IN THE THREAD
    try {
      // Get all messages in the thread
      const messages = await client.beta.threads.messages.list(threadId, {
        order: 'asc'
      });

      // Find the first context message (hidden system message)
      const firstContextMessage = messages.data.find(msg => 
        msg.metadata?.isSystemContext === 'true' && 
        msg.metadata?.messageType === 'team_knowledge_context'
      );

      if (firstContextMessage) {
        // Update the first context message metadata only (content cannot be updated)
        await client.beta.threads.messages.update(threadId, firstContextMessage.id, {
          metadata: {
            isSystemContext: 'true',
            hidden: 'false', // VISIBLE TO USER FOR DEBUGGING
            messageType: 'team_knowledge_context',
            lastUpdated: new Date().toISOString()
          }
        });

        console.log('✅ Updated context message for thread:', threadId);
      } else {
        // If no context message found, create a new one
        await client.beta.threads.messages.create(threadId, {
          role: 'user',
          content: updatedContext,
          metadata: {
            isSystemContext: 'true',
            hidden: 'false', // VISIBLE TO USER FOR DEBUGGING
            messageType: 'team_knowledge_context',
            lastUpdated: new Date().toISOString()
          }
        });

        console.log('✅ Created new context message for thread:', threadId);
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Context updated successfully',
        threadId 
      });

    } catch (openaiError) {
      console.error('❌ Error updating OpenAI thread context:', openaiError);
      return NextResponse.json(
        { error: 'Failed to update thread context' },
        { status: 500 }
      );
    }

  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'TEAM_ACCESS_DENIED', 'INSUFFICIENT_PERMISSIONS'].includes(error.message)) {
      return handleAuthError(error);
    }
    console.error('Error in update context route:', error);
    return handleDatabaseError(error, 'update chat context');
  }
}
