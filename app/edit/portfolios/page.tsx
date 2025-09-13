"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import StandardHeader from "../../components/StandardHeader";
import ConfirmationModal from "../../components/ConfirmationModal";
import { Save, ChevronDown, ChevronRight } from "lucide-react";
import { uploadFilesToSupabase, processUploadedFiles } from "../../utils/file-upload";
import LoadingScreen from "../../components/LoadingScreen";
import { ProcessingDocumentsSection } from "../../components/ProcessingDocumentsSection";
import { PortfolioProcessingSummary } from "../../components/PortfolioProcessingSummary";
import { DocumentStatusIndicator } from "../../components/DocumentStatusIndicator";

interface Portfolio {
  id?: string;
  name: string;
  description: string;
  files: File[];
  existingDocuments?: Array<{ id: string; filename: string; original_name: string; file_size?: number | null }>;
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
  const [isOriginalManager, setIsOriginalManager] = useState<boolean>(false);
  // Add state for managing expanded portfolios
  const [expandedPortfolios, setExpandedPortfolios] = useState<Set<string>>(new Set());
  // Add state for confirmation modal
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'danger'
  });

  // Add state for tracking which portfolio is being deleted
  const [deletingPortfolioId, setDeletingPortfolioId] = useState<string | null>(null);

  // Add portfolio status state
  const [portfolioStatuses, setPortfolioStatuses] = useState<Record<string, any>>({});
  // Add state for dismissed warnings
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (!teamId) {
              router.push("/");
    } else if (user && teamId) {
      loadExistingData();
    }
  }, [user, loading, teamId, router]);

  // FETCH STATUS FOR ALL PORTFOLIOS WHEN PORTFOLIOS ARE LOADED
  const fetchPortfolioStatus = async (portfolioId: string) => {
    try {
      const response = await fetch(
        `/api/teams/portfolios/${portfolioId}/documents/status?teamId=${teamId}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch document status');
      }

      const data = await response.json();

      if (data.success) {
        setPortfolioStatuses(prev => ({
          ...prev,
          [portfolioId]: {
            documents: data.documents,
            summary: data.summary
          }
        }));
      }
    } catch (error) {
      console.error('ERROR FETCHING PORTFOLIO STATUS:', error);
    }
  };

  // REFRESH ALL PORTFOLIO STATUSES
  const refreshAllPortfolioStatuses = async () => {
    if (portfolios.length > 0 && teamId) {
      await Promise.all(
        portfolios
          .filter(portfolio => portfolio.id)
          .map(portfolio => fetchPortfolioStatus(portfolio.id!))
      );
    }
  };

  useEffect(() => {
    if (portfolios.length > 0 && teamId) {
      portfolios.forEach(portfolio => {
        if (portfolio.id) {
          fetchPortfolioStatus(portfolio.id);
        }
      });
    }
  }, [portfolios, teamId]);

  const loadExistingData = async () => {
    try {
      // Use the secure team data API endpoint
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

      // Check if user is a manager
      if (result.data.userRole !== 'manager') {
        setError('Manager access required');
        return;
      }

      setUserRole(result.data.userRole);
      setIsOriginalManager(result.data.isOriginalManager || false);
      setTeam(result.data.team);

      // Load existing portfolios and their documents using service role via API
      const portfoliosResponse = await fetch(`/api/teams/portfolios/list?teamId=${teamId}`);
      const portfoliosResult = await portfoliosResponse.json();

      if (!portfoliosResponse.ok) {
        console.error('Error loading portfolios:', portfoliosResult.error);
        setError('Failed to load existing portfolios');
        return;
      }

      const portfoliosData = portfoliosResult.portfolios || [];

      // Transform data for editing
      const transformedPortfolios = portfoliosData?.map((portfolio: any) => ({
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

  // HELPER FUNCTION TO SHOW CONFIRMATION MODAL
  const showConfirmationModal = (
    title: string, 
    message: string, 
    onConfirm: () => void, 
    variant: 'danger' | 'warning' | 'info' = 'danger'
  ) => {
    setConfirmationModal({
      isOpen: true,
      title,
      message,
      onConfirm,
      variant
    });
  };

  // CLOSE CONFIRMATION MODAL
  const closeConfirmationModal = () => {
    setConfirmationModal(prev => ({ ...prev, isOpen: false }));
  };

  // HELPER FUNCTION TO FORMAT FILE SIZES
  const formatFileSize = (bytes: number | undefined | null): string => {
    if (bytes === null || bytes === undefined || bytes === 0) {
      return bytes === 0 ? '0 Bytes' : 'Size unknown';
    }
    
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  // HELPER FUNCTION TO CALCULATE TOTAL PORTFOLIO SIZE
  const calculatePortfolioSize = (portfolio: Portfolio): number => {
    let totalSize = 0;
    
    // ADD EXISTING DOCUMENTS SIZE
    if (portfolio.existingDocuments) {
      portfolio.existingDocuments.forEach(doc => {
        if (doc.file_size !== null && doc.file_size !== undefined) {
          totalSize += doc.file_size;
        } else {
          // ASSUME 2.5MB FOR UNKNOWN SIZES
          totalSize += 2.5 * 1024 * 1024;
        }
      });
    }
    
    // ADD NEW FILES SIZE
    portfolio.files.forEach(file => {
      totalSize += file.size;
    });
    
    return totalSize;
  };

  // HELPER FUNCTION TO CHECK IF PORTFOLIO NEEDS WARNING
  const shouldShowSizeWarning = (portfolio: Portfolio): boolean => {
    const totalSize = calculatePortfolioSize(portfolio);
    const warningThreshold = 50 * 1024 * 1024; // 50MB
    return totalSize > warningThreshold;
  };

  // HELPER FUNCTION TO DISMISS WARNING
  const dismissWarning = (portfolioId: string | undefined, portfolioIndex: number) => {
    const key = portfolioId || `new-${portfolioIndex}`;
    setDismissedWarnings(prev => new Set([...prev, key]));
  };

  // HELPER FUNCTION TO CHECK IF WARNING IS DISMISSED
  const isWarningDismissed = (portfolioId: string | undefined, portfolioIndex: number): boolean => {
    const key = portfolioId || `new-${portfolioIndex}`;
    return dismissedWarnings.has(key);
  };

  // HANDLE LLAMAPARSE FILE UPLOAD
  const processUploadedFilesWithLlamaParse = async (
    uploadedFiles: any[],
    teamId: string,
    portfolioId: string
  ): Promise<any> => {
    const response = await fetch('/api/teams/documents/upload-with-llamaparse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        teamId,
        portfolioId,
        uploadedFiles
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to process uploaded files with LlamaParse');
    }

    return response.json();
  };

  const removePortfolio = async (index: number) => {
    const portfolio = portfolios[index];
    
    if (portfolio.id) {
      // SHOW CONFIRMATION MODAL FOR EXISTING PORTFOLIO
      showConfirmationModal(
        'Delete Portfolio',
        `Are you sure you want to delete "${portfolio.name}"? This will permanently remove all associated documents, chat history, notes, and knowledge. This action cannot be undone.`,
        async () => {
          try {
            // SHOW LOADING STATE
            setIsSubmitting(true);
            setDeletingPortfolioId(portfolio.id || null);
            setError(null);

            // DELETE VIA API ROUTE
            const response = await fetch('/api/teams/portfolios/delete', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                portfolioId: portfolio.id,
                teamId: teamId
              }),
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Failed to delete portfolio');
            }

            const result = await response.json();
            
            if (result.success) {
              // ONLY REMOVE FROM STATE AFTER CONFIRMED SUCCESSFUL DELETION
              const newPortfolios = portfolios.filter((_, i) => i !== index);
              setPortfolios(newPortfolios.length > 0 ? newPortfolios : [{ id: undefined, name: '', description: '', files: [], existingDocuments: [] }]);
              
              // RELOAD DATA TO ENSURE CONSISTENCY
              await loadExistingData();
              
              closeConfirmationModal();
            } else {
              throw new Error(result.error || 'Portfolio deletion failed');
            }
          } catch (error) {
            console.error('Error deleting portfolio:', error);
            setError(error instanceof Error ? error.message : 'Failed to delete portfolio');
            closeConfirmationModal();
          } finally {
            setIsSubmitting(false);
            setDeletingPortfolioId(null);
          }
        },
        'danger'
      );
    } else {
      // REMOVE NEW PORTFOLIO DIRECTLY (NO CONFIRMATION NEEDED)
      const newPortfolios = portfolios.filter((_, i) => i !== index);
      setPortfolios(newPortfolios.length > 0 ? newPortfolios : [{ id: undefined, name: '', description: '', files: [], existingDocuments: [] }]);
    }
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
    // SHOW CONFIRMATION MODAL FOR DOCUMENT DELETION
    showConfirmationModal(
      'Delete Document',
      'Are you sure you want to delete this document?',
      async () => {
        try {
          // DELETE VIA API ROUTE
          const response = await fetch('/api/teams/documents/delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              documentId: documentId,
              teamId: teamId
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete document');
          }

          // REMOVE FROM STATE AFTER SUCCESSFUL DELETION
          const newPortfolios = [...portfolios];
          newPortfolios[portfolioIndex].existingDocuments = 
            newPortfolios[portfolioIndex].existingDocuments?.filter(doc => doc.id !== documentId) || [];
          setPortfolios(newPortfolios);
          closeConfirmationModal();

        } catch (error) {
          console.error('Error deleting document:', error);
          setError('Failed to delete document');
          closeConfirmationModal();
        }
      },
      'danger'
    );
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
          // UPDATE EXISTING PORTFOLIO VIA API ROUTE
          const updateResponse = await fetch('/api/teams/portfolios/update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              portfolioId: portfolio.id,
              teamId: teamId,
              name: portfolio.name.trim(),
              description: portfolio.description?.trim() || null
            }),
          });

          if (!updateResponse.ok) {
            const errorData = await updateResponse.json();
            throw new Error(`Failed to update portfolio: ${portfolio.name} - ${errorData.error}`);
          }
        } else if (portfolio.name.trim()) {
          // CREATE NEW PORTFOLIO VIA API ROUTE
          const createResponse = await fetch('/api/teams/portfolios/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              teamId: teamId,
              portfolios: [{
                name: portfolio.name.trim(),
                description: portfolio.description?.trim() || null
              }]
            }),
          });

          if (!createResponse.ok) {
            const errorData = await createResponse.json();
            throw new Error(`Failed to create portfolio: ${portfolio.name} - ${errorData.error}`);
          }

          const createResult = await createResponse.json();
          if (createResult.success && createResult.portfolios && createResult.portfolios.length > 0) {
            // Update local state with new ID for file uploads
            portfolio.id = createResult.portfolios[0].id;
          }
        }

        // Handle new file uploads using LlamaParse processing
        if (portfolio.files.length > 0 && portfolio.id) {
          try {
            // UPLOAD FILES DIRECTLY TO SUPABASE
            const uploadedFiles = await uploadFilesToSupabase(
              portfolio.files,
              teamId!,
              portfolio.id
            );

            // PROCESS UPLOADED FILES WITH LLAMAPARSE
            await processUploadedFilesWithLlamaParse(
              uploadedFiles,
              teamId!,
              portfolio.id
            );
          } catch (error) {
            throw new Error(`Failed to upload files for portfolio: ${portfolio.name} - ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }

      // RELOAD THE DATA TO SHOW UPDATED PORTFOLIOS
      await loadExistingData();

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
      <LoadingScreen 
        title="HHB Assistant" 
        subtitle="Loading portfolios..." 
      />
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
        isOriginalManager={isOriginalManager}
        backUrl={`/launcher/team?teamId=${teamId}`}
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
                  disabled={deletingPortfolioId === portfolio.id || isSubmitting}
                  className={`font-medium transition-colors flex items-center gap-2 ${
                    deletingPortfolioId === portfolio.id || isSubmitting
                      ? 'text-slate-500 cursor-not-allowed'
                      : 'text-red-400 hover:text-red-300'
                  }`}
                >
                  {deletingPortfolioId === portfolio.id ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Deleting...
                    </>
                  ) : (
                    'Delete Portfolio'
                  )}
                </button>
              </div>

              {/* PORTFOLIO SIZE WARNING */}
              {shouldShowSizeWarning(portfolio) && !isWarningDismissed(portfolio.id, index) && (
                <div className="mb-4 p-3 bg-amber-900/30 border border-amber-700 rounded-md">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2">
                      <svg className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <div className="flex-1">
                        <p className="text-amber-200 text-sm font-medium mb-1">Portfolio Size Notice</p>
                        <p className="text-amber-300 text-xs leading-relaxed">
                          Assistants perform better with focused portfolios. Consider organizing your documents into smaller, 
                          more specific portfolios for improved results and faster responses.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => dismissWarning(portfolio.id, index)}
                      className="text-amber-400 hover:text-amber-300 ml-2 flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

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

              {/* Processing Documents Section */}
              {portfolio.id && (
                <ProcessingDocumentsSection
                  teamId={teamId!}
                  portfolioId={portfolio.id}
                  onDocumentCompleted={(documentId) => {
                    // RELOAD DATA WHEN DOCUMENT COMPLETES PROCESSING
                    loadExistingData();
                    // REFRESH PORTFOLIO STATUS
                    if (portfolio.id) {
                      fetchPortfolioStatus(portfolio.id);
                    }
                  }}
                />
              )}

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
                    <div className="space-y-4 transition-all duration-200 ease-in-out">
                      {/* Portfolio Processing Summary */}
                      {portfolio.id && teamId && portfolioStatuses[portfolio.id] && (
                        <PortfolioProcessingSummary
                          teamId={teamId}
                          portfolioId={portfolio.id}
                          summary={portfolioStatuses[portfolio.id].summary || {
                            total: 0,
                            completed: 0,
                            pending: 0,
                            processing: 0,
                            failed: 0,
                            isComplete: true
                          }}
                          onRefresh={() => fetchPortfolioStatus(portfolio.id!)}
                          className="mb-4"
                        />
                      )}

                      {/* Documents Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {portfolio.existingDocuments.map((doc) => {
                          const documentStatus = portfolio.id ? portfolioStatuses[portfolio.id]?.documents?.find(
                            (d: any) => d.id === doc.id
                          ) : null;
                          
                          return (
                            <div key={doc.id} className="flex items-center p-3 bg-slate-700 rounded-md">
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className="text-slate-300 text-sm truncate">{doc.original_name}</span>
                                <span className="text-slate-500 text-xs">{formatFileSize(doc.file_size)}</span>
                              </div>
                              <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                {documentStatus && portfolio.id && (
                                  <DocumentStatusIndicator
                                    documentId={doc.id}
                                    status={documentStatus.status}
                                    progress={documentStatus.progress}
                                    error={documentStatus.error}
                                    onRefresh={() => fetchPortfolioStatus(portfolio.id!)}
                                  />
                                )}
                                <button
                                  onClick={() => removeExistingDocument(index, doc.id)}
                                  className="text-red-400 hover:text-red-300 text-sm"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* File Upload Area */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Add New Documents <span className="text-slate-500">(PDF and Markdown files)</span>
                </label>
                <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.md"
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
                    <p className="text-slate-300">Click to upload PDF or Markdown files</p>
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
                          <div className="flex flex-col">
                            <span className="text-slate-300 text-sm">{file.name}</span>
                            <span className="text-slate-500 text-xs">{formatFileSize(file.size)}</span>
                          </div>
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
              disabled={deletingPortfolioId !== null}
              className="w-full bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-slate-100 px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
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
              disabled={isSubmitting || !isFormValid() || deletingPortfolioId !== null}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
            >
              <Save className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 text-center">
                {isSubmitting ? 'Saving Changes...' : deletingPortfolioId ? 'Deleting Portfolio...' : 'Save Changes'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* CONFIRMATION MODAL */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={closeConfirmationModal}
        onConfirm={confirmationModal.onConfirm}
        title={confirmationModal.title}
        message={confirmationModal.message}
        variant={confirmationModal.variant}
        isLoading={isSubmitting}
        loadingText="Deleting portfolio..."
      />
    </div>
  );
}

export default function EditPortfoliosPage() {
  return (
    <Suspense fallback={
      <LoadingScreen 
        title="HHB Assistant" 
        subtitle="Loading..." 
      />
    }>
      <EditPortfoliosContent />
    </Suspense>
  );
} 