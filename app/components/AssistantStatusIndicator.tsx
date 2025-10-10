"use client";

import { useState, useEffect } from 'react';

interface AssistantStatusIndicatorProps {
  courseId: string;
  portfolioId: string;
  className?: string;
}

export function AssistantStatusIndicator({ 
  courseId, 
  portfolioId, 
  className = "" 
}: AssistantStatusIndicatorProps) {
  const [status, setStatus] = useState<'ready' | 'outdated' | 'none' | 'loading'>('loading');

  const checkAssistantStatus = async () => {
    if (!courseId || !portfolioId) return;
    
    try {
      const response = await fetch(`/api/assistants/status?courseId=${courseId}&portfolioId=${portfolioId}`);
      const result = await response.json();
      
      if (response.ok && result.success) {
        setStatus(result.status);
      } else {
        console.error('Failed to check assistant status:', result.error);
        setStatus('none');
      }
    } catch (error) {
      console.error('Error checking assistant status:', error);
      setStatus('none');
    }
  };

  useEffect(() => {
    checkAssistantStatus();
  }, [courseId, portfolioId]);

  const getStatusColor = () => {
    switch (status) {
      case 'ready':
        return 'bg-green-500';
      case 'outdated':
      case 'none':
        return 'bg-yellow-500';
      case 'loading':
      default:
        return 'bg-slate-500';
    }
  };

  const getStatusClass = () => {
    switch (status) {
      case 'outdated':
      case 'none':
        return 'animate-pulse';
      default:
        return '';
    }
  };

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <div 
        className={`w-2 h-2 rounded-full ${getStatusColor()} ${getStatusClass()}`}
        title={status === 'ready' ? 'Assistant ready' : 'Assistant will be updated'}
      />
      <span className="text-xs text-slate-400">Assistant Status</span>
    </span>
  );
}
