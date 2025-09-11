'use client';

import { useState, useEffect } from 'react';
import { useDocumentProcessing } from '../hooks/useDocumentProcessing';

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
  const { status, progress, error, isLoading } = useDocumentProcessing(document.id);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'pending':
        return (
          <div className="w-4 h-4 rounded-full bg-yellow-500 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-yellow-200 animate-pulse" />
          </div>
        );
      case 'processing':
        return (
          <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-blue-200 animate-spin" />
          </div>
        );
      case 'completed':
        return (
          <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
            <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        );
      case 'failed':
        return (
          <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
            <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-4 h-4 rounded-full bg-gray-500" />
        );
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'pending':
        return 'Queued...';
      case 'processing':
        return `Processing... ${progress}%`;
      case 'completed':
        return 'Completed ✓';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500';
      case 'processing':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="bg-slate-700/50 border border-slate-600 rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-slate-300 text-sm font-medium">
            {document.original_name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {formatFileSize(document.file_size)}
          </span>
          <span className="text-xs text-slate-400">
            {progress}%
          </span>
        </div>
      </div>
      
      <div className="w-full bg-slate-600 rounded-full h-2 mb-2">
        <div 
          className={`h-2 rounded-full transition-all duration-300 ${getStatusColor()}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {getStatusText()}
        </span>
        
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
  );
}
