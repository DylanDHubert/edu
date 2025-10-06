import React from 'react';

interface SourceInfo {
  documentName: string;
  pageNumber: number;
  docId: string;
  relevanceScore?: number;
}

interface SourcesDisplayProps {
  sources: SourceInfo[];
}

export default function SourcesDisplay({ sources }: SourcesDisplayProps) {
  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 p-3 bg-gray-50 rounded-lg border">
      <h4 className="text-sm font-medium text-gray-700 mb-2">Sources:</h4>
      <div className="space-y-1">
        {sources.map((source, index) => (
          <a
            key={`${source.docId}-${source.pageNumber}-${index}`}
            href={`/api/documents/${source.docId}/pdf?page=${source.pageNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            Page {source.pageNumber} of {source.documentName}
            {source.relevanceScore && (
              <span className="text-gray-500 ml-2">
                (Score: {source.relevanceScore.toFixed(2)})
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
