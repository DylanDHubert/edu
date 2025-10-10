import OpenAI from 'openai';

export interface OpenAICleanupResult {
  assistantsDeleted: number;
  vectorStoresDeleted: number;
  filesDeleted: number;
  errors: string[];
}

export class OpenAICleanupService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * CLEANUP ALL OPENAI RESOURCES FOR A course
   */
  async cleanupcourseResources(courseData: any): Promise<OpenAICleanupResult> {
    const result: OpenAICleanupResult = {
      assistantsDeleted: 0,
      vectorStoresDeleted: 0,
      filesDeleted: 0,
      errors: []
    };


    try {
      // CLEANUP ASSISTANTS
      if (courseData.assistantIds.length > 0) {
        const assistantResult = await this.cleanupAssistants(courseData.assistantIds);
        result.assistantsDeleted = assistantResult.deleted;
        result.errors.push(...assistantResult.errors);
      }

      // CLEANUP VECTOR STORES
      if (courseData.vectorStoreIds.length > 0) {
        const vectorStoreResult = await this.cleanupVectorStores(courseData.vectorStoreIds);
        result.vectorStoresDeleted = vectorStoreResult.deleted;
        result.errors.push(...vectorStoreResult.errors);
      }

      // CLEANUP FILES
      if (courseData.fileIds.length > 0) {
        const fileResult = await this.cleanupFiles(courseData.fileIds);
        result.filesDeleted = fileResult.deleted;
        result.errors.push(...fileResult.errors);
      }

    } catch (error) {
      const errorMsg = `CRITICAL: OpenAI cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
    }

    return result;
  }

  /**
   * CLEANUP ASSISTANTS
   */
  private async cleanupAssistants(assistantIds: string[]): Promise<{ deleted: number; errors: string[] }> {
    const result = { deleted: 0, errors: [] as string[] };

    for (const assistantId of assistantIds) {
      try {
        await this.client.beta.assistants.del(assistantId);
        result.deleted++;
      } catch (error) {
        const errorMsg = `Failed to delete assistant ${assistantId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMsg);
      }
    }

    return result;
  }

  /**
   * CLEANUP VECTOR STORES
   */
  private async cleanupVectorStores(vectorStoreIds: string[]): Promise<{ deleted: number; errors: string[] }> {
    const result = { deleted: 0, errors: [] as string[] };

    for (const vectorStoreId of vectorStoreIds) {
      try {
        await (this.client as any).vectorStores.del(vectorStoreId);
        result.deleted++;
      } catch (error) {
        const errorMsg = `Failed to delete vector store ${vectorStoreId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMsg);
      }
    }

    return result;
  }

  /**
   * CLEANUP FILES
   */
  private async cleanupFiles(fileIds: string[]): Promise<{ deleted: number; errors: string[] }> {
    const result = { deleted: 0, errors: [] as string[] };

    for (const fileId of fileIds) {
      try {
        await this.client.files.del(fileId);
        result.deleted++;
      } catch (error) {
        const errorMsg = `Failed to delete file ${fileId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMsg);
      }
    }

    return result;
  }

  /**
   * VERIFY CLEANUP (OPTIONAL - FOR DEBUGGING)
   */
  async verifyCleanup(courseData: any): Promise<{
    assistantsRemaining: number;
    vectorStoresRemaining: number;
    filesRemaining: number;
  }> {
    const result = {
      assistantsRemaining: 0,
      vectorStoresRemaining: 0,
      filesRemaining: 0
    };

    try {
      // CHECK ASSISTANTS
      for (const assistantId of courseData.assistantIds) {
        try {
          await this.client.beta.assistants.retrieve(assistantId);
          result.assistantsRemaining++;
        } catch (error) {
          // ASSISTANT NOT FOUND - GOOD
        }
      }

      // CHECK VECTOR STORES
      for (const vectorStoreId of courseData.vectorStoreIds) {
        try {
          await (this.client as any).vectorStores.retrieve(vectorStoreId);
          result.vectorStoresRemaining++;
        } catch (error) {
          // VECTOR STORE NOT FOUND - GOOD
        }
      }

      // CHECK FILES
      for (const fileId of courseData.fileIds) {
        try {
          await this.client.files.retrieve(fileId);
          result.filesRemaining++;
        } catch (error) {
          // FILE NOT FOUND - GOOD
        }
      }

    } catch (error) {
      // Silent error handling for verification
    }

    return result;
  }
}
