"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import StandardHeader from "../../components/StandardHeader";
import { Save, ChevronDown, ChevronRight } from "lucide-react";
import { uploadFilesToSupabase, processUploadedFiles } from "../../utils/file-upload";

interface Portfolio {
  id?: string;
  name: string;
  description: string;
  files: File[];
  existingDocuments?: Array<{ id: string; filename: string; original_name: string }>;
}

function EditPortfoliosContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');
  const supabase = createClient();

  const [team, setTeam] = useState<any>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  // Add state for managing expanded portfolios
  const [expandedPortfolios, setExpandedPortfolios] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (!teamId) {
              router.push("/");
    } else if (user && teamId) {
      loadExistingData();
    }
  }, [user, loading, teamId, router]);

  const loadExistingData = async () => {
    try {
      // Verify user is a manager of this team
      const { data: membership, error: membershipError } = await supabase
        .from('team_members')
        .select('role')
        .eq('team_id', teamId)
        .eq('user_id', user?.id)
        .eq('status', 'active')
        .single();

      if (membershipError || !membership || membership.role !== 'manager') {
        setError('Manager access required');
        return;
      }
      
      setUserRole(membership.role);

      // Load team info
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

      if (teamError || !teamData) {
        setError('Failed to load team information');
        return;
      }
      setTeam(teamData);

      // Load existing portfolios and their documents
      const { data: portfoliosData, error: portfoliosError } = await supabase
        .from('team_portfolios')
        .select(`
          *,
          team_documents (
            id,
            filename,
            original_name
          )
        `)
        .eq('team_id', teamId)
        .order('created_at');

      if (portfoliosError) {
        console.error('Error loading portfolios:', portfoliosError);
        setError('Failed to load existing portfolios');
        return;
      }

      // Transform data for editing
      const transformedPortfolios = portfoliosData?.map(portfolio => ({
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description || '',
        files: [],
        existingDocuments: portfolio.team_documents || []
      })) || [];

      // Add empty portfolio if none exist
      if (transformedPortfolios.length === 0) {
        transformedPortfolios.push({ id: undefined, name: '', description: '', files: [], existingDocuments: [] });
      }

      setPortfolios(transformedPortfolios);

    } catch (error) {
      console.error('Error loading existing data:', error);
      setError('Failed to load team data');
    }
  };

  const addPortfolio = () => {
    setPortfolios([...portfolios, { id: undefined, name: '', description: '', files: [], existingDocuments: [] }]);
  };

  const removePortfolio = async (index: number) => {
    const portfolio = portfolios[index];
    
    if (portfolio.id) {
      // Confirm deletion of existing portfolio
      if (!confirm(`Are you sure you want to delete "${portfolio.name}"? This will remove all associated documents and knowledge.`)) {
        return;
      }

      try {
        // Delete from database
        const { error: deleteError } = await supabase
          .from('team_portfolios')
          .delete()
          .eq('id', portfolio.id);

        if (deleteError) {
          console.error('Error deleting portfolio:', deleteError);
          setError('Failed to delete portfolio');
          return;
        }
      } catch (error) {
        console.error('Error deleting portfolio:', error);
        setError('Failed to delete portfolio');
        return;
      }
    }

    // Remove from state
    const newPortfolios = portfolios.filter((_, i) => i !== index);
    setPortfolios(newPortfolios.length > 0 ? newPortfolios : [{ id: undefined, name: '', description: '', files: [], existingDocuments: [] }]);
  };

  const updatePortfolio = (index: number, field: keyof Portfolio, value: any) => {
    const newPortfolios = [...portfolios];
    newPortfolios[index] = { ...newPortfolios[index], [field]: value };
    setPortfolios(newPortfolios);
  };

  const handleFileUpload = (index: number, files: FileList | null) => {
    if (files && files.length > 0) {
      const newPortfolios = [...portfolios];
      newPortfolios[index].files = [...newPortfolios[index].files, ...Array.from(files)];
      setPortfolios(newPortfolios);
    }
  };

  const removeFile = (portfolioIndex: number, fileIndex: number) => {
    const newPortfolios = [...portfolios];
    newPortfolios[portfolioIndex].files = newPortfolios[portfolioIndex].files.filter((_, i) => i !== fileIndex);
    setPortfolios(newPortfolios);
  };

  const removeExistingDocument = async (portfolioIndex: number, documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      // Delete from database
      const { error: deleteError } = await supabase
        .from('team_documents')
        .delete()
        .eq('id', documentId);

      if (deleteError) {
        console.error('Error deleting document:', deleteError);
        setError('Failed to delete document');
        return;
      }

      // Remove from state
      const newPortfolios = [...portfolios];
      newPortfolios[portfolioIndex].existingDocuments = 
        newPortfolios[portfolioIndex].existingDocuments?.filter(doc => doc.id !== documentId) || [];
      setPortfolios(newPortfolios);

    } catch (error) {
      console.error('Error deleting document:', error);
      setError('Failed to delete document');
    }
  };

  const isFormValid = () => {
    // Check if any portfolio has empty name
    const hasInvalidPortfolio = portfolios.some(portfolio => !portfolio.name.trim());
    
    if (hasInvalidPortfolio) return false;
    
    // Check for duplicate names
    const names = portfolios.map(p => p.name.trim().toLowerCase());
    const uniqueNames = new Set(names);
    return names.length === uniqueNames.size;
  };

  const validateForm = () => {
    for (let i = 0; i < portfolios.length; i++) {
      const portfolio = portfolios[i];
      if (!portfolio.name.trim()) {
        setError(`Portfolio ${i + 1}: Name is required`);
        return false;
      }
    }

    // Check for duplicate names
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
      // Update/create portfolios
      for (const portfolio of portfolios) {
        if (portfolio.id) {
          // Update existing portfolio
          const { error: updateError } = await supabase
            .from('team_portfolios')
            .update({
              name: portfolio.name.trim(),
              description: portfolio.description?.trim() || null
            })
            .eq('id', portfolio.id);

          if (updateError) {
            console.error('Error updating portfolio:', updateError);
            throw new Error(`Failed to update portfolio: ${portfolio.name}`);
          }
        } else if (portfolio.name.trim()) {
          // Create new portfolio
          const { data: newPortfolio, error: createError } = await supabase
            .from('team_portfolios')
            .insert({
              team_id: teamId,
              name: portfolio.name.trim(),
              description: portfolio.description?.trim() || null
            })
            .select()
            .single();

          if (createError) {
            console.error('Error creating portfolio:', createError);
            throw new Error(`Failed to create portfolio: ${portfolio.name}`);
          }

          // Update local state with new ID for file uploads
          portfolio.id = newPortfolio.id;
        }

        // Handle new file uploads using new client-side upload flow
        if (portfolio.files.length > 0 && portfolio.id) {
          try {
            // UPLOAD FILES DIRECTLY TO SUPABASE
            const uploadedFiles = await uploadFilesToSupabase(
              portfolio.files,
              teamId!,
              portfolio.id
            );

            // PROCESS UPLOADED FILES (UPLOAD TO OPENAI AND SAVE TO DATABASE)
            await processUploadedFiles(
              uploadedFiles,
              teamId!,
              portfolio.id
            );
          } catch (error) {
            throw new Error(`Failed to upload files for portfolio: ${portfolio.name} - ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }

      // Redirect back to team dashboard
      router.push(`/launcher/team?teamId=${teamId}`);

    } catch (error) {
      console.error('Error updating portfolios:', error);
      setError(error instanceof Error ? error.message : 'Failed to update portfolios');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add toggle function for expanding/collapsing portfolio documents
  const togglePortfolioDocuments = (portfolioId: string | undefined, portfolioIndex: number) => {
    const key = portfolioId || `new-${portfolioIndex}`;
    const newExpanded = new Set(expandedPortfolios);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedPortfolios(newExpanded);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Loading...</h1>
          <p className="text-slate-400">Loading portfolios...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold text-red-400 mb-4">Error</h1>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => router.push(`/launcher/team?teamId=${teamId}`)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
          >
            ←
          </button>
        </div>
      </div>
    );
  }

  if (!user || !teamId || !team) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <StandardHeader
        teamName={team.name}
        teamLocation={team.location}
        userRole={userRole}
        showBackButton={true}
        onBackClick={handleSubmit}
        backText={isSubmitting ? 'SAVING...' : 'SAVE'}
        backButtonDisabled={isSubmitting || !isFormValid()}
      />

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-md">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          {portfolios.map((portfolio, index) => (
            <div key={index} className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-slate-100">
                  {portfolio.id ? `Edit Portfolio: ${portfolio.name}` : `New Portfolio ${index + 1}`}
                </h3>
                <button
                  onClick={() => removePortfolio(index)}
                  className="text-red-400 hover:text-red-300 font-medium"
                >
                  Delete Portfolio
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Portfolio Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={portfolio.name}
                    onChange={(e) => updatePortfolio(index, 'name', e.target.value)}
                    placeholder="e.g., Hip, Knee, Spine"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Description <span className="text-slate-500">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={portfolio.description}
                    onChange={(e) => updatePortfolio(index, 'description', e.target.value)}
                    placeholder="Brief description of this portfolio"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Existing Documents - Collapsible */}
              {portfolio.existingDocuments && portfolio.existingDocuments.length > 0 && (
                <div className="mb-6">
                  <button
                    onClick={() => togglePortfolioDocuments(portfolio.id, index)}
                    className="flex items-center justify-between w-full text-left mb-3 hover:bg-slate-700/50 p-2 rounded-md transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <h4 className="text-md font-medium text-slate-100">Existing Documents</h4>
                      <span className="text-sm text-slate-400 bg-slate-700 px-2 py-1 rounded-full">
                        {portfolio.existingDocuments.length} document{portfolio.existingDocuments.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {expandedPortfolios.has(portfolio.id || `new-${index}`) ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                  
                  {/* Collapsible Documents List */}
                  {expandedPortfolios.has(portfolio.id || `new-${index}`) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 transition-all duration-200 ease-in-out">
                      {portfolio.existingDocuments.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-700 rounded-md">
                          <span className="text-slate-300 text-sm">{doc.original_name}</span>
                          <button
                            onClick={() => removeExistingDocument(index, doc.id)}
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* File Upload Area */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Add New Documents <span className="text-slate-500">(PDF files)</span>
                </label>
                <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    multiple
                    accept=".pdf"
                    onChange={(e) => handleFileUpload(index, e.target.files)}
                    className="hidden"
                    id={`file-upload-${index}`}
                  />
                  <label htmlFor={`file-upload-${index}`} className="cursor-pointer">
                    <div className="text-slate-400 mb-2">
                      <svg className="mx-auto h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="text-slate-300">Click to upload PDF files</p>
                    <p className="text-slate-500 text-sm">or drag and drop</p>
                  </label>
                </div>

                {/* New Files */}
                {portfolio.files.length > 0 && (
                  <div className="mt-4">
                    <h5 className="text-sm font-medium text-slate-300 mb-2">New Files to Upload:</h5>
                    <div className="space-y-2">
                      {portfolio.files.map((file, fileIndex) => (
                        <div key={fileIndex} className="flex items-center justify-between p-2 bg-slate-700 rounded">
                          <span className="text-slate-300 text-sm">{file.name}</span>
                          <button
                            onClick={() => removeFile(index, fileIndex)}
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Add Portfolio Button */}
          <div className="text-center">
            <button
              onClick={addPortfolio}
              className="w-full bg-slate-700 hover:bg-slate-600 text-slate-100 px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="flex-1 text-center">Add Another Portfolio</span>
            </button>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !isFormValid()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
            >
              <Save className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 text-center">{isSubmitting ? 'Saving Changes...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EditPortfoliosPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EditPortfoliosContent />
    </Suspense>
  );
} 