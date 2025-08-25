"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import StandardHeader from "../../components/StandardHeader";
import { Save } from "lucide-react";

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

      // Load existing general knowledge
      const { data: knowledgeData, error: knowledgeError } = await supabase
        .from('team_knowledge')
        .select('*')
        .eq('team_id', teamId)
        .is('account_id', null)
        .is('portfolio_id', null);

      if (knowledgeError) {
        console.error('Error loading general knowledge:', knowledgeError);
        setError('Failed to load existing knowledge');
        return;
      }

      // Transform data for editing
      const surgeonsData = knowledgeData
        ?.filter(k => k.category === 'surgeon_info')
        .map(k => ({
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
          procedure_focus: '',
          notes: ''
        });
      }

      setSurgeons(surgeonsData);

    } catch (error) {
      console.error('Error loading existing data:', error);
      setError('Failed to load team data');
    }
  };

  const addSurgeon = () => {
    setSurgeons([...surgeons, {
      id: `temp-${Date.now()}`,
      name: '',
      specialty: '',
      procedure_focus: '',
      notes: ''
    }]);
  };

  const updateSurgeon = (index: number, field: keyof Surgeon, value: string) => {
    const newSurgeons = [...surgeons];
    newSurgeons[index] = { ...newSurgeons[index], [field]: value };
    setSurgeons(newSurgeons);
  };

  const removeSurgeon = (index: number) => {
    const newSurgeons = surgeons.filter((_, i) => i !== index);
    setSurgeons(newSurgeons.length > 0 ? newSurgeons : [{
      id: `temp-${Date.now()}`,
      name: '',
      specialty: '',
      procedure_focus: '',
      notes: ''
    }]);
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

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-md">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Surgeon Information */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-slate-100">Surgeon Information</h3>
              <button
                onClick={addSurgeon}
                className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-md font-medium transition-colors"
              >
                + Add Surgeon
              </button>
            </div>

            <div className="space-y-4">
              {surgeons.map((surgeon, index) => (
                <div key={surgeon.id} className="p-4 bg-slate-700 rounded border border-slate-600">
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="text-slate-200 font-medium">Surgeon {index + 1}</h4>
                    <button
                      onClick={() => removeSurgeon(index)}
                      className="text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Surgeon Name
                      </label>
                      <input
                        type="text"
                        value={surgeon.name}
                        onChange={(e) => updateSurgeon(index, 'name', e.target.value)}
                        placeholder="Dr. Johnson"
                        className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Specialty
                      </label>
                      <input
                        type="text"
                        value={surgeon.specialty}
                        onChange={(e) => updateSurgeon(index, 'specialty', e.target.value)}
                        placeholder="Cardiovascular Surgery"
                        className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Procedure Focus
                    </label>
                    <input
                      type="text"
                      value={surgeon.procedure_focus}
                      onChange={(e) => updateSurgeon(index, 'procedure_focus', e.target.value)}
                      placeholder="Heart bypass surgery, valve replacement"
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Notes & Details
                    </label>
                    <textarea
                      value={surgeon.notes}
                      onChange={(e) => updateSurgeon(index, 'notes', e.target.value)}
                      placeholder="Surgical preferences, equipment requirements, team preferences, etc."
                      rows={3}
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              ))}
            </div>
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

export default function EditGeneralPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EditGeneralContent />
    </Suspense>
  );
} 