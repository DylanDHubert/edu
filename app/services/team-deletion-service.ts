import { createServiceClient } from '../utils/supabase/server';
import { OpenAICleanupService } from './openai-cleanup-service';
import { StorageCleanupService } from './storage-cleanup-service';
import OpenAI from 'openai';

export interface DeletionOptions {
  deleteExternalResources: boolean;
  userId: string;
  teamName: string;
}

export interface DeletionResult {
  success: boolean;
  error?: string;
  deletedResources?: {
    assistants: number;
    vectorStores: number;
    files: number;
    databaseRecords: number;
    storageFiles: number;
  };
  cleanupSummary?: {
    openai: {
      assistantsDeleted: number;
      vectorStoresDeleted: number;
      filesDeleted: number;
      errors: string[];
    };
    storage: {
      documentsDeleted: number;
      imagesDeleted: number;
      errors: string[];
    };
    database: {
      tablesCleaned: string[];
      recordsDeleted: number;
      errors: string[];
    };
  };
  partialCleanup?: boolean;
}

export class TeamDeletionService {
  private serviceClient = createServiceClient();
  private openaiCleanup: OpenAICleanupService;
  private storageCleanup: StorageCleanupService;

  constructor(serviceClient?: any) {
    if (serviceClient) {
      this.serviceClient = serviceClient;
    }
    this.openaiCleanup = new OpenAICleanupService();
    this.storageCleanup = new StorageCleanupService();
  }

