'use client';

import { useState } from 'react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (feedbackText: string) => void;
  existingFeedback?: string | null;
  isLoading?: boolean;
}

export default function FeedbackModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  existingFeedback,
  isLoading = false 
}: FeedbackModalProps) {
  const [feedbackText, setFeedbackText] = useState(existingFeedback || '');

  const handleSubmit = () => {
    if (feedbackText.trim()) {
      onSubmit(feedbackText.trim());
    }
  };

  const handleClose = () => {
    setFeedbackText(existingFeedback || '');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            {existingFeedback ? 'EDIT FEEDBACK' : 'GIVE FEEDBACK'}
          </h3>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white transition-colors"
            disabled={isLoading}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            {existingFeedback ? 'UPDATE YOUR FEEDBACK:' : 'TELL US MORE ABOUT YOUR EXPERIENCE:'}
          </label>
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="SHARE YOUR THOUGHTS, SUGGESTIONS, OR EXPLAIN YOUR RATING..."
            className="w-full h-32 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            disabled={isLoading}
          />
        </div>
        
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
            disabled={isLoading}
          >
            CANCEL
          </button>
          <button
            onClick={handleSubmit}
            disabled={!feedbackText.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'SAVING...' : (existingFeedback ? 'UPDATE' : 'SUBMIT')}
          </button>
        </div>
      </div>
    </div>
  );
}
