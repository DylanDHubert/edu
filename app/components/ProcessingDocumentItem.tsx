'use client';

import { useState, useEffect } from 'react';
import { useDocumentProcessing } from '../hooks/useDocumentProcessing';
import { DocumentStatusIndicator } from './DocumentStatusIndicator';

interface ProcessingDocumentItemProps {
  document: {
    id: string;
    original_name: string;
    file_size: number;
    created_at: string;
  };
  onRetry?: (documentId: string) => void;
}

export function ProcessingDocumentItem({ document, onRetry }: ProcessingDocumentItemProps) {
  const { status, progress, error, isLoading, refetchStatus } = useDocumentProcessing(document.id);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // REMOVED OLD STATUS DISPLAY FUNCTIONS - NOW USING DocumentStatusIndicator COMPONENT

  return (
    <div className="flex items-center gap-3">
      {/* FULL WIDTH DOCUMENT CARD */}
      <div className="flex-1 bg-slate-700/50 border border-slate-600 rounded-md p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-slate-300 text-sm font-medium">
              {document.original_name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              {formatFileSize(document.file_size)}
            </span>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {status === 'pending' && 'Queued for processing'}
            {status === 'processing' && `Processing ${progress}%`}
            {status === 'completed' && 'Ready'}
            {status === 'failed' && 'Failed'}
          </div>
          
          {status === 'failed' && onRetry && (
            <button
              onClick={() => onRetry(document.id)}
              disabled={isLoading}
              className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Retrying...' : 'Retry'}
            </button>
          )}
        </div>
        
        {error && status === 'failed' && (
          <div className="mt-2 p-2 bg-red-900/20 border border-red-800 rounded text-xs text-red-300">
            {error}
          </div>
        )}
      </div>
      
      {/* STATUS SQUARE TO THE RIGHT OF THE CARD */}
      <div className="flex flex-col items-center gap-1">
        <DocumentStatusIndicator
          documentId={document.id}
          status={status}
          progress={progress}
          error={error}
          onRefresh={refetchStatus}
        />
      </div>
    </div>
  );
}
