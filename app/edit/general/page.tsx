"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import StandardHeader from "../../components/StandardHeader";
import { Save } from "lucide-react";

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  notes: string;
}

function EditGeneralContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');
  const supabase = createClient();

  const [team, setTeam] = useState<any>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [accessMisc, setAccessMisc] = useState<string>('');
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
      const doctorsData = knowledgeData
        ?.filter(k => k.category === 'doctor_info')
        .map(k => ({
          id: k.id,
          name: k.metadata?.name || k.title || '',
          specialty: k.metadata?.specialty || '',
          notes: k.metadata?.notes || ''
        })) || [];

      // Add empty doctor if none exist
      if (doctorsData.length === 0) {
        doctorsData.push({
          id: `temp-${Date.now()}`,
          name: '',
          specialty: '',
          notes: ''
        });
      }

      const accessData = knowledgeData?.find(k => k.category === 'access_misc');
      setAccessMisc(accessData?.content || accessData?.metadata?.content || '');
      setDoctors(doctorsData);

    } catch (error) {
      console.error('Error loading existing data:', error);
      setError('Failed to load team data');
    }
  };

  const addDoctor = () => {
    setDoctors([...doctors, {
      id: `temp-${Date.now()}`,
      name: '',
      specialty: '',
      notes: ''
    }]);
  };

  const updateDoctor = (index: number, field: keyof Doctor, value: string) => {
    const newDoctors = [...doctors];
    newDoctors[index] = { ...newDoctors[index], [field]: value };
    setDoctors(newDoctors);
  };

  const removeDoctor = (index: number) => {
    const newDoctors = doctors.filter((_, i) => i !== index);
    setDoctors(newDoctors.length > 0 ? newDoctors : [{
      id: `temp-${Date.now()}`,
      name: '',
      specialty: '',
      notes: ''
    }]);
  };

  const validateForm = () => {
    // At least one doctor with a name or access/misc content is required
    const hasValidDoctor = doctors.some(doctor => doctor.name.trim());
    const hasAccessMisc = accessMisc.trim();

    if (!hasValidDoctor && !hasAccessMisc) {
      setError('Please add at least one doctor or some access/misc information');
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
        doctors: doctors.filter(doctor => doctor.name.trim()),
        accessMisc: accessMisc.trim()
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
      />

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-md">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Doctor Information */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-slate-100">Doctor Information</h3>
              <button
                onClick={addDoctor}
                className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-md font-medium transition-colors"
              >
                + Add Doctor
              </button>
            </div>

            <div className="space-y-4">
              {doctors.map((doctor, index) => (
                <div key={doctor.id} className="p-4 bg-slate-700 rounded border border-slate-600">
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="text-slate-200 font-medium">Doctor {index + 1}</h4>
                    <button
                      onClick={() => removeDoctor(index)}
                      className="text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Doctor Name
                      </label>
                      <input
                        type="text"
                        value={doctor.name}
                        onChange={(e) => updateDoctor(index, 'name', e.target.value)}
                        placeholder="Dr. Smith"
                        className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Specialty
                      </label>
                      <input
                        type="text"
                        value={doctor.specialty}
                        onChange={(e) => updateDoctor(index, 'specialty', e.target.value)}
                        placeholder="Orthopedic Surgeon"
                        className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Notes & Details
                    </label>
                    <textarea
                      value={doctor.notes}
                      onChange={(e) => updateDoctor(index, 'notes', e.target.value)}
                      placeholder="Preferences, contact info, special requirements, etc."
                      rows={3}
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Access & Miscellaneous */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-slate-100 mb-6">Access & Miscellaneous</h3>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                General Information
              </label>
              <textarea
                value={accessMisc}
                onChange={(e) => setAccessMisc(e.target.value)}
                placeholder="Parking instructions, door codes, vendor credentialing, facility access notes, general team information, etc."
                rows={8}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-slate-500 text-sm mt-2">
                Include any information that applies to the entire team, such as facility access, parking, general protocols, etc.
              </p>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
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