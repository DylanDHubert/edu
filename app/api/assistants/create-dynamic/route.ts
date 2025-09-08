import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { createAccountPortfolioKnowledgeText, createGeneralKnowledgeText, filterSurgeonInfoByPortfolio } from '../../../utils/knowledge-generator';
import fs from 'fs';
import path from 'path';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to backup all threads for an assistant before deletion
async function backupAssistantThreads(supabase: any, assistantId: string) {
  try {
    console.log(`🔄 Starting backup for assistant: ${assistantId}`);
    
    // Get all chat_history records for this assistant
    const { data: chats, error: chatsError } = await supabase
      .from('chat_history')
      .select('thread_id, title, user_id, team_id, account_id, portfolio_id, created_at')
      .eq('assistant_id', assistantId);

    if (chatsError) {
      console.error('❌ Error fetching chats for backup:', chatsError);
      return;
    }

    if (!chats || chats.length === 0) {
      console.log('ℹ️ No chats found for assistant, skipping backup');
      return;
    }

    console.log(`📊 Found ${chats.length} chats to backup`);
    let backedUpThreads = 0;
    let failedThreads = 0;

    // Process each thread
    for (const chat of chats) {
      try {
        console.log(`🔄 Backing up thread: ${chat.thread_id}`);
        
        // Get messages from OpenAI
        const messages = await getThreadMessages(chat.thread_id);
        if (!messages) {
          console.log(`⚠️ Thread ${chat.thread_id} not found in OpenAI, skipping`);
          failedThreads++;
          continue;
        }

        // Filter out hidden system messages and prepare for storage
        const messagesToArchive = [];
        let messageOrder = 0;

        for (const message of messages) {
          // Skip hidden system context messages
          if (message.metadata?.hidden === 'true' || 
              message.metadata?.messageType === 'team_knowledge_context' ||
              message.metadata?.isSystemContext === 'true') {
            continue;
          }

          const content = extractTextContent(message);
          if (content.trim()) {
            messagesToArchive.push({
              thread_id: chat.thread_id,
              assistant_id: assistantId,
              message_id: message.id,
              role: message.role,
              content: content,
              created_at: new Date(message.created_at * 1000).toISOString(),
              message_order: messageOrder++
            });
          }
        }

        // Bulk insert messages for this thread
        if (messagesToArchive.length > 0) {
          const { error: insertError } = await supabase
            .from('archived_messages')
            .insert(messagesToArchive);

          if (insertError) {
            console.error(`❌ Error archiving messages for thread ${chat.thread_id}:`, insertError);
            failedThreads++;
          } else {
            console.log(`✅ Archived ${messagesToArchive.length} messages for thread ${chat.thread_id}`);
            backedUpThreads++;
          }
        } else {
          console.log(`ℹ️ No messages to archive for thread ${chat.thread_id}`);
          backedUpThreads++;
        }

      } catch (error) {
        console.error(`❌ Error processing thread ${chat.thread_id}:`, error);
        failedThreads++;
      }
    }

    console.log(`✅ Backup complete: ${backedUpThreads} threads backed up, ${failedThreads} failed`);

  } catch (error) {
    console.error('❌ Error in backup process:', error);
    // Don't throw - we want assistant recreation to continue even if backup fails
  }
}

