"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { Shield, Search, FileText, ArrowLeft, Copy, CheckCircle, ExternalLink } from "lucide-react";
import StandardHeader from "../../components/StandardHeader";
import LoadingScreen from "../../components/LoadingScreen";
import PDFPageImage from "../../components/PDFPageImage";

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

  // SAMPLE QUESTIONS FOR TESTING
  const sampleQuestions = [
    "What are the contraindications for the Restoration Modular system?",
    "What are the different stem lengths available?",
    "How do you perform distal reaming?",
    "What are the indications for use?",
    "What instruments are required for the procedure?"
  ];

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

  const handleSampleQuestion = (question: string) => {
    setSearchQuery(question);
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

  const handleViewPDFPage = (pageNumber: number, documentName: string) => {
    // FOR NOW: USE THE TESTDATA.PDF
    // LATER: THIS WILL BE DYNAMIC BASED ON THE ACTUAL PDF STORED IN SUPABASE
    const pdfUrl = `${window.location.origin}/safemode_testdata.pdf`;
    
    console.log('SAFE MODE: OPENING PDF:', pdfUrl, 'PAGE:', pageNumber);
    
    // OPEN PDF IN NEW TAB WITH PAGE ANCHOR - THIS WORKS RELIABLY
    window.open(`${pdfUrl}#page=${pageNumber}`, '_blank');
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
                <p className="text-slate-400">Search uploaded documents without AI-generated responses</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* SEARCH PANEL */}
            <div className="lg:col-span-1">
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 sticky top-8">
                <div className="space-y-6">
                  {/* PORTFOLIO SELECTION */}
                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">
                      Select Portfolio
                    </label>
                    <select
                      value={selectedPortfolio}
                      onChange={(e) => setSelectedPortfolio(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Choose a portfolio...</option>
                      {portfolios.map((portfolio) => (
                        <option key={portfolio.id} value={portfolio.id}>
                          {portfolio.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* SEARCH QUERY */}
                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">
                      Search Query
                    </label>
                    <textarea
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Enter your question..."
                      className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                    />
                  </div>

                  {/* SAMPLE QUESTIONS */}
                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">
                      Sample Questions
                    </label>
                    <div className="space-y-2">
                      {sampleQuestions.map((question, index) => (
                        <button
                          key={index}
                          onClick={() => handleSampleQuestion(question)}
                          className="w-full text-left p-2 bg-slate-700 hover:bg-slate-600 rounded-md text-sm text-slate-300 transition-colors"
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* SEARCH BUTTON */}
                  <button
                    onClick={handleSearch}
                    disabled={!selectedPortfolio || !searchQuery.trim() || searching}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white px-6 py-3 rounded-md font-medium transition-colors flex items-center justify-center gap-3"
                  >
                    {searching ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Searching...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5" />
                        <span>Search Documents</span>
                      </>
                    )}
                  </button>

                  {/* ERROR MESSAGE */}
                  {error && (
                    <div className="bg-red-900/50 border border-red-500 rounded-md p-3">
                      <span className="text-red-300 text-sm">{error}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RESULTS PANEL */}
            <div className="lg:col-span-2">
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
                      <div key={index} className="bg-slate-800 rounded-lg border border-slate-700 p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-green-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium">
                              {result.rank}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-slate-400" />
                                <span className="text-sm text-slate-400">{result.document_name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-500">Page {result.page_number}</span>
                                <button
                                  onClick={() => handleViewPDFPage(result.page_number, result.document_name)}
                                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                  title="View PDF Page"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>View PDF</span>
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-green-400">
                              {result.relevance_percentage}% match
                            </div>
                            <div className="text-xs text-slate-500">
                              Score: {result.similarity_score}
                            </div>
                          </div>
                        </div>

                        {/* PAGE IMAGE PREVIEW */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium text-slate-300">Page Preview</h4>
                          </div>
                          <div className="bg-slate-700 rounded-md p-2">
                            <PDFPageImage
                              pdfUrl={`${window.location.origin}/safemode_testdata.pdf`}
                              pageNumber={result.page_number}
                              width={300}
                              height={400}
                              className=""
                            />
                          </div>
                        </div>

                      {/* SUMMARY */}
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-slate-300 mb-2">Summary</h4>
                        <p className="text-slate-400 text-sm">{result.chunk_summary}</p>
                      </div>

                      {/* FULL TEXT */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-slate-300">Full Text</h4>
                          <button
                            onClick={() => handleCopyResult(result.chunk_text, index)}
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
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
                        <div className="bg-slate-700 rounded-md p-3 text-sm text-slate-300 max-h-40 overflow-y-auto">
                          {result.chunk_text}
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
                  <div className="text-sm text-slate-500">
                    <p>Try searching for:</p>
                    <ul className="mt-2 space-y-1">
                      <li>• Contraindications</li>
                      <li>• Procedure steps</li>
                      <li>• Equipment specifications</li>
                      <li>• Safety information</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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
