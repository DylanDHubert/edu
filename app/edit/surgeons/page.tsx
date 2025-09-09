"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import StandardHeader from "../../components/StandardHeader";
import { Save, Plus, User, X } from "lucide-react";

interface Surgeon {
  id: string;
  name: string;
  specialty: string;
  procedure_focus: string;
  notes: string;
}

interface ProcedureTab {
  id: string;
  name: string;
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
  const [selectedSurgeonId, setSelectedSurgeonId] = useState<string | null>(null);
  const [selectedProcedure, setSelectedProcedure] = useState<string>('general');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');

  // Modal state for adding procedures
  const [showAddProcedureModal, setShowAddProcedureModal] = useState(false);
  const [newProcedureName, setNewProcedureName] = useState('');
  
  // Surgeon editing state
  const [editingSurgeonId, setEditingSurgeonId] = useState<string | null>(null);
  
  // Save state for individual procedures
  const [savingProcedures, setSavingProcedures] = useState<Set<string>>(new Set());

  // Get the currently selected surgeon
  const selectedSurgeon = surgeons.find(s => s.id === selectedSurgeonId);

  // Get procedure tabs for a surgeon from database entries
  const getProcedureTabs = (surgeon: Surgeon): ProcedureTab[] => {
    if (!surgeon) return [];
    
    console.log('🔥 GETTING TABS FOR SURGEON:', surgeon.name);
    
    // Find all entries for this surgeon by name
    const surgeonEntries = surgeons.filter(entry => entry.name === surgeon.name);
    
    console.log('🔥 SURGEON ENTRIES:', surgeonEntries);
    
    const tabs: ProcedureTab[] = [];
    
    surgeonEntries.forEach(entry => {
      const procedureFocus = entry.procedure_focus || 'General Practice';
      
      console.log('🔥 PROCESSING ENTRY:', { procedureFocus, notes: entry.notes });
      
      if (procedureFocus === 'General Practice' || procedureFocus === '') {
        tabs.push({
          id: 'general',
          name: 'General',
          notes: entry.notes || ''
        });
      } else {
        tabs.push({
          id: procedureFocus.toLowerCase().replace(/\s+/g, '_'),
          name: procedureFocus,
          notes: entry.notes || ''
        });
      }
    });
    
    // Ensure we always have a General tab
    if (!tabs.find(t => t.id === 'general')) {
      tabs.unshift({
        id: 'general',
        name: 'General',
        notes: ''
      });
    }
    
    console.log('🔥 FINAL TABS:', tabs);
    return tabs;
  };



  const procedureTabs = selectedSurgeon ? getProcedureTabs(selectedSurgeon) : [];

  // Get unique surgeons for the sidebar (deduplicate by name)
  const getUniqueSurgeons = (): Surgeon[] => {
    const seen = new Map<string, Surgeon>();
    
    surgeons.forEach(surgeon => {
      const key = surgeon.name.trim().toLowerCase() || surgeon.id; // Use ID as key for empty names
      if (!seen.has(key) || (surgeon.procedure_focus === 'General Practice' || surgeon.procedure_focus === '')) {
        // Prefer the General Practice entry for the sidebar, or first entry if no general
        seen.set(key, surgeon);
      }
    });
    
    // Include empty-name surgeons (new surgeons being created)
    return Array.from(seen.values());
  };

  const uniqueSurgeons = getUniqueSurgeons();

  // Reset selected procedure if it doesn't exist for the current surgeon
  useEffect(() => {
    if (selectedSurgeon && procedureTabs.length > 0) {
      const currentProcedureExists = procedureTabs.some(tab => tab.id === selectedProcedure);
      if (!currentProcedureExists) {
        setSelectedProcedure('general');
      }
    }
  }, [selectedSurgeonId, selectedSurgeon?.notes, procedureTabs.length]);

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

      // Auto-select first surgeon if available
      if (surgeonsData.length > 0 && surgeonsData[0].name.trim()) {
        setSelectedSurgeonId(surgeonsData[0].id);
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
    // Auto-select the new surgeon
    setSelectedSurgeonId(newSurgeon.id);
    setSelectedProcedure('general');
  };

