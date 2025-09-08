/**
 * TYPESCRIPT INTERFACES FOR NOTES FUNCTIONALITY
 */

export interface NoteImage {
  url: string;
  description: string;
}

export interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string;
  images: NoteImage[] | null;
  is_shared: boolean;
  is_portfolio_shared: boolean;
  team_id?: string;
  account_id?: string;
  portfolio_id?: string;
  portfolio_type?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateNoteRequest {
  title: string;
  content: string;
  is_shared: boolean;
  is_portfolio_shared: boolean;
  team_id?: string;
  account_id?: string;
  portfolio_id?: string;
  imageFiles: File[];
  imageDescriptions: string[];
}

export interface UpdateNoteRequest {
  noteId: string;
  title: string;
  content: string;
  is_shared: boolean;
  is_portfolio_shared: boolean;
  team_id?: string;
  account_id?: string;
  portfolio_id?: string;
  existingImages: NoteImage[];
  imageFiles: File[];
  imageDescriptions: string[];
}

export interface NoteResult {
  success: boolean;
  note?: Note;
  error?: string;
}

export interface NotesListResult {
  success: boolean;
  notes?: Note[];
  error?: string;
}

export interface FormDataEntry {
  file?: File;
  description?: string;
}

export interface ImageUploadResult {
  success: boolean;
  images?: NoteImage[];
  error?: string;
}
