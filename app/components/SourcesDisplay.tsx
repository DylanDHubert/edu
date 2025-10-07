'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import PDFViewer to avoid SSR issues
const PDFViewer = dynamic(() => import('./PDFViewer'), {
  ssr: false,
  loading: () => <div className="text-center p-4">Loading PDF viewer...</div>,
});

interface SourceInfo {
  documentName: string;
  pageStart: number;
  pageEnd: number;
  docId: string;
  relevanceScore?: number;
}

interface SourcesDisplayProps {
  sources: SourceInfo[];
}

export default function SourcesDisplay({ sources }: SourcesDisplayProps) {
  console.log(`🎨 SOURCES DISPLAY RENDERED with:`, sources);
  
  const [selectedSource, setSelectedSource] = useState<SourceInfo | null>(null);
  
  if (!sources || sources.length === 0) {
    console.log(`❌ NO SOURCES TO DISPLAY`);
    return null;
  }

  const handleSourceClick = (source: SourceInfo) => {
    console.log(`📄 OPENING PDF: ${source.documentName} - Page ${source.pageStart}-${source.pageEnd}`);
    setSelectedSource(source);
  };

  const handleClose = () => {
    console.log(`❌ CLOSING PDF VIEWER`);
    setSelectedSource(null);
  };

  return (
    <>
      <div className="mt-4 p-3 bg-gray-50 rounded-lg border">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Sources:</h4>
        <div className="space-y-1">
          {sources.map((source, index) => (
            <button
              key={`${source.docId}-${source.pageStart}-${index}`}
              onClick={() => handleSourceClick(source)}
              className="block text-left text-sm text-blue-600 hover:text-blue-800 hover:underline cursor-pointer w-full"
            >
              {index + 1}. {source.documentName} - Page {source.pageStart === source.pageEnd 
                ? source.pageStart 
                : `${source.pageStart}-${source.pageEnd}`}
              {source.relevanceScore && (
                <span className="text-gray-500 ml-2">
                  (Score: {source.relevanceScore.toFixed(2)})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* PDF Viewer Modal */}
      {selectedSource && (
        <PDFViewer
          docId={selectedSource.docId}
          initialPage={selectedSource.pageStart}
          onClose={handleClose}
        />
      )}
    </>
  );
}
