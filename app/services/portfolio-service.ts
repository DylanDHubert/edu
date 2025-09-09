import { createClient, createServiceClient } from '../utils/supabase/server';
import { cookies } from 'next/headers';

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

  async deletePortfolio(request: DeletePortfolioRequest) {
    const serviceClient = this.getServiceClient();
    
    const { error } = await serviceClient
      .from('team_portfolios')
      .delete()
      .eq('id', request.portfolioId)
      .eq('team_id', request.teamId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
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
}