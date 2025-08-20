"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { createClient } from "../utils/supabase/client";

import { NoteTag, NoteTags, tagsArrayToObject, tagsObjectToArray } from "../utils/notes";

interface Note {
  id: string;
  user_id: string;
  portfolio_type: string;
  title: string;
  content: string;
  image_url?: string | null;
  image_description?: string | null;
  images?: Array<{url: string, description: string}> | null;
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
  getNotesForPortfolio: (portfolioType: string, teamContext?: {
    teamId: string;
    accountId: string;
    portfolioId: string;
  }) => Note[];
  getUniqueTags: () => { [key: string]: string[] };
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

      console.log('📝 USER NOTES LOADED:', userNotes?.length || 0, 'notes');

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

      console.log('📝 SHARED NOTES LOADED:', sharedNotes?.length || 0, 'notes');

      // COMBINE USER NOTES AND SHARED NOTES
      const allNotes = [...(userNotes || []), ...(sharedNotes || [])];
      
      // REMOVE DUPLICATES (IN CASE USER'S OWN NOTES ARE ALSO SHARED)
      const uniqueNotes = allNotes.filter((note, index, self) => 
        index === self.findIndex(n => n.id === note.id)
      );

      console.log('📝 TOTAL UNIQUE NOTES:', uniqueNotes.length);

      // PROCESS TAGS FOR EACH NOTE
      const processedNotes = uniqueNotes.map(note => ({
        ...note,
        tags: note.note_tags ? tagsArrayToObject(note.note_tags) : undefined
      }));

      console.log('📝 PROCESSED NOTES:', processedNotes.length, 'notes');
      setNotes(processedNotes);
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

  const getNotesForPortfolio = (portfolioType: string, teamContext?: {
    teamId: string;
    accountId: string;
    portfolioId: string;
  }): Note[] => {
    console.log('🔍 FILTERING NOTES FOR PORTFOLIO:', {
      portfolioType,
      teamContext,
      totalNotes: notes.length,
      allNotes: notes.map(n => ({ id: n.id, title: n.title, portfolio_type: n.portfolio_type, tags: n.tags }))
    });

    console.log('🔍 STARTING FILTER - NOTES ARRAY:', notes);
    
    const filteredNotes = notes.filter(note => {
      console.log('🔍 CHECKING NOTE:', {
        id: note.id,
        title: note.title,
        portfolio_type: note.portfolio_type,
        tags: note.tags,
        is_shared: note.is_shared,
        noteKeys: Object.keys(note)
      });

      // FILTER BY TEAM CONTEXT IF PROVIDED
      if (teamContext && note.tags) {
        // CHECK IF NOTE HAS TEAM TAG THAT MATCHES CURRENT TEAM
        const noteTeamId = note.tags.team;
        if (noteTeamId && noteTeamId !== teamContext.teamId) {
          console.log('❌ NOTE FILTERED OUT: Team ID mismatch', { noteTeamId, expectedTeamId: teamContext.teamId });
          return false;
        }
        
        // CHECK IF NOTE HAS ACCOUNT TAG THAT MATCHES CURRENT ACCOUNT
        const noteAccountId = note.tags.account;
        if (noteAccountId && noteAccountId !== teamContext.accountId) {
          console.log('❌ NOTE FILTERED OUT: Account ID mismatch', { noteAccountId, expectedAccountId: teamContext.accountId });
          return false;
        }
      }
      
      // INCLUDE GENERAL NOTES FOR ALL PORTFOLIOS
      if (note.portfolio_type.toLowerCase() === 'general') {
        console.log('✅ NOTE INCLUDED: General note');
        return true;
      }
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

  const getUniqueTags = (): { [key: string]: string[] } => {
    const tagCategories: { [key: string]: Set<string> } = {
      account: new Set(),
      team: new Set()
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
      team: Array.from(tagCategories.team).sort()
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