"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

interface TeamMemberInvite {
  email: string;
  name: string;
  role: 'manager' | 'member';
}

export default function TeamMembersSetupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');
  const supabase = createClient();

  const [team, setTeam] = useState<any>(null);
  const [invites, setInvites] = useState<TeamMemberInvite[]>([
    { email: '', name: '', role: 'member' }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedSetup, setCompletedSetup] = useState(false);

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

  const addInvite = () => {
    setInvites([...invites, { email: '', name: '', role: 'member' }]);
  };

  const removeInvite = (index: number) => {
    if (invites.length > 1) {
      setInvites(invites.filter((_, i) => i !== index));
    }
  };

  const updateInvite = (index: number, field: keyof TeamMemberInvite, value: string) => {
    const newInvites = [...invites];
    newInvites[index] = { ...newInvites[index], [field]: value };
    setInvites(newInvites);
  };

  const validateForm = () => {
    const validInvites = invites.filter(invite => invite.email.trim() && invite.name.trim());
    
    if (validInvites.length === 0) {
      // Allow skipping invitations
      return true;
    }

    // Validate email formats
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const invite of validInvites) {
      if (!emailRegex.test(invite.email)) {
        setError(`Invalid email format: ${invite.email}`);
        return false;
      }
    }

    // Check for duplicate emails
    const emails = validInvites.map(invite => invite.email.toLowerCase());
    const uniqueEmails = new Set(emails);
    if (emails.length !== uniqueEmails.size) {
      setError('Duplicate email addresses are not allowed');
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
      // Filter out empty invites
      const validInvites = invites.filter(invite => invite.email.trim() && invite.name.trim());
      
      if (validInvites.length > 0) {
        const response = await fetch('/api/teams/members/invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            teamId,
            invites: validInvites.map(invite => ({
              email: invite.email.trim(),
              name: invite.name.trim(),
              role: invite.role
            }))
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to send invitations');
        }
      }

      // Mark setup as completed
      setCompletedSetup(true);

    } catch (error) {
      console.error('Error sending invitations:', error);
      setError(error instanceof Error ? error.message : 'Failed to send invitations');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinishSetup = () => {
    // Redirect to the main launcher
    router.push(`/launcher?teamId=${teamId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Loading...</h1>
          <p className="text-slate-400">Preparing team member setup...</p>
        </div>
      </div>
    );
  }

  if (!user || !teamId || !team) {
    return null;
  }

  if (completedSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center max-w-2xl mx-auto px-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-8">
            <div className="mb-6">
              <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-green-400 mb-4">Setup Complete!</h1>
              <p className="text-slate-300 mb-6">
                <strong>{team.name}</strong> is now fully configured and ready to use.
              </p>
            </div>

            <div className="space-y-4">
              <p className="text-slate-400 text-sm">
                Your team members will receive email invitations to join. You can always add more members later from the team management dashboard.
              </p>
              
              <button
                onClick={handleFinishSetup}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-md font-medium transition-colors"
              >
                Go to Team Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-slate-100">Invite Team Members</h1>
            <p className="text-slate-400 mt-1">
              Invite team members to <strong>{team.name}</strong> and assign their roles
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-md">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-8">
          {/* Team Member Invitations */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Team Member Invitations</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Add team members by email. They'll receive invitation links to join your team.
                </p>
              </div>
              <button
                onClick={addInvite}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
              >
                + Add Member
              </button>
            </div>

            <div className="space-y-4">
              {invites.map((invite, index) => (
                <div key={index} className="p-4 bg-slate-700 rounded-md">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Name
                      </label>
                      <input
                        type="text"
                        placeholder="Full name"
                        value={invite.name}
                        onChange={(e) => updateInvite(index, 'name', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        placeholder="email@company.com"
                        value={invite.email}
                        onChange={(e) => updateInvite(index, 'email', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Role
                      </label>
                      <select
                        value={invite.role}
                        onChange={(e) => updateInvite(index, 'role', e.target.value as 'manager' | 'member')}
                        className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="member">Team Member</option>
                        <option value="manager">Team Manager</option>
                      </select>
                    </div>

                    <div>
                      {invites.length > 1 && (
                        <button
                          onClick={() => removeInvite(index)}
                          className="text-red-400 hover:text-red-300 font-medium px-3 py-2"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Role Explanations */}
            <div className="mt-6 p-4 bg-blue-900/20 border border-blue-700 rounded-md">
              <h4 className="text-blue-400 font-medium mb-2">Role Permissions:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-blue-300 text-sm">
                <div>
                  <p className="font-medium">Team Manager:</p>
                  <ul className="ml-4 space-y-1">
                    <li>• Edit team knowledge and settings</li>
                    <li>• Upload and manage documents</li>
                    <li>• Invite and manage team members</li>
                    <li>• Access to all team functionality</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium">Team Member:</p>
                  <ul className="ml-4 space-y-1">
                    <li>• View team knowledge and documents</li>
                    <li>• Use AI assistant for searches</li>
                    <li>• Create and share personal notes</li>
                    <li>• Read-only access to team settings</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Optional Skip Section */}
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-md p-6">
            <h3 className="text-yellow-400 font-medium mb-2">Optional Step</h3>
            <p className="text-yellow-300 text-sm mb-4">
              You can skip team member invitations for now and add members later from the team dashboard. 
              Your team setup is already complete and functional.
            </p>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-between">
            <button
              onClick={handleFinishSetup}
              className="bg-slate-600 hover:bg-slate-700 text-white px-6 py-3 rounded-md font-medium transition-colors"
            >
              Skip & Finish Setup
            </button>
            
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white px-8 py-3 rounded-md font-medium transition-colors"
            >
              {isSubmitting ? 'Sending Invitations...' : 'Send Invitations & Finish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 