import { createServiceClient } from '../utils/supabase/server';
import { OpenAIService } from './openai-service';
import { VectorStoreService } from './vector-store-service';
import { 
  CreateAssistantRequest, 
  AssistantResult, 
  AssistantConfig, 
  BackupThread,
  ThreadMessage 
} from '../types/assistant';
import fs from 'fs';
import path from 'path';

export class AssistantService {
  private serviceClient = createServiceClient();
  private openaiService = new OpenAIService();
  private vectorService = new VectorStoreService();

  /**
   * CREATE DYNAMIC ASSISTANT
   */
  async createDynamicAssistant(params: CreateAssistantRequest): Promise<AssistantResult> {
    try {
      const { courseId, portfolioId, userId } = params;
      
      if (!userId) {
        return {
          success: false,
          error: 'User ID is required for assistant creation'
        };
      }

      // Get names for context
      // Get course and portfolio names
      const [courseResult, portfolioResult] = await Promise.all([
        this.serviceClient.from('courses').select('name').eq('id', courseId).single(),
        this.serviceClient.from('course_portfolios').select('name').eq('id', portfolioId).single()
      ]);
      
      const names = {
        courseName: courseResult.data?.name || 'Unknown course',
        portfolioName: portfolioResult.data?.name || 'Unknown Portfolio'
      };

      // Check if we already have a cached portfolio assistant
      const { data: existingAssistant, error: assistantError } = await this.serviceClient
        .from('course_assistants')
        .select('*')
        .eq('course_id', courseId)
        .eq('portfolio_id', portfolioId)
        .single();

      if (existingAssistant && !assistantError) {
        // Check if cache is stale
        console.log('Using cached assistant:', existingAssistant.openai_assistant_id);
        
        return {
          success: true,
          assistantId: existingAssistant.openai_assistant_id
        };
      } else {
        console.log('No cached assistant found, creating new one...');
      }

      // Generate context based on portfolio
      let context: string;
      let vectorStoreId: string | null | undefined;

      if (portfolioId) {
        // Portfolio-specific assistant
        // Generate simple context without manual knowledge
        const generalContext = {
          courseInfo: `course: ${names.courseName}`,
          knowledgeText: 'Knowledge comes from uploaded documents only.'
        };
        context = this.buildPortfolioContext(generalContext, names);
        
        // Create vector store for portfolio documents
        const vectorResult = await this.vectorService.createPortfolioVectorStore(
          courseId, 
          portfolioId, 
          names
        );
        vectorStoreId = vectorResult.vectorStoreId;
        
        // Update portfolio with vector store ID if created
        if (vectorStoreId) {
          await this.serviceClient
            .from('course_portfolios')
            .update({ vector_store_id: vectorStoreId })
            .eq('id', portfolioId);
        }
      } else {
        // General course assistant
        // Generate simple context without manual knowledge
        const generalContext = {
          courseInfo: `course: ${names.courseName}`,
          knowledgeText: 'Knowledge comes from uploaded documents only.'
        };
        context = this.buildGeneralContext(generalContext, names);
      }

      // Generate assistant instructions
      const instructions = this.generateAssistantInstructions(context, names);

      // Create assistant configuration
      const assistantConfig: AssistantConfig = {
        name: `${names.courseName} - ${names.portfolioName} Assistant`,
        instructions,
        model: 'gpt-4.1',
        tools: vectorStoreId ? [
          { type: 'file_search' }
        ] : [],
        tool_resources: vectorStoreId ? {
          file_search: {
            vector_store_ids: [vectorStoreId]
          }
        } : undefined
      };

      // Create the assistant
      const assistant = await this.openaiService.createAssistant(assistantConfig);

      // Cache the portfolio assistant (no vector store ID - use portfolio's vector store)
      const { data: cachedAssistant, error: cacheError } = await this.serviceClient
        .from('course_assistants')
        .upsert({
          course_id: courseId,
          portfolio_id: portfolioId,
          openai_assistant_id: assistant.id,
          name: assistantConfig.name,
          created_at: new Date().toISOString()
        });

      if (cacheError) {
        console.error('Error caching assistant:', cacheError);
      }

      return {
        success: true,
        assistantId: assistant.id
      };

    } catch (error) {
      console.error('Error creating dynamic assistant:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * BACKUP ASSISTANT THREADS
   */
  async backupAssistantThreads(assistantId: string): Promise<void> {
    try {
      console.log(`🔄 Starting backup for assistant: ${assistantId}`);
      
      // Get all chat_history records for this assistant
      const { data: chats, error: chatsError } = await this.serviceClient
        .from('chat_history')
        .select('thread_id, title, user_id, course_id, portfolio_id, created_at')
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
          const messages = await this.openaiService.getThreadMessages(chat.thread_id);
          if (!messages) {
            console.log(`⚠️ Thread ${chat.thread_id} not found in OpenAI, skipping`);
            failedThreads++;
            continue;
          }

          // Create backup record
          const backupData: BackupThread = {
            thread_id: chat.thread_id,
            title: chat.title,
            user_id: chat.user_id,
            course_id: chat.course_id,
            portfolio_id: chat.portfolio_id,
            created_at: chat.created_at,
            messages: messages
          };

          // Save to archived_messages table
          await this.serviceClient
            .from('archived_messages')
            .insert({
              thread_id: chat.thread_id,
              title: chat.title,
              user_id: chat.user_id,
              course_id: chat.course_id,
              portfolio_id: chat.portfolio_id,
              created_at: chat.created_at,
              messages: JSON.stringify(backupData),
              assistant_id: assistantId
            });

          backedUpThreads++;
          console.log(`✅ Backed up thread: ${chat.thread_id}`);

        } catch (threadError) {
          console.error(`❌ Error backing up thread ${chat.thread_id}:`, threadError);
          failedThreads++;
        }
      }

      console.log(`📊 Backup complete: ${backedUpThreads} successful, ${failedThreads} failed`);

    } catch (error) {
      console.error('❌ Error in backup process:', error);
    }
  }

  /**
   * BUILD PORTFOLIO CONTEXT
   */
  private buildPortfolioContext(context: any, names: any): string {
    return `
course: ${names.courseName}
PORTFOLIO: ${names.portfolioName}

course INFORMATION:
${context.courseInfo}

GENERAL KNOWLEDGE:
${context.knowledgeText}
    `.trim();
  }

  /**
   * BUILD GENERAL CONTEXT
   */
  private buildGeneralContext(context: any, names: any): string {
    return `
course: ${names.courseName}

course INFORMATION:
${context.courseInfo}

GENERAL KNOWLEDGE:
${context.knowledgeText}
    `.trim();
  }

  /**
   * GENERATE ASSISTANT INSTRUCTIONS
   */
  private generateAssistantInstructions(context: string, names: any): string {
    const baseInstructions = fs.readFileSync(
      path.join(process.cwd(), 'public/prompts/assistant-instructions.txt'), 
      'utf-8'
    );

    return baseInstructions
      .replace('{{course_NAME}}', names.courseName)
      .replace('{{PORTFOLIO_NAME}}', names.portfolioName)
      .replace('{{CONTEXT}}', context);
  }

  /**
   * UPDATE KNOWLEDGE MD FILE IF NEEDED
   */
  private async updateKnowledgeIfNeeded(
    courseId: string,
    portfolioId: string,
    vectorStoreId: string,
    userId: string
  ): Promise<void> {
    try {
      // Skip knowledge update - no manual knowledge system
      console.log('Knowledge update skipped - using document-based knowledge only');
      
    } catch (error) {
      console.error('Error updating knowledge:', error);
      // Don't fail the assistant creation if knowledge update fails
    }
  }
}
