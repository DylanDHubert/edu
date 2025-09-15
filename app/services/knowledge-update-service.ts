import { KnowledgeMDService } from './knowledge-md-service';
import { VectorStoreService } from './vector-store-service';

export interface KnowledgeUpdateResult {
  success: boolean;
  wasUpdated: boolean;
  error?: string;
}

export class KnowledgeUpdateService {
  private mdService = new KnowledgeMDService();
  private vectorService = new VectorStoreService();

  /**
   * CHECK IF KNOWLEDGE IS STALE AND UPDATE IF NEEDED
   */
  async updateKnowledgeIfStale(
    teamId: string,
    accountId: string,
    portfolioId: string,
    vectorStoreId: string,
    userId: string
  ): Promise<KnowledgeUpdateResult> {
    try {
      // Get latest knowledge timestamp
      const latestKnowledgeTime = await this.mdService.getLatestKnowledgeTimestamp(teamId, portfolioId);
      
      // Get current tracking info
      const trackingInfo = await this.vectorService.getKnowledgeFileInfo(teamId, portfolioId);

      // Determine if update is needed
      let needsUpdate = false;
      
      if (!trackingInfo || !trackingInfo.lastGenerated) {
        needsUpdate = true;
      } else if (latestKnowledgeTime && latestKnowledgeTime > trackingInfo.lastGenerated) {
        needsUpdate = true;
      } else {
        needsUpdate = false;
      }

      if (!needsUpdate) {
        return {
          success: true,
          wasUpdated: false
        };
      }

      // Generate new markdown content
      const mdResult = await this.mdService.generateKnowledgeMarkdown(
        teamId,
        accountId,
        portfolioId,
        userId
      );

      if (!mdResult.success || !mdResult.markdown || !mdResult.filename) {
        return {
          success: false,
          wasUpdated: false,
          error: mdResult.error || 'Failed to generate markdown'
        };
      }

      // Update vector store with new content
      const updateResult = await this.vectorService.updateKnowledgeFile(
        vectorStoreId,
        mdResult.filename,
        mdResult.markdown,
        teamId,
        portfolioId
      );

      if (!updateResult.success || !updateResult.fileId) {
        return {
          success: false,
          wasUpdated: false,
          error: updateResult.error || 'Failed to update vector store'
        };
      }

      // Track the new file
      await this.vectorService.trackKnowledgeFile(
        teamId,
        portfolioId,
        mdResult.filename,
        updateResult.fileId
      );

      return {
        success: true,
        wasUpdated: true
      };

    } catch (error) {
      console.error('❌ Error in knowledge update service:', error);
      return {
        success: false,
        wasUpdated: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}
