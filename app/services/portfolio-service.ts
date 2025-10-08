import { createClient, createServiceClient } from '../utils/supabase/server';
import { cookies } from 'next/headers';
import { deleteOpenAIResources } from '../utils/openai';
import { StorageCleanupService } from './storage-cleanup-service';

export interface CreatePortfolioRequest {
  teamId: string;
  name: string;
  description?: string;
}

export interface UpdatePortfolioRequest {
  portfolioId: string;
  teamId: string;
  name: string;
  description?: string;
}

export interface DeletePortfolioRequest {
  portfolioId: string;
  teamId: string;
}

export interface DeleteDocumentRequest {
  documentId: string;
  teamId: string;
}

export interface PortfolioOpenAIResources {
  assistants: string[];
  vectorStores: string[];
}

export interface PortfolioDeletionResult {
  success: boolean;
  error?: string;
  openaiCleanup?: {
    deletedAssistants: string[];
    deletedVectorStores: string[];
    errors: string[];
  };
  databaseCleanup?: {
    deletedTables: string[];
    errors: string[];
  };
  storageCleanup?: {
    deletedFiles: number;
    errors: string[];
  };
}

export class PortfolioService {
  private storageCleanup: StorageCleanupService;

  constructor() {
    this.storageCleanup = new StorageCleanupService();
  }

  private async getSupabase() {
    return await createClient(cookies());
  }

  private getServiceClient() {
    return createServiceClient();
  }

  async createPortfolio(request: CreatePortfolioRequest) {
    const serviceClient = this.getServiceClient();
    
    const { data, error } = await serviceClient
      .from('team_portfolios')
      .insert({
        team_id: request.teamId,
        name: request.name.trim(),
        description: request.description?.trim() || null
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: 'Portfolio creation failed' };
    }

    return { success: true, portfolio: data };
  }

  async updatePortfolio(request: UpdatePortfolioRequest) {
    const serviceClient = this.getServiceClient();
    
    const { data, error } = await serviceClient
      .from('team_portfolios')
      .update({
        name: request.name.trim(),
        description: request.description?.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', request.portfolioId)
      .eq('team_id', request.teamId)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: 'Portfolio not found or update failed' };
    }

    return { success: true, portfolio: data };
  }

  async deletePortfolio(request: DeletePortfolioRequest): Promise<PortfolioDeletionResult> {
    console.log(`🗑️ STARTING COMPREHENSIVE PORTFOLIO DELETION: ${request.portfolioId}`);
    
    try {
      // PHASE 1: COLLECT ALL OPENAI RESOURCES
      console.log('📋 PHASE 1: COLLECTING OPENAI RESOURCES');
      const openaiResources = await this.collectOpenAIResources(request.portfolioId);
      console.log('🔍 FOUND OPENAI RESOURCES:', openaiResources);

      // PHASE 2: DELETE OPENAI RESOURCES
      console.log('🤖 PHASE 2: CLEANING UP OPENAI RESOURCES');
      const openaiCleanup = await deleteOpenAIResources(openaiResources);
      console.log('✅ OPENAI CLEANUP RESULT:', openaiCleanup);

      // PHASE 3: CLEAN UP STORAGE FILES
      console.log('🗂️ PHASE 3: CLEANING UP STORAGE FILES');
      const storageCleanup = await this.storageCleanup.cleanupPortfolioStorage(request.portfolioId, request.teamId);
      console.log('✅ STORAGE CLEANUP RESULT:', storageCleanup);

      // PHASE 4: DELETE DATABASE RECORDS IN DEPENDENCY ORDER
      console.log('🗄️ PHASE 4: CLEANING UP DATABASE RECORDS');
      const databaseCleanup = await this.cleanupDatabaseRecords(request.portfolioId, request.teamId);
      console.log('✅ DATABASE CLEANUP RESULT:', databaseCleanup);

      // DETERMINE OVERALL SUCCESS - ALL CLEANUP PHASES MUST SUCCEED
      const success = databaseCleanup.success && openaiCleanup.success && storageCleanup.success;
      const hasErrors = !openaiCleanup.success || !databaseCleanup.success || !storageCleanup.success;

      console.log(`${success ? '✅' : '❌'} PORTFOLIO DELETION COMPLETED: ${success ? 'SUCCESS' : 'PARTIAL FAILURE'}`);
      
      if (hasErrors) {
        console.log('🔍 CLEANUP ERRORS:');
        if (!openaiCleanup.success) {
          console.log('  OpenAI cleanup errors:', openaiCleanup.errors);
        }
        if (!storageCleanup.success) {
          console.log('  Storage cleanup errors:', storageCleanup.errors);
        }
        if (!databaseCleanup.success) {
          console.log('  Database cleanup errors:', databaseCleanup.errors);
        }
      }

      return {
        success,
        error: !success ? 'Portfolio deletion completed with some errors - check logs for details' : undefined,
        openaiCleanup,
        storageCleanup,
        databaseCleanup
      };

    } catch (error: any) {
      console.error('💥 CRITICAL ERROR DURING PORTFOLIO DELETION:', error);
      return {
        success: false,
        error: `Critical error during portfolio deletion: ${error.message}`
      };
    }
  }

