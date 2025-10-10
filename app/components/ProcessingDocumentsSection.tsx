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
  openai_file_id: string | null;
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
      const { data, error } = await supabase
        .from('course_documents')
        .select('id, original_name, file_size, created_at, openai_file_id')
        .eq('course_id', courseId)
        .eq('portfolio_id', portfolioId)
        .in('openai_file_id', [null, 'processing', 'failed'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('ERROR FETCHING PROCESSING DOCUMENTS:', error);
        return;
      }

      setProcessingDocuments(data || []);
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
      .channel(`processing-documents-${portfolioId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'course_documents',
          filter: `course_id=eq.${courseId} AND portfolio_id=eq.${portfolioId}`,
        },
        (payload) => {
          console.log('DOCUMENT STATUS UPDATED:', payload);
          
          // UPDATE LOCAL STATE
          setProcessingDocuments(prev => {
            const updated = prev.map(doc => 
              doc.id === payload.new.id 
                ? { ...doc, openai_file_id: payload.new.openai_file_id }
                : doc
            );

            // REMOVE COMPLETED DOCUMENTS
            const filtered = updated.filter(doc => 
              doc.openai_file_id === null || 
              doc.openai_file_id === 'processing' || 
              doc.openai_file_id === 'failed'
            );

            // NOTIFY PARENT OF COMPLETED DOCUMENTS
            const completed = updated.filter(doc => 
              doc.openai_file_id !== null && 
              doc.openai_file_id !== 'processing' && 
              doc.openai_file_id !== 'failed'
            );

            completed.forEach(doc => {
              onDocumentCompleted?.(doc.id);
            });

            return filtered;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'course_documents',
          filter: `course_id=eq.${courseId} AND portfolio_id=eq.${portfolioId}`,
        },
        (payload) => {
          console.log('NEW DOCUMENT ADDED:', payload);
          
          // ADD NEW DOCUMENT TO PROCESSING LIST
          setProcessingDocuments(prev => [
            {
              id: payload.new.id,
              original_name: payload.new.original_name,
              file_size: payload.new.file_size,
              created_at: payload.new.created_at,
              openai_file_id: payload.new.openai_file_id,
            },
            ...prev
          ]);
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
