import { createServiceClient } from '../utils/supabase/server';
import { OpenAIService } from './openai-service';
import { PortfolioDocument, VectorStoreResult } from '../types/assistant';

export class VectorStoreService {
  private serviceClient = createServiceClient();
  private openaiService = new OpenAIService();

  /**
   * GATHER PORTFOLIO DOCUMENTS
   */
  async gatherPortfolioDocuments(teamId: string, portfolioId: string): Promise<PortfolioDocument[]> {
    try {
      const { data: documents, error } = await this.serviceClient
        .from('team_documents')
        .select('openai_file_id, original_name')
        .eq('team_id', teamId)
        .eq('portfolio_id', portfolioId)
        .not('openai_file_id', 'is', null)
        .not('openai_file_id', 'eq', 'processing')
        .not('openai_file_id', 'eq', 'failed');

      if (error) {
        console.error('Error gathering portfolio documents:', error);
        return [];
      }

      // FILTER OUT ANY DOCUMENTS THAT DON'T HAVE VALID OPENAI FILE IDS
      const validDocuments = (documents || []).filter(doc => 
        doc.openai_file_id && 
        doc.openai_file_id.startsWith('file-')
      );

      return validDocuments;
    } catch (error) {
      console.error('Error gathering portfolio documents:', error);
      return [];
    }
  }

  /**
   * CREATE PORTFOLIO VECTOR STORE
   */
  async createPortfolioVectorStore(teamId: string, portfolioId: string, names: any): Promise<VectorStoreResult> {
    try {
      // Gather documents for this portfolio
      const documents = await this.gatherPortfolioDocuments(teamId, portfolioId);
      
      if (documents.length === 0) {
        throw new Error('No documents found for this portfolio');
      }

      // Create vector store
      const vectorStoreName = `${names.teamName} - ${names.portfolioName} Portfolio`;
      const vectorStore = await this.openaiService.createVectorStore(vectorStoreName);

      // Add files to vector store
      const fileIds = documents.map(doc => doc.openai_file_id);
      await this.openaiService.addFilesToVectorStore(vectorStore.id, fileIds);

      return {
        vectorStoreId: vectorStore.id,
        fileIds: fileIds
      };
    } catch (error) {
      console.error('Error creating portfolio vector store:', error);
      throw error;
    }
  }

  /**
   * GET VECTOR STORE STATUS
   */
  async getVectorStoreStatus(vectorStoreId: string): Promise<any> {
    try {
      return await this.openaiService.getVectorStore(vectorStoreId);
    } catch (error) {
      console.error('Error getting vector store status:', error);
      return null;
    }
  }

  /**
   * DELETE VECTOR STORE
   */
  async deleteVectorStore(vectorStoreId: string): Promise<void> {
    try {
      // Note: OpenAI doesn't have a direct delete method for vector stores
      // They are automatically cleaned up after a period of inactivity
      console.log(`Vector store ${vectorStoreId} will be automatically cleaned up by OpenAI`);
    } catch (error) {
      console.error('Error deleting vector store:', error);
      throw error;
    }
  }
}
