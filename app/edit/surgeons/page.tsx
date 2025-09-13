"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import StandardHeader from "../../components/StandardHeader";
import { Save, Plus, User, X, ChevronDown, ChevronRight } from "lucide-react";
import ConfirmationModal from "../../components/ConfirmationModal";

interface Surgeon {
  id: string;
  name: string;
  specialty: string;
  procedure_focus: string;
  notes: string;
}


function EditGeneralContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');
  const supabase = createClient();

  const [team, setTeam] = useState<any>(null);
  const [surgeons, setSurgeons] = useState<Surgeon[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isOriginalManager, setIsOriginalManager] = useState<boolean>(false);
  // Add state for managing expanded surgeons
  const [expandedSurgeons, setExpandedSurgeons] = useState<Set<string>>(new Set());
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
  // Add state for tracking which surgeon is being deleted
  const [deletingSurgeonId, setDeletingSurgeonId] = useState<string | null>(null);


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

      // Load existing general knowledge using service role via API
      const knowledgeResponse = await fetch(`/api/teams/knowledge/list?teamId=${teamId}&type=general`);
      const knowledgeResult = await knowledgeResponse.json();

      if (!knowledgeResponse.ok) {
        console.error('Error loading general knowledge:', knowledgeResult.error);
        setError('Failed to load existing knowledge');
        return;
      }

      const knowledgeData = knowledgeResult.knowledge || [];

      // Transform data for editing
      const surgeonsData = knowledgeData
        ?.filter((k: any) => k.category === 'surgeon_info')
        .map((k: any) => ({
          id: k.id,
          name: k.metadata?.name || k.title || '',
          specialty: k.metadata?.specialty || '',
          procedure_focus: k.metadata?.procedure_focus || '',
          notes: k.metadata?.notes || ''
        })) || [];

      // Add empty surgeon if none exist
      if (surgeonsData.length === 0) {
        surgeonsData.push({
          id: `temp-${Date.now()}`,
          name: '',
          specialty: '',
          procedure_focus: 'General Practice',
          notes: ''
        });
      }

      setSurgeons(surgeonsData);

      // Auto-expand first surgeon if available
      if (surgeonsData.length > 0 && surgeonsData[0].name.trim()) {
        setExpandedSurgeons(new Set([surgeonsData[0].id]));
      }

    } catch (error) {
      console.error('Error loading existing data:', error);
      setError('Failed to load team data');
    }
  };

  const addSurgeon = () => {
    const newSurgeon = {
      id: `temp-${Date.now()}`,
      name: '',
      specialty: '',
      procedure_focus: 'General Practice',
      notes: ''
    };
    setSurgeons([...surgeons, newSurgeon]);
  };

  const updateSurgeon = (index: number, field: keyof Surgeon, value: string) => {
    const newSurgeons = [...surgeons];
    newSurgeons[index] = { ...newSurgeons[index], [field]: value };
    setSurgeons(newSurgeons);
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

  const removeSurgeon = async (index: number) => {
    const surgeon = surgeons[index];
    
    if (surgeon.id && !surgeon.id.startsWith('temp-')) {
      // SHOW CONFIRMATION MODAL FOR EXISTING SURGEON
      showConfirmationModal(
        'Delete Surgeon',
        `Are you sure you want to delete "${surgeon.name}"? This will permanently remove all associated procedure notes and information. This action cannot be undone.`,
        async () => {
          try {
            // SHOW LOADING STATE
            setIsSubmitting(true);
            setDeletingSurgeonId(surgeon.id);
            setError(null);

            // DELETE FROM DATABASE BY UPDATING WITH FILTERED SURGEONS
            const remainingSurgeons = surgeons.filter((_, i) => i !== index);
            const generalKnowledge = {
              surgeons: remainingSurgeons.filter(s => s.name.trim())
            };

            const response = await fetch('/api/teams/general/update', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                teamId,
                generalKnowledge
              }),
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Failed to delete surgeon');
            }

            // REMOVE FROM STATE AFTER SUCCESSFUL DELETION
            const newSurgeons = surgeons.filter((_, i) => i !== index);
            setSurgeons(newSurgeons.length > 0 ? newSurgeons : [{
              id: `temp-${Date.now()}`,
              name: '',
              specialty: '',
              procedure_focus: 'General Practice',
              notes: ''
            }]);

            closeConfirmationModal();
          } catch (error) {
            console.error('Error deleting surgeon:', error);
            setError('Failed to delete surgeon');
            closeConfirmationModal();
          } finally {
            setIsSubmitting(false);
            setDeletingSurgeonId(null);
          }
        },
        'danger'
      );
    } else {
      // REMOVE NEW SURGEON DIRECTLY (NO CONFIRMATION NEEDED)
      const newSurgeons = surgeons.filter((_, i) => i !== index);
      setSurgeons(newSurgeons.length > 0 ? newSurgeons : [{
        id: `temp-${Date.now()}`,
        name: '',
        specialty: '',
        procedure_focus: 'General Practice',
        notes: ''
      }]);
    }
  };

  // Add toggle function for expanding/collapsing surgeon details
  const toggleSurgeonDetails = (surgeonId: string | undefined, surgeonIndex: number) => {
    const key = surgeonId || `new-${surgeonIndex}`;
    const newExpanded = new Set(expandedSurgeons);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedSurgeons(newExpanded);
  };


  const isFormValid = () => {
    // At least one surgeon is required
    const hasValidSurgeon = surgeons.some(surgeon => surgeon.name.trim());
    return hasValidSurgeon;
  };

  const validateForm = () => {
    // At least one surgeon is required
    const hasValidSurgeon = surgeons.some(surgeon => surgeon.name.trim());

    if (!hasValidSurgeon) {
      setError('Please add at least one surgeon');
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
      // Prepare data for API call
      const generalKnowledge = {
        surgeons: surgeons.filter(surgeon => surgeon.name.trim()),
      };

      const response = await fetch('/api/teams/general/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId,
          generalKnowledge
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save general knowledge');
      }

      // Redirect back to team dashboard
      router.push(`/launcher/team?teamId=${teamId}`);

    } catch (error) {
      console.error('Error updating general knowledge:', error);
      setError(error instanceof Error ? error.message : 'Failed to update general knowledge');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Loading...</h1>
          <p className="text-slate-400">Loading general knowledge...</p>
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
          {surgeons.map((surgeon, surgeonIndex) => (
            <div key={surgeonIndex} className="bg-slate-800 rounded-lg border border-slate-700">
              {/* Collapsible Header */}
              <div className="p-6 pb-4">
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => toggleSurgeonDetails(surgeon.id, surgeonIndex)}
                    className="flex items-center gap-3 flex-1 text-left hover:bg-slate-700/50 p-3 rounded-md transition-colors"
                  >
                    <h3 className="text-lg font-semibold text-slate-100">
                      {surgeon.name || `New Surgeon ${surgeonIndex + 1}`}
                    </h3>
                    {surgeon.specialty && (
                      <span className="text-sm text-slate-400 bg-slate-700 px-2 py-1 rounded-full">
                        {surgeon.specialty}
                      </span>
                    )}
                    {expandedSurgeons.has(surgeon.id || `new-${surgeonIndex}`) ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 ml-auto" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 ml-auto" />
                    )}
                  </button>
                  <button
                    onClick={() => removeSurgeon(surgeonIndex)}
                    disabled={deletingSurgeonId === surgeon.id || isSubmitting}
                    className={`font-medium transition-colors flex items-center gap-2 ${
                      deletingSurgeonId === surgeon.id || isSubmitting
                        ? 'text-slate-500 cursor-not-allowed'
                        : 'text-red-400 hover:text-red-300'
                    }`}
                  >
                    {deletingSurgeonId === surgeon.id ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Deleting...
                      </>
                    ) : (
                      'Delete Surgeon'
                    )}
                  </button>
                </div>
              </div>

              {/* Collapsible Content */}
              {expandedSurgeons.has(surgeon.id || `new-${surgeonIndex}`) && (
                <div className="px-6 pb-6 transition-all duration-200 ease-in-out">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Surgeon Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={surgeon.name}
                        onChange={(e) => updateSurgeon(surgeonIndex, 'name', e.target.value)}
                        placeholder="e.g., Dr. Johnson, Dr. Smith"
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Specialty <span className="text-slate-500">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        value={surgeon.specialty}
                        onChange={(e) => updateSurgeon(surgeonIndex, 'specialty', e.target.value)}
                        placeholder="e.g., Orthopedic Surgery, Neurosurgery"
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Procedure Notes */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Procedure Notes & Preferences <span className="text-slate-500">(Optional)</span>
                    </label>
                    <textarea
                      value={surgeon.notes}
                      onChange={(e) => updateSurgeon(surgeonIndex, 'notes', e.target.value)}
                      placeholder="Surgical preferences, equipment requirements, step-by-step procedures, team preferences, etc."
                      rows={8}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-slate-500 text-sm mt-2">
                      Include surgical preferences, equipment requirements, step-by-step procedures, team preferences, etc.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add Surgeon Button */}
          <div className="text-center">
            <button
              onClick={addSurgeon}
              disabled={deletingSurgeonId !== null}
              className="w-full bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-slate-100 px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="flex-1 text-center">Add Another Surgeon</span>
            </button>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !isFormValid() || deletingSurgeonId !== null}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
            >
              <Save className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 text-center">
                {isSubmitting ? 'Saving Changes...' : deletingSurgeonId ? 'Deleting Surgeon...' : 'Save Changes'}
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
        loadingText="Deleting surgeon..."
      />
    </div>
  );
}

export default function EditGeneralPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EditGeneralContent />
    </Suspense>
  );
} 