  const updateSurgeon = (field: keyof Surgeon, value: string) => {
    if (!selectedSurgeon) return;
    
    console.log('🔥 UPDATING SURGEON FIELD (LOCAL):', { field, value, surgeonName: selectedSurgeon.name });
    
    if (field === 'name' || field === 'specialty') {
      // Update all entries for this surgeon in local state
      const surgeonEntries = surgeons.filter(entry => entry.name === selectedSurgeon.name);
      
      console.log('🔥 UPDATING ALL LOCAL ENTRIES FOR SURGEON:', surgeonEntries);
      
      // Update local state for all entries of this surgeon
      setSurgeons(prev => prev.map(surgeon => {
        const shouldUpdate = surgeonEntries.some(entry => entry.id === surgeon.id);
        return shouldUpdate 
          ? { ...surgeon, [field]: value }
          : surgeon;
      }));
      
      console.log('🔥 SURGEON FIELD UPDATED IN LOCAL STATE');
    } else {
      // For other fields, just update the selected entry
      const newSurgeons = surgeons.map(surgeon => 
        surgeon.id === selectedSurgeon.id 
          ? { ...surgeon, [field]: value }
          : surgeon
      );
      setSurgeons(newSurgeons);
    }
  };

  const removeSurgeon = (surgeonId: string) => {
    const newSurgeons = surgeons.filter(s => s.id !== surgeonId);
    
    if (newSurgeons.length === 0) {
      // Add empty surgeon if none left
      const emptySurgeon = {
        id: `temp-${Date.now()}`,
        name: '',
        specialty: '',
        procedure_focus: '',
        notes: ''
      };
      setSurgeons([emptySurgeon]);
      setSelectedSurgeonId(emptySurgeon.id);
    } else {
      setSurgeons(newSurgeons);
      // Select first surgeon if deleted surgeon was selected
      if (selectedSurgeonId === surgeonId) {
        setSelectedSurgeonId(newSurgeons[0].id);
      }
    }
    setSelectedProcedure('general');
  };

  const selectSurgeon = (surgeonId: string) => {
    setSelectedSurgeonId(surgeonId);
    setSelectedProcedure('general'); // Reset to general tab when switching surgeons
  };

  // Update procedure notes for the selected surgeon
  const updateProcedureNotes = (procedureId: string, notes: string) => {
    if (!selectedSurgeon) return;
    
    console.log('🔥 UPDATING PROCEDURE NOTES (LOCAL):', { procedureId, notes });
    
    // Find the specific surgeon entry for this procedure
    const targetEntry = surgeons.find(entry => 
      entry.name === selectedSurgeon.name && 
      (procedureId === 'general' 
        ? (entry.procedure_focus === 'General Practice' || entry.procedure_focus === '')
        : entry.procedure_focus.toLowerCase().replace(/\s+/g, '_') === procedureId
      )
    );
    
    if (!targetEntry) {
      console.error('🔥 TARGET ENTRY NOT FOUND:', { procedureId, surgeonName: selectedSurgeon.name });
      return;
    }
    
    console.log('🔥 FOUND TARGET ENTRY:', targetEntry);
    
    // Update local state only
    setSurgeons(prev => prev.map(surgeon => 
      surgeon.id === targetEntry.id 
        ? { ...surgeon, notes }
        : surgeon
    ));
    
    console.log('🔥 NOTES UPDATED IN LOCAL STATE');
  };



  // Show add procedure modal
  const showAddProcedureModal_func = () => {
    setNewProcedureName('');
    setShowAddProcedureModal(true);
  };

  // Add new procedure tab
  const handleAddProcedure = () => {
    if (!selectedSurgeon || !newProcedureName.trim()) return;
    
    const procedureName = newProcedureName.trim();
    console.log('🔥 ADD PROCEDURE DEBUG - Starting process for:', procedureName);
    console.log('🔥 Selected surgeon before:', selectedSurgeon);
    
    const currentTabs = getProcedureTabs(selectedSurgeon);
    console.log('🔥 Current tabs before adding:', currentTabs);
    
    // Check for duplicates
    const duplicateExists = currentTabs.some(tab => 
      tab.name.toLowerCase() === procedureName.toLowerCase()
    );
    
    if (duplicateExists) {
      console.log('🔥 DUPLICATE DETECTED:', procedureName);
      alert('A procedure with this name already exists');
      return;
    }
    
    console.log('🔥 Creating new local procedure entry for:', procedureName);
    
    // Create new local surgeon entry for this procedure
    const newSurgeonEntry: Surgeon = {
      id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: selectedSurgeon.name,
      specialty: selectedSurgeon.specialty,
      procedure_focus: procedureName,
      notes: ''
    };
    
    setSurgeons(prev => [...prev, newSurgeonEntry]);
    
    // Switch to the new procedure tab
    const newTabId = procedureName.toLowerCase().replace(/\s+/g, '_');
    setSelectedProcedure(newTabId);
    setShowAddProcedureModal(false);
    setNewProcedureName('');
    
    console.log('🔥 Procedure added to local state, switched to tab:', newTabId);
  };

