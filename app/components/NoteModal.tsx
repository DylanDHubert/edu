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
    images?: Array<{url: string, description: string}> | null;
    image_url?: string | null; // BACKWARD COMPATIBILITY
    image_description?: string | null; // BACKWARD COMPATIBILITY
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
  
  // MULTIPLE IMAGE UPLOAD STATE
  const [selectedImages, setSelectedImages] = useState<Array<{file: File, preview: string, description: string}>>([]);
  const [existingImages, setExistingImages] = useState<Array<{url: string, description: string}>>([]);
  const [removeAllImages, setRemoveAllImages] = useState(false);
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
        
        // HANDLE MULTIPLE IMAGES (NEW FORMAT)
        if (editingNote.images && editingNote.images.length > 0) {
          // CONVERT SUPABASE URLS TO PROXY URLS
          const convertedImages = editingNote.images.map((image: any) => {
            if (image.url) {
              // EXTRACT FILENAME FROM SUPABASE URL
              const urlParts = image.url.split('/');
              const filename = urlParts[urlParts.length - 1];
              const proxyUrl = `/api/images/${encodeURIComponent(filename)}`;
              return {
                url: proxyUrl,
                description: image.description
              };
            }
            return image;
          });
          setExistingImages(convertedImages);
        }
        // BACKWARD COMPATIBILITY: HANDLE SINGLE IMAGE
        else if (editingNote.image_url && editingNote.image_description) {
          // CONVERT SUPABASE URL TO PROXY URL
          const urlParts = editingNote.image_url.split('/');
          const filename = urlParts[urlParts.length - 1];
          const proxyUrl = `/api/images/${encodeURIComponent(filename)}`;
          
          setExistingImages([{
            url: proxyUrl,
            description: editingNote.image_description
          }]);
        } else {
          setExistingImages([]);
        }
        
        setSelectedImages([]);
        setRemoveAllImages(false);
      } else {
        setPortfolioType('general');
        setTitle('');
        setContent('');
        setIsShared(false);
        setTags({});
        setExistingImages([]);
        setSelectedImages([]);
        setRemoveAllImages(false);
      }
      // LOAD UNIQUE TAGS FOR AUTOCOMPLETE
      setUniqueTags(getUniqueTags());
    }
  }, [isOpen, editingNote, getUniqueTags]);

  // HANDLE MULTIPLE IMAGE SELECTION
  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      let processedCount = 0;
      const totalFiles = files.length;
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // VALIDATE FILE TYPE
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
          alert(`INVALID FILE TYPE FOR ${file.name}. ONLY JPEG, PNG, GIF, AND WEBP ARE ALLOWED`);
          continue;
        }

        // VALIDATE FILE SIZE (5MB MAX)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
          alert(`FILE TOO LARGE: ${file.name}. MAXIMUM SIZE IS 5MB`);
          continue;
        }

        // VALIDATE MAX IMAGES (10 TOTAL)
        if (selectedImages.length + existingImages.length >= 10) {
          alert('MAXIMUM 10 IMAGES ALLOWED PER NOTE');
          break;
        }

        // CREATE PREVIEW
        const reader = new FileReader();
        reader.onload = (e) => {
          const newImage = {
            file,
            preview: e.target?.result as string,
            description: ''
          };
          
          setSelectedImages(prev => [...prev, newImage]);
          
          processedCount++;
        };
        reader.readAsDataURL(file);
      }
    }
    
    // RESET FILE INPUT
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // REMOVE SELECTED IMAGE
  const handleRemoveSelectedImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  // REMOVE EXISTING IMAGE
  const handleRemoveExistingImage = (index: number) => {
    setExistingImages(prev => prev.filter((_, i) => i !== index));
  };

  // UPDATE IMAGE DESCRIPTION
  const handleUpdateImageDescription = (index: number, description: string) => {
    setSelectedImages(prev => prev.map((img, i) => 
      i === index ? { ...img, description } : img
    ));
  };

  // REMOVE ALL IMAGES
  const handleRemoveAllImages = () => {
    setSelectedImages([]);
    setExistingImages([]);
    setRemoveAllImages(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !content.trim()) {
      alert('PLEASE FILL IN ALL REQUIRED FIELDS');
      return;
    }

    // VALIDATE ALL SELECTED IMAGES HAVE DESCRIPTIONS
    const imagesWithoutDescriptions = selectedImages.filter(img => !img.description.trim());
    if (imagesWithoutDescriptions.length > 0) {
      alert('ALL IMAGES MUST HAVE DESCRIPTIONS');
      return;
    }

    console.log('🖼️ SUBMITTING NOTE WITH IMAGES:', {
      selectedImages: selectedImages.length,
      existingImages: existingImages.length,
      removeAllImages
    });

    setIsSubmitting(true);
    try {
      // CREATE FORMDATA FOR IMAGE UPLOAD
      const formData = new FormData();
      formData.append('portfolio_type', portfolioType);
      formData.append('title', title.trim());
      formData.append('content', content.trim());
      formData.append('is_shared', isShared.toString());
      formData.append('tags', JSON.stringify(tags));
      
      // ADD SELECTED IMAGES
      selectedImages.forEach((img, index) => {
        console.log(`🖼️ ADDING IMAGE ${index}:`, img.file.name, img.description);
        formData.append(`image_${index}`, img.file);
        formData.append(`image_description_${index}`, img.description.trim());
      });
      
      if (removeAllImages) {
        formData.append('removeImage', 'true');
      }

      console.log('🖼️ FORMDATA ENTRIES:');
      for (const [key, value] of formData.entries()) {
        console.log(`  ${key}:`, value instanceof File ? `File(${value.name})` : value);
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

          {/* MULTIPLE IMAGE UPLOAD */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-slate-300">
                IMAGES (OPTIONAL) - MAX 10
              </label>
              {(selectedImages.length > 0 || existingImages.length > 0) && (
                <button
                  type="button"
                  onClick={handleRemoveAllImages}
                  className="text-xs text-red-400 hover:text-red-300"
                  disabled={isSubmitting}
                >
                  REMOVE ALL
                </button>
              )}
            </div>
            
            <div className="space-y-3">
              {/* FILE INPUT */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                onChange={handleImageSelect}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500"
                disabled={isSubmitting || (selectedImages.length + existingImages.length >= 10)}
              />
              
              {/* IMAGE COUNT */}
              <div className="text-xs text-slate-400">
                {selectedImages.length + existingImages.length} / 10 IMAGES
              </div>
              
              {/* EXISTING IMAGES */}
              {existingImages.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-slate-400 font-medium">EXISTING IMAGES:</div>
                  {existingImages.map((image, index) => (
                    <div key={`existing-${index}`} className="relative bg-slate-700 rounded-lg p-3 border border-slate-600">
                      <img
                        src={image.url}
                        alt="EXISTING IMAGE"
                        className="max-w-full max-h-32 rounded-lg border border-slate-600"
                      />
                      <div className="text-xs text-slate-300 mt-2">
                        <strong>DESCRIPTION:</strong> {image.description}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveExistingImage(index)}
                        className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm"
                        disabled={isSubmitting}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* SELECTED IMAGES */}
              {selectedImages.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-slate-400 font-medium">NEW IMAGES:</div>
                  {selectedImages.map((image, index) => (
                    <div key={`selected-${index}`} className="relative bg-slate-700 rounded-lg p-3 border border-slate-600">
                      <img
                        src={image.preview}
                        alt="PREVIEW"
                        className="max-w-full max-h-32 rounded-lg border border-slate-600"
                      />
                      <div className="text-xs text-slate-400 mt-2">
                        FILE: {image.file.name} ({(image.file.size / 1024 / 1024).toFixed(2)} MB)
                      </div>
                      <textarea
                        value={image.description}
                        onChange={(e) => handleUpdateImageDescription(index, e.target.value)}
                        className="w-full mt-2 bg-slate-600 border border-slate-500 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-400"
                        placeholder="DESCRIBE WHAT THIS IMAGE SHOWS... *"
                        rows={2}
                        disabled={isSubmitting}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveSelectedImage(index)}
                        className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm"
                        disabled={isSubmitting}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

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