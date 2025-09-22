"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import StandardHeader from "../../components/StandardHeader";
import ConfirmationModal from "../../components/ConfirmationModal";
import { Save, ChevronDown, ChevronRight, Upload, Trash2, FileSpreadsheet } from "lucide-react";
import { uploadInventoryFilesToSupabase, processUploadedInventoryFiles } from "../../utils/inventory-upload";
import LoadingScreen from "../../components/LoadingScreen";
import { InventoryProcessingSection } from "../../components/InventoryProcessingSection";

interface InventoryDocument {
  id: string;
  original_name: string;
  file_size: number | null;
  created_at: string;
  openai_file_id: string | null;
  status?: string;
  progress?: number;
  error?: string;
}

function EditInventoryContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');
  const supabase = createClient();

  const [team, setTeam] = useState<any>(null);
  const [inventoryDocuments, setInventoryDocuments] = useState<InventoryDocument[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isOriginalManager, setIsOriginalManager] = useState<boolean>(false);
  
  // File upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  // Confirmation modal state
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
  
  // State for tracking which document is being deleted
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);

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

      // Load existing inventory documents
      const inventoryResponse = await fetch(`/api/teams/inventory/list?teamId=${teamId}`);
      const inventoryResult = await inventoryResponse.json();

      if (!inventoryResponse.ok) {
        console.error('Error loading inventory documents:', inventoryResult.error);
        setError('Failed to load existing inventory documents');
        return;
      }

      setInventoryDocuments(inventoryResult.inventoryDocuments || []);

    } catch (error) {
      console.error('Error loading existing data:', error);
      setError('Failed to load team data');
    }
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    // Validate file types
    const validFiles = files.filter(file => {
      const extension = file.name.toLowerCase().match(/\.(xlsx|xls|csv)$/)?.[0];
      return extension && ['.xlsx', '.xls', '.csv'].includes(extension);
    });

    if (validFiles.length !== files.length) {
      setError('Some files were skipped. Only Excel (.xlsx, .xls) and CSV files are allowed.');
      return;
    }

    setSelectedFiles(validFiles);
    setError(null);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one file to upload');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Upload files to Supabase
      const uploadedFiles = await uploadInventoryFilesToSupabase(
        selectedFiles,
        teamId!,
        (progress) => setUploadProgress(progress)
      );

      // Process uploaded files with LlamaParse
      await processUploadedInventoryFiles(uploadedFiles, teamId!);

      // Clear selected files and reload data
      setSelectedFiles([]);
      setUploadProgress([]);
      await loadExistingData();

    } catch (error) {
      console.error('Error uploading inventory files:', error);
      setError(error instanceof Error ? error.message : 'Failed to upload files');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = (documentId: string, documentName: string) => {
    showConfirmationModal(
      'Delete Inventory Document',
      `Are you sure you want to delete "${documentName}"? This will permanently remove the document and cannot be undone.`,
      async () => {
        try {
          setDeletingDocumentId(documentId);
          closeConfirmationModal();

          const response = await fetch('/api/teams/inventory/delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              teamId,
              documentId
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete inventory document');
          }

          // Reload data to show updated list
          await loadExistingData();

        } catch (error) {
          console.error('Error deleting inventory document:', error);
          setError(error instanceof Error ? error.message : 'Failed to delete document');
        } finally {
          setDeletingDocumentId(null);
        }
      },
      'danger'
    );
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size';
    
    if (bytes < 1024 * 1024) {
      // Less than 1MB - show in KB
      const kb = bytes / 1024;
      return `${kb.toFixed(1)} KB`;
    } else {
      // 1MB or more - show in MB
      const mb = bytes / (1024 * 1024);
      return `${mb.toFixed(1)} MB`;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'processing': return 'text-yellow-400';
      case 'failed': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (error && error !== 'Manager access required') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-4">Error</h1>
          <p className="text-slate-300 mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <StandardHeader
        teamName={team?.name}
        teamLocation={team?.location}
        userRole={userRole}
        isOriginalManager={isOriginalManager}
        backUrl={`/launcher/team?teamId=${teamId}`}
        backText="← Back to Team"
      />

      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 mb-2">Manage Inventory</h1>
          <p className="text-slate-400">
            Upload Excel or CSV files containing your inventory data. These will be available to all team assistants.
          </p>
        </div>

        {/* Upload Section */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-slate-200 mb-4">Upload Inventory Files</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Select Excel or CSV files
              </label>
              <input
                type="file"
                multiple
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer cursor-pointer"
              />
              <p className="text-xs text-slate-400 mt-1">
                Supported formats: .xlsx, .xls, .csv (Max 512MB per file)
              </p>
            </div>

            {selectedFiles.length > 0 && (
              <div className="bg-slate-700 border border-slate-600 rounded-md p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Selected Files:</h3>
                <ul className="space-y-1">
                  {selectedFiles.map((file, index) => (
                    <li key={index} className="text-sm text-slate-400 flex items-center">
                      <FileSpreadsheet className="w-4 h-4 mr-2" />
                      {file.name} ({formatFileSize(file.size)})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {uploadProgress.length > 0 && (
              <div className="bg-slate-700 border border-slate-600 rounded-md p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Upload Progress:</h3>
                {uploadProgress.map((progress, index) => (
                  <div key={index} className="mb-2">
                    <div className="flex justify-between text-sm text-slate-400 mb-1">
                      <span>{progress.fileName}</span>
                      <span>{progress.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-600 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          progress.status === 'completed' ? 'bg-green-500' :
                          progress.status === 'error' ? 'bg-red-500' :
                          'bg-blue-500'
                        }`}
                        style={{ width: `${progress.progress}%` }}
                      />
                    </div>
                    {progress.error && (
                      <p className="text-xs text-red-400 mt-1">{progress.error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={selectedFiles.length === 0 || isUploading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-6 py-2 rounded-md font-medium transition-colors flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {isUploading ? 'Uploading...' : 'Upload Files'}
            </button>
          </div>
        </div>

        {/* Existing Documents */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-slate-200 mb-4">Inventory Documents</h2>
          
          {inventoryDocuments.length === 0 ? (
            <p className="text-slate-400 text-center py-8">
              No inventory documents uploaded yet. Upload Excel or CSV files to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {inventoryDocuments.map((document) => (
                <div
                  key={document.id}
                  className="bg-slate-700 border border-slate-600 rounded-md p-4 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <FileSpreadsheet className="w-5 h-5 text-slate-400" />
                    <div>
                      <h3 className="text-slate-200 font-medium">{document.original_name}</h3>
                      <div className="text-sm text-slate-400">
                        {formatFileSize(document.file_size)} • 
                        Uploaded {new Date(document.created_at).toLocaleDateString()}
                        {document.status && (
                          <span className={`ml-2 ${getStatusColor(document.status)}`}>
                            {document.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleDeleteDocument(document.id, document.original_name)}
                    disabled={deletingDocumentId === document.id}
                    className="text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed p-2"
                    title="Delete document"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Processing Status Section */}
        <div className="mt-6">
          <InventoryProcessingSection 
            teamId={teamId!}
            onDocumentCompleted={() => loadExistingData()}
          />
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={closeConfirmationModal}
        onConfirm={confirmationModal.onConfirm}
        title={confirmationModal.title}
        message={confirmationModal.message}
        variant={confirmationModal.variant}
        isLoading={deletingDocumentId !== null}
        loadingText="Deleting document..."
      />
    </div>
  );
}

export default function EditInventoryPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <EditInventoryContent />
    </Suspense>
  );
}
