'use client';

import { useState, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { createClient } from '../utils/supabase/client';

// Import react-pdf styles (these are bundled with react-pdf)
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  docId: string;
  initialPage?: number;
  onClose?: () => void;
}

export default function PDFViewer({ 
  docId, 
  initialPage = 1,
  onClose 
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(initialPage);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [retryCount, setRetryCount] = useState<number>(0);
  const [documentName, setDocumentName] = useState<string>('');

  const supabase = useMemo(() => createClient(), []);

  // Fetch signed URL for the PDF
  useEffect(() => {
    let urlRefreshInterval: NodeJS.Timeout;

    const getSignedUrl = async () => {
      try {
        console.log(`📄 FETCHING PDF: Document ID ${docId}`);
        
        // Get document info from database
        const { data: document, error: docError } = await supabase
          .from('team_documents')
          .select('file_path, original_name, team_id, portfolio_id')
          .eq('id', docId)
          .single();

        if (docError || !document) {
          console.error('❌ DOCUMENT NOT FOUND:', docError);
          setError('Document not found');
          setLoading(false);
          return;
        }

        console.log(`✅ FOUND DOCUMENT: ${document.original_name} at ${document.file_path}`);
        setDocumentName(document.original_name);

        // Generate signed URL from Supabase Storage
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('team-documents')
          .createSignedUrl(document.file_path, 3600); // 1 hour expiry

        if (signedUrlError || !signedUrlData) {
          console.error('❌ SIGNED URL ERROR:', signedUrlError);
          setError('Failed to generate PDF access URL');
          setLoading(false);
          return;
        }

        console.log(`🔗 SIGNED URL GENERATED: ${signedUrlData.signedUrl.substring(0, 50)}...`);
        setPdfUrl(signedUrlData.signedUrl);
        setLoading(false);

      } catch (err: any) {
        console.error('❌ PDF FETCH ERROR:', err);
        setError(err.message || 'Failed to load PDF');
        setLoading(false);
      }
    };

    getSignedUrl();
    
    // Refresh URL every 50 minutes (before 1-hour expiry)
    urlRefreshInterval = setInterval(getSignedUrl, 50 * 60 * 1000);

    return () => clearInterval(urlRefreshInterval);
  }, [supabase, docId]);

  // Handle PDF load success
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log(`📖 PDF LOADED: ${numPages} pages`);
    setNumPages(numPages);
    setError('');
    setRetryCount(0);
  };

  // Handle PDF load error with retry logic
  const onDocumentLoadError = (error: Error) => {
    console.error('❌ PDF LOAD ERROR:', error);
    
    if (error.message.includes('403') || error.message.includes('expired')) {
      if (retryCount < 3) {
        console.log(`🔄 RETRYING (${retryCount + 1}/3)...`);
        setRetryCount(prev => prev + 1);
        // Trigger signed URL refresh by clearing current URL
        setPdfUrl('');
      } else {
        setError('Unable to load document after multiple attempts');
      }
    } else if (error.message.includes('CORS')) {
      setError('Document access blocked. Please check CORS configuration.');
    } else {
      setError('Failed to load document. Please try again.');
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && pageNumber > 1) {
        setPageNumber(prev => prev - 1);
      } else if (e.key === 'ArrowRight' && pageNumber < numPages) {
        setPageNumber(prev => prev + 1);
      } else if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [pageNumber, numPages, onClose]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {documentName || 'Loading...'}
            </h2>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="ml-4 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Controls */}
        {!loading && !error && numPages > 0 && (
          <div className="flex items-center justify-center gap-4 p-3 border-b border-gray-200 bg-gray-50">
            <button
              onClick={() => setPageNumber(prev => Math.max(prev - 1, 1))}
              disabled={pageNumber <= 1}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm font-medium text-gray-700">
              Page {pageNumber} of {numPages}
            </span>
            <button
              onClick={() => setPageNumber(prev => Math.min(prev + 1, numPages))}
              disabled={pageNumber >= numPages}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}

        {/* PDF Content */}
        <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center">
          {loading && (
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Loading PDF...</p>
            </div>
          )}

          {error && (
            <div className="text-center p-4">
              <p className="text-red-600 font-semibold">Error</p>
              <p className="text-gray-700 mt-2">{error}</p>
            </div>
          )}

          {pdfUrl && !error && (
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="mt-2 text-gray-600">Loading PDF...</p>
                </div>
              }
            >
              <Page
                pageNumber={pageNumber}
                width={Math.min(window.innerWidth * 0.8, 900)}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </Document>
          )}
        </div>

        {/* Footer hint */}
        <div className="p-2 border-t border-gray-200 bg-gray-50 text-center text-xs text-gray-500">
          Use arrow keys to navigate • Press ESC to close
        </div>
      </div>
    </div>
  );
}

