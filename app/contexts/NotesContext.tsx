"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { createClient } from "../utils/supabase/client";

interface Note {
  id: string;
  user_id: string;
  portfolio_type: string;
  title: string;
  content: string;
  images?: Array<{url: string, description: string}> | null;
  is_shared: boolean;
  is_portfolio_shared: boolean;
  created_at: string;
  updated_at: string;
  team_id?: string | null;
  account_id?: string | null;
  portfolio_id?: string | null;
}

interface NotesContextType {
  notes: Note[];
  loading: boolean;
  createNote: (formData: FormData) => Promise<void>;
  updateNote: (formData: FormData) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  refreshNotes: () => Promise<void>;
  getNotesForPortfolio: (portfolioType: string, teamContext?: {
    teamId: string;
    accountId: string;
    portfolioId: string;
  }) => Note[];
}

const NotesContext = createContext<NotesContextType | undefined>(undefined);

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const refreshNotes = useCallback(async () => {
    if (!user) return;

    console.log('🔄 REFRESHING NOTES...');
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

      console.log('📝 USER NOTES LOADED:', userNotes?.length || 0, 'notes');

      // GET SHARED NOTES
      const { data: sharedNotes, error: sharedError } = await supabase
        .from('notes')
        .select('*')
        .eq('is_shared', true);

      if (sharedError) {
        console.error('ERROR LOADING SHARED NOTES:', sharedError);
        return;
      }

      console.log('📝 SHARED NOTES LOADED:', sharedNotes?.length || 0, 'notes');

      // COMBINE USER NOTES AND SHARED NOTES
      const allNotes = [...(userNotes || []), ...(sharedNotes || [])];
      
      // REMOVE DUPLICATES (IN CASE USER'S OWN NOTES ARE ALSO SHARED)
      const uniqueNotes = allNotes.filter((note, index, self) => 
        index === self.findIndex(n => n.id === note.id)
      );

      console.log('📝 TOTAL UNIQUE NOTES:', uniqueNotes.length);
      setNotes(uniqueNotes);
    } catch (error) {
      console.error('ERROR LOADING NOTES:', error);
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  // LOAD NOTES WHEN USER CHANGES
  useEffect(() => {
    if (user) {
      refreshNotes();
    }
  }, [user, refreshNotes]);

  // SET UP REAL-TIME SUBSCRIPTION FOR NOTES
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('notes-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          // REFRESH NOTES WHEN ANY CHANGE OCCURS
          console.log('🔄 REAL-TIME UPDATE: User notes changed, refreshing...');
          refreshNotes();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes',
          filter: 'is_shared=eq.true'
        },
        () => {
          // REFRESH NOTES WHEN SHARED NOTES CHANGE
          console.log('🔄 REAL-TIME UPDATE: Shared notes changed, refreshing...');
          refreshNotes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase, refreshNotes]);

  const createNote = async (formData: FormData) => {
    try {
      const response = await fetch('/api/notes/create', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'FAILED TO CREATE NOTE');
      }

      await refreshNotes();
    } catch (error) {
      console.error('ERROR CREATING NOTE:', error);
      throw error;
    }
  };

  const updateNote = async (formData: FormData) => {
    try {
      const response = await fetch('/api/notes/update', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'FAILED TO UPDATE NOTE');
      }

      await refreshNotes();
    } catch (error) {
      console.error('ERROR UPDATING NOTE:', error);
      throw error;
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      const response = await fetch('/api/notes/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ noteId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'FAILED TO DELETE NOTE');
      }

      await refreshNotes();
    } catch (error) {
      console.error('ERROR DELETING NOTE:', error);
      throw error;
    }
  };

  const getNotesForPortfolio = (portfolioType: string, teamContext?: {
    teamId: string;
    accountId: string;
    portfolioId: string;
  }) => {
    console.log('🔍 GETTING NOTES FOR PORTFOLIO:', { portfolioType, teamContext });
    
    const filteredNotes = notes.filter(note => {
      console.log('🔍 CHECKING NOTE:', {
        noteId: note.id,
        notePortfolio: note.portfolio_type,
        expectedPortfolio: portfolioType,
        noteTeamId: note.team_id,
        noteAccountId: note.account_id,
        notePortfolioId: note.portfolio_id,
        teamContext
      });

      // INCLUDE PORTFOLIO-SPECIFIC NOTES (CASE-INSENSITIVE)
      const portfolioMatch = note.portfolio_type.toLowerCase() === portfolioType.toLowerCase();
      console.log('✅ NOTE INCLUDED: Portfolio match', { portfolioMatch, notePortfolio: note.portfolio_type, expectedPortfolio: portfolioType });
      return portfolioMatch;
    });

    console.log('🔍 FILTERED NOTES RESULT:', {
      totalNotes: notes.length,
      filteredNotes: filteredNotes.length,
      portfolioType,
      teamContext
    });

    return filteredNotes;
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
    throw new Error('useNotes must be used within a NotesProvider');
  }
  return context;
} 