  /**
   * MAIN TEAM DELETION METHOD
   */
  async deleteTeam(teamId: string, options: DeletionOptions): Promise<DeletionResult> {
    const startTime = Date.now();

    const result: DeletionResult = {
      success: false,
      deletedResources: {
        assistants: 0,
        vectorStores: 0,
        files: 0,
        databaseRecords: 0,
        storageFiles: 0
      },
      cleanupSummary: {
        openai: { assistantsDeleted: 0, vectorStoresDeleted: 0, filesDeleted: 0, errors: [] },
        storage: { documentsDeleted: 0, imagesDeleted: 0, errors: [] },
        database: { tablesCleaned: [], recordsDeleted: 0, errors: [] }
      }
    };

    try {
      // PHASE 1: GATHER ALL TEAM DATA FOR CLEANUP
      const teamData = await this.gatherTeamData(teamId);
      if (!teamData) {
        result.error = 'Team not found';
        return result;
      }


      // PHASE 2: CLEANUP EXTERNAL RESOURCES (IF REQUESTED)
      if (options.deleteExternalResources) {
        
        // CLEANUP OPENAI RESOURCES
        const openaiResult = await this.openaiCleanup.cleanupTeamResources(teamData);
        result.cleanupSummary!.openai = openaiResult;
        result.deletedResources!.assistants = openaiResult.assistantsDeleted;
        result.deletedResources!.vectorStores = openaiResult.vectorStoresDeleted;
        result.deletedResources!.files = openaiResult.filesDeleted;

        // CLEANUP STORAGE RESOURCES
        const storageResult = await this.storageCleanup.cleanupTeamStorage(teamData);
        result.cleanupSummary!.storage = storageResult;
        result.deletedResources!.storageFiles = storageResult.documentsDeleted + storageResult.imagesDeleted;
      }

      // PHASE 3: CLEANUP DATABASE RECORDS
      const dbResult = await this.cleanupDatabaseRecords(teamId, teamData);
      result.cleanupSummary!.database = dbResult;
      result.deletedResources!.databaseRecords = dbResult.recordsDeleted;

      // CHECK FOR CRITICAL ERRORS
      const criticalErrors = [
        ...result.cleanupSummary!.openai.errors.filter(e => e.includes('CRITICAL')),
        ...result.cleanupSummary!.storage.errors.filter(e => e.includes('CRITICAL')),
        ...result.cleanupSummary!.database.errors.filter(e => e.includes('CRITICAL'))
      ];

      if (criticalErrors.length > 0) {
        result.error = `Critical errors during deletion: ${criticalErrors.join(', ')}`;
        result.partialCleanup = true;
        return result;
      }

      result.success = true;

      return result;

    } catch (error) {
      result.error = `Critical error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.partialCleanup = true;
      return result;
    }
  }

  /**
   * GATHER ALL TEAM DATA FOR CLEANUP
   */
  private async gatherTeamData(teamId: string) {
    try {
      // FETCH ALL TEAM-RELATED DATA
      const [
        team,
        assistants,
        portfolios,
        accounts,
        documents,
        knowledge,
        members,
        invitations,
        chatHistory,
        ratings,
        surgeons
      ] = await Promise.all([
        // TEAM BASIC INFO
        this.serviceClient
          .from('teams')
          .select('*')
          .eq('id', teamId)
          .single(),

        // TEAM ASSISTANTS
        this.serviceClient
          .from('team_assistants')
          .select('*')
          .eq('team_id', teamId),

        // TEAM PORTFOLIOS
        this.serviceClient
          .from('team_portfolios')
          .select('*')
          .eq('team_id', teamId),

        // TEAM ACCOUNTS
        this.serviceClient
          .from('team_accounts')
          .select('*')
          .eq('team_id', teamId),

        // TEAM DOCUMENTS
        this.serviceClient
          .from('team_documents')
          .select('*')
          .eq('team_id', teamId),

        // TEAM KNOWLEDGE
        this.serviceClient
          .from('team_knowledge')
          .select('*')
          .eq('team_id', teamId),

        // TEAM MEMBERS
        this.serviceClient
          .from('team_members')
          .select('*')
          .eq('team_id', teamId),

        // TEAM INVITATIONS
        this.serviceClient
          .from('team_member_invitations')
          .select('*')
          .eq('team_id', teamId),

        // CHAT HISTORY
        this.serviceClient
          .from('chat_history')
          .select('*')
          .eq('team_id', teamId),


        // MESSAGE RATINGS
        this.serviceClient
          .from('message_ratings')
          .select('*')
          .eq('team_id', teamId),

        // SURGEONS
        this.serviceClient
          .from('surgeons')
          .select('*')
          .eq('team_id', teamId)
      ]);

      if (team.error) {
        return null;
      }

      // COLLECT ALL VECTOR STORE IDs
      const vectorStoreIds = new Set<string>();
      
      // FROM TEAM TABLE
      if (team.data.general_vector_store_id) vectorStoreIds.add(team.data.general_vector_store_id);
      if (team.data.general_knowledge_vector_store_id) vectorStoreIds.add(team.data.general_knowledge_vector_store_id);

      // FROM PORTFOLIOS
      portfolios.data?.forEach(portfolio => {
        if (portfolio.vector_store_id) vectorStoreIds.add(portfolio.vector_store_id);
      });

      // FROM ASSISTANTS
      assistants.data?.forEach(assistant => {
        if (assistant.general_vector_store_id) vectorStoreIds.add(assistant.general_vector_store_id);
        if (assistant.account_portfolio_vector_store_id) vectorStoreIds.add(assistant.account_portfolio_vector_store_id);
        if (assistant.portfolio_vector_store_id) vectorStoreIds.add(assistant.portfolio_vector_store_id);
        if (assistant.consolidated_vector_store_id) vectorStoreIds.add(assistant.consolidated_vector_store_id);
      });

      // COLLECT ALL ASSISTANT IDs
      const assistantIds = assistants.data?.map(a => a.assistant_id) || [];

      // COLLECT ALL FILE IDs
      const fileIds = new Set<string>();
      documents.data?.forEach(doc => {
        if (doc.openai_file_id) fileIds.add(doc.openai_file_id);
      });

      // COLLECT ALL STORAGE FILE PATHS
      const storagePaths = documents.data?.map(doc => doc.file_path) || [];

      return {
        team: team.data,
        assistants: assistants.data || [],
        portfolios: portfolios.data || [],
        accounts: accounts.data || [],
        documents: documents.data || [],
        knowledge: knowledge.data || [],
        members: members.data || [],
        invitations: invitations.data || [],
        chatHistory: chatHistory.data || [],
        ratings: ratings.data || [],
        surgeons: surgeons.data || [],
        vectorStoreIds: Array.from(vectorStoreIds),
        assistantIds,
        fileIds: Array.from(fileIds),
        storagePaths,
        summary: {
          assistants: assistantIds.length,
          vectorStores: vectorStoreIds.size,
          files: fileIds.size,
          documents: documents.data?.length || 0,
          knowledge: knowledge.data?.length || 0,
          members: members.data?.length || 0,
          invitations: invitations.data?.length || 0,
          chats: chatHistory.data?.length || 0,
          ratings: ratings.data?.length || 0,
          surgeons: surgeons.data?.length || 0
        }
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * CLEANUP DATABASE RECORDS IN PROPER ORDER
   */
  private async cleanupDatabaseRecords(teamId: string, teamData: any) {
    const result = {
      tablesCleaned: [] as string[],
      recordsDeleted: 0,
      errors: [] as string[]
    };

    try {
      // DELETE IN ORDER TO RESPECT FOREIGN KEY CONSTRAINTS
      // First delete all child records that reference team_id
      const childTables = [
        'note_tags',
        'message_ratings', 
        'chat_history',
        'team_knowledge',
        'team_documents',
        'account_portfolio_stores',
        'account_portfolios',
        'team_assistants',
        'team_member_invitations',
        'team_members',
        'surgeons',
        'team_accounts',
        'team_portfolios'
      ];

      for (const table of childTables) {
        try {
          let deleteQuery = this.serviceClient.from(table).delete({ count: 'exact' });
          
          // Handle special cases for tables that don't directly reference team_id
          if (table === 'note_tags') {
            // Skip note_tags deletion - notes system removed
            continue;
          } else if (table === 'account_portfolios') {
            // Delete account_portfolios for accounts that belong to this team
            const { data: teamAccounts } = await this.serviceClient
              .from('team_accounts')
              .select('id')
              .eq('team_id', teamId);
            
            if (teamAccounts && teamAccounts.length > 0) {
              const accountIds = teamAccounts.map(account => account.id);
              deleteQuery = deleteQuery.in('account_id', accountIds);
            } else {
              // No accounts to delete portfolios for
              continue;
            }
          } else {
            // Standard team_id reference
            deleteQuery = deleteQuery.eq('team_id', teamId);
          }

          const { count, error } = await deleteQuery;

          if (error) {
            result.errors.push(`Failed to delete from ${table}: ${error.message}`);
          } else {
            result.tablesCleaned.push(table);
            result.recordsDeleted += count || 0;
          }
        } catch (error) {
          const errorMsg = `CRITICAL: Failed to delete from ${table}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
        }
      }

      // Finally delete the team record itself (using id, not team_id)
      try {
        const { count, error } = await this.serviceClient
          .from('teams')
          .delete({ count: 'exact' })
          .eq('id', teamId);

        if (error) {
          result.errors.push(`Failed to delete from teams: ${error.message}`);
        } else {
          result.tablesCleaned.push('teams');
          result.recordsDeleted += count || 0;
        }
      } catch (error) {
        const errorMsg = `CRITICAL: Failed to delete from teams: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMsg);
      }

    } catch (error) {
      const errorMsg = `CRITICAL: Database cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
    }

    return result;
  }
}