// Helper function to get thread messages (same as analytics)
async function getThreadMessages(threadId: string) {
  // Try default project first
  try {
    console.log(`🔍 Trying default project for thread: ${threadId}`);
    const messages = await client.beta.threads.messages.list(threadId);
    console.log(`✅ Found thread ${threadId} in default project`);
    return messages.data.reverse(); // Chronological order
  } catch (error: any) {
    if (error.status === 404) {
      console.log(`Thread ${threadId} not found in default project, trying specific project...`);
      
      // Try specific project  
      const projectClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        project: 'proj_lNxW2HsF47ntT5fS2ESTf1tW'
      });
      
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

// Helper function to extract text content (same as analytics)
function extractTextContent(message: any) {
  if (!message.content || message.content.length === 0) return '';
  
  return message.content
    .filter((content: any) => content.type === 'text')
    .map((content: any) => {
      let text = content.text.value;
      
      // Clean up the system prompts/notes that appear in user messages
      text = text.replace(/ADDITIONAL NOTES FOR REFERENCE.*?USER MESSAGE: /g, '');
      text = text.replace(/.*?USER MESSAGE: /g, '');
      
      // Process citations in assistant responses (just remove them for archival)
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

    // Create service client for all database operations - AVOID RLS CIRCULAR REFERENCE
    const serviceClient = createServiceClient();

    // Verify user is a member of this team - USE SERVICE CLIENT
    const { data: teamMember, error: memberError } = await serviceClient
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
    const { data: existingAssistant, error: assistantError } = await serviceClient
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
        
        // Backup all threads before deletion
        await backupAssistantThreads(supabase, existingAssistant.assistant_id);
        
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
        await serviceClient
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

    // Create OpenAI assistant with portfolio vector store and account context
    const assistantName = `${names.teamName} - ${names.portfolioName} Assistant`;
    
    const instructions = generateAssistantInstructions(names);
    
    console.log('🤖 CREATING AI ASSISTANT:');
    console.log('==========================');
    console.log(`📝 Assistant Name: ${assistantName}`);
    console.log(`🏢 Team: ${names.teamName}`);
    console.log(`📂 Portfolio: ${names.portfolioName}`);
    console.log(`📋 Full Assistant Instructions:`);
    console.log(instructions);
    console.log('==========================');
    
    try {
      const assistantConfig: any = {
        name: assistantName,
        instructions: instructions,
        model: "gpt-4.1",
        temperature: 0.05
      };

      // Only add file search tools if we have a vector store
      if (portfolioVectorStore) {
        assistantConfig.tools = [{ type: "file_search" }];
        assistantConfig.tool_resources = {
          file_search: {
            vector_store_ids: [portfolioVectorStore.id] // Portfolio PDFs only
          }
        };
      }

      const assistant = await client.beta.assistants.create(assistantConfig);

      // Cache the portfolio assistant
      const { data: cachedAssistant, error: cacheError } = await serviceClient
        .from('team_assistants')
        .upsert({
          team_id: teamId,
          account_id: null, // Portfolio-level assistant
          portfolio_id: portfolioId,
          assistant_id: assistant.id,
          assistant_name: assistantName,
          consolidated_vector_store_id: portfolioVectorStore?.id || null,
          consolidated_vector_store_name: portfolioVectorStore?.name || null,
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
        vectorStoreId: portfolioVectorStore?.id || null,
        vectorStoreName: portfolioVectorStore?.name || null,
        cached: false,
        message: portfolioVectorStore ? 'Portfolio assistant created successfully' : 'Portfolio assistant created successfully (no PDFs available)'
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
    const serviceClient = createServiceClient();
    const { data: documents, error } = await serviceClient
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

    // Get portfolio-specific knowledge (inventory)
    const { data: portfolioKnowledgeData } = await supabase
      .from('team_knowledge')
      .select('*')
      .eq('team_id', teamId)
      .eq('account_id', accountId)
      .eq('portfolio_id', portfolioId);

    // Get account-level knowledge (instruments, technical, access)
    const { data: accountKnowledgeData } = await supabase
      .from('team_knowledge')
      .select('*')
      .eq('team_id', teamId)
      .eq('account_id', accountId)
      .eq('portfolio_id', null);

    const allKnowledgeData = [...(portfolioKnowledgeData || []), ...(accountKnowledgeData || [])];

    if (!allKnowledgeData || allKnowledgeData.length === 0) {
      console.log('No account knowledge found');
      return '';
    }

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

    // Generate text content
    const textContent = createAccountPortfolioKnowledgeText({
      teamName: names.teamName,
      accountName: account?.name || 'Unknown Account',
      portfolioName: names.portfolioName,
      knowledge: { inventory, instruments, technical, accessMisc }
    });

    console.log('🔍 GENERATED ACCOUNT KNOWLEDGE TEXT:');
    console.log('=====================================');
    console.log(textContent);
    console.log('=====================================');
    console.log(`📊 Knowledge summary for ${account?.name}:`);
    console.log(`  📦 Inventory items: ${inventory.length}`);
    console.log(`  🔧 Instruments: ${instruments.length}`);
    console.log(`  📋 Technical entries: ${technical.length}`);
    console.log(`  🚪 Access entries: ${accessMisc.length}`);
    if (instruments.length > 0) {
      console.log('  🔧 Instrument details:');
      instruments.forEach(inst => {
        console.log(`    - ${inst.name} (Qty: ${inst.quantity ?? 'N/A'}): ${inst.description}`);
      });
    }

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

    // Filter surgeon info by portfolio type (include general + relevant procedures)
    const surgeonInfo = filterSurgeonInfoByPortfolio(knowledgeData, names.portfolioName);

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
    const serviceClient = createServiceClient();
    
    // Get team name
    const { data: team } = await serviceClient
      .from('teams')
      .select('name')
      .eq('id', teamId)
      .single();

    // Get portfolio name
    const { data: portfolio } = await serviceClient
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
    const serviceClient = createServiceClient();
    const { data: latestDocuments } = await serviceClient
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
  names: { teamName: string; portfolioName: string }
): string {
  try {
    // READ THE PROMPT TEMPLATE FROM THE FILE
    const promptPath = path.join(process.cwd(), 'public', 'prompts', 'assistant-instructions.txt');
    const promptTemplate = fs.readFileSync(promptPath, 'utf8');
    
    // REPLACE THE PLACEHOLDER WITH THE ACTUAL PORTFOLIO NAME
    const instructions = promptTemplate.replace(/{PORTFOLIO_NAME}/g, names.portfolioName.toUpperCase());
    
    return instructions;
  } catch (error) {
    console.error('ERROR READING ASSISTANT INSTRUCTIONS FILE:', error);
    // FALLBACK TO HARDCODED PROMPT IF FILE READ FAILS
    return `YOU ARE A FRIENDLY AND KNOWLEDGEABLE MEDICAL ASSISTANT SPECIALIZING IN ${names.portfolioName.toUpperCase()}. THINK OF YOURSELF AS A HELPFUL COLLEAGUE WHO CAN HAVE NATURAL CONVERSATIONS ABOUT SURGICAL TECHNIQUES, PROTOCOLS, AND MEDICAL PROCEDURES.

You have access to:
1. ${names.portfolioName} portfolio documentation (PDFs) - use file search ONLY when specific document content is needed
2. Account-specific knowledge (provided in first message of thread) - this is your primary knowledge source
3. General team knowledge (provided in first message of thread)

Please provide helpful, accurate information about surgical techniques and procedures using the available documentation.`;
  }
}