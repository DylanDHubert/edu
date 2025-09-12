import { createClient, createServiceClient } from '../utils/supabase/server';
import { cookies } from 'next/headers';
import { deleteOpenAIResources } from '../utils/openai';

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
}

export class PortfolioService {
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

      // PHASE 3: DELETE DATABASE RECORDS IN DEPENDENCY ORDER
      console.log('🗄️ PHASE 3: CLEANING UP DATABASE RECORDS');
      const databaseCleanup = await this.cleanupDatabaseRecords(request.portfolioId, request.teamId);
      console.log('✅ DATABASE CLEANUP RESULT:', databaseCleanup);

      // DETERMINE OVERALL SUCCESS
      const success = databaseCleanup.success;
      const hasErrors = !openaiCleanup.success || !databaseCleanup.success;

      console.log(`${success ? '✅' : '❌'} PORTFOLIO DELETION COMPLETED: ${success ? 'SUCCESS' : 'PARTIAL FAILURE'}`);

      return {
        success,
        error: !success ? 'Portfolio deletion completed with some errors' : undefined,
        openaiCleanup,
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
    
    const { error } = await serviceClient
      .from('team_documents')
      .delete()
      .eq('id', request.documentId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
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

  // COLLECT OPENAI RESOURCES LINKED TO PORTFOLIO (SIMPLIFIED)
  private async collectOpenAIResources(portfolioId: string): Promise<PortfolioOpenAIResources> {
    const serviceClient = this.getServiceClient();
    const assistants: string[] = [];
    const vectorStores: string[] = [];

    try {
      // GET TEAM ASSISTANTS - ONLY EXTRACT THE TWO VALUES THAT MATTER
      const { data: teamAssistants } = await serviceClient
        .from('team_assistants')
        .select('assistant_id, consolidated_vector_store_id')
        .eq('portfolio_id', portfolioId);

      if (teamAssistants) {
        teamAssistants.forEach(assistant => {
          // COLLECT ASSISTANT ID
          if (assistant.assistant_id) {
            assistants.push(assistant.assistant_id);
          }
          
          // COLLECT ONLY THE CONSOLIDATED VECTOR STORE (THE REAL ONE)
          if (assistant.consolidated_vector_store_id && assistant.consolidated_vector_store_id.startsWith('vs_')) {
            vectorStores.push(assistant.consolidated_vector_store_id);
          }
        });
      }

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
      // DELETE IN REVERSE DEPENDENCY ORDER

      // 1. DELETE TEAM ASSISTANTS
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

      // 2. DELETE ACCOUNT PORTFOLIO STORES
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

      // 3. DELETE ACCOUNT PORTFOLIOS
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

      // 4. NULLIFY TEAM KNOWLEDGE PORTFOLIO REFERENCES (DON'T DELETE KNOWLEDGE)
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

      // 5. DELETE TEAM DOCUMENTS
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

      // 6. DELETE PORTFOLIO (NOTES AND MESSAGE_RATINGS SHOULD ALREADY BE TRANSFERRED)
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