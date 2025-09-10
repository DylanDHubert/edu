import { createClient } from '../utils/supabase/server';
import { cookies } from 'next/headers';

export interface StorageCleanupResult {
  documentsDeleted: number;
  imagesDeleted: number;
  errors: string[];
}

export class StorageCleanupService {
  private supabase: any;

  constructor() {
    this.initializeSupabase();
  }

  private async initializeSupabase() {
    const cookieStore = cookies();
    this.supabase = await createClient(cookieStore);
  }

  /**
   * CLEANUP ALL STORAGE RESOURCES FOR A TEAM
   */
  async cleanupTeamStorage(teamData: any): Promise<StorageCleanupResult> {
    const result: StorageCleanupResult = {
      documentsDeleted: 0,
      imagesDeleted: 0,
      errors: []
    };


    try {
      // CLEANUP TEAM DOCUMENTS
      if (teamData.storagePaths.length > 0) {
        const documentResult = await this.cleanupTeamDocuments(teamData.storagePaths);
        result.documentsDeleted = documentResult.deleted;
        result.errors.push(...documentResult.errors);
      }

      // CLEANUP TEAM-RELATED NOTE IMAGES
      const imageResult = await this.cleanupTeamNoteImages(teamData.notes);
      result.imagesDeleted = imageResult.deleted;
      result.errors.push(...imageResult.errors);

    } catch (error) {
      const errorMsg = `CRITICAL: Storage cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
    }

    return result;
  }

  /**
   * CLEANUP TEAM DOCUMENTS FROM STORAGE
   */
  private async cleanupTeamDocuments(storagePaths: string[]): Promise<{ deleted: number; errors: string[] }> {
    const result = { deleted: 0, errors: [] as string[] };

    try {
      // DELETE ALL DOCUMENT FILES IN BATCH
      const { data, error } = await this.supabase.storage
        .from('team-documents')
        .remove(storagePaths);

      if (error) {
        const errorMsg = `CRITICAL: Failed to delete team documents: ${error.message}`;
        result.errors.push(errorMsg);
      } else {
        result.deleted = data?.length || storagePaths.length;
      }

    } catch (error) {
      const errorMsg = `CRITICAL: Exception during document cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
    }

    return result;
  }

  /**
   * CLEANUP TEAM-RELATED NOTE IMAGES
   */
  private async cleanupTeamNoteImages(notes: any[]): Promise<{ deleted: number; errors: string[] }> {
    const result = { deleted: 0, errors: [] as string[] };

    try {
      // EXTRACT ALL IMAGE PATHS FROM TEAM NOTES
      const imagePaths: string[] = [];
      
      for (const note of notes) {
        if (note.images && Array.isArray(note.images)) {
          for (const image of note.images) {
            if (image.url && image.url.startsWith('/api/images/')) {
              // EXTRACT FILE PATH FROM API URL
              const pathParts = image.url.replace('/api/images/', '').split('/');
              if (pathParts.length >= 2) {
                const userId = pathParts[0];
                const fileName = pathParts.slice(1).join('/');
                imagePaths.push(`${userId}/${fileName}`);
              }
            }
          }
        }
      }

      if (imagePaths.length > 0) {
        // DELETE ALL IMAGE FILES IN BATCH
        const { data, error } = await this.supabase.storage
          .from('user_note_images')
          .remove(imagePaths);

        if (error) {
          const errorMsg = `Failed to delete note images: ${error.message}`;
          result.errors.push(errorMsg);
        } else {
          result.deleted = data?.length || imagePaths.length;
        }
      }

    } catch (error) {
      const errorMsg = `Exception during image cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
    }

    return result;
  }

  /**
   * CLEANUP BY TEAM ID PATTERN (FALLBACK METHOD)
   */
  async cleanupByTeamId(teamId: string): Promise<StorageCleanupResult> {
    const result: StorageCleanupResult = {
      documentsDeleted: 0,
      imagesDeleted: 0,
      errors: []
    };

    try {
      // CLEANUP ALL FILES IN TEAM DOCUMENTS FOLDER
      const teamDocumentsPath = `teams/${teamId}/`;
      
      const { data: documents, error: listError } = await this.supabase.storage
        .from('team-documents')
        .list(teamDocumentsPath, {
          limit: 1000,
          offset: 0
        });

      if (listError) {
        const errorMsg = `Failed to list team documents: ${listError.message}`;
        result.errors.push(errorMsg);
      } else if (documents && documents.length > 0) {
        const documentPaths = documents.map((doc: any) => `${teamDocumentsPath}${doc.name}`);
        
        const { data, error } = await this.supabase.storage
          .from('team-documents')
          .remove(documentPaths);

        if (error) {
          const errorMsg = `Failed to delete team documents: ${error.message}`;
          result.errors.push(errorMsg);
        } else {
          result.documentsDeleted = data?.length || 0;
        }
      }

    } catch (error) {
      const errorMsg = `Exception during team ID cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
    }

    return result;
  }

  /**
   * VERIFY STORAGE CLEANUP (OPTIONAL - FOR DEBUGGING)
   */
  async verifyCleanup(teamId: string): Promise<{
    documentsRemaining: number;
    imagesRemaining: number;
  }> {
    const result = {
      documentsRemaining: 0,
      imagesRemaining: 0
    };

    try {
      // CHECK TEAM DOCUMENTS
      const teamDocumentsPath = `teams/${teamId}/`;
      
      const { data: documents, error: listError } = await this.supabase.storage
        .from('team-documents')
        .list(teamDocumentsPath, {
          limit: 1000,
          offset: 0
        });

      if (!listError && documents) {
        result.documentsRemaining = documents.length;
      }

      // NOTE: IMAGE VERIFICATION WOULD REQUIRE QUERYING ALL USER FOLDERS
      // THIS IS COMPLEX AND NOT NECESSARY FOR BASIC VERIFICATION

    } catch (error) {
      // Silent error handling for verification
    }

    return result;
  }
}
