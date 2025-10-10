"use client";

import { useState, useCallback } from 'react';

interface DocumentStatus {
  id: string;
  original_name: string;
  file_size: number;
  created_at: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error: string | null;
  updated_at: string;
}

interface PortfolioStatus {
  documents: DocumentStatus[];
  summary: {
    total: number;
    completed: number;
    pending: number;
    processing: number;
    failed: number;
    isComplete: boolean;
  };
}

export function usePortfolioDocumentStatus(courseId: string, portfolioId: string) {
  const [status, setStatus] = useState<PortfolioStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!courseId || !portfolioId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/courses/portfolios/${portfolioId}/documents/status?courseId=${courseId}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch document status');
      }

      const data = await response.json();

      if (data.success) {
        setStatus({
          documents: data.documents,
          summary: data.summary
        });
      } else {
        throw new Error(data.error || 'Failed to fetch document status');
      }
    } catch (err) {
      console.error('ERROR FETCHING PORTFOLIO DOCUMENT STATUS:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [courseId, portfolioId]);

  const refreshStatus = useCallback(async () => {
    await fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    isLoading,
    error,
    fetchStatus,
    refreshStatus
  };
}
