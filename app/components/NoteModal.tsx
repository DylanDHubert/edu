"use client";

import { useState, useEffect, useRef } from "react";
import { useNotes } from "../contexts/NotesContext";
import { PortfolioType } from "../utils/portfolios";
import { NoteTags, getTagColor, getTagDisplayName } from "../utils/notes";

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingNote?: {
    id: string;
    portfolio_type: PortfolioType | 'general';
    title: string;
    content: string;
    image_url?: string | null;
    image_description?: string | null;
    is_shared: boolean;
    tags?: NoteTags;
  } | null;
}

export default function NoteModal({ isOpen, onClose, editingNote }: NoteModalProps) {
  const { createNote, updateNote, getUniqueTags } = useNotes();
  const [portfolioType, setPortfolioType] = useState<PortfolioType | 'general'>('general');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tags, setTags] = useState<NoteTags>({});
  const [uniqueTags, setUniqueTags] = useState<{ [key: string]: string[] }>({});
  
  // IMAGE UPLOAD STATE
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageDescription, setImageDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // RESET FORM WHEN MODAL OPENS/CLOSES OR EDITING NOTE CHANGES
  useEffect(() => {
    if (isOpen) {
      if (editingNote) {
        setPortfolioType(editingNote.portfolio_type);
        setTitle(editingNote.title);
        setContent(editingNote.content);
        setIsShared(editingNote.is_shared);
        setTags(editingNote.tags || {});
        setImagePreview(editingNote.image_url || null);
        setSelectedImage(null);
        setRemoveImage(false);
        setImageDescription(editingNote.image_description || '');
      } else {
        setPortfolioType('general');
        setTitle('');
        setContent('');
        setIsShared(false);
        setTags({});
        setImagePreview(null);
        setSelectedImage(null);
        setRemoveImage(false);
        setImageDescription('');
      }
      // LOAD UNIQUE TAGS FOR AUTOCOMPLETE
      setUniqueTags(getUniqueTags());
    }
  }, [isOpen, editingNote, getUniqueTags]);

  // HANDLE IMAGE SELECTION
  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // VALIDATE FILE TYPE
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        alert('INVALID FILE TYPE. ONLY JPEG, PNG, GIF, AND WEBP ARE ALLOWED');
        return;
      }

      // VALIDATE FILE SIZE (5MB MAX)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        alert('FILE TOO LARGE. MAXIMUM SIZE IS 5MB');
        return;
      }

      setSelectedImage(file);
      setRemoveImage(false);
      
      // CREATE PREVIEW
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // REMOVE SELECTED IMAGE
  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setRemoveImage(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !content.trim()) {
      alert('PLEASE FILL IN ALL REQUIRED FIELDS');
      return;
    }

    setIsSubmitting(true);
    try {
      // CREATE FORMDATA FOR IMAGE UPLOAD
      const formData = new FormData();
      formData.append('portfolio_type', portfolioType);
      formData.append('title', title.trim());
      formData.append('content', content.trim());
      formData.append('is_shared', isShared.toString());
      formData.append('tags', JSON.stringify(tags));
      
      if (selectedImage) {
        formData.append('image', selectedImage);
        formData.append('image_description', imageDescription.trim());
      }
      
      if (removeImage) {
        formData.append('removeImage', 'true');
      }

      if (editingNote) {
        formData.append('noteId', editingNote.id);
        await updateNote(formData);
      } else {
        await createNote(formData);
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
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-base text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500"
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
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-base text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500"
              placeholder="ENTER NOTE CONTENT..."
              rows={8}
              disabled={isSubmitting}
              required
            />
          </div>

          {/* IMAGE UPLOAD */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              IMAGE (OPTIONAL)
            </label>
            <div className="space-y-3">
              {/* FILE INPUT */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                onChange={handleImageSelect}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500"
                disabled={isSubmitting}
              />
              
              {/* IMAGE PREVIEW */}
              {imagePreview && (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="PREVIEW"
                    className="max-w-full max-h-48 rounded-lg border border-slate-600"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm"
                    disabled={isSubmitting}
                  >
                    ✕
                  </button>
                </div>
              )}
              
              {/* FILE INFO */}
              {selectedImage && (
                <div className="text-xs text-slate-400">
                  SELECTED: {selectedImage.name} ({(selectedImage.size / 1024 / 1024).toFixed(2)} MB)
                </div>
              )}
            </div>
          </div>

          {/* IMAGE DESCRIPTION */}
          {(selectedImage || imagePreview) && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                IMAGE DESCRIPTION *
              </label>
              <textarea
                value={imageDescription}
                onChange={(e) => setImageDescription(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-base text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500"
                placeholder="DESCRIBE WHAT THIS IMAGE SHOWS..."
                rows={3}
                disabled={isSubmitting}
                required
              />
            </div>
          )}

          {/* TAGS */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              TAGS (OPTIONAL)
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* ACCOUNT TAG */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">ACCOUNT</label>
                <input
                  type="text"
                  value={tags.account || ''}
                  onChange={(e) => setTags(prev => ({ ...prev, account: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-base text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500"
                  placeholder="ENTER ACCOUNT..."
                  disabled={isSubmitting}
                  list="account-tags"
                />
                <datalist id="account-tags">
                  {uniqueTags.account?.map(tag => (
                    <option key={tag} value={tag} />
                  ))}
                </datalist>
              </div>

              {/* TEAM TAG */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">TEAM</label>
                <input
                  type="text"
                  value={tags.team || ''}
                  onChange={(e) => setTags(prev => ({ ...prev, team: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-base text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500"
                  placeholder="ENTER TEAM..."
                  disabled={isSubmitting}
                  list="team-tags"
                />
                <datalist id="team-tags">
                  {uniqueTags.team?.map(tag => (
                    <option key={tag} value={tag} />
                  ))}
                </datalist>
              </div>

              {/* PRIORITY TAG */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">PRIORITY</label>
                <input
                  type="text"
                  value={tags.priority || ''}
                  onChange={(e) => setTags(prev => ({ ...prev, priority: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-base text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500"
                  placeholder="ENTER PRIORITY..."
                  disabled={isSubmitting}
                  list="priority-tags"
                />
                <datalist id="priority-tags">
                  {uniqueTags.priority?.map(tag => (
                    <option key={tag} value={tag} />
                  ))}
                </datalist>
              </div>

              {/* STATUS TAG */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">STATUS</label>
                <input
                  type="text"
                  value={tags.status || ''}
                  onChange={(e) => setTags(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-base text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500"
                  placeholder="ENTER STATUS..."
                  disabled={isSubmitting}
                  list="status-tags"
                />
                <datalist id="status-tags">
                  {uniqueTags.status?.map(tag => (
                    <option key={tag} value={tag} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* TAG PREVIEW */}
            {Object.values(tags).some(tag => tag && tag.trim() !== '') && (
              <div className="mt-3 p-2 bg-slate-700 rounded-md">
                <div className="text-xs text-slate-400 mb-2">TAGS:</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(tags).map(([category, value]) => {
                    if (!value || value.trim() === '') return null;
                    return (
                      <span
                        key={category}
                        className={`inline-block text-xs px-2 py-1 rounded ${getTagColor(category)} text-white`}
                      >
                        {getTagDisplayName(category)}: {value}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
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