  // Cancel add procedure
  const handleCancelAddProcedure = () => {
    setShowAddProcedureModal(false);
    setNewProcedureName('');
  };

  // Save individual procedure
  const saveProcedure = async (procedureId: string) => {
    if (!selectedSurgeon) return;
    
    console.log('🔥 SAVING PROCEDURE:', procedureId);
    
    // Find the specific surgeon entry for this procedure
    const targetEntry = surgeons.find(entry => 
      entry.name === selectedSurgeon.name && 
      (procedureId === 'general' 
        ? (entry.procedure_focus === 'General Practice' || entry.procedure_focus === '')
        : entry.procedure_focus.toLowerCase().replace(/\s+/g, '_') === procedureId
      )
    );
    
    if (!targetEntry) {
      console.error('🔥 TARGET ENTRY NOT FOUND FOR SAVING:', { procedureId, surgeonName: selectedSurgeon.name });
      return;
    }
    
    console.log('🔥 FOUND TARGET ENTRY FOR SAVING:', targetEntry);
    
    // Add to saving state
    setSavingProcedures(prev => new Set([...prev, procedureId]));
    
    try {
      // Prepare surgeon data for API (similar to handleSubmit)
      const surgeonData = {
        surgeons: [targetEntry]
      };

      const response = await fetch('/api/teams/general/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId,
          generalKnowledge: surgeonData
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save procedure');
      }

      console.log('🔥 PROCEDURE SAVED SUCCESSFULLY');
      
    } catch (error) {
      console.error('Error saving procedure:', error);
      alert(error instanceof Error ? error.message : 'Failed to save procedure');
    } finally {
      // Remove from saving state
      setSavingProcedures(prev => {
        const newSet = new Set(prev);
        newSet.delete(procedureId);
        return newSet;
      });
    }
  };

