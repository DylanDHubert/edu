import { createServiceClient } from '../utils/supabase/server';
import OpenAI from 'openai';

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class InventoryVectorService {
  private serviceClient = createServiceClient();

  /**
   * ENSURE INVENTORY FILES ARE ADDED TO A VECTOR STORE
   */
  async ensureInventoryInVectorStore(vectorStoreId: string, teamId: string): Promise<{
    success: boolean;
    addedFiles: string[];
    error?: string;
  }> {
    try {
      // Get all completed inventory documents for this team
      const { data: inventoryDocuments, error: inventoryError } = await this.serviceClient
        .from('team_documents')
        .select('id, original_name, openai_file_id')
        .eq('team_id', teamId)
        .eq('document_type', 'inventory')
        .not('openai_file_id', 'is', null)
        .not('openai_file_id', 'eq', 'processing')
        .not('openai_file_id', 'eq', 'failed');

      if (inventoryError) {
        console.error('Error fetching inventory documents:', inventoryError);
        return {
          success: false,
          addedFiles: [],
          error: 'Failed to fetch inventory documents'
        };
      }

      if (!inventoryDocuments || inventoryDocuments.length === 0) {
        // No inventory documents to add
        return {
          success: true,
          addedFiles: []
        };
      }

      // Get current files in the vector store
      const vectorStoreFiles = await (openaiClient as any).vectorStores.files.list(vectorStoreId);
      const existingFileIds = new Set(vectorStoreFiles.data.map((file: any) => file.id));

      const addedFiles: string[] = [];

      // Add each inventory file that's not already in the vector store
      for (const inventoryDoc of inventoryDocuments) {
        if (!existingFileIds.has(inventoryDoc.openai_file_id)) {
          try {
            await (openaiClient as any).vectorStores.files.create(vectorStoreId, {
              file_id: inventoryDoc.openai_file_id
            });
            
            addedFiles.push(inventoryDoc.openai_file_id);
            console.log(`Added inventory file to vector store: ${inventoryDoc.original_name} (${inventoryDoc.openai_file_id})`);
          } catch (addError) {
            console.error(`Failed to add inventory file ${inventoryDoc.original_name} to vector store:`, addError);
            // Continue with other files even if one fails
          }
        }
      }

      return {
        success: true,
        addedFiles
      };

    } catch (error) {
      console.error('Error ensuring inventory in vector store:', error);
      return {
        success: false,
        addedFiles: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * GET LATEST INVENTORY DOCUMENT FOR A TEAM
   */
  async getLatestInventoryDocument(teamId: string): Promise<{
    id: string;
    original_name: string;
    openai_file_id: string;
    created_at: string;
  } | null> {
    try {
      const { data: document, error } = await this.serviceClient
        .from('team_documents')
        .select('id, original_name, openai_file_id, created_at')
        .eq('team_id', teamId)
        .eq('document_type', 'inventory')
        .not('openai_file_id', 'is', null)
        .not('openai_file_id', 'eq', 'processing')
        .not('openai_file_id', 'eq', 'failed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !document) {
        return null;
      }

      return document;
    } catch (error) {
      console.error('Error getting latest inventory document:', error);
      return null;
    }
  }

  /**
   * CHECK IF VECTOR STORE HAS INVENTORY FILES
   */
  async checkVectorStoreHasInventory(vectorStoreId: string, teamId: string): Promise<boolean> {
    try {
      // Get latest inventory document
      const latestInventory = await this.getLatestInventoryDocument(teamId);
      
      if (!latestInventory) {
        return true; // No inventory to check, consider it "has inventory"
      }

      // Check if this file exists in the vector store
      const vectorStoreFiles = await (openaiClient as any).vectorStores.files.list(vectorStoreId);
      return vectorStoreFiles.data.some((file: any) => file.id === latestInventory.openai_file_id);

    } catch (error) {
      console.error('Error checking vector store inventory:', error);
      return false; // Assume it doesn't have inventory if we can't check
    }
  }
}
