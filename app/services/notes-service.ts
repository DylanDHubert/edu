import { createClient, createServiceClient } from '../utils/supabase/server';
import { verifyUserAuth, verifyTeamAccess } from '../utils/auth-helpers';
import { cookies } from 'next/headers';
import { 
  Note, 
  CreateNoteRequest, 
  UpdateNoteRequest, 
  NoteResult, 
  NotesListResult,
  ImageUploadResult,
  FormDataEntry,
  NoteImage
} from '../types/notes';

export class NotesService {
  private async getSupabase() {
    const cookieStore = cookies();
    return await createClient(cookieStore);
  }

  /**
   * PARSE FORM DATA FOR NOTES
   */
  parseFormData(formData: FormData): {
    title: string;
    content: string;
    is_shared: boolean;
    is_portfolio_shared: boolean;
    team_id: string | null;
    account_id: string | null;
    portfolio_id: string | null;
    imageFiles: File[];
    imageDescriptions: string[];
  } {
    const title = formData.get('title') as string;
    const content = formData.get('content') as string;
    const is_shared = formData.get('is_shared') === 'true';
    const is_portfolio_shared = formData.get('is_portfolio_shared') === 'true';
    const team_id = formData.get('team_id') as string | null;
    const account_id = formData.get('account_id') as string | null;
    const portfolio_id = formData.get('portfolio_id') as string | null;

    // EXTRACT ALL IMAGE FILES AND DESCRIPTIONS FROM FORMDATA
    const imageEntries: {[key: string]: FormDataEntry} = {};
    
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('image_') && value instanceof File) {
        const index = key.replace('image_', '');
        if (!imageEntries[index]) imageEntries[index] = {};
        imageEntries[index].file = value;
      }
      if (key.startsWith('image_description_') && typeof value === 'string') {
        const index = key.replace('image_description_', '');
        if (!imageEntries[index]) imageEntries[index] = {};
        imageEntries[index].description = value;
      }
    }
    
    // CONVERT TO ARRAYS IN CORRECT ORDER
    const imageFiles: File[] = [];
    const imageDescriptions: string[] = [];
    
    Object.keys(imageEntries).sort().forEach(index => {
      const entry = imageEntries[index];
      if (entry.file && entry.description) {
        imageFiles.push(entry.file);
        imageDescriptions.push(entry.description);
      }
    });

    return {
      title,
      content,
      is_shared,
      is_portfolio_shared,
      team_id,
      account_id,
      portfolio_id,
      imageFiles,
      imageDescriptions
    };
  }

  /**
   * PARSE EXISTING IMAGES FROM FORM DATA
   */
  parseExistingImages(formData: FormData): NoteImage[] {
    const existingImagesJson = formData.get('existing_images') as string;
    return existingImagesJson ? JSON.parse(existingImagesJson) : [];
  }

  /**
   * UPLOAD IMAGES TO SUPABASE STORAGE
   */
  async uploadImages(
    imageFiles: File[], 
    imageDescriptions: string[], 
    userId: string
  ): Promise<ImageUploadResult> {
    try {
      const images: NoteImage[] = [];

      for (let i = 0; i < imageFiles.length; i++) {
        const imageFile = imageFiles[i];
        const imageDescription = imageDescriptions[i];

        if (!imageFile || !imageDescription.trim()) {
          continue;
        }

        // GENERATE UNIQUE FILENAME
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2);
        const fileExtension = imageFile.name.split('.').pop() || 'jpg';
        const fileName = `${userId}/${timestamp}_${random}.${fileExtension}`;

        // UPLOAD TO SUPABASE STORAGE
        const supabase = await this.getSupabase();
        const { error: uploadError } = await supabase.storage
          .from('user_note_images')
          .upload(fileName, imageFile);

        if (uploadError) {
          console.error('ERROR UPLOADING IMAGE:', uploadError);
          return {
            success: false,
            error: 'Failed to upload image'
          };
        }

        // GENERATE CUSTOM API URL
        const imageUrl = `/api/images/${userId}/${timestamp}_${random}.${fileExtension}`;

        images.push({
          url: imageUrl,
          description: imageDescription.trim()
        });
      }

      return {
        success: true,
        images
      };
    } catch (error) {
      console.error('Error uploading images:', error);
      return {
        success: false,
        error: 'Failed to upload images'
      };
    }
  }

  /**
   * DELETE IMAGES FROM SUPABASE STORAGE
   */
  async deleteImages(images: NoteImage[]): Promise<void> {
    try {
      for (const image of images) {
        if (image.url) {
          // EXTRACT USER ID AND FILENAME FROM API URL
          const urlParts = image.url.split('/');
          if (urlParts.length >= 4 && urlParts[1] === 'api' && urlParts[2] === 'images') {
            const userId = urlParts[3];
            const fileName = urlParts[4];
            const storagePath = `${userId}/${fileName}`;
            
            const supabase = await this.getSupabase();
            const { error: deleteImageError } = await supabase.storage
              .from('user_note_images')
              .remove([storagePath]);

            if (deleteImageError) {
              console.error('ERROR DELETING IMAGE:', deleteImageError);
            }
          }
        }
      }
    } catch (error) {
      console.error('ERROR PROCESSING IMAGES DELETE:', error);
    }
  }

  /**
   * GET PORTFOLIO NAME FOR PORTFOLIO TYPE
   */
  async getPortfolioName(portfolioId: string): Promise<string> {
    try {
      // USE SERVICE CLIENT TO BYPASS RLS (LIKE OTHER PORTFOLIO QUERIES)
      const serviceClient = createServiceClient();
      const { data: portfolioData, error: portfolioError } = await serviceClient
        .from('team_portfolios')
        .select('name')
        .eq('id', portfolioId)
        .single();

      if (portfolioError || !portfolioData) {
        throw new Error('Invalid portfolio ID');
      }

      return portfolioData.name;
    } catch (error) {
      console.error('Error getting portfolio name:', error);
      throw error;
    }
  }

  /**
   * CREATE A NEW NOTE
   */
  async createNote(request: CreateNoteRequest, userId: string): Promise<NoteResult> {
    try {
      // VERIFY TEAM ACCESS IF TEAM CONTEXT IS PROVIDED
      if (request.team_id) {
        await verifyTeamAccess(request.team_id, userId);
      }

      // UPLOAD IMAGES
      const imageResult = await this.uploadImages(
        request.imageFiles, 
        request.imageDescriptions, 
        userId
      );

      if (!imageResult.success) {
        return {
          success: false,
          error: imageResult.error
        };
      }

      // GET PORTFOLIO NAME (REQUIRED FIELD)
      let portfolioType: string = 'general'; // Default value
      if (request.portfolio_id) {
        portfolioType = await this.getPortfolioName(request.portfolio_id);
      }

      // CREATE NOTE DATA
      const noteData: any = {
        user_id: userId,
        title: request.title.trim(),
        content: request.content.trim(),
        images: imageResult.images && imageResult.images.length > 0 ? imageResult.images : null,
        is_shared: request.is_shared || false,
        is_portfolio_shared: request.is_portfolio_shared || false,
        team_id: request.team_id,
        portfolio_id: request.portfolio_id,
        portfolio_type: portfolioType // This is now always a string
      };

      // Handle account_id based on portfolio sharing
      if (request.is_portfolio_shared) {
        noteData.account_id = null; // Portfolio-shared notes have no specific account
      } else {
        noteData.account_id = request.account_id;
      }

      // INSERT NOTE
      const supabase = await this.getSupabase();
      const { data, error } = await supabase
        .from('notes')
        .insert(noteData)
        .select()
        .single();

      if (error) {
        console.error('ERROR CREATING NOTE:', error);
        return {
          success: false,
          error: 'Failed to create note'
        };
      }

      return {
        success: true,
        note: data
      };
    } catch (error) {
      console.error('Error creating note:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * UPDATE AN EXISTING NOTE
   */
  async updateNote(request: UpdateNoteRequest, userId: string): Promise<NoteResult> {
    try {
      // VERIFY USER OWNS THIS NOTE
      const supabase = await this.getSupabase();
      const { data: existingNote, error: ownershipError } = await supabase
        .from('notes')
        .select('*')
        .eq('id', request.noteId)
        .eq('user_id', userId)
        .single();

      if (ownershipError || !existingNote) {
        return {
          success: false,
          error: 'Note not found or access denied'
        };
      }

      // UPLOAD NEW IMAGES
      const imageResult = await this.uploadImages(
        request.imageFiles, 
        request.imageDescriptions, 
        userId
      );

      if (!imageResult.success) {
        return {
          success: false,
          error: imageResult.error
        };
      }

      // COMBINE EXISTING AND NEW IMAGES
      const allImages = [...request.existingImages, ...(imageResult.images || [])];

      // GET PORTFOLIO NAME IF PORTFOLIO ID IS PROVIDED
      let portfolioType: string | undefined;
      if (request.portfolio_id) {
        portfolioType = await this.getPortfolioName(request.portfolio_id);
      }

      // UPDATE NOTE DATA
      const updateData: any = {
        title: request.title.trim(),
        content: request.content.trim(),
        is_shared: request.is_shared || false,
        is_portfolio_shared: request.is_portfolio_shared || false,
        images: allImages.length > 0 ? allImages : null,
        updated_at: new Date().toISOString()
      };

      // Add team context if provided
      if (request.team_id) updateData.team_id = request.team_id;
      if (request.portfolio_id) {
        updateData.portfolio_id = request.portfolio_id;
        if (portfolioType) updateData.portfolio_type = portfolioType;
      }
      
      // Handle account_id based on portfolio sharing
      if (request.is_portfolio_shared) {
        updateData.account_id = null; // Portfolio-shared notes have no specific account
      } else if (request.account_id) {
        updateData.account_id = request.account_id;
      }

      // UPDATE NOTE
      const { data, error } = await supabase
        .from('notes')
        .update(updateData)
        .eq('id', request.noteId)
        .select()
        .single();

      if (error) {
        console.error('ERROR UPDATING NOTE:', error);
        return {
          success: false,
          error: 'Failed to update note'
        };
      }

      return {
        success: true,
        note: data
      };
    } catch (error) {
      console.error('Error updating note:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * GET ALL NOTES FOR A USER
   */
  async getUserNotes(userId: string): Promise<NotesListResult> {
    try {
      // GET USER'S OWN NOTES
      const supabase = await this.getSupabase();
      const { data: userNotes, error: userError } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (userError) {
        console.error('ERROR LOADING USER NOTES:', userError);
        return {
          success: false,
          error: 'Failed to load user notes'
        };
      }

      // GET SHARED NOTES
      const { data: sharedNotes, error: sharedError } = await supabase
        .from('notes')
        .select('*')
        .eq('is_shared', true)
        .order('updated_at', { ascending: false });

      if (sharedError) {
        console.error('ERROR LOADING SHARED NOTES:', sharedError);
        return {
          success: false,
          error: 'Failed to load shared notes'
        };
      }

      // COMBINE USER NOTES AND SHARED NOTES
      const allNotes = [...(userNotes || []), ...(sharedNotes || [])];
      
      // REMOVE DUPLICATES (IN CASE USER'S OWN NOTES ARE ALSO SHARED)
      const uniqueNotes = allNotes.filter((note, index, self) => 
        index === self.findIndex(n => n.id === note.id)
      );

      return {
        success: true,
        notes: uniqueNotes
      };
    } catch (error) {
      console.error('Error getting user notes:', error);
      return {
        success: false,
        error: 'Failed to load notes'
      };
    }
  }

  /**
   * DELETE A NOTE
   */
  async deleteNote(noteId: string, userId: string): Promise<NoteResult> {
    try {
      // GET NOTE TO CHECK FOR IMAGES BEFORE DELETING
      const supabase = await this.getSupabase();
      const { data: note, error: fetchError } = await supabase
        .from('notes')
        .select('images')
        .eq('id', noteId)
        .eq('user_id', userId)
        .single();

      if (fetchError) {
        console.error('ERROR FETCHING NOTE:', fetchError);
        return {
          success: false,
          error: 'Note not found or access denied'
        };
      }

      // DELETE ASSOCIATED IMAGES IF THEY EXIST
      if (note.images && Array.isArray(note.images) && note.images.length > 0) {
        await this.deleteImages(note.images);
      }

      // DELETE NOTE
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', noteId)
        .eq('user_id', userId);

      if (error) {
        console.error('ERROR DELETING NOTE:', error);
        return {
          success: false,
          error: 'Failed to delete note'
        };
      }

      return {
        success: true
      };
    } catch (error) {
      console.error('Error deleting note:', error);
      return {
        success: false,
        error: 'Failed to delete note'
      };
    }
  }
}
