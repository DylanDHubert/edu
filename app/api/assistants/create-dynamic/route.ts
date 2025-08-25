import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { createAccountPortfolioKnowledgeText, createGeneralKnowledgeText } from '../../../utils/knowledge-generator';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { teamId, accountId, portfolioId } = await request.json();

    // Validate required fields
    if (!teamId || !accountId || !portfolioId) {
      return NextResponse.json(
        { error: 'Team ID, Account ID, and Portfolio ID are required' },
        { status: 400 }
      );
    }

    // Verify user authentication
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user is a member of this team
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

    // Check if we already have a cached portfolio assistant
    const { data: existingAssistant, error: assistantError } = await supabase
      .from('team_assistants')
      .select('*')
      .eq('team_id', teamId)
      .eq('portfolio_id', portfolioId)
      .is('account_id', null)
      .single();

    if (existingAssistant && !assistantError && existingAssistant.consolidated_vector_store_id) {
      console.log('🔍 Found existing portfolio assistant, checking if cache is still valid...');
      
      // Check if underlying PDFs have been updated since vector store creation
      const vectorStoreCreatedAt = new Date(existingAssistant.created_at);
      console.log(`📅 Vector store created at: ${vectorStoreCreatedAt.toISOString()}`);

      const isStale = await checkIfCacheIsStale(supabase, teamId, portfolioId, vectorStoreCreatedAt);
      
      if (isStale) {
        console.log('🔄 Cache is stale, deleting old assistant and creating new one...');
        
        // Delete old OpenAI assistant and vector store
        try {
          console.log('🗑️ Deleting old OpenAI assistant:', existingAssistant.assistant_id);
          await client.beta.assistants.del(existingAssistant.assistant_id);
          
          console.log('🗑️ Deleting old OpenAI vector store:', existingAssistant.consolidated_vector_store_id);
          await (client as any).vectorStores.del(existingAssistant.consolidated_vector_store_id);
        } catch (deleteError) {
          console.warn('⚠️ Error deleting old OpenAI resources:', deleteError);
          // Continue anyway - we'll create new ones
        }
        
        // Delete cached assistant record
        await supabase
          .from('team_assistants')
          .delete()
          .eq('id', existingAssistant.id);
        
        console.log('✅ Old cache cleaned up, proceeding to create new assistant...');
      } else {
        console.log('✅ Cache is still valid, returning existing assistant');
        // Return existing cached assistant
        return NextResponse.json({
          success: true,
          assistantId: existingAssistant.assistant_id,
          assistantName: existingAssistant.assistant_name,
          vectorStoreId: existingAssistant.consolidated_vector_store_id,
          cached: true,
          message: 'Using existing portfolio assistant'
        });
      }
    }

    // Get team and portfolio names for naming
    const names = await getNames(supabase, teamId, portfolioId);
    
    // Create portfolio vector store with PDFs only
    const portfolioVectorStore = await createPortfolioVectorStore(
      supabase, teamId, portfolioId, names
    );

    if (!portfolioVectorStore) {
      return NextResponse.json(
        { error: 'Failed to create portfolio knowledge base' },
        { status: 500 }
      );
    }

    // Generate context for this specific account
    const accountContext = await generateAccountContext(supabase, teamId, accountId, portfolioId, names);
    const generalContext = await generateGeneralContext(supabase, teamId, names);

    // Create OpenAI assistant with portfolio vector store and account context
    const assistantName = `${names.teamName} - ${names.portfolioName} Assistant`;
    
    try {
      const assistant = await client.beta.assistants.create({
        name: assistantName,
        instructions: generateAssistantInstructions(names, accountContext, generalContext),
        model: "gpt-4o",
        tools: [{ type: "file_search" }],
        tool_resources: {
          file_search: {
            vector_store_ids: [portfolioVectorStore.id] // Portfolio PDFs only
          }
        }
      });

      // Cache the portfolio assistant
      const { data: cachedAssistant, error: cacheError } = await supabase
        .from('team_assistants')
        .upsert({
          team_id: teamId,
          account_id: null, // Portfolio-level assistant
          portfolio_id: portfolioId,
          assistant_id: assistant.id,
          assistant_name: assistantName,
          consolidated_vector_store_id: portfolioVectorStore.id,
          consolidated_vector_store_name: portfolioVectorStore.name,
          // Keep old fields for backward compatibility with placeholder values
          general_vector_store_id: 'portfolio',
          account_portfolio_vector_store_id: 'portfolio', 
          portfolio_vector_store_id: 'portfolio'
        }, {
          onConflict: 'team_id,portfolio_id'
        })
        .select()
        .single();

      if (cacheError) {
        console.error('Error caching portfolio assistant:', cacheError);
        // Continue anyway, assistant is created
      }

      return NextResponse.json({
        success: true,
        assistantId: assistant.id,
        assistantName: assistantName,
        vectorStoreId: portfolioVectorStore.id,
        vectorStoreName: portfolioVectorStore.name,
        cached: false,
        message: 'Portfolio assistant created successfully'
      });

    } catch (openaiError) {
      console.error('Error creating OpenAI assistant:', openaiError);
      return NextResponse.json(
        { error: 'Failed to create AI assistant' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error in portfolio assistant creation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function createPortfolioVectorStore(supabase: any, teamId: string, portfolioId: string, names: any) {
  try {
    const vectorStoreName = `${names.teamName}-${names.portfolioName}-Portfolio-PDFs`;
    console.log(`Creating portfolio vector store: ${vectorStoreName}`);

    // Gather portfolio PDFs from Supabase Storage
    const portfolioPDFs = await gatherPortfolioPDFs(supabase, teamId, portfolioId);

    if (portfolioPDFs.length === 0) {
      console.warn('No PDF files found for portfolio vector store');
      return null;
    }

    console.log(`Uploading ${portfolioPDFs.length} PDF files to portfolio vector store`);

    // Create portfolio vector store in OpenAI with PDFs only
    const vectorStore = await (client as any).vectorStores.create({
      name: vectorStoreName,
      file_ids: portfolioPDFs.map((f: any) => f.id)
    });

    console.log(`Successfully created portfolio vector store: ${vectorStore.id}`);

    return {
      id: vectorStore.id,
      name: vectorStoreName,
      fileCount: portfolioPDFs.length
    };

  } catch (error) {
    console.error('Error creating portfolio vector store:', error);
    return null;
  }
}

async function gatherPortfolioPDFs(supabase: any, teamId: string, portfolioId: string) {
  try {
    // Get portfolio PDFs that were previously uploaded to OpenAI
    const { data: documents, error } = await supabase
      .from('team_documents')
      .select('openai_file_id, original_name')
      .eq('team_id', teamId)
      .eq('portfolio_id', portfolioId);

    if (error) {
      console.error('Error gathering portfolio PDFs:', error);
      return [];
    }

    return (documents || []).map((doc: any) => ({
      id: doc.openai_file_id,
      name: doc.original_name,
      type: 'pdf'
    }));

  } catch (error) {
    console.error('Error in gatherPortfolioPDFs:', error);
    return [];
  }
}

async function generateAccountContext(supabase: any, teamId: string, accountId: string, portfolioId: string, names: any) {
  try {
    // Get account info
    const { data: account } = await supabase
      .from('team_accounts')
      .select('name, description')
      .eq('id', accountId)
      .single();

    // Get account knowledge for this portfolio
    const { data: knowledgeData } = await supabase
      .from('team_knowledge')
      .select('*')
      .eq('team_id', teamId)
      .eq('account_id', accountId)
      .eq('portfolio_id', portfolioId);

    if (!knowledgeData || knowledgeData.length === 0) {
      console.log('No account knowledge found');
      return '';
    }

    // Transform knowledge data for text generation
    const inventory = knowledgeData
      .filter((k: any) => k.category === 'inventory')
      .map((k: any) => ({ item: k.metadata?.name || k.title || '', quantity: k.metadata?.quantity || 0, notes: '' }));

    const instruments = knowledgeData
      .filter((k: any) => k.category === 'instruments')
      .map((k: any) => ({
        name: k.metadata?.name || k.title || '',
        description: k.metadata?.description || k.content || '',
        imageUrl: k.metadata?.image_url || ''
      }));

    const technical = knowledgeData
      .filter((k: any) => k.category === 'technical')
      .map((k: any) => ({ title: 'Technical Information', content: k.content || k.metadata?.content || '' }));

    const accessMisc = knowledgeData
      .filter((k: any) => k.category === 'access_misc')
      .map((k: any) => ({ title: 'Access Information', content: k.content || k.metadata?.content || '' }));

    // Generate text content
    const textContent = createAccountPortfolioKnowledgeText({
      teamName: names.teamName,
      accountName: account?.name || 'Unknown Account',
      portfolioName: names.portfolioName,
      knowledge: {
        inventory,
        instruments,
        technical,
        accessMisc
      }
    });

    console.log(`Generated account context for ${account?.name || 'Unknown Account'}`);
    return textContent;

  } catch (error) {
    console.error('Error generating account context:', error);
    return '';
  }
}

async function generateGeneralContext(supabase: any, teamId: string, names: any) {
  try {
    // Get general team knowledge (account_id and portfolio_id are null)
    const { data: knowledgeData } = await supabase
      .from('team_knowledge')
      .select('*')
      .eq('team_id', teamId)
      .is('account_id', null)
      .is('portfolio_id', null);

    if (!knowledgeData || knowledgeData.length === 0) {
      console.log('No general knowledge found');
      return '';
    }

    // Transform knowledge data
    const surgeonInfo = knowledgeData
      .filter((k: any) => k.category === 'surgeon_info')
      .map((k: any) => ({
        title: k.metadata?.name || k.title || '',
        content: `${k.metadata?.specialty || ''} - ${k.metadata?.procedure_focus || ''} - ${k.metadata?.notes || ''}`
      }));

    // Generate text content
    const textContent = createGeneralKnowledgeText({
      teamName: names.teamName,
      surgeonInfo
    });

    console.log(`Generated general context for ${names.teamName}`);
    return textContent;

  } catch (error) {
    console.error('Error generating general context:', error);
    return '';
  }
}

async function getNames(supabase: any, teamId: string, portfolioId: string) {
  try {
    // Get team name
    const { data: team } = await supabase
      .from('teams')
      .select('name')
      .eq('id', teamId)
      .single();

    // Get portfolio name
    const { data: portfolio } = await supabase
      .from('team_portfolios')
      .select('name')
      .eq('id', portfolioId)
      .single();

    return {
      teamName: team?.name || 'Team',
      portfolioName: portfolio?.name || 'Portfolio'
    };
  } catch (error) {
    console.error('Error getting names:', error);
    return {
      teamName: 'Team',
      portfolioName: 'Portfolio'
    };
  }
}

async function checkIfCacheIsStale(
  supabase: any, 
  teamId: string, 
  portfolioId: string, 
  vectorStoreCreatedAt: Date
): Promise<boolean> {
  try {
    console.log('🔍 Checking cache staleness...');

    // Check if any portfolio PDFs were uploaded/updated after vector store creation
    const { data: latestDocuments } = await supabase
      .from('team_documents')
      .select('created_at')
      .eq('team_id', teamId)
      .eq('portfolio_id', portfolioId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (latestDocuments && latestDocuments.length > 0) {
      const latestDocumentDate = new Date(latestDocuments[0].created_at);
      if (latestDocumentDate > vectorStoreCreatedAt) {
        console.log(`📄 Portfolio PDFs updated: ${latestDocumentDate.toISOString()} > ${vectorStoreCreatedAt.toISOString()}`);
        return true;
      }
    }

    console.log('✅ Cache is still fresh - no PDF updates detected');
    return false;

  } catch (error) {
    console.error('❌ Error checking cache staleness:', error);
    // On error, assume cache is stale to be safe
    return true;
  }
}

function generateAssistantInstructions(
  names: { teamName: string; portfolioName: string }, 
  accountContext: string, 
  generalContext: string
): string {
  let instructions = `YOU ARE AN EXPERT MEDICAL ASSISTANT SPECIALIZING IN ${names.portfolioName.toUpperCase()}. USE YOUR KNOWLEDGE BASE TO ANSWER QUESTIONS ABOUT SURGICAL TECHNIQUES, PROTOCOLS, AND MEDICAL PROCEDURES.

You have access to:
1. ${names.portfolioName} portfolio documentation (PDFs) - use file search for specific document lookup
2. Account-specific knowledge (provided in context below)
3. ${names.teamName} general team knowledge (provided in context below)

RESPONSE GUIDELINES:
- Provide comprehensive, detailed answers about surgical techniques and procedures
- Use file search for specific document content and detailed procedures
- Use context information for account-specific details and general team information
- ONLY when referencing images from the team knowledge: include the URL directly in your response
- Format for team images: "The Hip Tray Set A contains primary instruments: /api/images/hip_tray_a.jpg"
- Do NOT add quotes, explanatory text, or markdown formatting around the URL
- Do NOT say "you can view" or "available here" - just include the URL directly after the description
- For all other responses, provide normal detailed medical information

IMPORTANT: FORMAT YOUR RESPONSES AS PLAIN TEXT ONLY. DO NOT USE MARKDOWN FORMATTING. USE SIMPLE TEXT WITH LINE BREAKS FOR ORGANIZATION. AVOID USING MARKDOWN SYMBOLS LIKE #, *, -, OR \`\`\`. JUST USE CLEAN, READABLE PLAIN TEXT.`;

  // Add account-specific context
  if (accountContext) {
    instructions += `\n\nACCOUNT-SPECIFIC KNOWLEDGE:\n${accountContext}`;
  }

  // Add general team context
  if (generalContext) {
    instructions += `\n\nGENERAL TEAM KNOWLEDGE:\n${generalContext}`;
  }

  return instructions;
}