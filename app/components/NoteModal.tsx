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
    tags?: string[];
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
  const [isShared, setIsShared] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [images, setImages] = useState<{ file: File; description: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  // RESET FORM WHEN MODAL OPENS/CLOSES OR EDITING NOTE CHANGES
  useEffect(() => {
    if (isOpen) {
      if (editingNote) {
        setTitle(editingNote.title);
        setContent(editingNote.content);
        setIsShared(editingNote.is_shared);
        setTags(editingNote.tags || []);
      } else {
        setTitle("");
        setContent("");
        setIsShared(false);
        setTags([]);
      }
      setImages([]);
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
      formData.append('is_shared', isShared.toString());
      formData.append('tags', JSON.stringify(tags));

      // ADD TEAM CONTEXT IF AVAILABLE
      if (teamContext) {
        formData.append('team_id', teamContext.teamId);
        formData.append('account_id', teamContext.accountId);
        formData.append('portfolio_id', teamContext.portfolioId);
      }

      // ADD IMAGES
      images.forEach((image, index) => {
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

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const addImage = () => {
    setImages([...images, { file: new File([], ''), description: '' }]);
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const updateImage = (index: number, field: 'file' | 'description', value: File | string) => {
    setImages(images.map((image, i) => 
      i === index ? { ...image, [field]: value } : image
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
                {teamContext.teamName} → {teamContext.accountName} → {teamContext.portfolioName}
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

            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={isShared}
                  onChange={(e) => setIsShared(e.target.checked)}
                  className="rounded border-slate-600 text-slate-500 focus:ring-slate-500"
                />
                <span className="text-sm text-slate-300">SHARE WITH TEAM</span>
              </label>
              {isShared && teamContext && (
                <p className="text-xs text-slate-400 mt-1">
                  <strong>NOTE:</strong> SHARED NOTES WILL BE VISIBLE TO ALL USERS IN THE {teamContext.portfolioName.toUpperCase()} PORTFOLIO.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                TAGS
              </label>
              <div className="flex space-x-2 mb-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                  placeholder="ADD TAG"
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="px-4 py-2 bg-slate-600 text-slate-100 rounded-md hover:bg-slate-500 transition-colors"
                >
                  ADD
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-slate-600 text-slate-200"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-1 text-slate-400 hover:text-slate-200"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                IMAGES
              </label>
              {images.map((image, index) => (
                <div key={index} className="flex space-x-2 mb-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) updateImage(index, 'file', file);
                    }}
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    value={image.description}
                    onChange={(e) => updateImage(index, 'description', e.target.value)}
                    placeholder="DESCRIPTION"
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                  >
                    REMOVE
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addImage}
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