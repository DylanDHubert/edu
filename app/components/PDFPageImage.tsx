"use client";

import { useState, useEffect, useRef } from "react";

interface PDFPageImageProps {
  pdfUrl: string;
  pageNumber: number;
  width?: number;
  height?: number;
  className?: string;
}

export default function PDFPageImage({ 
  pdfUrl, 
  pageNumber, 
  width = 400, 
  height = 600,
  className = ""
}: PDFPageImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfUrl || !pageNumber) return;

    setLoading(true);
    
    try {
      // CREATE A SIMPLE PLACEHOLDER USING A DATA URL
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas context not available');
      }

      // DRAW A PLACEHOLDER WITH PAGE INFO
      context.fillStyle = '#1e293b';
      context.fillRect(0, 0, width, height);
      
      context.fillStyle = '#94a3b8';
      context.font = '16px Arial';
      context.textAlign = 'center';
      context.fillText(`Page ${pageNumber}`, width / 2, height / 2 - 20);
      context.fillText('PDF Preview', width / 2, height / 2 + 20);
      context.fillText('Click "View PDF" to open', width / 2, height / 2 + 50);
      
      // CONVERT CANVAS TO DATA URL
      const dataUrl = canvas.toDataURL('image/png');
      console.log('Generated image URL:', dataUrl.substring(0, 50) + '...');
      setImageUrl(dataUrl);
      setError(null);
    } catch (err) {
      console.error('Error creating page preview:', err);
      setError(err instanceof Error ? err.message : 'Failed to create preview');
    } finally {
      setLoading(false);
    }
  }, [pdfUrl, pageNumber, width, height]);

  if (loading) {
    return (
      <div className={`bg-slate-600 rounded flex items-center justify-center ${className}`} style={{ width, height }}>
        <div className="text-slate-300 text-sm">Loading page {pageNumber}...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-slate-600 rounded flex items-center justify-center ${className}`} style={{ width, height }}>
        <div className="text-red-300 text-sm text-center">
          <div>Error loading page</div>
          <div className="text-xs mt-1">{error}</div>
        </div>
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className={`bg-slate-600 rounded flex items-center justify-center ${className}`} style={{ width, height }}>
        <div className="text-slate-300 text-sm">No image available</div>
      </div>
    );
  }

  return (
    <div className={className} style={{ width, height }}>
      <img
        src={imageUrl}
        alt={`Page ${pageNumber}`}
        className="w-full h-full object-contain rounded border border-slate-600"
        style={{ 
          width: '100%', 
          height: '100%',
          display: 'block',
          backgroundColor: '#1e293b'
        }}
        onLoad={() => console.log('Image loaded successfully')}
        onError={(e) => console.error('Image failed to load:', e)}
      />
    </div>
  );
}
