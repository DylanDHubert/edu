'use client';

import { useState, useEffect } from 'react';
import { FileSpreadsheet, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

interface InventoryDocument {
  id: string;
  original_name: string;
  file_size: number;
  created_at: string;
  openai_file_id: string | null;
}

interface InventoryProcessingItemProps {
  document: InventoryDocument;
  onRetry: (documentId: string) => void;
}

export function InventoryProcessingItem({ document, onRetry }: InventoryProcessingItemProps) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('pending');
  const [error, setError] = useState<string | null>(null);

  // DETERMINE STATUS FROM OPENAI FILE ID
  useEffect(() => {
    if (document.openai_file_id === null) {
      setStatus('pending');
      setProgress(0);
    } else if (document.openai_file_id === 'processing') {
      setStatus('processing');
      setProgress(50); // Show some progress for processing state
    } else if (document.openai_file_id === 'failed') {
      setStatus('failed');
      setProgress(0);
      setError('Processing failed');
    } else if (document.openai_file_id.startsWith('file-')) {
      setStatus('completed');
      setProgress(100);
    } else {
      setStatus('unknown');
      setProgress(0);
    }
  }, [document.openai_file_id]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      // Less than 1MB - show in KB
      const kb = bytes / 1024;
      return `${kb.toFixed(1)} KB`;
    } else {
      // 1MB or more - show in MB
      const mb = bytes / (1024 * 1024);
      return `${mb.toFixed(1)} MB`;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'processing': return 'text-yellow-400';
      case 'failed': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'processing':
        return <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <FileSpreadsheet className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'completed': return 'Completed';
      case 'processing': return 'Processing...';
      case 'failed': return 'Failed';
      case 'pending': return 'Pending';
      default: return 'Unknown';
    }
  };

  return (
    <div className="bg-slate-700 border border-slate-600 rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          {getStatusIcon()}
          <div>
            <h4 className="text-slate-200 font-medium">{document.original_name}</h4>
            <div className="text-sm text-slate-400">
              {formatFileSize(document.file_size)} • 
              Uploaded {new Date(document.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </span>
          
          {status === 'failed' && (
            <button
              onClick={() => onRetry(document.id)}
              className="text-blue-400 hover:text-blue-300 text-sm font-medium"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      {/* PROGRESS BAR */}
      <div className="w-full bg-slate-600 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${
            status === 'completed' ? 'bg-green-500' :
            status === 'processing' ? 'bg-yellow-500' :
            status === 'failed' ? 'bg-red-500' :
            'bg-slate-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <div className="mt-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* PROGRESS TEXT */}
      <div className="mt-2 text-xs text-slate-400">
        {progress}% complete
      </div>
    </div>
  );
}
