import { createServiceClient } from '../utils/supabase/server';
import { createAccountPortfolioKnowledgeText, createGeneralKnowledgeText, filterSurgeonInfoByPortfolio } from '../utils/knowledge-generator';
import { getNotesForTeamContext, formatNotesForContext } from '../utils/notes-server';

export interface KnowledgeMDResult {
  success: boolean;
  markdown?: string;
  filename?: string;
  error?: string;
}

export class KnowledgeMDService {
  private serviceClient = createServiceClient();

  /**
   * GENERATE MARKDOWN FILE FOR TEAM KNOWLEDGE + NOTES
   * Replaces legacy context injection with vector store MD files
   */
  async generateKnowledgeMarkdown(
    teamId: string,
    accountId: string,
    portfolioId: string,
    userId: string
  ): Promise<KnowledgeMDResult> {
    try {
      // Get team and portfolio names for filename
      const [teamResult, portfolioResult, accountResult] = await Promise.all([
        this.serviceClient.from('teams').select('name').eq('id', teamId).single(),
        this.serviceClient.from('team_portfolios').select('name').eq('id', portfolioId).single(),
        this.serviceClient.from('team_accounts').select('name').eq('id', accountId).single()
      ]);

      if (!teamResult.data || !portfolioResult.data || !accountResult.data) {
        return {
          success: false,
          error: 'Failed to fetch team, portfolio, or account information'
        };
      }

      const teamName = teamResult.data.name;
      const portfolioName = portfolioResult.data.name;
      const accountName = accountResult.data.name;

      // Generate filename
      const filename = `team-${teamName}-portfolio-${portfolioName}-knowledge.md`;

      // Get all knowledge data
      const [portfolioSpecificKnowledgeResult, accountLevelKnowledgeResult, generalKnowledgeResult] = await Promise.all([
        // Portfolio-specific knowledge (inventory, instruments, technical)
        this.serviceClient
          .from('team_knowledge')
          .select('*')
          .eq('team_id', teamId)
          .eq('account_id', accountId)
          .eq('portfolio_id', portfolioId),
        
        // Account-level knowledge (access & misc only)
        this.serviceClient
          .from('team_knowledge')
          .select('*')
          .eq('team_id', teamId)
          .eq('account_id', accountId)
          .is('portfolio_id', null),
        
        // General team knowledge (surgeon info)
        this.serviceClient
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

      // Generate team knowledge text
      let teamKnowledgeText = '';
      
      if (inventory.length > 0 || instruments.length > 0 || technical.length > 0 || accessMisc.length > 0) {
        teamKnowledgeText += createAccountPortfolioKnowledgeText({
          teamName,
          accountName,
          portfolioName,
          knowledge: { inventory, instruments, technical, accessMisc }
        });
        teamKnowledgeText += '\n\n';
      }

      // Generate general team knowledge (surgeon info)
      const surgeonKnowledgeData = allKnowledgeData.filter((k: any) => k.category === 'surgeon_info');
      if (surgeonKnowledgeData.length > 0) {
        const filteredSurgeonInfo = filterSurgeonInfoByPortfolio(surgeonKnowledgeData, portfolioName);
        
        if (filteredSurgeonInfo.length > 0) {
          teamKnowledgeText += createGeneralKnowledgeText({
            teamName,
            surgeonInfo: filteredSurgeonInfo
          });
        }
      }

      // Get notes for team context
      const notes = await getNotesForTeamContext(teamId, accountId, portfolioId, userId);
      const notesContext = formatNotesForContext(notes);
      
      // Build final markdown content
      let markdownContent = `# ${teamName} - ${portfolioName} Knowledge Base\n\n`;
      markdownContent += `*Generated for ${accountName} - ${portfolioName} portfolio*\n\n`;
      markdownContent += `---\n\n`;

      if (teamKnowledgeText.trim()) {
        markdownContent += `## Team Knowledge\n\n`;
        markdownContent += teamKnowledgeText;
        markdownContent += `\n\n---\n\n`;
      }

      if (notesContext) {
        markdownContent += `## Additional Notes\n\n`;
        // Clean up the notes context formatting for markdown
        const cleanNotesContext = notesContext
          .replace('ADDITIONAL NOTES FOR REFERENCE:', '')
          .replace(/IMPORTANT: WHEN REFERENCING NOTES WITH IMAGES.*$/, '')
          .trim();
        markdownContent += cleanNotesContext;
        markdownContent += `\n\n---\n\n`;
      }

      markdownContent += `*Last updated: ${new Date().toISOString()}*\n`;

      return {
        success: true,
        markdown: markdownContent,
        filename
      };

    } catch (error) {
      console.error('Error generating knowledge markdown:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * GET LATEST KNOWLEDGE TIMESTAMP FOR STALENESS CHECK
   */
  async getLatestKnowledgeTimestamp(teamId: string, portfolioId: string): Promise<Date | null> {
    try {
      // Get latest timestamp from team_knowledge
      const { data: knowledgeData } = await this.serviceClient
        .from('team_knowledge')
        .select('updated_at')
        .eq('team_id', teamId)
        .eq('portfolio_id', portfolioId)
        .order('updated_at', { ascending: false })
        .limit(1);

      // Get latest timestamp from notes
      const { data: notesData } = await this.serviceClient
        .from('notes')
        .select('updated_at')
        .eq('team_id', teamId)
        .eq('portfolio_id', portfolioId)
        .order('updated_at', { ascending: false })
        .limit(1);

      const timestamps = [];
      if (knowledgeData && knowledgeData.length > 0) {
        timestamps.push(new Date(knowledgeData[0].updated_at));
      }
      if (notesData && notesData.length > 0) {
        timestamps.push(new Date(notesData[0].updated_at));
      }

      if (timestamps.length === 0) {
        return null;
      }

      // Return the most recent timestamp
      return new Date(Math.max(...timestamps.map(t => t.getTime())));

    } catch (error) {
      console.error('Error getting latest knowledge timestamp:', error);
      return null;
    }
  }
}
