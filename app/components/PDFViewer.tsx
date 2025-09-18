"use client";

import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

interface PDFViewerProps {
  pdfUrl: string;
  initialPage?: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function PDFViewer({ pdfUrl, initialPage = 1, isOpen, onClose }: PDFViewerProps) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [zoom, setZoom] = useState(100);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setCurrentPage(initialPage);
      setIsLoading(true);
    }
  }, [isOpen, initialPage]);

  const handlePreviousPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => prev + 1);
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(200, prev + 25));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(50, prev - 25));
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  if (!isOpen) return null;


  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-lg border border-slate-700 w-full h-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* HEADER */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-slate-200">PDF Viewer</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviousPage}
                disabled={currentPage <= 1}
                className="p-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-slate-300 rounded-md transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-300 px-2">
                Page {currentPage}
              </span>
              <button
                onClick={handleNextPage}
                className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-md transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleZoomOut}
              className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-md transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-300 px-2">
              {zoom}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-md transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PDF CONTENT */}
        <div className="flex-1 overflow-hidden relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
              <div className="text-slate-300">Loading PDF...</div>
            </div>
          )}
          
          {/* USE BROWSER'S BUILT-IN PDF VIEWER */}
          <iframe
            key={`${pdfUrl}-${currentPage}`} // FORCE RE-RENDER WHEN PAGE CHANGES
            src={`${pdfUrl}#page=${currentPage}`}
            className="w-full h-full border-0"
            title="PDF Viewer"
            onLoad={handleIframeLoad}
            onError={(e) => {
              console.error('PDF Viewer Error:', e);
              setIsLoading(false);
            }}
          />
        </div>
      </div>
    </div>
  );
}