  async deleteDocument(request: DeleteDocumentRequest) {
    const serviceClient = this.getServiceClient();
    
    try {
      // GET DOCUMENT INFO BEFORE DELETION FOR STORAGE CLEANUP
      const { data: document, error: fetchError } = await serviceClient
        .from('team_documents')
        .select('file_path, original_name')
        .eq('id', request.documentId)
        .single();

      if (fetchError) {
        return { success: false, error: `Document not found: ${fetchError.message}` };
      }

      // DELETE FROM DATABASE
      const { error } = await serviceClient
        .from('team_documents')
        .delete()
        .eq('id', request.documentId);

      if (error) {
        return { success: false, error: error.message };
      }

      // CLEAN UP STORAGE FILE
      if (document.file_path) {
        try {
          const storageResult = await this.storageCleanup.cleanupDocumentStorage([request.documentId]);
          if (!storageResult.success) {
            console.warn('⚠️ STORAGE CLEANUP FAILED FOR DOCUMENT:', document.original_name, storageResult.errors);
            // DON'T FAIL THE ENTIRE OPERATION FOR STORAGE ISSUES
          }
        } catch (storageError) {
          console.warn('⚠️ STORAGE CLEANUP ERROR FOR DOCUMENT:', document.original_name, storageError);
          // DON'T FAIL THE ENTIRE OPERATION FOR STORAGE ISSUES
        }
      }

      return { success: true };
    } catch (error: any) {
      console.error('❌ ERROR DELETING DOCUMENT:', error);
      return { success: false, error: error.message };
    }
  }