  // Delete procedure tab
  const deleteProcedureTab = (procedureId: string) => {
    if (!selectedSurgeon || procedureId === 'general') return;
    
    console.log('🔥 DELETING PROCEDURE TAB (LOCAL):', procedureId);
    
    // Find the specific surgeon entry for this procedure
    const targetEntry = surgeons.find(entry => 
      entry.name === selectedSurgeon.name && 
      entry.procedure_focus.toLowerCase().replace(/\s+/g, '_') === procedureId
    );
    
    if (!targetEntry) {
      console.error('🔥 TARGET ENTRY NOT FOUND FOR DELETION:', { procedureId, surgeonName: selectedSurgeon.name });
      return;
    }
    
    console.log('🔥 FOUND TARGET ENTRY FOR DELETION:', targetEntry);
    
    // Remove from local state only
    setSurgeons(prev => prev.filter(surgeon => surgeon.id !== targetEntry.id));
    
    // Switch to general tab if we deleted the current tab
    if (selectedProcedure === procedureId) {
      setSelectedProcedure('general');
    }
    
    console.log('🔥 PROCEDURE DELETED FROM LOCAL STATE');
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
        showBackButton={true}
        onBackClick={handleSubmit}
        backText={isSubmitting ? 'SAVING...' : 'SAVE'}
        backButtonDisabled={isSubmitting || !isFormValid()}
      />

      {/* Main Content - New Tab Layout */}
      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Sidebar - Surgeon Tabs */}
        <div className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col">
          <div className="p-4 border-b border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-100">Surgeons</h3>
              <button
                onClick={addSurgeon}
                className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-md transition-colors"
                title="Add New Surgeon"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mx-4 mt-4 p-3 bg-red-900/50 border border-red-700 rounded-md">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Surgeon List */}
          <div className="flex-1 overflow-y-auto">
            {uniqueSurgeons.map((surgeon) => (
              <div
                key={surgeon.id}
                className={`border-b border-slate-700 transition-colors ${
                  selectedSurgeonId === surgeon.id
                    ? 'bg-slate-700 border-l-4 border-l-blue-500'
                    : ''
                }`}
              >
                {editingSurgeonId === surgeon.id ? (
                  /* Edit Mode */
                  <div className="p-4 space-y-3">
                    <input
                      type="text"
                      value={surgeon.name}
                      onChange={(e) => updateSurgeon('name', e.target.value)}
                      placeholder="Dr. Johnson"
                      className="w-full px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={surgeon.specialty}
                      onChange={(e) => updateSurgeon('specialty', e.target.value)}
                      placeholder="Orthopedic Surgery"
                      className="w-full px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingSurgeonId(null)}
                        className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingSurgeonId(null)}
                        className="flex-1 px-2 py-1 bg-slate-600 hover:bg-slate-500 text-slate-100 text-xs rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display Mode */
                  <div
                    onClick={() => selectSurgeon(surgeon.id)}
                    className="p-4 cursor-pointer hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <User className="w-4 h-4 text-slate-400" />
                        <div>
                          <h4 className="text-slate-100 font-medium">
                            {surgeon.name.trim() || 'New Surgeon'}
                          </h4>
                          {surgeon.specialty && (
                            <p className="text-slate-400 text-sm">{surgeon.specialty}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSurgeonId(surgeon.id);
                          }}
                          className="text-slate-400 hover:text-slate-300 p-1 rounded hover:bg-slate-600 transition-colors"
                          title="Edit Surgeon"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSurgeon(surgeon.id);
                          }}
                          className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-900/20 transition-colors"
                          title="Delete Surgeon"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Save Button */}
          <div className="p-4 border-t border-slate-700">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !isFormValid()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
            >
              <Save className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 text-center">{isSubmitting ? 'Saving...' : 'Save All'}</span>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col">
          {selectedSurgeon ? (
            <>
              {/* Procedure Tabs */}
              <div className="bg-slate-800 border-b border-slate-700 px-6 py-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-slate-100">
                    {selectedSurgeon.name || 'New Surgeon'}
                  </h2>
                                     <button
                     onClick={showAddProcedureModal_func}
                     className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1 rounded text-sm transition-colors"
                     title="Add New Procedure"
                   >
                     + Add Procedure
                   </button>
                </div>
                
                                 {/* Horizontal Tabs */}
                 <div className="flex space-x-1">
                   {procedureTabs.map((tab) => (
                     <div key={tab.id} className="relative group">
                       <button
                         onClick={() => setSelectedProcedure(tab.id)}
                         className={`px-4 py-2 rounded-md font-medium transition-colors ${
                           selectedProcedure === tab.id
                             ? 'bg-slate-600 text-slate-100'
                             : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700'
                         }`}
                       >
                         {tab.name}
                       </button>
                       {tab.id !== 'general' && (
                         <button
                           onClick={() => {
                             if (confirm(`Delete ${tab.name} procedure?`)) {
                               deleteProcedureTab(tab.id);
                             }
                           }}
                           className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-4 h-4 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                           title={`Delete ${tab.name}`}
                         >
                           ×
                         </button>
                       )}
                     </div>
                   ))}
                 </div>
              </div>

              {/* Procedure Content */}
              <div className="flex-1 p-6 overflow-y-auto">
                <div className="max-w-4xl">
                  {/* Procedure-Specific Content */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      {selectedProcedure === 'general' ? 'General Notes & Procedures' : `${procedureTabs.find(t => t.id === selectedProcedure)?.name || 'Procedure'} Notes & Procedures`}
                    </label>
                    <textarea
                      value={procedureTabs.find(t => t.id === selectedProcedure)?.notes || ''}
                      onChange={(e) => updateProcedureNotes(selectedProcedure, e.target.value)}
                      placeholder="Surgical preferences, equipment requirements, step-by-step procedures, team preferences, etc."
                      rows={20}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                    />
                    
                    {/* Save Button */}
                    <button
                      onClick={() => saveProcedure(selectedProcedure)}
                      disabled={savingProcedures.has(selectedProcedure)}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white px-6 py-3 rounded-md font-medium transition-colors flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {savingProcedures.has(selectedProcedure) ? 'Saving...' : 'Save Procedure'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* No Surgeon Selected */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <User className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-100 mb-2">No Surgeon Selected</h3>
                <p className="text-slate-400 mb-4">Select a surgeon from the sidebar or create a new one</p>
                <button
                  onClick={addSurgeon}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
                >
                  Add First Surgeon
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Procedure Modal */}
      {showAddProcedureModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">Add New Procedure</h3>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Procedure Name
              </label>
              <input
                type="text"
                value={newProcedureName}
                onChange={(e) => setNewProcedureName(e.target.value)}
                placeholder="e.g. Total Knee, Total Hip, Spine"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddProcedure();
                  } else if (e.key === 'Escape') {
                    handleCancelAddProcedure();
                  }
                }}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCancelAddProcedure}
                className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-100 rounded-md font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddProcedure}
                disabled={!newProcedureName.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
              >
                Add Procedure
              </button>
            </div>
          </div>
        </div>
      )}
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