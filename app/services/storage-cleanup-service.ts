import { createClient } from '@supabase/supabase-js';

export interface StorageCleanupResult {
  success: boolean;
  deletedFiles: number;
  errors: string[];
}

export interface courseStorageCleanupResult {
  success: boolean;
  documentsDeleted: number;
  imagesDeleted: number;
  errors: string[];
}

export class StorageCleanupService {
  private supabase: any;

  constructor() {
    // INITIALIZE SUPABASE CLIENT FOR STORAGE OPERATIONS
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * CLEAN UP STORAGE FILES FOR A PORTFOLIO
   */
  async cleanupPortfolioStorage(portfolioId: string, courseId: string): Promise<StorageCleanupResult> {
    const result: StorageCleanupResult = {
      success: true,
      deletedFiles: 0,
      errors: []
    };

    try {
      console.log(`🗂️ STARTING STORAGE CLEANUP FOR PORTFOLIO: ${portfolioId}`);

      // GET ALL DOCUMENTS FOR THIS PORTFOLIO
      const { data: documents, error: documentsError } = await this.supabase
        .from('course_documents')
        .select('file_path, original_name')
        .eq('portfolio_id', portfolioId)
        .eq('course_id', courseId);

      if (documentsError) {
        result.errors.push(`Failed to fetch documents: ${documentsError.message}`);
        result.success = false;
        return result;
      }

      if (!documents || documents.length === 0) {
        console.log('📁 NO DOCUMENTS FOUND FOR STORAGE CLEANUP');
        return result;
      }

      console.log(`📁 FOUND ${documents.length} DOCUMENTS TO DELETE FROM STORAGE`);

      // DELETE EACH FILE FROM STORAGE
      for (const document of documents) {
        try {
          // EXTRACT BUCKET AND FILE PATH FROM file_path
          // EXPECTED FORMAT: "course-documents/courseId/portfolioId/filename"
          const filePath = document.file_path;
          
          if (!filePath) {
            result.errors.push(`Document ${document.original_name} has no file path`);
            continue;
          }

          // DELETE FROM STORAGE
          const { error: deleteError } = await this.supabase.storage
            .from('course-documents')
            .remove([filePath]);

          if (deleteError) {
            result.errors.push(`Failed to delete ${document.original_name}: ${deleteError.message}`);
            console.error(`❌ STORAGE DELETE ERROR for ${document.original_name}:`, deleteError);
          } else {
            result.deletedFiles++;
            console.log(`✅ DELETED STORAGE FILE: ${document.original_name}`);
          }

        } catch (error: any) {
          result.errors.push(`Error deleting ${document.original_name}: ${error.message}`);
          console.error(`❌ ERROR DELETING STORAGE FILE ${document.original_name}:`, error);
        }
      }

      // DETERMINE OVERALL SUCCESS
      result.success = result.errors.length === 0;

      console.log(`🗂️ STORAGE CLEANUP COMPLETED: ${result.deletedFiles} files deleted, ${result.errors.length} errors`);

      return result;

    } catch (error: any) {
      console.error('💥 CRITICAL ERROR DURING STORAGE CLEANUP:', error);
      result.success = false;
      result.errors.push(`Critical storage cleanup error: ${error.message}`);
      return result;
    }
  }

  /**
   * CLEAN UP STORAGE FILES FOR MULTIPLE DOCUMENTS
   */
  async cleanupDocumentStorage(documentIds: string[]): Promise<StorageCleanupResult> {
    const result: StorageCleanupResult = {
      success: true,
      deletedFiles: 0,
      errors: []
    };

    try {
      if (documentIds.length === 0) {
        return result;
      }

      console.log(`🗂️ STARTING STORAGE CLEANUP FOR ${documentIds.length} DOCUMENTS`);

      // GET DOCUMENTS BY IDS
      const { data: documents, error: documentsError } = await this.supabase
        .from('course_documents')
        .select('file_path, original_name')
        .in('id', documentIds);

      if (documentsError) {
        result.errors.push(`Failed to fetch documents: ${documentsError.message}`);
        result.success = false;
        return result;
      }

      if (!documents || documents.length === 0) {
        console.log('📁 NO DOCUMENTS FOUND FOR STORAGE CLEANUP');
        return result;
      }

      // DELETE EACH FILE FROM STORAGE
      for (const document of documents) {
        try {
          const filePath = document.file_path;
          
          if (!filePath) {
            result.errors.push(`Document ${document.original_name} has no file path`);
            continue;
          }

          const { error: deleteError } = await this.supabase.storage
            .from('course-documents')
            .remove([filePath]);

          if (deleteError) {
            result.errors.push(`Failed to delete ${document.original_name}: ${deleteError.message}`);
          } else {
            result.deletedFiles++;
            console.log(`✅ DELETED STORAGE FILE: ${document.original_name}`);
          }

        } catch (error: any) {
          result.errors.push(`Error deleting ${document.original_name}: ${error.message}`);
        }
      }

      result.success = result.errors.length === 0;
      console.log(`🗂️ STORAGE CLEANUP COMPLETED: ${result.deletedFiles} files deleted, ${result.errors.length} errors`);

      return result;

    } catch (error: any) {
      console.error('💥 CRITICAL ERROR DURING STORAGE CLEANUP:', error);
      result.success = false;
      result.errors.push(`Critical storage cleanup error: ${error.message}`);
      return result;
    }
  }

  /**
   * CLEAN UP STORAGE FILES FOR AN ENTIRE course
   */
  async cleanupcourseStorage(courseData: any): Promise<courseStorageCleanupResult> {
    const result: courseStorageCleanupResult = {
      success: true,
      documentsDeleted: 0,
      imagesDeleted: 0,
      errors: []
    };

    try {
      console.log(`🗂️ STARTING course STORAGE CLEANUP`);

      const documents = courseData.documents || [];
      
      if (documents.length === 0) {
        console.log('📁 NO DOCUMENTS FOUND FOR course STORAGE CLEANUP');
        return result;
      }

      console.log(`📁 FOUND ${documents.length} DOCUMENTS TO DELETE FROM STORAGE`);

      // DELETE EACH FILE FROM STORAGE
      for (const document of documents) {
        try {
          const filePath = document.file_path;
          
          if (!filePath) {
            result.errors.push(`Document ${document.original_name} has no file path`);
            continue;
          }

          // DELETE FROM STORAGE
          const { error: deleteError } = await this.supabase.storage
            .from('course-documents')
            .remove([filePath]);

          if (deleteError) {
            result.errors.push(`Failed to delete ${document.original_name}: ${deleteError.message}`);
            console.error(`❌ STORAGE DELETE ERROR for ${document.original_name}:`, deleteError);
          } else {
            result.documentsDeleted++;
            console.log(`✅ DELETED STORAGE FILE: ${document.original_name}`);
          }

        } catch (error: any) {
          result.errors.push(`Error deleting ${document.original_name}: ${error.message}`);
          console.error(`❌ ERROR DELETING STORAGE FILE ${document.original_name}:`, error);
        }
      }

      // DETERMINE OVERALL SUCCESS
      result.success = result.errors.length === 0;

      console.log(`🗂️ course STORAGE CLEANUP COMPLETED: ${result.documentsDeleted} documents deleted, ${result.errors.length} errors`);

      return result;

    } catch (error: any) {
      console.error('💥 CRITICAL ERROR DURING course STORAGE CLEANUP:', error);
      result.success = false;
      result.errors.push(`Critical course storage cleanup error: ${error.message}`);
      return result;
    }
  }
}