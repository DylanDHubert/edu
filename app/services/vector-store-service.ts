import { createServiceClient } from '../utils/supabase/server';
import { OpenAIService } from './openai-service';
import { PortfolioDocument, VectorStoreResult } from '../types/assistant';
import OpenAI from 'openai';

export class VectorStoreService {
  private serviceClient = createServiceClient();
  private openaiService = new OpenAIService();
  private openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

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

  /**
   * UPDATE KNOWLEDGE MD FILE IN VECTOR STORE
   * Uses tracking table to find exact file to replace, never touches PDF files
   */
  async updateKnowledgeFile(
    vectorStoreId: string, 
    filename: string, 
    markdownContent: string,
    teamId: string,
    portfolioId: string
  ): Promise<{ success: boolean; fileId?: string; error?: string }> {
    try {
      // Get existing knowledge file info from our tracking table
      const existingInfo = await this.getKnowledgeFileInfo(teamId, portfolioId);
      
      // If we have an existing knowledge file tracked, delete it from vector store
      if (existingInfo && existingInfo.openaiFileId) {
        try {
          console.log('🗑️ Deleting existing knowledge file:', existingInfo.filename);
          await (this.openaiClient as any).vectorStores.files.del(vectorStoreId, existingInfo.openaiFileId);
        } catch (deleteError) {
          console.error('Failed to delete existing knowledge file, continuing with upload:', deleteError);
        }
      }

      // Create new file with markdown content
      const file = await this.openaiClient.files.create({
        file: new File([markdownContent], filename, { type: 'text/markdown' }),
        purpose: 'assistants'
      });

      // Add new file to vector store
      await (this.openaiClient as any).vectorStores.files.create(vectorStoreId, {
        file_id: file.id
      });

      return {
        success: true,
        fileId: file.id
      };

    } catch (error) {
      console.error('❌ Error updating knowledge file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * TRACK KNOWLEDGE FILE IN DATABASE
   */
  async trackKnowledgeFile(
    teamId: string,
    portfolioId: string,
    filename: string,
    openaiFileId: string
  ): Promise<void> {
    try {
      await this.serviceClient
        .from('portfolio_knowledge_files')
        .upsert({
          team_id: teamId,
          portfolio_id: portfolioId,
          filename: filename,
          openai_file_id: openaiFileId,
          last_generated_at: new Date().toISOString()
        }, {
          onConflict: 'team_id,portfolio_id'
        });

    } catch (error) {
      console.error('Error tracking knowledge file:', error);
      throw error;
    }
  }

  /**
   * GET KNOWLEDGE FILE TRACKING INFO
   */
  async getKnowledgeFileInfo(teamId: string, portfolioId: string): Promise<{
    filename?: string;
    openaiFileId?: string;
    lastGenerated?: Date;
  } | null> {
    try {
      const { data, error } = await this.serviceClient
        .from('portfolio_knowledge_files')
        .select('filename, openai_file_id, last_generated_at')
        .eq('team_id', teamId)
        .eq('portfolio_id', portfolioId)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        filename: data.filename,
        openaiFileId: data.openai_file_id,
        lastGenerated: data.last_generated_at ? new Date(data.last_generated_at) : undefined
      };
    } catch (error) {
      console.error('Error getting knowledge file info:', error);
      return null;
    }
  }
}
