"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

interface GeneralKnowledge {
  doctorInfo: Array<{ title: string; content: string }>;
  accessMisc: Array<{ title: string; content: string }>;
}

function GeneralKnowledgeSetupContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');
  const supabase = createClient();

  const [team, setTeam] = useState<any>(null);
  const [knowledge, setKnowledge] = useState<GeneralKnowledge>({
    doctorInfo: [{ title: '', content: '' }],
    accessMisc: [{ title: '', content: '' }]
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (!teamId) {
      router.push("/setup/team");
    } else if (user && teamId) {
      loadTeamData();
    }
  }, [user, loading, teamId, router]);

  const loadTeamData = async () => {
    try {
      // Load team info
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .eq('created_by', user?.id)
        .single();

      if (teamError || !teamData) {
        router.push("/setup/team");
        return;
      }
      setTeam(teamData);

    } catch (error) {
      console.error('Error loading team data:', error);
      setError('Failed to load team information');
    }
  };

  const addKnowledgeItem = (type: 'doctorInfo' | 'accessMisc') => {
    setKnowledge(prev => ({
      ...prev,
      [type]: [...prev[type], { title: '', content: '' }]
    }));
  };

  const removeKnowledgeItem = (type: 'doctorInfo' | 'accessMisc', index: number) => {
    if (knowledge[type].length > 1) {
      setKnowledge(prev => ({
        ...prev,
        [type]: prev[type].filter((_, i) => i !== index)
      }));
    }
  };

  const updateKnowledgeItem = (type: 'doctorInfo' | 'accessMisc', index: number, field: 'title' | 'content', value: string) => {
    setKnowledge(prev => ({
      ...prev,
      [type]: prev[type].map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const validateForm = () => {
    // Check if at least one doctor info or access misc item has content
    const hasDoctorInfo = knowledge.doctorInfo.some(item => item.title.trim() || item.content.trim());
    const hasAccessMisc = knowledge.accessMisc.some(item => item.title.trim() || item.content.trim());
    
    if (!hasDoctorInfo && !hasAccessMisc) {
      setError('Please add at least one piece of general team knowledge');
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
      const response = await fetch('/api/teams/general/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId,
          knowledge: {
            doctorInfo: knowledge.doctorInfo.filter(item => item.title.trim() || item.content.trim()),
            accessMisc: knowledge.accessMisc.filter(item => item.title.trim() || item.content.trim())
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save general knowledge');
      }

      // Redirect to team member invitations or completion
      router.push(`/setup/members?teamId=${teamId}`);

    } catch (error) {
      console.error('Error saving general knowledge:', error);
      setError(error instanceof Error ? error.message : 'Failed to save general knowledge');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Loading...</h1>
          <p className="text-slate-400">Preparing general knowledge setup...</p>
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
            <h1 className="text-3xl font-bold text-slate-100">General Team Knowledge</h1>
            <p className="text-slate-400 mt-1">
              Add general information for <strong>{team.name}</strong> that applies across all accounts
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
          {/* Doctor Information Section */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Doctor Information</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Add information about doctors, their preferences, schedules, or any relevant details
                </p>
              </div>
              <button
                onClick={() => addKnowledgeItem('doctorInfo')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
              >
                + Add Doctor Info
              </button>
            </div>

            <div className="space-y-4">
              {knowledge.doctorInfo.map((item, index) => (
                <div key={index} className="p-4 bg-slate-700 rounded-md space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 space-y-3">
                      <input
                        type="text"
                        placeholder="e.g., Dr. Smith Preferences, Dr. Johnson Schedule, etc."
                        value={item.title}
                        onChange={(e) => updateKnowledgeItem('doctorInfo', index, 'title', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <textarea
                        placeholder="Detailed information about this doctor or medical practice..."
                        value={item.content}
                        onChange={(e) => updateKnowledgeItem('doctorInfo', index, 'content', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    {knowledge.doctorInfo.length > 1 && (
                      <button
                        onClick={() => removeKnowledgeItem('doctorInfo', index)}
                        className="ml-3 text-red-400 hover:text-red-300 font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Examples */}
            <div className="mt-6 p-4 bg-blue-900/20 border border-blue-700 rounded-md">
              <h4 className="text-blue-400 font-medium mb-2">Examples:</h4>
              <ul className="text-blue-300 text-sm space-y-1">
                <li>• Dr. Martinez prefers 22mm heads for revision cases</li>
                <li>• Dr. Johnson operates Tuesdays/Thursdays at Metro Hospital</li>
                <li>• Dr. Chen requires specific instrument setup for complex cases</li>
                <li>• Emergency contact: Dr. Wilson (555-0123) for weekend coverage</li>
              </ul>
            </div>
          </div>

          {/* Access & Miscellaneous Section */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Access & Miscellaneous</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Add access information, parking details, vendor credentials, or other important notes
                </p>
              </div>
              <button
                onClick={() => addKnowledgeItem('accessMisc')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
              >
                + Add Access Info
              </button>
            </div>

            <div className="space-y-4">
              {knowledge.accessMisc.map((item, index) => (
                <div key={index} className="p-4 bg-slate-700 rounded-md space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 space-y-3">
                      <input
                        type="text"
                        placeholder="e.g., Metro Hospital Parking, Vendor Credentialing, Door Codes, etc."
                        value={item.title}
                        onChange={(e) => updateKnowledgeItem('accessMisc', index, 'title', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <textarea
                        placeholder="Detailed access information, codes, procedures, or other important notes..."
                        value={item.content}
                        onChange={(e) => updateKnowledgeItem('accessMisc', index, 'content', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    {knowledge.accessMisc.length > 1 && (
                      <button
                        onClick={() => removeKnowledgeItem('accessMisc', index)}
                        className="ml-3 text-red-400 hover:text-red-300 font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Examples */}
            <div className="mt-6 p-4 bg-blue-900/20 border border-blue-700 rounded-md">
              <h4 className="text-blue-400 font-medium mb-2">Examples:</h4>
              <ul className="text-blue-300 text-sm space-y-1">
                <li>• Metro Hospital: Park in Lot C, enter through vendor door (code: 1234)</li>
                <li>• St. Mary's: Vendor credentialing required, contact Jane Doe (ext. 5555)</li>
                <li>• City Surgery Center: Loading dock access 6AM-8AM only</li>
                <li>• Regional Medical: WiFi password "GuestAccess2024"</li>
              </ul>
            </div>
          </div>

          {/* Summary Info Box */}
          <div className="bg-green-900/30 border border-green-700 rounded-md p-6">
            <h3 className="text-lg font-medium text-green-400 mb-3">Almost Done!</h3>
            <p className="text-green-300 mb-4">
              You're setting up the final piece of your team's knowledge base. This general information will be available 
              to all team members across all accounts and portfolios.
            </p>
            <div className="text-green-300 text-sm space-y-1">
              <p><strong>What you've built so far:</strong></p>
              <ul className="ml-4 space-y-1">
                <li>• <strong>Team Structure</strong>: {team.name} with custom portfolios</li>
                <li>• <strong>Account Knowledge</strong>: Location-specific inventory, instruments, and technical info</li>
                <li>• <strong>General Knowledge</strong>: Team-wide doctor info and access details</li>
              </ul>
              <p className="mt-3"><strong>Next:</strong> Invite team members and start using your AI assistant!</p>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white px-8 py-3 rounded-md font-medium transition-colors"
            >
              {isSubmitting ? 'Saving Knowledge...' : 'Save General Knowledge & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GeneralKnowledgeSetupPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GeneralKnowledgeSetupContent />
    </Suspense>
  );
} 