'use client';

import { useState, useEffect, useCallback } from 'react';

interface ProcessingStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export function useDocumentProcessing(documentId: string) {
  const [status, setStatus] = useState<ProcessingStatus['status']>('pending');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | undefined>();

  const fetchStatus = useCallback(async () => {
    if (!documentId) return;

    try {
      const response = await fetch(`/api/courses/documents/processing-status/${documentId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch processing status');
      }

      const data = await response.json();
      
      if (data.success && data.status) {
        setStatus(data.status.status);
        setProgress(data.status.progress);
        setError(data.status.error);
        setLastUpdated(data.status.updatedAt);
      }
    } catch (error) {
      console.error('ERROR FETCHING PROCESSING STATUS:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    }
  }, [documentId]);

  const retryProcessing = useCallback(async () => {
    if (!documentId) return false;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/courses/documents/processing-status/${documentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'retry' }),
      });

      if (!response.ok) {
        throw new Error('Failed to retry processing');
      }

      const data = await response.json();
      
      if (data.success) {
        // REFETCH STATUS AFTER RETRY
        await fetchStatus();
        return true;
      } else {
        throw new Error(data.error || 'Retry failed');
      }
    } catch (error) {
      console.error('ERROR RETRYING PROCESSING:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [documentId, fetchStatus]);

  // FETCH STATUS ON MOUNT ONLY (NO POLLING)
  useEffect(() => {
    if (!documentId) return;

    // FETCH INITIAL STATUS
    fetchStatus();
  }, [documentId, fetchStatus]);

  return {
    status,
    progress,
    error,
    isLoading,
    lastUpdated,
    retryProcessing,
    refetchStatus: fetchStatus,
  };
}
