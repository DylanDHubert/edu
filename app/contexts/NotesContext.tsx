"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { createClient } from "../utils/supabase/client";
import { PortfolioType } from "../utils/portfolios";
import { NoteTag, NoteTags, tagsArrayToObject, tagsObjectToArray } from "../utils/notes";

interface Note {
  id: string;
  user_id: string;
  portfolio_type: PortfolioType | 'general';
  title: string;
  content: string;
  image_url?: string | null;
  image_description?: string | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
  tags?: NoteTags;
}

interface NotesContextType {
  notes: Note[];
  loading: boolean;
  createNote: (formData: FormData) => Promise<void>;
  updateNote: (formData: FormData) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  refreshNotes: () => Promise<void>;
  getNotesForPortfolio: (portfolioType: PortfolioType | 'general') => Note[];
  getUniqueTags: () => { [key: string]: string[] };
}

const NotesContext = createContext<NotesContextType | undefined>(undefined);

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  // LOAD NOTES WHEN USER CHANGES
  useEffect(() => {
    if (user) {
      refreshNotes();
    }
  }, [user]);

  const refreshNotes = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // GET USER'S OWN NOTES WITH TAGS
      const { data: userNotes, error: userError } = await supabase
        .from('notes')
        .select(`
          *,
          note_tags (
            id,
            tag_name,
            tag_value
          )
        `)
        .eq('user_id', user.id);

      if (userError) {
        console.error('ERROR LOADING USER NOTES:', userError);
        return;
      }

      // GET SHARED NOTES WITH TAGS
      const { data: sharedNotes, error: sharedError } = await supabase
        .from('notes')
        .select(`
          *,
          note_tags (
            id,
            tag_name,
            tag_value
          )
        `)
        .eq('is_shared', true);

      if (sharedError) {
        console.error('ERROR LOADING SHARED NOTES:', sharedError);
        return;
      }

      // COMBINE USER NOTES AND SHARED NOTES
      const allNotes = [...(userNotes || []), ...(sharedNotes || [])];
      
      // REMOVE DUPLICATES (IN CASE USER'S OWN NOTES ARE ALSO SHARED)
      const uniqueNotes = allNotes.filter((note, index, self) => 
        index === self.findIndex(n => n.id === note.id)
      );

      // PROCESS TAGS FOR EACH NOTE
      const processedNotes = uniqueNotes.map(note => ({
        ...note,
        tags: note.note_tags ? tagsArrayToObject(note.note_tags) : undefined
      }));

      setNotes(processedNotes);
    } catch (error) {
      console.error('ERROR LOADING NOTES:', error);
    } finally {
      setLoading(false);
    }
  };

  const createNote = async (formData: FormData) => {
    if (!user) return;

    try {
      const response = await fetch('/api/notes/create', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'FAILED TO CREATE NOTE');
      }

      const data = await response.json();
      
      // REFRESH NOTES TO GET THE LATEST DATA
      await refreshNotes();
    } catch (error) {
      console.error('ERROR CREATING NOTE:', error);
      throw error;
    }
  };

  const updateNote = async (formData: FormData) => {
    if (!user) return;

    try {
      const response = await fetch('/api/notes/update', {
        method: 'PUT',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'FAILED TO UPDATE NOTE');
      }

      const data = await response.json();
      
      // REFRESH NOTES TO GET THE LATEST DATA
      await refreshNotes();
    } catch (error) {
      console.error('ERROR UPDATING NOTE:', error);
      throw error;
    }
  };

  const deleteNote = async (id: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id); // ENSURE USER OWNS THE NOTE

      if (error) {
        throw new Error('FAILED TO DELETE NOTE');
      }

      setNotes(prev => prev.filter(note => note.id !== id));
    } catch (error) {
      console.error('ERROR DELETING NOTE:', error);
      throw error;
    }
  };

  const getNotesForPortfolio = (portfolioType: PortfolioType | 'general'): Note[] => {
    return notes.filter(note => {
      // INCLUDE GENERAL NOTES FOR ALL PORTFOLIOS
      if (note.portfolio_type === 'general') return true;
      // INCLUDE PORTFOLIO-SPECIFIC NOTES
      return note.portfolio_type === portfolioType;
    });
  };

  const getUniqueTags = (): { [key: string]: string[] } => {
    const tagCategories: { [key: string]: Set<string> } = {
      account: new Set(),
      team: new Set(),
      priority: new Set(),
      status: new Set()
    };

    notes.forEach(note => {
      if (note.tags) {
        Object.entries(note.tags).forEach(([category, value]) => {
          if (value && value.trim() !== '') {
            tagCategories[category]?.add(value.trim());
          }
        });
      }
    });

    return {
      account: Array.from(tagCategories.account).sort(),
      team: Array.from(tagCategories.team).sort(),
      priority: Array.from(tagCategories.priority).sort(),
      status: Array.from(tagCategories.status).sort()
    };
  };

  const value = {
    notes,
    loading,
    createNote,
    updateNote,
    deleteNote,
    refreshNotes,
    getNotesForPortfolio,
    getUniqueTags,
  };

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes() {
  const context = useContext(NotesContext);
  if (context === undefined) {
    throw new Error('USENOTES MUST BE USED WITHIN A NOTESPROVIDER');
  }
  return context;
} 