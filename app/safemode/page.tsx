"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../utils/supabase/client";
import { Shield, Search, FileText, ArrowLeft, Copy, CheckCircle, ExternalLink } from "lucide-react";
import StandardHeader from "../components/StandardHeader";
import LoadingScreen from "../components/LoadingScreen";

interface Portfolio {
  id: string;
  name: string;
  description: string;
}

interface SearchResult {
  rank: number;
  chunk_text: string;
  chunk_summary: string;
  page_number: number;
  document_name: string;
  similarity_score: number;
  relevance_percentage: number;
  document_id?: string;
  screenshot_path?: string;
  screenshot_filename?: string;
}

function SafeModeSearchContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [modalImage, setModalImage] = useState<{
    src: string;
    documentName: string;
    pageNumber: number;
    documentId?: string;
  } | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{[key: string]: {width: number, height: number}}>({});


  useEffect(() => {
    if (!authLoading && user && teamId) {
      loadPortfolios();
    } else if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && !teamId) {
      router.push('/');
    }
  }, [authLoading, user, teamId, router]);

  const loadPortfolios = async () => {
    try {
      setLoading(true);
      
      // USE THE SECURE TEAM DATA API ENDPOINT (SAME AS OTHER PAGES)
      const response = await fetch(`/api/teams/${teamId}/data`);
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to load team data');
        return;
      }

      if (!result.success) {
        setError('Failed to load team data');
        return;
      }

      setUserRole(result.data.userRole);

      // TRANSFORM PORTFOLIOS DATA
      const transformedPortfolios = (result.data.portfolios || []).map((portfolio: any) => ({
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description || ''
      }));

      setPortfolios(transformedPortfolios);

    } catch (error) {
      console.error('Error loading portfolios:', error);
      setError('Failed to load portfolios');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!selectedPortfolio) {
      setError('Please select a portfolio');
      return;
    }

    if (!searchQuery.trim()) {
      setError('Please enter a search query');
      return;
    }

    setSearching(true);
    setError(null);
    setResults([]);

    try {
      const response = await fetch('/api/chat/safe-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: searchQuery,
          teamId,
          portfolioId: selectedPortfolio,
          limit: 5
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to search documents');
      }

      if (result.success && result.sources) {
        setResults(result.sources);
      } else {
        setError('No results found');
      }

    } catch (error) {
      console.error('Search error:', error);
      setError(error instanceof Error ? error.message : 'Failed to search documents');
    } finally {
      setSearching(false);
    }
  };


  const handleCopyResult = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  const handleViewPDFPage = (pageNumber: number, documentName: string, documentId?: string) => {
    if (documentId && teamId && selectedPortfolio) {
      // USE REAL PDF FROM SUPABASE STORAGE VIA THUMBNAIL API
      const pdfUrl = `${window.location.origin}/api/thumbnails/pdf/${teamId}/${selectedPortfolio}/${documentId}`;
      console.log('SAFE MODE: OPENING REAL PDF:', pdfUrl, 'PAGE:', pageNumber);
      window.open(`${pdfUrl}#page=${pageNumber}`, '_blank');
    } else {
      // FALLBACK TO TEST PDF
      const pdfUrl = `${window.location.origin}/safemode_testdata.pdf`;
      console.log('SAFE MODE: OPENING TEST PDF:', pdfUrl, 'PAGE:', pageNumber);
      window.open(`${pdfUrl}#page=${pageNumber}`, '_blank');
    }
  };

  const handleThumbnailClick = (documentId: string, pageNumber: number, documentName: string) => {
    const screenshotUrl = getScreenshotUrl(documentId, pageNumber);
    if (screenshotUrl) {
      setModalImage({
        src: screenshotUrl,
        documentName,
        pageNumber,
        documentId
      });
    }
  };

  const closeModal = () => {
    setModalImage(null);
  };

  const handleImageLoad = (documentId: string, pageNumber: number, event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    const key = `${documentId}-${pageNumber}`;
    setImageDimensions(prev => ({
      ...prev,
      [key]: {
        width: img.naturalWidth,
        height: img.naturalHeight
      }
    }));
  };

  const getThumbnailContainerClass = (documentId: string, pageNumber: number) => {
    const key = `${documentId}-${pageNumber}`;
    const dimensions = imageDimensions[key];
    
    if (!dimensions) {
      // Default container while loading
      return "flex-shrink-0 w-20 h-24 bg-slate-700 rounded border border-slate-600 flex items-center justify-center overflow-hidden";
    }
    
    const aspectRatio = dimensions.width / dimensions.height;
    
    if (aspectRatio > 1.2) {
      // Landscape - wider container
      return "flex-shrink-0 w-24 h-16 bg-slate-700 rounded border border-slate-600 flex items-center justify-center overflow-hidden";
    } else if (aspectRatio < 0.8) {
      // Portrait - taller container
      return "flex-shrink-0 w-16 h-24 bg-slate-700 rounded border border-slate-600 flex items-center justify-center overflow-hidden";
    } else {
      // Square-ish - balanced container
      return "flex-shrink-0 w-20 h-20 bg-slate-700 rounded border border-slate-600 flex items-center justify-center overflow-hidden";
    }
  };

  const getScreenshotUrl = (documentId: string, pageNumber: number) => {
    // CONSTRUCT THUMBNAIL API URL FOR SCREENSHOT
    if (teamId && selectedPortfolio) {
      return `${window.location.origin}/api/thumbnails/screenshot/${teamId}/${selectedPortfolio}/${documentId}/${pageNumber}`;
    }
    return null;
  };



  const handleBack = () => {
    router.push(`/launcher/team?teamId=${teamId}`);
  };

  if (loading || authLoading) {
    return (
      <LoadingScreen 
        title="Safe Mode Search" 
        subtitle="Loading..." 
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <StandardHeader />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* HEADER */}
          <div className="flex items-center gap-4 mb-8">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-slate-800 rounded-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-green-500" />
              <div>
                <h1 className="text-3xl font-bold">Safe Mode Search</h1>
                <p className="text-slate-400">Search portfolio documents without AI-generated responses</p>
              </div>
            </div>
          </div>

          {/* SEARCH CONTROLS */}
          <div className="mb-8 space-y-4">
            {/* PORTFOLIO SELECTION */}
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                Select Portfolio
              </label>
              <select
                value={selectedPortfolio}
                onChange={(e) => setSelectedPortfolio(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                style={{ backgroundImage: 'none' }}
              >
                <option value="">Choose a portfolio...</option>
                {portfolios.map((portfolio) => (
                  <option key={portfolio.id} value={portfolio.id}>
                    {portfolio.name}
                  </option>
                ))}
              </select>
            </div>

            {/* SEARCH QUERY WITH INLINE BUTTON */}
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                Search Query
              </label>
              <div className="flex gap-2">
                <textarea
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter your question..."
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                />
                <button
                  onClick={handleSearch}
                  disabled={!selectedPortfolio || !searchQuery.trim() || searching}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md font-medium transition-colors flex items-center justify-center gap-2 h-24"
                >
                  {searching ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* ERROR MESSAGE */}
            {error && (
              <div className="bg-red-900/50 border border-red-500 rounded-md p-3">
                <span className="text-red-300 text-sm">{error}</span>
              </div>
            )}
          </div>

          {/* RESULTS PANEL */}
          <div>
              {results.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-slate-200">
                      Search Results ({results.length})
                    </h2>
                    <span className="text-sm text-slate-400">
                      Portfolio: {portfolios.find(p => p.id === selectedPortfolio)?.name}
                    </span>
                  </div>

                  {results.map((result, index) => (
                      <div key={index} className="bg-slate-800 rounded-lg border border-slate-700 p-6 hover:border-slate-600 transition-colors">
                        {/* HEADER */}
                        <div className="flex items-start justify-between mb-6">
                          <div className="flex items-center gap-4">
                            <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center text-sm font-bold">
                              {result.rank}
                            </div>
                            <div className="flex items-center gap-3">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <FileText className="w-4 h-4 text-slate-300" />
                                  <span className="text-sm font-medium text-slate-200">{result.document_name}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">Page {result.page_number}</span>
                                  <button
                                    onClick={() => handleViewPDFPage(result.page_number, result.document_name, result.document_id)}
                                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors bg-blue-900/20 hover:bg-blue-900/30 px-2 py-1 rounded"
                                    title="View PDF Page"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    <span>View PDF</span>
                                  </button>
                                </div>
                              </div>
                              {/* INLINE THUMBNAIL */}
                              {result.document_id && (
                                <div className={getThumbnailContainerClass(result.document_id, result.page_number)}>
                                  <img
                                    src={getScreenshotUrl(result.document_id, result.page_number) || ''}
                                    alt={`Page ${result.page_number} preview`}
                                    className="max-w-full max-h-full object-contain cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => handleThumbnailClick(result.document_id!, result.page_number, result.document_name)}
                                    title="Click to view larger image"
                                    onLoad={(e) => handleImageLoad(result.document_id!, result.page_number, e)}
                                    onError={(e) => {
                                      console.log('Thumbnail failed to load for document:', result.document_id, 'page:', result.page_number);
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-green-400">
                              {result.relevance_percentage}%
                            </div>
                            <div className="text-xs text-slate-400">
                              relevance
                            </div>
                          </div>
                        </div>



                        {/* FULL TEXT */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                              Full Text
                            </h4>
                            <button
                              onClick={() => handleCopyResult(result.chunk_text, index)}
                              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded-md"
                            >
                              {copiedIndex === index ? (
                                <>
                                  <CheckCircle className="w-3 h-3" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600">
                            <div className="text-sm text-slate-300 leading-relaxed max-h-40 overflow-y-auto">
                              {result.chunk_text}
                            </div>
                          </div>
                        </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-800 rounded-lg border border-slate-700 p-12 text-center">
                  <Search className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-slate-300 mb-2">No Results Yet</h3>
                  <p className="text-slate-400 mb-6">
                    Select a portfolio and enter a search query to find relevant document chunks.
                  </p>
                </div>
              )}
          </div>
        </div>
      </div>

      {/* IMAGE MODAL */}
      {modalImage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-4xl max-h-[90vh] overflow-hidden">
            {/* MODAL HEADER */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <div>
                <h3 className="text-lg font-semibold text-slate-200">{modalImage.documentName}</h3>
                <p className="text-sm text-slate-400">Page {modalImage.pageNumber}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleViewPDFPage(modalImage.pageNumber, modalImage.documentName, modalImage.documentId)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open PDF Page</span>
                </button>
                <button
                  onClick={closeModal}
                  className="p-2 hover:bg-slate-700 rounded-md transition-colors"
                >
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* MODAL CONTENT */}
            <div className="p-4 overflow-auto max-h-[calc(90vh-80px)]">
              <img
                src={modalImage.src}
                alt={`Page ${modalImage.pageNumber} of ${modalImage.documentName}`}
                className="max-w-full h-auto rounded border border-slate-600 shadow-lg"
                onError={(e) => {
                  console.log('Modal image failed to load');
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function SafeModeSearchPage() {
  return (
    <Suspense fallback={<LoadingScreen title="Safe Mode Search" subtitle="Loading..." />}>
      <SafeModeSearchContent />
    </Suspense>
  );
}
