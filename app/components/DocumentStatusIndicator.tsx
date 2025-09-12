"use client";

import { useState, useEffect } from 'react';

interface DocumentStatusIndicatorProps {
  documentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string | null;
  onRefresh?: () => void;
}

export function DocumentStatusIndicator({ 
  documentId, 
  status, 
  progress = 0, 
  error = null,
  onRefresh 
}: DocumentStatusIndicatorProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      await onRefresh();
      setIsRefreshing(false);
    }
  };

  const getSquareColor = () => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      case 'pending':
      case 'processing':
      default:
        return 'bg-yellow-500';
    }
  };

  const getSquareAnimation = () => {
    switch (status) {
      case 'pending':
      case 'processing':
        return 'animate-pulse';
      default:
        return '';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'pending':
        return 'Queued';
      case 'processing':
        return `Processing ${progress}%`;
      case 'completed':
        return 'Ready';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };


  return (
    <div className="flex items-center gap-1">
      {/* Status Square */}
      <div 
        className={`w-3 h-3 rounded-sm transition-all duration-300 ${getSquareColor()} ${getSquareAnimation()}`}
        title={getStatusText()}
      />

      {/* Refresh Button (only show for processing/pending) */}
      {(status === 'processing' || status === 'pending') && onRefresh && (
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-1 text-slate-400 hover:text-slate-300 disabled:opacity-50"
          title="Refresh status"
        >
          <svg 
            className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      )}

      {/* Error Tooltip */}
      {status === 'failed' && error && (
        <div className="relative group">
          <svg className="w-3 h-3 text-red-400 cursor-help" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
