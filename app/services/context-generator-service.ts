import { createServiceClient } from '../utils/supabase/server';
import { createAccountPortfolioKnowledgeText, createGeneralKnowledgeText, filterSurgeonInfoByPortfolio } from '../utils/knowledge-generator';
import { TeamNames, AccountContext, GeneralContext } from '../types/assistant';

export class ContextGeneratorService {
  private serviceClient = createServiceClient();

  /**
   * GET TEAM AND PORTFOLIO NAMES
   */
  async getNames(teamId: string, portfolioId: string): Promise<TeamNames> {
    try {
      // Get team name
      const { data: team } = await this.serviceClient
        .from('teams')
        .select('name')
        .eq('id', teamId)
        .single();

      // Get portfolio name
      const { data: portfolio } = await this.serviceClient
        .from('team_portfolios')
        .select('name')
        .eq('id', portfolioId)
        .single();

      return {
        teamName: team?.name || 'Unknown Team',
        portfolioName: portfolio?.name || 'Unknown Portfolio'
      };
    } catch (error) {
      console.error('Error getting names:', error);
      return {
        teamName: 'Unknown Team',
        portfolioName: 'Unknown Portfolio'
      };
    }
  }

  /**
   * GENERATE ACCOUNT CONTEXT
   */
  async generateAccountContext(teamId: string, accountId: string, portfolioId: string, names: TeamNames): Promise<AccountContext> {
    try {
      // Get account information
      const { data: account } = await this.serviceClient
        .from('team_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('team_id', teamId)
        .single();

      // Get portfolio information
      const { data: portfolio } = await this.serviceClient
        .from('team_portfolios')
        .select('*')
        .eq('id', portfolioId)
        .eq('team_id', teamId)
        .single();

      // Get surgeons for this account
      const { data: surgeons } = await this.serviceClient
        .from('surgeons')
        .select('*')
        .eq('team_id', teamId);

      // Filter surgeons by portfolio
      const filteredSurgeons = filterSurgeonInfoByPortfolio(surgeons || [], portfolioId);

      // Generate knowledge text - this function doesn't exist in the current form
      // We'll need to implement this or use a different approach
      const knowledgeText = 'Knowledge generation not yet implemented';

      return {
        accountInfo: account ? `Account: ${account.name}\nDescription: ${account.description || 'No description'}` : 'No account information',
        portfolioInfo: portfolio ? `Portfolio: ${portfolio.name}\nDescription: ${portfolio.description || 'No description'}` : 'No portfolio information',
        surgeonInfo: filteredSurgeons.length > 0 ? `Surgeons: ${filteredSurgeons.map(s => s.title || 'Unknown').join(', ')}` : 'No surgeons assigned',
        knowledgeText: knowledgeText || 'No additional knowledge available'
      };
    } catch (error) {
      console.error('Error generating account context:', error);
      return {
        accountInfo: 'Error loading account information',
        portfolioInfo: 'Error loading portfolio information',
        surgeonInfo: 'Error loading surgeon information',
        knowledgeText: 'Error loading knowledge'
      };
    }
  }

  /**
   * GENERATE GENERAL CONTEXT
   */
  async generateGeneralContext(teamId: string, names: TeamNames): Promise<GeneralContext> {
    try {
      // Get team information
      const { data: team } = await this.serviceClient
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

      // Generate general knowledge text - this function doesn't exist in the current form
      // We'll need to implement this or use a different approach
      const knowledgeText = 'General knowledge generation not yet implemented';

      return {
        teamInfo: team ? `Team: ${team.name}\nDescription: ${team.description || 'No description'}` : 'No team information',
        knowledgeText: knowledgeText || 'No general knowledge available'
      };
    } catch (error) {
      console.error('Error generating general context:', error);
      return {
        teamInfo: 'Error loading team information',
        knowledgeText: 'Error loading general knowledge'
      };
    }
  }

  /**
   * CHECK IF CACHE IS STALE
   */
  async checkIfCacheIsStale(teamId: string, portfolioId: string): Promise<boolean> {
    try {
      // Check if any portfolio documents were uploaded/updated after assistant creation
      const { data: latestDocuments } = await this.serviceClient
        .from('team_documents')
        .select('created_at')
        .eq('team_id', teamId)
        .eq('portfolio_id', portfolioId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!latestDocuments || latestDocuments.length === 0) {
        return false; // No documents, cache is not stale
      }

      // Get the assistant creation time
      const { data: assistant } = await this.serviceClient
        .from('team_assistants')
        .select('created_at')
        .eq('team_id', teamId)
        .eq('portfolio_id', portfolioId)
        .single();

      if (!assistant) {
        return true; // No cached assistant, need to create one
      }

      const latestDocumentDate = new Date(latestDocuments[0].created_at);
      const assistantCreatedDate = new Date(assistant.created_at);

      // Cache is stale if documents were uploaded after assistant creation
      return latestDocumentDate > assistantCreatedDate;
    } catch (error) {
      console.error('Error checking cache staleness:', error);
      return true; // Assume stale if we can't check
    }
  }
}
