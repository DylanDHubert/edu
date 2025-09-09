"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";

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

  const refreshNotes = useCallback(async () => {
    if (!user) return;

    // Refreshing notes via API
    setLoading(true);
    try {
      // USE API ROUTE INSTEAD OF DIRECT SUPABASE CALLS
      const response = await fetch('/api/notes/list', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load notes');
      }

      const { notes: loadedNotes } = await response.json();
      // Notes loaded via API
      setNotes(loadedNotes || []);
    } catch (error) {
      console.error('ERROR LOADING NOTES:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // LOAD NOTES WHEN USER CHANGES
  useEffect(() => {
    if (user) {
      refreshNotes();
    }
  }, [user, refreshNotes]);

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

      // REFRESH NOTES AFTER CREATION
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

      // REFRESH NOTES AFTER UPDATE
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

      // REFRESH NOTES AFTER DELETION
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
    if (!teamContext) {
      // RETURN ALL NOTES IF NO TEAM CONTEXT
      return notes;
    }

    // FILTER NOTES BASED ON PORTFOLIO AND TEAM CONTEXT
    return notes.filter(note => {
      // USER'S OWN NOTES FOR THIS PORTFOLIO
      if (note.user_id === user?.id && note.portfolio_type === portfolioType) {
        return true;
      }

      // SHARED NOTES FOR THIS PORTFOLIO
      if (note.is_shared && note.portfolio_type === portfolioType) {
        return true;
      }

      // PORTFOLIO-SHARED NOTES FOR THIS SPECIFIC PORTFOLIO
      if (note.is_portfolio_shared && note.portfolio_id === teamContext.portfolioId) {
        return true;
      }

      return false;
    });
  };

  const value: NotesContextType = {
    notes,
    loading,
    createNote,
    updateNote,
    deleteNote,
    refreshNotes,
    getNotesForPortfolio,
  };

  return (
    <NotesContext.Provider value={value}>
      {children}
    </NotesContext.Provider>
  );
}

export function useNotes() {
  const context = useContext(NotesContext);
  if (context === undefined) {
    throw new Error('useNotes must be used within a NotesProvider');
  }
  return context;
}