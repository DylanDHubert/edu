"use client";

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AssistantStatusIndicator } from './AssistantStatusIndicator';

interface PortfolioProcessingSummaryProps {
  teamId: string;
  portfolioId: string;
  summary: {
    total: number;
    completed: number;
    pending: number;
    processing: number;
    failed: number;
    isComplete: boolean;
  };
  onRefresh?: () => void;
  className?: string;
}

export function PortfolioProcessingSummary({ 
  teamId, 
  portfolioId, 
  summary, 
  onRefresh,
  className = ""
}: PortfolioProcessingSummaryProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      await onRefresh();
      setIsRefreshing(false);
    }
  };

  const getProgressPercentage = () => {
    if (summary.total === 0) return 0;
    return Math.round((summary.completed / summary.total) * 100);
  };

  const getStatusColor = () => {
    if (summary.failed > 0) return 'text-red-400';
    if (summary.processing > 0 || summary.pending > 0) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getProgressBarSegments = () => {
    const completedPercentage = summary.total === 0 ? 0 : (summary.completed / summary.total) * 100;
    const failedPercentage = summary.total === 0 ? 0 : (summary.failed / summary.total) * 100;
    const processingPercentage = summary.total === 0 ? 0 : ((summary.processing + summary.pending) / summary.total) * 100;
    
    return {
      completed: completedPercentage,
      failed: failedPercentage,
      processing: processingPercentage
    };
  };

  const getStatusText = () => {
    if (summary.total === 0) return 'No documents';
    if (summary.isComplete) return 'All documents processed';
    if (summary.failed > 0) return `${summary.failed} failed, ${summary.completed} completed`;
    return `${summary.completed} of ${summary.total} documents processed`;
  };

  return (
    <div className={`bg-slate-800 rounded-lg border border-slate-700 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-300">Document Processing Status</h3>
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1 text-slate-400 hover:text-slate-300 disabled:opacity-50 transition-colors"
            title="Refresh status"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-600 rounded-full h-2 mb-3 overflow-hidden">
        <div className="h-2 flex transition-all duration-300">
          {/* COMPLETED SEGMENT - GREEN */}
          {getProgressBarSegments().completed > 0 && (
            <div 
              className="bg-green-500"
              style={{ width: `${getProgressBarSegments().completed}%` }}
            />
          )}
          {/* PROCESSING SEGMENT - YELLOW */}
          {getProgressBarSegments().processing > 0 && (
            <div 
              className="bg-yellow-500"
              style={{ width: `${getProgressBarSegments().processing}%` }}
            />
          )}
          {/* FAILED SEGMENT - RED */}
          {getProgressBarSegments().failed > 0 && (
            <div 
              className="bg-red-500"
              style={{ width: `${getProgressBarSegments().failed}%` }}
            />
          )}
        </div>
      </div>

      {/* Status Text */}
      <div className="flex items-center justify-between">
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
        <span className="text-xs text-slate-400">
          {getProgressPercentage()}%
        </span>
      </div>

      {/* Detailed Breakdown */}
      {summary.total > 0 && (
        <div className="mt-3 flex gap-4 text-xs text-slate-400">
          {summary.completed > 0 && (
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              {summary.completed} completed
            </span>
          )}
          {summary.processing > 0 && (
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
              {summary.processing} processing
            </span>
          )}
          {summary.pending > 0 && (
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
              {summary.pending} pending
            </span>
          )}
          {summary.failed > 0 && (
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              {summary.failed} failed
            </span>
          )}
        </div>
      )}

      {/* Assistant Status */}
      <div className="mt-2">
        <AssistantStatusIndicator 
          teamId={teamId} 
          portfolioId={portfolioId} 
        />
      </div>
    </div>
  );
}
