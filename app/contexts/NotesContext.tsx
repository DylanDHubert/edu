"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { createClient } from "../utils/supabase/client";
import { PortfolioType } from "../utils/portfolios";

interface Note {
  id: string;
  user_id: string;
  portfolio_type: PortfolioType | 'general';
  title: string;
  content: string;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

interface NotesContextType {
  notes: Note[];
  loading: boolean;
  createNote: (note: Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  refreshNotes: () => Promise<void>;
  getNotesForPortfolio: (portfolioType: PortfolioType | 'general') => Note[];
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
      // GET USER'S OWN NOTES
      const { data: userNotes, error: userError } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id);

      if (userError) {
        console.error('ERROR LOADING USER NOTES:', userError);
        return;
      }

      // GET SHARED NOTES
      const { data: sharedNotes, error: sharedError } = await supabase
        .from('notes')
        .select('*')
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

      setNotes(uniqueNotes);
    } catch (error) {
      console.error('ERROR LOADING NOTES:', error);
    } finally {
      setLoading(false);
    }
  };

  const createNote = async (note: Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          ...note
        })
        .select()
        .single();

      if (error) {
        throw new Error('FAILED TO CREATE NOTE');
      }

      setNotes(prev => [data, ...prev]);
    } catch (error) {
      console.error('ERROR CREATING NOTE:', error);
      throw error;
    }
  };

  const updateNote = async (id: string, updates: Partial<Note>) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('notes')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id) // ENSURE USER OWNS THE NOTE
        .select()
        .single();

      if (error) {
        throw new Error('FAILED TO UPDATE NOTE');
      }

      setNotes(prev => prev.map(note => note.id === id ? data : note));
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

  const value = {
    notes,
    loading,
    createNote,
    updateNote,
    deleteNote,
    refreshNotes,
    getNotesForPortfolio,
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