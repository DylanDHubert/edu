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

    // Check if we already have a cached consolidated assistant
    const { data: existingAssistant, error: assistantError } = await supabase
      .from('team_assistants')
      .select('*')
      .eq('team_id', teamId)
      .eq('account_id', accountId)
      .eq('portfolio_id', portfolioId)
      .single();

    if (existingAssistant && !assistantError && existingAssistant.consolidated_vector_store_id) {
      console.log('🔍 Found existing assistant, checking if cache is still valid...');
      
      // Check if underlying content has been updated since vector store creation
      const vectorStoreCreatedAt = new Date(existingAssistant.created_at);
      console.log(`📅 Vector store created at: ${vectorStoreCreatedAt.toISOString()}`);

      const isStale = await checkIfCacheIsStale(supabase, teamId, accountId, portfolioId, vectorStoreCreatedAt);
      
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
          message: 'Using existing consolidated assistant'
        });
      }
    }

    // Get team, account, and portfolio names for naming
    const names = await getNames(supabase, teamId, accountId, portfolioId);
    
    // Create consolidated vector store with all knowledge
    const consolidatedVectorStore = await createConsolidatedVectorStore(
      supabase, teamId, accountId, portfolioId, names
    );

    if (!consolidatedVectorStore) {
      return NextResponse.json(
        { error: 'Failed to create consolidated knowledge base' },
        { status: 500 }
      );
    }

    // Create OpenAI assistant with consolidated vector store
    const assistantName = `${names.teamName} - ${names.accountName} - ${names.portfolioName} Assistant`;
    
    try {
      const assistant = await client.beta.assistants.create({
        name: assistantName,
        instructions: generateAssistantInstructions(names),
        model: "gpt-4o",
        tools: [{ type: "file_search" }],
        tool_resources: {
          file_search: {
            vector_store_ids: [consolidatedVectorStore.id] // Single consolidated store
          }
        }
      });

      // Cache the consolidated assistant
      const { data: cachedAssistant, error: cacheError } = await supabase
        .from('team_assistants')
        .upsert({
          team_id: teamId,
          account_id: accountId,
          portfolio_id: portfolioId,
          assistant_id: assistant.id,
          assistant_name: assistantName,
          consolidated_vector_store_id: consolidatedVectorStore.id,
          consolidated_vector_store_name: consolidatedVectorStore.name,
          // Keep old fields for backward compatibility with placeholder values
          general_vector_store_id: 'consolidated',
          account_portfolio_vector_store_id: 'consolidated', 
          portfolio_vector_store_id: 'consolidated'
        }, {
          onConflict: 'team_id,account_id,portfolio_id'
        })
        .select()
        .single();

      if (cacheError) {
        console.error('Error caching consolidated assistant:', cacheError);
        // Continue anyway, assistant is created
      }

      return NextResponse.json({
        success: true,
        assistantId: assistant.id,
        assistantName: assistantName,
        vectorStoreId: consolidatedVectorStore.id,
        vectorStoreName: consolidatedVectorStore.name,
        cached: false,
        message: 'Consolidated assistant created successfully'
      });

    } catch (openaiError) {
      console.error('Error creating OpenAI assistant:', openaiError);
      return NextResponse.json(
        { error: 'Failed to create AI assistant' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error in consolidated assistant creation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function createConsolidatedVectorStore(supabase: any, teamId: string, accountId: string, portfolioId: string, names: any) {
  try {
    const vectorStoreName = `${names.teamName}-${names.accountName}-${names.portfolioName}-Consolidated`;
    console.log(`Creating consolidated vector store: ${vectorStoreName}`);

    // 1. Gather portfolio PDFs from Supabase Storage
    const portfolioPDFs = await gatherPortfolioPDFs(supabase, teamId, portfolioId);
    
    // 2. Generate and store account knowledge text file
    const accountKnowledgeFile = await generateAndStoreAccountKnowledge(supabase, teamId, accountId, portfolioId);
    
    // 3. Generate and store general knowledge text file  
    const generalKnowledgeFile = await generateAndStoreGeneralKnowledge(supabase, teamId);

    // 4. Collect all files for upload
    const allFiles = [
      ...portfolioPDFs,
      ...(accountKnowledgeFile ? [accountKnowledgeFile] : []),
      ...(generalKnowledgeFile ? [generalKnowledgeFile] : [])
    ];

    if (allFiles.length === 0) {
      console.warn('No files found for consolidated vector store');
      return null;
    }

    console.log(`Uploading ${allFiles.length} files to consolidated vector store`);

    // 5. Create consolidated vector store in OpenAI
    const vectorStore = await (client as any).vectorStores.create({
      name: vectorStoreName,
      file_ids: allFiles.map(f => f.id)
    });

    console.log(`Successfully created consolidated vector store: ${vectorStore.id}`);

    return {
      id: vectorStore.id,
      name: vectorStoreName,
      fileCount: allFiles.length
    };

  } catch (error) {
    console.error('Error creating consolidated vector store:', error);
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

async function generateAndStoreAccountKnowledge(supabase: any, teamId: string, accountId: string, portfolioId: string) {
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
      return null;
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

    // Get proper names
    const { data: team } = await supabase.from('teams').select('name').eq('id', teamId).single();
    const { data: portfolioInfo } = await supabase.from('team_portfolios').select('name').eq('id', portfolioId).single();

    // Generate text content
    const textContent = createAccountPortfolioKnowledgeText({
      teamName: team?.name || 'Team',
      accountName: account?.name || 'Unknown Account',
      portfolioName: portfolioInfo?.name || 'Portfolio',
      knowledge: {
        inventory,
        instruments,
        technical
      }
    });

    // Upload to OpenAI as text file
    const filename = `account-${accountId}-portfolio-${portfolioId}-knowledge.txt`;
    const blob = new Blob([textContent], { type: 'text/plain' });
    const file = new File([blob], filename, { type: 'text/plain' });

    const openaiFile = await client.files.create({
      file: file,
      purpose: 'assistants'
    });

    console.log(`Generated account knowledge file: ${openaiFile.id}`);

    return {
      id: openaiFile.id,
      name: filename,
      type: 'text'
    };

  } catch (error) {
    console.error('Error generating account knowledge:', error);
    return null;
  }
}

async function generateAndStoreGeneralKnowledge(supabase: any, teamId: string) {
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
      return null;
    }

    // Transform knowledge data
    const doctorInfo = knowledgeData
      .filter((k: any) => k.category === 'doctor_info')
      .map((k: any) => ({
        title: k.metadata?.name || k.title || '',
        content: `${k.metadata?.specialty || ''} - ${k.metadata?.notes || ''}`
      }));

    const accessMisc = knowledgeData
      .filter((k: any) => k.category === 'access_misc')
      .map((k: any) => ({ title: 'Access Information', content: k.content || k.metadata?.content || '' }));

    // Get proper team name
    const { data: team } = await supabase.from('teams').select('name').eq('id', teamId).single();

    // Generate text content
    const textContent = createGeneralKnowledgeText({
      teamName: team?.name || 'Team',
      doctorInfo,
      accessMisc
    });

    // Upload to OpenAI as text file
    const filename = `team-${teamId}-general-knowledge.txt`;
    const blob = new Blob([textContent], { type: 'text/plain' });
    const file = new File([blob], filename, { type: 'text/plain' });

    const openaiFile = await client.files.create({
      file: file,
      purpose: 'assistants'
    });

    console.log(`Generated general knowledge file: ${openaiFile.id}`);

    return {
      id: openaiFile.id,
      name: filename,
      type: 'text'
    };

  } catch (error) {
    console.error('Error generating general knowledge:', error);
    return null;
  }
}

async function getNames(supabase: any, teamId: string, accountId: string, portfolioId: string) {
  try {
    // Get team name
    const { data: team } = await supabase
      .from('teams')
      .select('name')
      .eq('id', teamId)
      .single();

    // Get account name
    const { data: account } = await supabase
      .from('team_accounts')
      .select('name')
      .eq('id', accountId)
      .single();

    // Get portfolio name
    const { data: portfolio } = await supabase
      .from('team_portfolios')
      .select('name')
      .eq('id', portfolioId)
      .single();

    return {
      teamName: team?.name || 'Team',
      accountName: account?.name || 'Account',
      portfolioName: portfolio?.name || 'Portfolio'
    };
  } catch (error) {
    console.error('Error getting names:', error);
    return {
      teamName: 'Team',
      accountName: 'Account', 
      portfolioName: 'Portfolio'
    };
  }
}

async function checkIfCacheIsStale(
  supabase: any, 
  teamId: string, 
  accountId: string, 
  portfolioId: string, 
  vectorStoreCreatedAt: Date
): Promise<boolean> {
  try {
    console.log('🔍 Checking cache staleness...');

    // 1. Check if any portfolio PDFs were uploaded/updated after vector store creation
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

    // 2. Check if account information was updated after vector store creation
    const { data: accountInfo } = await supabase
      .from('team_accounts')
      .select('updated_at')
      .eq('id', accountId)
      .single();

    if (accountInfo && accountInfo.updated_at) {
      const accountUpdatedAt = new Date(accountInfo.updated_at);
      if (accountUpdatedAt > vectorStoreCreatedAt) {
        console.log(`🏥 Account info updated: ${accountUpdatedAt.toISOString()} > ${vectorStoreCreatedAt.toISOString()}`);
        return true;
      }
    }

    // 3. Check if account-specific knowledge was updated after vector store creation
    const { data: latestAccountKnowledge } = await supabase
      .from('team_knowledge')
      .select('updated_at')
      .eq('team_id', teamId)
      .eq('account_id', accountId)
      .eq('portfolio_id', portfolioId)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (latestAccountKnowledge && latestAccountKnowledge.length > 0) {
      const latestKnowledgeDate = new Date(latestAccountKnowledge[0].updated_at);
      if (latestKnowledgeDate > vectorStoreCreatedAt) {
        console.log(`🧠 Account knowledge updated: ${latestKnowledgeDate.toISOString()} > ${vectorStoreCreatedAt.toISOString()}`);
        return true;
      }
    }

    // 4. Check if general team knowledge was updated after vector store creation
    const { data: latestGeneralKnowledge } = await supabase
      .from('team_knowledge')
      .select('updated_at')
      .eq('team_id', teamId)
      .is('account_id', null)
      .is('portfolio_id', null)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (latestGeneralKnowledge && latestGeneralKnowledge.length > 0) {
      const latestGeneralDate = new Date(latestGeneralKnowledge[0].updated_at);
      if (latestGeneralDate > vectorStoreCreatedAt) {
        console.log(`🌐 General knowledge updated: ${latestGeneralDate.toISOString()} > ${vectorStoreCreatedAt.toISOString()}`);
        return true;
      }
    }

    // 5. Check if team information itself was updated after vector store creation
    const { data: teamInfo } = await supabase
      .from('teams')
      .select('updated_at')
      .eq('id', teamId)
      .single();

    if (teamInfo && teamInfo.updated_at) {
      const teamUpdatedAt = new Date(teamInfo.updated_at);
      if (teamUpdatedAt > vectorStoreCreatedAt) {
        console.log(`👥 Team info updated: ${teamUpdatedAt.toISOString()} > ${vectorStoreCreatedAt.toISOString()}`);
        return true;
      }
    }

    console.log('✅ Cache is still fresh - no updates detected');
    return false;

  } catch (error) {
    console.error('❌ Error checking cache staleness:', error);
    // On error, assume cache is stale to be safe
    return true;
  }
}

function generateAssistantInstructions(names: { teamName: string; accountName: string; portfolioName: string }): string {
  return `YOU ARE AN EXPERT MEDICAL ASSISTANT SPECIALIZING IN ${names.portfolioName.toUpperCase()}. USE YOUR KNOWLEDGE BASE TO ANSWER QUESTIONS ABOUT SURGICAL TECHNIQUES, PROTOCOLS, AND MEDICAL PROCEDURES. ALWAYS PROVIDE ACCURATE, DETAILED INFORMATION BASED ON THE UPLOADED DOCUMENTS.

You have access to:
1. ${names.portfolioName} portfolio documentation (PDFs)
2. ${names.accountName} specific knowledge and inventory
3. ${names.teamName} general team knowledge

RESPONSE GUIDELINES:
- Provide comprehensive, detailed answers about surgical techniques and procedures
- Answer questions thoroughly using information from all available documentation and knowledge
- ONLY when referencing images from the team knowledge: include the URL directly in your response
- Format for team images: "The Hip Tray Set A contains primary instruments: /api/images/hip_tray_a.jpg"
- Do NOT add quotes, explanatory text, or markdown formatting around the URL
- Do NOT say "you can view" or "available here" - just include the URL directly after the description
- For all other responses, provide normal detailed medical information

IMPORTANT: FORMAT YOUR RESPONSES AS PLAIN TEXT ONLY. DO NOT USE MARKDOWN FORMATTING. USE SIMPLE TEXT WITH LINE BREAKS FOR ORGANIZATION. AVOID USING MARKDOWN SYMBOLS LIKE #, *, -, OR \`\`\`. JUST USE CLEAN, READABLE PLAIN TEXT.`;
} 