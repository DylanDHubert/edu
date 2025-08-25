"use client";

import { useState, useEffect } from "react";
import { createClient } from "../utils/supabase/client";
import { useAuth } from "../contexts/AuthContext";

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNoteCreated: () => void;
  editingNote?: {
    id: string;
    title: string;
    content: string;
    is_shared: boolean;
    is_portfolio_shared: boolean;
    images?: Array<{url: string, description: string}> | null;
    team_id?: string;
    account_id?: string;
    portfolio_id?: string;
  } | null;
  teamContext?: {
    teamId: string;
    teamName: string;
    accountId: string;
    accountName: string;
    portfolioId: string;
    portfolioName: string;
  } | null;
}

export default function NoteModal({ isOpen, onClose, onNoteCreated, editingNote, teamContext }: NoteModalProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sharingLevel, setSharingLevel] = useState<'private' | 'account' | 'portfolio' | 'team'>('private');
  const [newImages, setNewImages] = useState<{ file: File; description: string }[]>([]);
  const [existingImages, setExistingImages] = useState<Array<{url: string, description: string}>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  // RESET FORM WHEN MODAL OPENS/CLOSES OR EDITING NOTE CHANGES
  useEffect(() => {
    if (isOpen) {
      if (editingNote) {
        setTitle(editingNote.title);
        setContent(editingNote.content);
        // Determine sharing level from editing note
        if (editingNote.is_portfolio_shared) {
          setSharingLevel('portfolio');
        } else if (editingNote.is_shared) {
          setSharingLevel('team');
        } else if (editingNote.account_id) {
          setSharingLevel('account');
        } else {
          setSharingLevel('private');
        }
        setExistingImages(editingNote.images || []);
      } else {
        setTitle("");
        setContent("");
        setSharingLevel('private');
        setExistingImages([]);
      }
      setNewImages([]);
      setError("");
    }
  }, [isOpen, editingNote]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError("TITLE AND CONTENT ARE REQUIRED");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('content', content.trim());
      formData.append('is_shared', (sharingLevel === 'team').toString());
      formData.append('is_portfolio_shared', (sharingLevel === 'portfolio').toString());

      // ADD TEAM CONTEXT IF AVAILABLE
      if (teamContext) {
        formData.append('team_id', teamContext.teamId);
        formData.append('account_id', teamContext.accountId);
        formData.append('portfolio_id', teamContext.portfolioId);
      }

      // ADD EXISTING IMAGES
      formData.append('existing_images', JSON.stringify(existingImages));

      // ADD NEW IMAGES
      newImages.forEach((image, index) => {
        formData.append(`image_${index}`, image.file);
        formData.append(`image_description_${index}`, image.description);
      });

      const endpoint = editingNote ? '/api/notes/update' : '/api/notes/create';
      if (editingNote) {
        formData.append('noteId', editingNote.id);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'FAILED TO SAVE NOTE');
      }

      onNoteCreated();
      onClose();
    } catch (error) {
      console.error('ERROR SAVING NOTE:', error);
      setError(error instanceof Error ? error.message : 'AN UNEXPECTED ERROR OCCURRED');
    } finally {
      setLoading(false);
    }
  };

  const addNewImage = () => {
    setNewImages([...newImages, { file: new File([], ''), description: '' }]);
  };

  const removeNewImage = (index: number) => {
    setNewImages(newImages.filter((_, i) => i !== index));
  };

  const updateNewImage = (index: number, field: 'file' | 'description', value: File | string) => {
    setNewImages(newImages.map((image, i) => 
      i === index ? { ...image, [field]: value } : image
    ));
  };

  const removeExistingImage = (index: number) => {
    setExistingImages(existingImages.filter((_, i) => i !== index));
  };

  const updateExistingImageDescription = (index: number, description: string) => {
    setExistingImages(existingImages.map((image, i) => 
      i === index ? { ...image, description } : image
    ));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-100">
              {editingNote ? 'EDIT NOTE' : 'CREATE NOTE'}
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-100 text-2xl"
            >
              ×
            </button>
          </div>

          {/* TEAM CONTEXT DISPLAY */}
          {teamContext && (
            <div className="mb-4 p-3 bg-blue-900/20 border border-blue-700 rounded-md">
              <p className="text-blue-300 text-sm font-medium">ADDING TO:</p>
              <p className="text-blue-200 text-sm">
                {sharingLevel === 'team' ? (
                  // Team-wide sharing
                  `${teamContext.teamName} → Entire Team`
                ) : sharingLevel === 'portfolio' ? (
                  // Portfolio-wide sharing
                  `${teamContext.teamName} → All Accounts → ${teamContext.portfolioName}`
                ) : (
                  // Private or Account-specific
                  `${teamContext.teamName} → ${teamContext.accountName} → ${teamContext.portfolioName}`
                )}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-900/20 border border-red-500 text-red-200 px-4 py-3 rounded-md">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="title" className="block text-sm font-medium text-slate-300 mb-2">
                TITLE
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                placeholder="ENTER NOTE TITLE"
                required
              />
            </div>

            <div>
              <label htmlFor="content" className="block text-sm font-medium text-slate-300 mb-2">
                CONTENT
              </label>
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent resize-none"
                placeholder="ENTER NOTE CONTENT"
                required
              />
            </div>

            <div className="space-y-3">
              <div className="text-sm text-slate-400 mb-2">
                SHARING OPTIONS:
              </div>
              
              {teamContext && (
                <>
                  <div className="flex items-center space-x-3">
                    <input
                      id="private"
                      type="radio"
                      name="sharing"
                      checked={sharingLevel === 'private'}
                      onChange={() => setSharingLevel('private')}
                      className="w-4 h-4 text-slate-600 bg-slate-700 border-slate-600 rounded focus:ring-slate-500 focus:ring-2"
                    />
                    <label htmlFor="private" className="text-sm text-slate-300">
                      <span className="font-medium">Private</span> - Just me
                    </label>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <input
                      id="account"
                      type="radio"
                      name="sharing"
                      checked={sharingLevel === 'account'}
                      onChange={() => setSharingLevel('account')}
                      disabled={!teamContext.accountId}
                      className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500 focus:ring-2 disabled:opacity-50"
                    />
                    <label htmlFor="account" className="text-sm text-slate-300">
                      <span className="font-medium">Account</span> - {teamContext.accountName} only
                    </label>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <input
                      id="portfolio"
                      type="radio"
                      name="sharing"
                      checked={sharingLevel === 'portfolio'}
                      onChange={() => setSharingLevel('portfolio')}
                      className="w-4 h-4 text-green-600 bg-slate-700 border-slate-600 rounded focus:ring-green-500 focus:ring-2"
                    />
                    <label htmlFor="portfolio" className="text-sm text-slate-300">
                      <span className="font-medium">Portfolio</span> - All hospitals in this portfolio
                    </label>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <input
                      id="team"
                      type="radio"
                      name="sharing"
                      checked={sharingLevel === 'team'}
                      onChange={() => setSharingLevel('team')}
                      className="w-4 h-4 text-purple-600 bg-slate-700 border-slate-600 rounded focus:ring-purple-500 focus:ring-2"
                    />
                    <label htmlFor="team" className="text-sm text-slate-300">
                      <span className="font-medium">Team</span> - Everyone on the team
                    </label>
                  </div>
                </>
              )}
            </div>

            {/* EXISTING IMAGES */}
            {existingImages.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  EXISTING IMAGES ({existingImages.length})
                </label>
                <div className="space-y-3">
                  {existingImages.map((image, index) => (
                    <div key={index} className="border border-slate-600 rounded-md p-3 bg-slate-700">
                      <div className="flex items-start space-x-3">
                        <img
                          src={image.url}
                          alt={image.description}
                          className="w-20 h-20 object-cover rounded-md"
                          onError={(e) => {
                            console.error('Failed to load image:', image.url);
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <div className="flex-1">
                          <input
                            type="text"
                            value={image.description}
                            onChange={(e) => updateExistingImageDescription(index, e.target.value)}
                            placeholder="DESCRIPTION"
                            className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent mb-2"
                          />
                          <button
                            type="button"
                            onClick={() => removeExistingImage(index)}
                            className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
                          >
                            REMOVE
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* NEW IMAGES */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                ADD NEW IMAGES
              </label>
              {newImages.map((image, index) => (
                <div key={index} className="flex space-x-2 mb-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) updateNewImage(index, 'file', file);
                    }}
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    value={image.description}
                    onChange={(e) => updateNewImage(index, 'description', e.target.value)}
                    placeholder="DESCRIPTION"
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => removeNewImage(index)}
                    className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                  >
                    REMOVE
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addNewImage}
                className="px-4 py-2 bg-slate-600 text-slate-100 rounded-md hover:bg-slate-500 transition-colors"
              >
                ADD IMAGE
              </button>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-300 hover:text-slate-100 transition-colors"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "SAVING..." : (editingNote ? "UPDATE" : "CREATE")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 