'use client';

import { useState, useEffect } from 'react';
import { ProcessingDocumentItem } from './ProcessingDocumentItem';
import { PortfolioProcessingSummary } from './PortfolioProcessingSummary';
import { usePortfolioDocumentStatus } from '../hooks/usePortfolioDocumentStatus';
import { createClient } from '../utils/supabase/client';

interface ProcessingDocument {
  id: string;
  original_name: string;
  file_size: number;
  created_at: string;
  status: string;
  progress: number;
  error?: string;
}

interface ProcessingDocumentsSectionProps {
  courseId: string;
  portfolioId: string;
  onDocumentCompleted?: (documentId: string) => void;
}

export function ProcessingDocumentsSection({ 
  courseId, 
  portfolioId, 
  onDocumentCompleted 
}: ProcessingDocumentsSectionProps) {
  const [processingDocuments, setProcessingDocuments] = useState<ProcessingDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  // FETCH PROCESSING DOCUMENTS
  const fetchProcessingDocuments = async () => {
    try {
      // GET PROCESSING JOBS WITH DOCUMENT INFO
      const { data, error } = await supabase
        .from('processing_jobs')
        .select(`
          id,
          document_id,
          status,
          progress,
          current_step,
          error_message,
          created_at,
          course_documents!inner(
            id,
            original_name,
            file_size,
            created_at
          )
        `)
        .eq('course_id', courseId)
        .eq('portfolio_id', portfolioId)
        .in('status', ['pending', 'processing', 'failed'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('ERROR FETCHING PROCESSING DOCUMENTS:', error);
        return;
      }

      // TRANSFORM DATA TO MATCH EXPECTED FORMAT
      const transformedData = (data || []).map(job => ({
        id: job.document_id, // Use document_id for the document ID
        original_name: job.course_documents[0]?.original_name || 'Unknown',
        file_size: job.course_documents[0]?.file_size || 0,
        created_at: job.course_documents[0]?.created_at || job.created_at,
        status: job.status,
        progress: job.progress,
        error: job.error_message
      }));

      setProcessingDocuments(transformedData);
    } catch (error) {
      console.error('ERROR FETCHING PROCESSING DOCUMENTS:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // SET UP REALTIME SUBSCRIPTION
  useEffect(() => {
    if (!courseId || !portfolioId) return;

    // FETCH INITIAL DATA
    fetchProcessingDocuments();

    // SET UP REALTIME SUBSCRIPTION
    const subscription = supabase
      .channel(`processing-jobs-${portfolioId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'processing_jobs',
          filter: `course_id=eq.${courseId} AND portfolio_id=eq.${portfolioId}`,
        },
        (payload) => {
          console.log('PROCESSING JOB UPDATED:', payload);
          
          // REFETCH PROCESSING DOCUMENTS TO GET UPDATED STATUS
          fetchProcessingDocuments();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'processing_jobs',
          filter: `course_id=eq.${courseId} AND portfolio_id=eq.${portfolioId}`,
        },
        (payload) => {
          console.log('NEW PROCESSING JOB ADDED:', payload);
          
          // REFETCH PROCESSING DOCUMENTS TO GET NEW JOB
          fetchProcessingDocuments();
        }
      )
      .subscribe();

    // CLEANUP SUBSCRIPTION
    return () => {
      subscription.unsubscribe();
    };
  }, [courseId, portfolioId, onDocumentCompleted]);

  // HANDLE RETRY
  const handleRetry = async (documentId: string) => {
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
        console.log('PROCESSING RETRY STARTED:', documentId);
      } else {
        throw new Error(data.error || 'Retry failed');
      }
    } catch (error) {
      console.error('ERROR RETRYING PROCESSING:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-slate-200 mb-3">
          Processing Documents
        </h3>
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (processingDocuments.length === 0) {
    return null; // DON'T SHOW SECTION IF NO PROCESSING DOCUMENTS
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-slate-200 mb-3">
        Processing Documents ({processingDocuments.length})
      </h3>
      
      <div className="space-y-3">
        {processingDocuments.map((document) => (
          <ProcessingDocumentItem
            key={document.id}
            document={document}
            onRetry={handleRetry}
          />
        ))}
      </div>
      
      <div className="mt-3 text-xs text-slate-400">
        Documents are being processed with LlamaParse. This may take a few minutes.
      </div>
    </div>
  );
}
