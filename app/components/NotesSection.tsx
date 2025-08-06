"use client";

import { useState } from "react";
import { useNotes } from "../contexts/NotesContext";
import { useChat } from "../contexts/ChatContext";
import { useAuth } from "../contexts/AuthContext";
import { PortfolioType } from "../utils/portfolios";
import NoteModal from "./NoteModal";

interface NotesSectionProps {
  onNoteSelect?: () => void;
}

export default function NotesSection({ onNoteSelect }: NotesSectionProps) {
  const { notes, loading, deleteNote, getNotesForPortfolio } = useNotes();
  const { currentPortfolio } = useChat();
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<any>(null);
  const [showAllNotes, setShowAllNotes] = useState(false);

  const handleEditNote = (note: any) => {
    // CHECK IF USER OWNS THE NOTE OR IF IT'S NOT SHARED
    if (note.user_id !== user?.id && note.is_shared) {
      alert('YOU CANNOT EDIT SHARED NOTES THAT DO NOT BELONG TO YOU');
      return;
    }
    setEditingNote(note);
    setIsModalOpen(true);
  };

  const handleDeleteNote = async (noteId: string) => {
    if (confirm('ARE YOU SURE YOU WANT TO DELETE THIS NOTE?')) {
      try {
        await deleteNote(noteId);
      } catch (error) {
        console.error('ERROR DELETING NOTE:', error);
        alert('ERROR DELETING NOTE - PLEASE TRY AGAIN');
      }
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingNote(null);
  };

  const handleAddNote = () => {
    setEditingNote(null);
    setIsModalOpen(true);
  };

  // GET RELEVANT NOTES BASED ON CURRENT PORTFOLIO OR SHOW ALL
  const relevantNotes = showAllNotes 
    ? notes 
    : currentPortfolio 
      ? getNotesForPortfolio(currentPortfolio)
      : [];

  const getPortfolioDisplayName = (portfolioType: string) => {
    switch (portfolioType) {
      case 'general': return 'GENERAL';
      case 'hip': return 'HIP';
      case 'knee': return 'KNEE';
      case 'ts_knee': return 'TS KNEE';
      default: return portfolioType.toUpperCase();
    }
  };

  const getPortfolioColor = (portfolioType: string) => {
    switch (portfolioType) {
      case 'general': return 'bg-slate-500';
      case 'hip': return 'bg-blue-500';
      case 'knee': return 'bg-green-500';
      case 'ts_knee': return 'bg-purple-500';
      default: return 'bg-slate-500';
    }
  };

  // CHECK IF USER CAN EDIT A NOTE
  const canEditNote = (note: any) => {
    return note.user_id === user?.id || !note.is_shared;
  };

  return (
    <>
      <div className="p-4 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300">NOTES</h2>
          <button
            onClick={handleAddNote}
            className="text-xs bg-slate-600 hover:bg-slate-500 text-slate-100 px-2 py-1 rounded transition-colors"
          >
            ADD NOTE
          </button>
        </div>

        {/* TOGGLE FOR SHOWING ALL NOTES VS CURRENT PORTFOLIO */}
        <div className="flex items-center space-x-2 mb-3">
          <button
            onClick={() => setShowAllNotes(false)}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              !showAllNotes 
                ? 'bg-slate-600 text-slate-100' 
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            CURRENT
          </button>
          <button
            onClick={() => setShowAllNotes(true)}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              showAllNotes 
                ? 'bg-slate-600 text-slate-100' 
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            ALL NOTES
          </button>
        </div>

        {loading ? (
          <div className="text-xs text-slate-400 text-center py-4">
            LOADING NOTES...
          </div>
        ) : relevantNotes.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-4">
            {showAllNotes ? 'NO NOTES YET' : 'NO NOTES FOR CURRENT PORTFOLIO'}
          </div>
        ) : (
          <div className="space-y-2 flex-1 overflow-y-auto scrollbar-hide">
            {relevantNotes.map((note) => (
              <div
                key={note.id}
                className="bg-slate-700 rounded-md p-3 text-sm group relative"
              >
                {/* PORTFOLIO BADGE */}
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs px-2 py-1 rounded ${getPortfolioColor(note.portfolio_type)} text-white`}>
                    {getPortfolioDisplayName(note.portfolio_type)}
                  </span>
                  {note.is_shared && (
                    <span className="text-xs text-slate-400" title="SHARED NOTE">
                      SHARED
                    </span>
                  )}
                </div>

                {/* NOTE TITLE */}
                <div className="font-medium text-slate-100 mb-1 truncate">
                  {note.title}
                </div>

                {/* NOTE CONTENT PREVIEW */}
                <div className="text-xs text-slate-400 mb-2 line-clamp-2">
                  {note.content.length > 100 
                    ? `${note.content.substring(0, 100)}...` 
                    : note.content
                  }
                </div>

                {/* NOTE METADATA */}
                <div className="text-xs text-slate-500 mb-2">
                  {new Date(note.updated_at).toLocaleDateString()}
                </div>

                {/* ACTION BUTTONS - MOVED TO BOTTOM RIGHT LIKE CHAT HISTORY */}
                {note.user_id === user?.id && (
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    className="absolute bottom-2 right-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 text-xs p-1"
                    title="DELETE NOTE"
                  >
                    TRASH
                  </button>
                )}
                {canEditNote(note) && (
                  <button
                    onClick={() => handleEditNote(note)}
                    className="absolute bottom-2 right-12 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-200 text-xs p-1"
                    title="EDIT NOTE"
                  >
                    EDIT
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <NoteModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        editingNote={editingNote}
      />
    </>
  );
} 