  async getPortfolios(teamId: string) {
    const serviceClient = this.getServiceClient();
    
    const { data, error } = await serviceClient
      .from('team_portfolios')
      .select(`
        *,
        team_documents (
          id,
          filename,
          original_name
        )
      `)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message, portfolios: [] };
    }

    return { success: true, portfolios: data || [] };
  }

  // COLLECT OPENAI RESOURCES LINKED TO PORTFOLIO (COMPREHENSIVE)
  private async collectOpenAIResources(portfolioId: string): Promise<PortfolioOpenAIResources> {
    const serviceClient = this.getServiceClient();
    const assistants: string[] = [];
    const vectorStores: string[] = [];

    try {
      // GET TEAM ASSISTANTS - EXTRACT ALL VECTOR STORE REFERENCES
      const { data: teamAssistants } = await serviceClient
        .from('team_assistants')
        .select('assistant_id, consolidated_vector_store_id, general_vector_store_id, account_portfolio_vector_store_id, portfolio_vector_store_id')
        .eq('portfolio_id', portfolioId);

      if (teamAssistants) {
        teamAssistants.forEach(assistant => {
          // COLLECT ASSISTANT ID
          if (assistant.assistant_id) {
            assistants.push(assistant.assistant_id);
          }
          
          // COLLECT ALL VECTOR STORE IDS (AVOID DUPLICATES)
          const vectorStoreIds = [
            assistant.consolidated_vector_store_id,
            assistant.general_vector_store_id,
            assistant.account_portfolio_vector_store_id,
            assistant.portfolio_vector_store_id
          ].filter(id => id && id.startsWith('vs_'));

          vectorStoreIds.forEach(id => {
            if (!vectorStores.includes(id)) {
              vectorStores.push(id);
            }
          });
        });
      }

      // GET DOCUMENT FILE IDS (FOR POTENTIAL OPENAI FILE CLEANUP)
      const { data: documents } = await serviceClient
        .from('team_documents')
        .select('openai_file_id')
        .eq('portfolio_id', portfolioId);

      if (documents) {
        // NOTE: We don't delete OpenAI files here as they might be shared across portfolios
        // But we log them for potential future cleanup
        const fileIds = documents.filter(doc => doc.openai_file_id).map(doc => doc.openai_file_id);
        if (fileIds.length > 0) {
          console.log('📄 FOUND OPENAI FILE IDS (NOT DELETING - MAY BE SHARED):', fileIds);
        }
      }

      console.log(`🔍 COLLECTED OPENAI RESOURCES: ${assistants.length} assistants, ${vectorStores.length} vector stores`);
      return {
        assistants,
        vectorStores
      };

    } catch (error: any) {
      console.error('❌ ERROR COLLECTING OPENAI RESOURCES:', error);
      return { assistants: [], vectorStores: [] };
    }
  }

  // CLEAN UP DATABASE RECORDS IN DEPENDENCY ORDER
  private async cleanupDatabaseRecords(portfolioId: string, teamId: string): Promise<{
    success: boolean;
    deletedTables: string[];
    errors: string[];
  }> {
    const serviceClient = this.getServiceClient();
    const deletedTables: string[] = [];
    const errors: string[] = [];

    try {
      // DELETE IN REVERSE DEPENDENCY ORDER TO RESPECT FOREIGN KEY CONSTRAINTS

      // 1. DELETE CHAT HISTORY (REFERENCES PORTFOLIO)
      const { error: chatHistoryError } = await serviceClient
        .from('chat_history')
        .delete()
        .eq('portfolio_id', portfolioId);

      if (chatHistoryError) {
        errors.push(`chat_history: ${chatHistoryError.message}`);
      } else {
        deletedTables.push('chat_history');
        console.log('✅ DELETED CHAT HISTORY');
      }

      // 2. DELETE MESSAGE RATINGS (REFERENCES PORTFOLIO)
      const { error: ratingsError } = await serviceClient
        .from('message_ratings')
        .delete()
        .eq('portfolio_id', portfolioId);

      if (ratingsError) {
        errors.push(`message_ratings: ${ratingsError.message}`);
      } else {
        deletedTables.push('message_ratings');
        console.log('✅ DELETED MESSAGE RATINGS');
      }

      // 3. DELETE NOTES (REFERENCES PORTFOLIO)
      // Notes deletion skipped - notes system removed

      // 4. DELETE TEAM ASSISTANTS (REFERENCES PORTFOLIO)
      const { error: assistantsError } = await serviceClient
        .from('team_assistants')
        .delete()
        .eq('portfolio_id', portfolioId);

      if (assistantsError) {
        errors.push(`team_assistants: ${assistantsError.message}`);
      } else {
        deletedTables.push('team_assistants');
        console.log('✅ DELETED TEAM ASSISTANTS');
      }

      // 5. DELETE ACCOUNT PORTFOLIO STORES (REFERENCES PORTFOLIO)
      const { error: storesError } = await serviceClient
        .from('account_portfolio_stores')
        .delete()
        .eq('portfolio_id', portfolioId);

      if (storesError) {
        errors.push(`account_portfolio_stores: ${storesError.message}`);
      } else {
        deletedTables.push('account_portfolio_stores');
        console.log('✅ DELETED ACCOUNT PORTFOLIO STORES');
      }

      // 6. DELETE ACCOUNT PORTFOLIOS (REFERENCES PORTFOLIO)
      const { error: accountPortfoliosError } = await serviceClient
        .from('account_portfolios')
        .delete()
        .eq('portfolio_id', portfolioId);

      if (accountPortfoliosError) {
        errors.push(`account_portfolios: ${accountPortfoliosError.message}`);
      } else {
        deletedTables.push('account_portfolios');
        console.log('✅ DELETED ACCOUNT PORTFOLIOS');
      }

      // 7. NULLIFY TEAM KNOWLEDGE PORTFOLIO REFERENCES (PRESERVE KNOWLEDGE)
      const { error: knowledgeError } = await serviceClient
        .from('team_knowledge')
        .update({ portfolio_id: null })
        .eq('portfolio_id', portfolioId);

      if (knowledgeError) {
        errors.push(`team_knowledge: ${knowledgeError.message}`);
      } else {
        deletedTables.push('team_knowledge (nullified references)');
        console.log('✅ NULLIFIED TEAM KNOWLEDGE PORTFOLIO REFERENCES');
      }

      // 8. DELETE TEAM DOCUMENTS (REFERENCES PORTFOLIO)
      const { error: documentsError } = await serviceClient
        .from('team_documents')
        .delete()
        .eq('portfolio_id', portfolioId);

      if (documentsError) {
        errors.push(`team_documents: ${documentsError.message}`);
      } else {
        deletedTables.push('team_documents');
        console.log('✅ DELETED TEAM DOCUMENTS');
      }

      // 9. DELETE PORTFOLIO (FINAL STEP)
      const { error: portfolioError } = await serviceClient
        .from('team_portfolios')
        .delete()
        .eq('id', portfolioId)
        .eq('team_id', teamId);

      if (portfolioError) {
        errors.push(`team_portfolios: ${portfolioError.message}`);
        return { success: false, deletedTables, errors };
      } else {
        deletedTables.push('team_portfolios');
        console.log('✅ DELETED PORTFOLIO');
      }

      return {
        success: errors.length === 0,
        deletedTables,
        errors
      };

    } catch (error: any) {
      console.error('❌ CRITICAL ERROR DURING DATABASE CLEANUP:', error);
      errors.push(`Critical database error: ${error.message}`);
      return { success: false, deletedTables, errors };
    }
  }
}