"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { FileText, Star } from "lucide-react";

interface CitationData {
  citationNumber: number;
  fileId: string;
  quote: string;
  fullChunkContent?: string;
  fileName?: string;
  relevanceScore?: number;
}

export default function ViewSourcesPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [citationData, setCitationData] = useState<CitationData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const messageId = params.messageId as string;

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (user && messageId) {
      loadCitationData();
    }
  }, [user, loading, messageId, router]);

  const loadCitationData = async () => {
    try {
      setIsLoading(true);
      
      // FOR NOW, WE'LL GET THE CITATION DATA FROM LOCAL STORAGE
      // IN A REAL IMPLEMENTATION, THIS WOULD BE STORED IN THE DATABASE
      const storedMessages = localStorage.getItem('chatMessages');
      if (storedMessages) {
        const messages = JSON.parse(storedMessages);
        const message = messages.find((msg: any) => msg.id === messageId);
        
        if (message && message.citationData) {
          setCitationData(message.citationData);
        } else {
          setError('No citation data found for this message');
        }
      } else {
        setError('No message data found');
      }
    } catch (error) {
      console.error('Error loading citation data:', error);
      setError('Failed to load citation data');
    } finally {
      setIsLoading(false);
    }
  };

  // MARKDOWN COMPONENTS
  const markdownComponents = {
    h1: ({children}: any) => <h1 className="text-2xl font-bold text-slate-100 mt-6 mb-4">{children}</h1>,
    h2: ({children}: any) => <h2 className="text-xl font-semibold text-slate-100 mt-5 mb-3">{children}</h2>,
    h3: ({children}: any) => <h3 className="text-lg font-semibold text-slate-100 mt-4 mb-2">{children}</h3>,
    p: ({children}: any) => <p className="mb-3 text-slate-200 leading-relaxed">{children}</p>,
    ul: ({children}: any) => <ul className="mb-3 ml-6 space-y-1 list-disc">{children}</ul>,
    ol: ({children}: any) => <ol className="mb-3 ml-6 space-y-1 list-decimal">{children}</ol>,
    li: ({children}: any) => <li className="text-slate-200">{children}</li>,
    strong: ({children}: any) => <strong className="font-semibold text-slate-100">{children}</strong>,
    em: ({children}: any) => <em className="italic text-slate-200">{children}</em>,
    code: ({children}: any) => (
      <code className="bg-slate-800 text-slate-100 px-2 py-1 rounded text-sm font-mono">
        {children}
      </code>
    ),
    pre: ({children}: any) => (
      <pre className="bg-slate-800 text-slate-100 p-4 rounded-lg overflow-x-auto mb-4">
        {children}
      </pre>
    ),
    blockquote: ({children}: any) => (
      <blockquote className="border-l-4 border-slate-600 pl-4 italic text-slate-300 mb-4">
        {children}
      </blockquote>
    ),
    table: ({children, ...props}: any) => (
      <div className="overflow-x-auto mb-4">
        <table className="min-w-full border border-slate-600 bg-slate-800 rounded-lg border-collapse" {...props}>
          {children}
        </table>
      </div>
    ),
    thead: ({children}: any) => <thead className="bg-slate-700">{children}</thead>,
    tbody: ({children}: any) => <tbody>{children}</tbody>,
    tr: ({children}: any) => <tr className="border-b border-slate-600">{children}</tr>,
    th: ({children, ...props}: any) => (
      <th className="px-4 py-2 text-left text-slate-100 font-semibold border-r border-slate-600 last:border-r-0" {...props}>
        {children}
      </th>
    ),
    td: ({children, ...props}: any) => (
      <td className="px-4 py-2 text-slate-200 border-r border-slate-600 last:border-r-0" {...props}>
        {children}
      </td>
    ),
    br: () => <br />,
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">Loading sources...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-4">Error</h1>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => router.back()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* HEADER */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-between relative">
          {/* LEFT: HHB Logo */}
          <div className="flex items-center">
            <button
              onClick={() => router.push('/')}
              className="bg-gradient-to-r from-slate-300 to-slate-400 rounded-md mr-4 shadow-lg relative overflow-hidden hover:from-slate-200 hover:to-slate-300 transition-all duration-200 cursor-pointer p-2"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
              <img src="/logo.png" alt="HHB" className="relative z-10 h-8 w-auto" />
            </button>
          </div>

          {/* CENTER: Sources Info */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center pointer-events-auto">
              <h1 className="text-xl font-bold text-slate-100">Sources</h1>
              <p className="text-slate-400 text-sm mt-1">
                {citationData.length} source{citationData.length !== 1 ? 's' : ''} used in this response
              </p>
            </div>
          </div>

          {/* RIGHT: Back Button */}
          <button
            onClick={() => router.back()}
            className="bg-slate-600 hover:bg-slate-700 text-white px-3 py-2 rounded-md font-medium transition-colors text-sm relative z-10"
          >
            Back to Chat
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {citationData.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-300 mb-2">No Sources Found</h2>
            <p className="text-slate-400">This response doesn't have any source citations.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {citationData.map((citation, index) => (
              <div key={index} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                {/* CITATION HEADER */}
                <div className="bg-slate-700 px-6 py-4 border-b border-slate-600">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                        [{citation.citationNumber}]
                      </span>
                      <div>
                        <h3 className="font-semibold text-slate-100">
                          {citation.fileName || `File ID: ${citation.fileId}`}
                        </h3>
                        {citation.relevanceScore !== undefined && (
                          <div className="flex items-center gap-1 text-sm text-slate-400">
                            <Star className="w-4 h-4" />
                            <span>Relevance: {(citation.relevanceScore * 100).toFixed(1)}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* QUOTED TEXT */}
                {citation.quote && (
                  <div className="px-6 py-4 bg-blue-900/20 border-b border-slate-600">
                    <h4 className="text-sm font-medium text-blue-300 mb-2">Quoted Text:</h4>
                    <p className="text-blue-100 italic">"{citation.quote}"</p>
                  </div>
                )}

                {/* FULL CHUNK CONTENT */}
                {citation.fullChunkContent ? (
                  <div className="px-6 py-6">
                    <h4 className="text-sm font-medium text-slate-300 mb-4">Full Source Content:</h4>
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown 
                        components={markdownComponents}
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw]}
                      >
                        {citation.fullChunkContent?.replace(/\\n/g, '\n').replace(/\\"/g, '"')}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="px-6 py-6">
                    <div className="text-center py-8">
                      <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-400">Full chunk content not available</p>
                      <p className="text-sm text-slate-500 mt-1">
                        File ID: {citation.fileId}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
