import { createServiceClient } from '../utils/supabase/server';
import { OpenAICleanupService } from './openai-cleanup-service';
import { StorageCleanupService } from './storage-cleanup-service';
import OpenAI from 'openai';

export interface DeletionOptions {
  deleteExternalResources: boolean;
  userId: string;
  courseName: string;
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

export class courseDeletionService {
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
   * MAIN course DELETION METHOD
   */
  async deletecourse(courseId: string, options: DeletionOptions): Promise<DeletionResult> {
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
      // PHASE 1: GATHER ALL course DATA FOR CLEANUP
      const courseData = await this.gathercourseData(courseId);
      if (!courseData) {
        result.error = 'course not found';
        return result;
      }


      // PHASE 2: CLEANUP EXTERNAL RESOURCES (IF REQUESTED)
      if (options.deleteExternalResources) {
        
        // CLEANUP OPENAI RESOURCES
        const openaiResult = await this.openaiCleanup.cleanupcourseResources(courseData);
        result.cleanupSummary!.openai = openaiResult;
        result.deletedResources!.assistants = openaiResult.assistantsDeleted;
        result.deletedResources!.vectorStores = openaiResult.vectorStoresDeleted;
        result.deletedResources!.files = openaiResult.filesDeleted;

        // CLEANUP STORAGE RESOURCES
        const storageResult = await this.storageCleanup.cleanupcourseStorage(courseData);
        result.cleanupSummary!.storage = storageResult;
        result.deletedResources!.storageFiles = storageResult.documentsDeleted + storageResult.imagesDeleted;
      }

      // PHASE 3: CLEANUP DATABASE RECORDS
      const dbResult = await this.cleanupDatabaseRecords(courseId, courseData);
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
   * GATHER ALL course DATA FOR CLEANUP
   */
  private async gathercourseData(courseId: string) {
    try {
      // FETCH ALL course-RELATED DATA
      const [
        course,
        assistants,
        portfolios,
        accounts,
        documents,
        knowledge,
        members,
        invitations,
        chatHistory,
        ratings,
      ] = await Promise.all([
        // course BASIC INFO
        this.serviceClient
          .from('courses')
          .select('*')
          .eq('id', courseId)
          .single(),

        // course ASSISTANTS
        this.serviceClient
          .from('course_assistants')
          .select('*')
          .eq('course_id', courseId),

        // course PORTFOLIOS
        this.serviceClient
          .from('course_portfolios')
          .select('*')
          .eq('course_id', courseId),

        // course ACCOUNTS
        this.serviceClient
          .from('course_accounts')
          .select('*')
          .eq('course_id', courseId),

        // course DOCUMENTS
        this.serviceClient
          .from('course_documents')
          .select('*')
          .eq('course_id', courseId),

        // course KNOWLEDGE
        this.serviceClient
          .from('course_knowledge')
          .select('*')
          .eq('course_id', courseId),

        // course MEMBERS
        this.serviceClient
          .from('course_members')
          .select('*')
          .eq('course_id', courseId),

        // course INVITATIONS
        this.serviceClient
          .from('course_member_invitations')
          .select('*')
          .eq('course_id', courseId),

        // CHAT HISTORY
        this.serviceClient
          .from('chat_history')
          .select('*')
          .eq('course_id', courseId),


        // MESSAGE RATINGS
        this.serviceClient
          .from('message_ratings')
          .select('*')
          .eq('course_id', courseId),

      ]);

      if (course.error) {
        return null;
      }

      // COLLECT ALL VECTOR STORE IDs
      const vectorStoreIds = new Set<string>();
      
      // FROM course TABLE
      // No vector store fields in courses table

      // FROM PORTFOLIOS
      portfolios.data?.forEach(portfolio => {
        if (portfolio.vector_store_id) vectorStoreIds.add(portfolio.vector_store_id);
      });

      // FROM ASSISTANTS
      // (Vector stores are now handled at portfolio level, not assistant level)

      // COLLECT ALL ASSISTANT IDs
      const assistantIds = assistants.data?.map(a => a.openai_assistant_id) || [];

      // COLLECT ALL FILE IDs
      const fileIds = new Set<string>();
      documents.data?.forEach(doc => {
        if (doc.openai_file_id) fileIds.add(doc.openai_file_id);
      });

      // COLLECT ALL STORAGE FILE PATHS
      const storagePaths = documents.data?.map(doc => doc.file_path) || [];

      return {
        course: course.data,
        assistants: assistants.data || [],
        portfolios: portfolios.data || [],
        accounts: accounts.data || [],
        documents: documents.data || [],
        knowledge: knowledge.data || [],
        members: members.data || [],
        invitations: invitations.data || [],
        chatHistory: chatHistory.data || [],
        ratings: ratings.data || [],
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
          ratings: ratings.data?.length || 0
        }
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * CLEANUP DATABASE RECORDS IN PROPER ORDER
   */
  private async cleanupDatabaseRecords(courseId: string, courseData: any) {
    const result = {
      tablesCleaned: [] as string[],
      recordsDeleted: 0,
      errors: [] as string[]
    };

    try {
      // DELETE IN ORDER TO RESPECT FOREIGN KEY CONSTRAINTS
      // First delete all child records that reference course_id
      const childTables = [
        'note_tags',
        'message_ratings', 
        'chat_history',
        'course_knowledge',
        'course_documents',
        'account_portfolio_stores',
        'account_portfolios',
        'course_assistants',
        'course_member_invitations',
        'course_members',
        'course_accounts',
        'course_portfolios'
      ];

      for (const table of childTables) {
        try {
          let deleteQuery = this.serviceClient.from(table).delete({ count: 'exact' });
          
          // Handle special cases for tables that don't directly reference course_id
          if (table === 'note_tags') {
            // Skip note_tags deletion - notes system removed
            continue;
          } else if (table === 'account_portfolios') {
            // Skip account_portfolios deletion - account system removed
            continue;
          } else {
            // Standard course_id reference
            deleteQuery = deleteQuery.eq('course_id', courseId);
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

      // Finally delete the course record itself (using id, not course_id)
      try {
        const { count, error } = await this.serviceClient
          .from('courses')
          .delete({ count: 'exact' })
          .eq('id', courseId);

        if (error) {
          result.errors.push(`Failed to delete from courses: ${error.message}`);
        } else {
          result.tablesCleaned.push('courses');
          result.recordsDeleted += count || 0;
        }
      } catch (error) {
        const errorMsg = `CRITICAL: Failed to delete from courses: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMsg);
      }

    } catch (error) {
      const errorMsg = `CRITICAL: Database cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
    }

    return result;
  }
}
