"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

interface Portfolio {
  id?: string;
  name: string;
  description: string;
  files: File[];
  uploadedFiles?: { name: string; size: number }[];
}

export default function PortfoliosSetupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');
  const supabase = createClient();

  const [portfolios, setPortfolios] = useState<Portfolio[]>([
    { name: '', description: '', files: [] }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<any>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (!teamId) {
      router.push("/setup/team");
    } else if (user && teamId) {
      loadTeamInfo();
    }
  }, [user, loading, teamId, router]);

  const loadTeamInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .eq('created_by', user?.id)
        .single();

      if (error || !data) {
        router.push("/setup/team");
        return;
      }

      setTeam(data);
    } catch (error) {
      console.error('Error loading team:', error);
      router.push("/setup/team");
    }
  };

  const addPortfolio = () => {
    setPortfolios([...portfolios, { name: '', description: '', files: [] }]);
  };

  const removePortfolio = (index: number) => {
    if (portfolios.length > 1) {
      const newPortfolios = portfolios.filter((_, i) => i !== index);
      setPortfolios(newPortfolios);
    }
  };

  const updatePortfolio = (index: number, field: keyof Portfolio, value: any) => {
    const newPortfolios = [...portfolios];
    newPortfolios[index] = { ...newPortfolios[index], [field]: value };
    setPortfolios(newPortfolios);
  };

  const handleFileUpload = (index: number, files: FileList | null) => {
    if (!files) return;

    const fileArray = Array.from(files);
    const pdfFiles = fileArray.filter(file => file.type === 'application/pdf');
    
    if (pdfFiles.length !== fileArray.length) {
      setError('Only PDF files are allowed');
      return;
    }

    updatePortfolio(index, 'files', [...portfolios[index].files, ...pdfFiles]);
    setError(null);
  };

  const removeFile = (portfolioIndex: number, fileIndex: number) => {
    const newFiles = portfolios[portfolioIndex].files.filter((_, i) => i !== fileIndex);
    updatePortfolio(portfolioIndex, 'files', newFiles);
  };

  const validateForm = () => {
    for (let i = 0; i < portfolios.length; i++) {
      const portfolio = portfolios[i];
      if (!portfolio.name.trim()) {
        setError(`Portfolio ${i + 1}: Name is required`);
        return false;
      }
      if (portfolio.files.length === 0) {
        setError(`Portfolio ${i + 1}: At least one PDF file is required`);
        return false;
      }
    }

    // Check for duplicate portfolio names
    const names = portfolios.map(p => p.name.trim().toLowerCase());
    const uniqueNames = new Set(names);
    if (names.length !== uniqueNames.size) {
      setError('Portfolio names must be unique');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    setError(null);
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/teams/portfolios/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId,
          portfolios: portfolios.map(p => ({
            name: p.name.trim(),
            description: p.description.trim(),
            fileCount: p.files.length
          }))
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create portfolios');
      }

      const { portfolios: createdPortfolios } = await response.json();

      // Upload files for each portfolio
      for (let i = 0; i < portfolios.length; i++) {
        const portfolio = portfolios[i];
        const createdPortfolio = createdPortfolios[i];

        if (portfolio.files.length > 0) {
          const formData = new FormData();
          formData.append('teamId', teamId!);
          formData.append('portfolioId', createdPortfolio.id);
          
          portfolio.files.forEach((file) => {
            formData.append('files', file);
          });

          const uploadResponse = await fetch('/api/teams/documents/upload', {
            method: 'POST',
            body: formData,
          });

          if (!uploadResponse.ok) {
            throw new Error(`Failed to upload files for portfolio: ${portfolio.name}`);
          }
        }
      }

      // Redirect to next step (accounts setup)
      router.push(`/setup/accounts?teamId=${teamId}`);

    } catch (error) {
      console.error('Error creating portfolios:', error);
      setError(error instanceof Error ? error.message : 'Failed to create portfolios');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Loading...</h1>
          <p className="text-slate-400">Preparing portfolio setup...</p>
        </div>
      </div>
    );
  }

  if (!user || !teamId || !team) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-slate-100">Create Portfolios</h1>
            <p className="text-slate-400 mt-1">
              Set up custom portfolios for <strong>{team.name}</strong> and upload PDF documents
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-md">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-8">
          {portfolios.map((portfolio, index) => (
            <div key={index} className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-slate-100">
                  Portfolio {index + 1}
                </h3>
                {portfolios.length > 1 && (
                  <button
                    onClick={() => removePortfolio(index)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove Portfolio
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Portfolio Info */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Portfolio Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={portfolio.name}
                      onChange={(e) => updatePortfolio(index, 'name', e.target.value)}
                      placeholder="e.g., Hip, Knee Revision, Shoulder"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Description <span className="text-slate-500">(Optional)</span>
                    </label>
                    <textarea
                      value={portfolio.description}
                      onChange={(e) => updatePortfolio(index, 'description', e.target.value)}
                      placeholder="Brief description of this portfolio"
                      rows={3}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* File Upload */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Upload PDFs <span className="text-red-400">*</span>
                  </label>
                  
                  <div
                    className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center hover:border-slate-500 transition-colors"
                    onDrop={(e) => {
                      e.preventDefault();
                      handleFileUpload(index, e.dataTransfer.files);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <input
                      type="file"
                      multiple
                      accept=".pdf"
                      onChange={(e) => handleFileUpload(index, e.target.files)}
                      className="hidden"
                      id={`file-upload-${index}`}
                    />
                    <label
                      htmlFor={`file-upload-${index}`}
                      className="cursor-pointer"
                    >
                      <div className="text-slate-400 mb-2">
                        <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <p className="text-slate-400 text-sm">
                        Drop PDF files here or <span className="text-blue-400">click to browse</span>
                      </p>
                      <p className="text-slate-500 text-xs mt-1">Only PDF files are allowed</p>
                    </label>
                  </div>

                  {/* File List */}
                  {portfolio.files.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-medium text-slate-300">Uploaded Files:</p>
                      {portfolio.files.map((file, fileIndex) => (
                        <div key={fileIndex} className="flex items-center justify-between bg-slate-700 rounded px-3 py-2">
                          <span className="text-slate-300 text-sm truncate">{file.name}</span>
                          <button
                            onClick={() => removeFile(index, fileIndex)}
                            className="text-red-400 hover:text-red-300 text-xs"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Add Portfolio Button */}
          <div className="text-center">
            <button
              onClick={addPortfolio}
              className="bg-slate-700 hover:bg-slate-600 text-slate-100 px-6 py-3 rounded-md font-medium transition-colors"
            >
              + Add Another Portfolio
            </button>
          </div>

          {/* Info Box */}
          <div className="bg-blue-900/30 border border-blue-700 rounded-md p-4">
            <h3 className="text-sm font-medium text-blue-400 mb-2">Next Steps:</h3>
            <ul className="text-blue-300 text-sm space-y-1">
              <li>• Each portfolio will get its own AI knowledge base</li>
              <li>• Next, you'll create accounts and add team knowledge</li>
              <li>• Finally, you'll be able to invite team members</li>
            </ul>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-8 py-3 rounded-md font-medium transition-colors"
            >
              {isSubmitting ? 'Creating Portfolios...' : 'Create Portfolios & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 