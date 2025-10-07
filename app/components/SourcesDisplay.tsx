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
  console.log(`🎨 SOURCES TYPE:`, typeof sources);
  console.log(`🎨 SOURCES IS ARRAY:`, Array.isArray(sources));
  console.log(`🎨 SOURCES LENGTH:`, sources?.length);
  
  const [selectedSource, setSelectedSource] = useState<SourceInfo | null>(null);
  
  if (!sources || sources.length === 0) {
    console.log(`❌ NO SOURCES TO DISPLAY`);
    return null;
  }

  console.log(`✅ ABOUT TO RENDER SOURCES UI`);

  const handleSourceClick = (source: SourceInfo) => {
    console.log(`📄 OPENING PDF: ${source.documentName} - Page ${source.pageStart}-${source.pageEnd}`);
    setSelectedSource(source);
  };

  const handleClose = () => {
    console.log(`❌ CLOSING PDF VIEWER`);
    setSelectedSource(null);
  };

  console.log(`🎨 RENDERING ${sources.length} SOURCES`);

  return (
    <>
      <div className="mt-4 p-4 bg-slate-800 rounded-lg border border-slate-700">
        <h4 className="text-sm font-medium text-slate-100 mb-3">Sources ({sources.length}):</h4>
        <div className="space-y-2">
          {sources.map((source, index) => (
            <button
              key={`${source.docId}-${source.pageStart}-${index}`}
              onClick={() => handleSourceClick(source)}
              className="w-full text-left bg-slate-700 hover:bg-slate-600 rounded p-3 transition-colors border border-slate-600 hover:border-blue-500"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <span className="text-blue-400 font-medium text-sm">
                    {index + 1}. {source.documentName}
                  </span>
                  <span className="text-slate-300 ml-2 text-sm">
                    - Page {source.pageStart === source.pageEnd 
                      ? source.pageStart 
                      : `${source.pageStart}-${source.pageEnd}`}
                  </span>
                </div>
                {source.relevanceScore && (
                  <span className="text-xs text-slate-400 ml-4">
                    Score: {source.relevanceScore.toFixed(2)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
        <div className="mt-3 text-xs text-slate-400">
          💡 Click any source to open the PDF at that page
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
