'use client';

import { useState, useEffect } from 'react';
import { InventoryProcessingItem } from './InventoryProcessingItem';
import { createClient } from '../utils/supabase/client';

interface InventoryDocument {
  id: string;
  original_name: string;
  file_size: number;
  created_at: string;
  openai_file_id: string | null;
}

interface InventoryProcessingSectionProps {
  teamId: string;
  onDocumentCompleted?: (documentId: string) => void;
}

export function InventoryProcessingSection({ 
  teamId, 
  onDocumentCompleted 
}: InventoryProcessingSectionProps) {
  const [processingDocuments, setProcessingDocuments] = useState<InventoryDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  // FETCH PROCESSING INVENTORY DOCUMENTS
  const fetchProcessingDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('team_documents')
        .select('id, original_name, file_size, created_at, openai_file_id')
        .eq('team_id', teamId)
        .eq('document_type', 'inventory')
        .is('portfolio_id', null)
        .in('openai_file_id', [null, 'processing', 'failed'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('ERROR FETCHING INVENTORY PROCESSING DOCUMENTS:', error);
        return;
      }

      setProcessingDocuments(data || []);
    } catch (error) {
      console.error('ERROR FETCHING INVENTORY PROCESSING DOCUMENTS:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // SET UP REALTIME SUBSCRIPTION
  useEffect(() => {
    if (!teamId) return;

    // FETCH INITIAL DATA
    fetchProcessingDocuments();

    // SET UP REALTIME SUBSCRIPTION FOR INVENTORY DOCUMENTS
    const subscription = supabase
      .channel(`inventory-processing-${teamId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'team_documents',
          filter: `team_id=eq.${teamId} AND document_type=eq.inventory AND portfolio_id=is.null`,
        },
        (payload) => {
          console.log('INVENTORY DOCUMENT STATUS UPDATED:', payload);
          
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
          table: 'team_documents',
          filter: `team_id=eq.${teamId} AND document_type=eq.inventory AND portfolio_id=is.null`,
        },
        (payload) => {
          console.log('NEW INVENTORY DOCUMENT ADDED:', payload);
          
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
  }, [teamId, onDocumentCompleted]);

  // HANDLE RETRY
  const handleRetry = async (documentId: string) => {
    try {
      const response = await fetch(`/api/teams/documents/processing-status/${documentId}`, {
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
        console.log('INVENTORY PROCESSING RETRY STARTED:', documentId);
      } else {
        throw new Error(data.error || 'Retry failed');
      }
    } catch (error) {
      console.error('ERROR RETRYING INVENTORY PROCESSING:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-slate-200 mb-3">
          Processing Inventory
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
        Processing Inventory ({processingDocuments.length})
      </h3>
      
      <div className="space-y-3">
        {processingDocuments.map((document) => (
          <InventoryProcessingItem
            key={document.id}
            document={document}
            onRetry={handleRetry}
          />
        ))}
      </div>
      
      <div className="mt-3 text-xs text-slate-400">
        Inventory documents are being processed with LlamaParse. This may take a few minutes.
      </div>
    </div>
  );
}
