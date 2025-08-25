"use client";

import { useState } from "react";
import { useNotes } from '../contexts/NotesContext';
import { useAuth } from '../contexts/AuthContext';
import NoteModal from './NoteModal';

interface NotesSectionProps {
  teamContext?: {
    teamId: string;
    teamName: string;
    accountId: string;
    accountName: string;
    portfolioId: string;
    portfolioName: string;
  } | null;
}

function getPortfolioColor(portfolioType: string): string {
  const colors: { [key: string]: string } = {
    'resume': 'bg-blue-600',
    'cover letter': 'bg-green-600',
    'portfolio': 'bg-purple-600',
    'general': 'bg-gray-600',
  };
  return colors[portfolioType.toLowerCase()] || 'bg-slate-600';
}

function getPortfolioDisplayName(portfolioType: string): string {
  return portfolioType.charAt(0).toUpperCase() + portfolioType.slice(1);
}

export default function NotesSection({ teamContext }: NotesSectionProps) {
  console.log('🎯 NOTES SECTION COMPONENT RENDERED');
  const { notes, loading, getNotesForPortfolio, deleteNote, refreshNotes } = useNotes();
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<any>(null);

  // GET RELEVANT NOTES FOR CURRENT PORTFOLIO
  const relevantNotes = teamContext 
    ? getNotesForPortfolio(teamContext.portfolioName, teamContext)
    : notes;

  console.log('📝 NOTES SECTION - RELEVANT NOTES:', {
    totalNotes: notes.length,
    relevantNotes: relevantNotes.length,
    teamContext: teamContext?.portfolioName
  });

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

  // CHECK IF USER CAN EDIT A NOTE
  const canEditNote = (note: any) => {
    return note.user_id === user?.id || !note.is_shared;
  };

  if (loading) {
    return (
      <div className="flex-1 bg-slate-800 p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-slate-700 rounded w-1/4"></div>
          <div className="h-4 bg-slate-700 rounded w-1/2"></div>
          <div className="h-4 bg-slate-700 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 bg-slate-800 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-100">
            NOTES {teamContext && `(${relevantNotes.length})`}
          </h3>
          <button
            onClick={handleAddNote}
            className="text-xs bg-slate-600 hover:bg-slate-500 text-slate-100 px-2 py-1 rounded transition-colors"
          >
            ADD NOTE
          </button>
        </div>

        {relevantNotes.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-400 text-sm">
              {teamContext 
                ? `NO NOTES FOR ${teamContext.portfolioName.toUpperCase()} PORTFOLIO`
                : 'NO NOTES FOUND'
              }
            </p>
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
                  <div className="flex items-center space-x-1">
                    <span className={`text-xs px-2 py-1 rounded ${getPortfolioColor(note.portfolio_type)} text-white`}>
                      {getPortfolioDisplayName(note.portfolio_type)}
                    </span>
                  </div>
                  {note.is_portfolio_shared && (
                    <span className="text-xs text-green-400" title="SHARED ACROSS ALL ACCOUNTS IN PORTFOLIO">
                      PORTFOLIO
                    </span>
                  )}
                  {note.is_shared && !note.is_portfolio_shared && (
                    <span className="text-xs text-purple-400" title="SHARED WITH ENTIRE TEAM">
                      TEAM
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

                {/* IMAGE INDICATOR */}
                {note.images && note.images.length > 0 && (
                  <div className="flex items-center space-x-1 mb-2">
                    <span className="text-slate-400 text-xs">📷</span>
                    <span className="text-slate-400 text-xs">
                      {`${note.images.length} image${note.images.length > 1 ? 's' : ''}`}
                    </span>
                  </div>
                )}

                {/* NOTE METADATA */}
                <div className="text-xs text-slate-500 mb-2">
                  {new Date(note.created_at).toLocaleDateString()}
                  {note.updated_at !== note.created_at && (
                    <span className="ml-2">(UPDATED: {new Date(note.updated_at).toLocaleDateString()})</span>
                  )}
                </div>

                {/* ACTION BUTTONS */}
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
                    className="absolute bottom-2 right-13 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-200 text-xs p-1"
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
        onNoteCreated={() => {
          // EXPLICITLY REFRESH NOTES WHEN A NEW NOTE IS CREATED
          refreshNotes();
        }}
        editingNote={editingNote}
        teamContext={teamContext}
      />
    </>
  );
} 