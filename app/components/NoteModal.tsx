"use client";

import { useState, useEffect } from "react";
import { useNotes } from "../contexts/NotesContext";
import { PortfolioType } from "../utils/portfolios";

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingNote?: {
    id: string;
    portfolio_type: PortfolioType | 'general';
    title: string;
    content: string;
    is_shared: boolean;
  } | null;
}

export default function NoteModal({ isOpen, onClose, editingNote }: NoteModalProps) {
  const { createNote, updateNote } = useNotes();
  const [portfolioType, setPortfolioType] = useState<PortfolioType | 'general'>('general');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // RESET FORM WHEN MODAL OPENS/CLOSES OR EDITING NOTE CHANGES
  useEffect(() => {
    if (isOpen) {
      if (editingNote) {
        setPortfolioType(editingNote.portfolio_type);
        setTitle(editingNote.title);
        setContent(editingNote.content);
        setIsShared(editingNote.is_shared);
      } else {
        setPortfolioType('general');
        setTitle('');
        setContent('');
        setIsShared(false);
      }
    }
  }, [isOpen, editingNote]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !content.trim()) {
      alert('PLEASE FILL IN ALL REQUIRED FIELDS');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingNote) {
        await updateNote(editingNote.id, {
          portfolio_type: portfolioType,
          title: title.trim(),
          content: content.trim(),
          is_shared: isShared
        });
      } else {
        await createNote({
          portfolio_type: portfolioType,
          title: title.trim(),
          content: content.trim(),
          is_shared: isShared
        });
      }
      onClose();
    } catch (error) {
      console.error('ERROR SAVING NOTE:', error);
      alert('ERROR SAVING NOTE - PLEASE TRY AGAIN');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-100">
            {editingNote ? 'EDIT NOTE' : 'CREATE NEW NOTE'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* PORTFOLIO SELECTION */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              PORTFOLIO
            </label>
            <select
              value={portfolioType}
              onChange={(e) => setPortfolioType(e.target.value as PortfolioType | 'general')}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500"
              disabled={isSubmitting}
            >
              <option value="general">GENERAL (ALL PORTFOLIOS)</option>
              <option value="hip">HIP PORTFOLIO</option>
              <option value="knee">KNEE PORTFOLIO</option>
              <option value="ts_knee">TS KNEE PORTFOLIO</option>
            </select>
          </div>

          {/* TITLE */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              TITLE *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500"
              placeholder="ENTER NOTE TITLE..."
              disabled={isSubmitting}
              required
            />
          </div>

          {/* CONTENT */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              CONTENT *
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500"
              placeholder="ENTER NOTE CONTENT..."
              rows={8}
              disabled={isSubmitting}
              required
            />
          </div>

          {/* SHARED TOGGLE */}
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="shared"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
              className="w-4 h-4 text-slate-600 bg-slate-700 border-slate-600 rounded focus:ring-slate-500"
              disabled={isSubmitting}
            />
            <label htmlFor="shared" className="text-sm text-slate-300">
              SHARE WITH ALL USERS
            </label>
          </div>

          {/* SHARED NOTE WARNING */}
          {isShared && (
            <div className="bg-slate-700 border border-slate-600 rounded-lg p-3">
              <p className="text-sm text-slate-300">
                <strong>NOTE:</strong> SHARED NOTES WILL BE VISIBLE TO ALL USERS IN THE {portfolioType.toUpperCase()} PORTFOLIO.
              </p>
            </div>
          )}

          {/* BUTTONS */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:text-slate-100 transition-colors"
              disabled={isSubmitting}
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !content.trim()}
              className="bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-100 px-4 py-2 rounded-lg transition-colors"
            >
              {isSubmitting ? 'SAVING...' : (editingNote ? 'UPDATE NOTE' : 'CREATE NOTE')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 