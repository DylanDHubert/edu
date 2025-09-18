"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { Shield, Upload, FileText, AlertCircle, CheckCircle, ArrowLeft, Search } from "lucide-react";
import StandardHeader from "../../components/StandardHeader";
import LoadingScreen from "../../components/LoadingScreen";

interface Portfolio {
  id: string;
  name: string;
  description: string;
}

function SafeModeUploadContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('');
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');

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

      // CHECK USER ROLE
      if (result.data.userRole !== 'manager') {
        setError('Manager access required for Safe Mode uploads');
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // VALIDATE FILE TYPE
    if (!file.name.toLowerCase().endsWith('.md')) {
      setError('Please select a Markdown (.md) file');
      return;
    }

    // VALIDATE FILE SIZE (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setFileName(file.name);
    setError(null);

    // READ FILE CONTENT
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setMarkdownContent(content);
    };
    reader.readAsText(file);
  };

  const handleTextAreaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMarkdownContent(event.target.value);
    setError(null);
  };

  const validateMarkdownContent = (content: string): boolean => {
    // CHECK FOR PAGE BREAKS
    const pageBreakPattern = /\n<<\d+>>\n/g;
    const hasPageBreaks = pageBreakPattern.test(content);
    
    if (!hasPageBreaks) {
      setError('Markdown content must contain page breaks in format: \\n<<page_number>>\\n');
      return false;
    }

    // CHECK MINIMUM CONTENT LENGTH
    if (content.trim().length < 100) {
      setError('Content must be at least 100 characters long');
      return false;
    }

    return true;
  };

  const handleUpload = async () => {
    if (!selectedPortfolio) {
      setError('Please select a portfolio');
      return;
    }

    if (!markdownContent.trim()) {
      setError('Please provide markdown content');
      return;
    }

    if (!fileName) {
      setError('Please provide a file name');
      return;
    }

    if (!validateMarkdownContent(markdownContent)) {
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/teams/safe-mode/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId,
          portfolioId: selectedPortfolio,
          markdownContent,
          fileName
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to upload document');
      }

      setSuccess(`Document "${fileName}" uploaded and vectorized successfully!`);
      setMarkdownContent('');
      setFileName('');
      setSelectedPortfolio('');

    } catch (error) {
      console.error('Upload error:', error);
      setError(error instanceof Error ? error.message : 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleBack = () => {
    router.push(`/launcher/team?teamId=${teamId}`);
  };

  if (loading || authLoading) {
    return (
      <LoadingScreen 
        title="Safe Mode Upload" 
        subtitle="Loading..." 
      />
    );
  }

  if (userRole !== 'manager') {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100">
        <StandardHeader />
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-red-400 mb-4">Access Denied</h1>
            <p className="text-slate-300 mb-6">Only team managers can upload Safe Mode documents.</p>
            <button
              onClick={handleBack}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium transition-colors"
            >
              Back to Team Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <StandardHeader />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
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
                <h1 className="text-3xl font-bold">Safe Mode Upload</h1>
                <p className="text-slate-400">Upload pre-parsed markdown documents with page breaks for vector search</p>
              </div>
            </div>
          </div>

          {/* UPLOAD FORM */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
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

              {/* FILE UPLOAD */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Upload Markdown File
                </label>
                <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept=".md"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <Upload className="w-8 h-8 text-slate-400" />
                    <span className="text-slate-300">
                      {fileName ? fileName : 'Click to select .md file'}
                    </span>
                    <span className="text-sm text-slate-500">
                      Maximum file size: 10MB
                    </span>
                  </label>
                </div>
              </div>

              {/* MANUAL INPUT */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Or Paste Markdown Content
                </label>
                <textarea
                  value={markdownContent}
                  onChange={handleTextAreaChange}
                  placeholder="Paste your markdown content here... Make sure it includes page breaks in the format: \n<<1>>\n\nContent for page 1...\n\n<<2>>\n\nContent for page 2..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 h-64 resize-vertical"
                />
                <p className="text-sm text-slate-500 mt-2">
                  Content must include page breaks in format: <code className="bg-slate-700 px-1 rounded">\n&lt;&lt;page_number&gt;&gt;\n</code>
                </p>
              </div>

              {/* ERROR/SUCCESS MESSAGES */}
              {error && (
                <div className="bg-red-900/50 border border-red-500 rounded-md p-4 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <span className="text-red-300">{error}</span>
                </div>
              )}

              {success && (
                <div className="bg-green-900/50 border border-green-500 rounded-md p-4 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <span className="text-green-300">{success}</span>
                </div>
              )}

              {/* UPLOAD BUTTON */}
              <button
                onClick={handleUpload}
                disabled={!selectedPortfolio || !markdownContent.trim() || uploading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white px-6 py-3 rounded-md font-medium transition-colors flex items-center justify-center gap-3"
              >
                {uploading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Uploading and Vectorizing...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5" />
                    <span>Upload Document</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* INSTRUCTIONS */}
          <div className="mt-8 bg-slate-800 rounded-lg border border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-slate-200 mb-4">Safe Mode Instructions</h3>
            <div className="space-y-3 text-slate-300">
              <p>• Safe Mode allows you to upload pre-parsed markdown documents for vector search</p>
              <p>• Documents must include page breaks in the format: <code className="bg-slate-700 px-1 rounded">\n&lt;&lt;page_number&gt;&gt;\n</code></p>
              <p>• Content will be chunked by page and vectorized for similarity search</p>
              <p>• Only team managers can upload documents</p>
              <p>• Documents are processed without AI-generated responses - only source retrieval</p>
            </div>
            <div className="mt-6 pt-6 border-t border-slate-600">
              <button
                onClick={() => router.push(`/safe-mode/search?teamId=${teamId}`)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium transition-colors flex items-center justify-center gap-3"
              >
                <Search className="w-5 h-5" />
                <span>Go to Safe Mode Search</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SafeModeUploadPage() {
  return (
    <Suspense fallback={<LoadingScreen title="Safe Mode Upload" subtitle="Loading..." />}>
      <SafeModeUploadContent />
    </Suspense>
  );
}
