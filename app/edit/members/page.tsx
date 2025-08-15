"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  profiles?: {
    email: string;
    full_name?: string;
  };
}

interface PendingInvite {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  created_at: string;
}

interface NewInvite {
  name: string;
  email: string;
  role: 'manager' | 'member';
}

function EditMembersContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');
  const supabase = createClient();

  const [team, setTeam] = useState<any>(null);
  const [existingMembers, setExistingMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [newInvites, setNewInvites] = useState<NewInvite[]>([{ name: '', email: '', role: 'member' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (!teamId) {
      router.push("/launcher");
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

      // Load existing team members with real user data via API
      const membersResponse = await fetch(`/api/teams/members/list?teamId=${teamId}`);
      
      if (membersResponse.ok) {
        const { members: membersData } = await membersResponse.json();
        console.log('Members data from API:', membersData);
        
        // Transform data to match expected format
        const membersWithProfiles = (membersData || []).map(member => ({
          ...member,
          profiles: {
            email: member.email,
            full_name: member.full_name
          }
        }));
        setExistingMembers(membersWithProfiles);
      } else {
        console.warn('Could not load team members from API');
        setExistingMembers([]);
      }

      // Load pending invitations (exclude accepted, declined, and expired)
      const { data: invitesData, error: invitesError } = await supabase
        .from('team_member_invitations')
        .select('*')
        .eq('team_id', teamId)
        .eq('status', 'pending')
        .order('created_at');

      if (invitesError) {
        console.error('Error loading pending invites:', invitesError);
        // Don't set error, just log it
      } else {
        setPendingInvites(invitesData || []);
      }

    } catch (error) {
      console.error('Error loading existing data:', error);
      setError('Failed to load team data');
    }
  };

  const addNewInvite = () => {
    setNewInvites([...newInvites, { name: '', email: '', role: 'member' }]);
  };

  const updateNewInvite = (index: number, field: keyof NewInvite, value: any) => {
    const updated = [...newInvites];
    updated[index] = { ...updated[index], [field]: value };
    setNewInvites(updated);
  };

  const removeNewInvite = (index: number) => {
    if (newInvites.length > 1) {
      setNewInvites(newInvites.filter((_, i) => i !== index));
    }
  };

  const removeMember = async (memberId: string, memberEmail: string) => {
    const displayName = memberEmail.includes('@unknown.com') ? 'this team member' : memberEmail;
    if (!confirm(`Are you sure you want to remove ${displayName} from the team?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('team_members')
        .update({ status: 'removed' })
        .eq('id', memberId);

      if (error) {
        console.error('Error removing member:', error);
        setError('Failed to remove team member');
        return;
      }

      // Refresh the data
      loadExistingData();
      setSuccessMessage('Team member removed successfully');
      setTimeout(() => setSuccessMessage(null), 3000);

    } catch (error) {
      console.error('Error removing member:', error);
      setError('Failed to remove team member');
    }
  };

  const cancelInvite = async (inviteId: string, email: string) => {
    if (!confirm(`Are you sure you want to cancel the invitation for ${email}?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('team_member_invitations')
        .update({ status: 'declined' })
        .eq('id', inviteId);

      if (error) {
        console.error('Error cancelling invite:', error);
        setError('Failed to cancel invitation');
        return;
      }

      // Refresh the data
      loadExistingData();
      setSuccessMessage('Invitation cancelled successfully');
      setTimeout(() => setSuccessMessage(null), 3000);

    } catch (error) {
      console.error('Error cancelling invite:', error);
      setError('Failed to cancel invitation');
    }
  };

  const validateForm = () => {
    const validInvites = newInvites.filter(invite => invite.name.trim() && invite.email.trim());
    
    if (validInvites.length === 0) {
      setError('Please add at least one team member to invite');
      return false;
    }

    // Validate email formats
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const invite of validInvites) {
      if (!emailRegex.test(invite.email)) {
        setError(`Invalid email format: ${invite.email}`);
        return false;
      }
    }

    // Check for duplicate emails in new invites
    const emails = validInvites.map(inv => inv.email.toLowerCase());
    const uniqueEmails = new Set(emails);
    if (emails.length !== uniqueEmails.size) {
      setError('Duplicate email addresses found in new invitations');
      return false;
    }

    // Check against existing members and pending invites
    const existingEmails = new Set([
      ...existingMembers
        .map(m => m.profiles?.email?.toLowerCase())
        .filter(email => email && !email.includes('@unknown.com')), // Exclude placeholder emails
      ...pendingInvites.map(inv => inv.email.toLowerCase())
    ]);

    for (const invite of validInvites) {
      if (existingEmails.has(invite.email.toLowerCase())) {
        setError(`${invite.email} is already a team member or has a pending invitation`);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccessMessage(null);
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const validInvites = newInvites.filter(invite => invite.name.trim() && invite.email.trim());

      const response = await fetch('/api/teams/members/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId,
          invites: validInvites
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send invitations');
      }

      // Reset form and reload data
      setNewInvites([{ name: '', email: '', role: 'member' }]);
      loadExistingData();
      setSuccessMessage(`Successfully sent ${validInvites.length} invitation(s)!`);
      setTimeout(() => setSuccessMessage(null), 5000);

    } catch (error) {
      console.error('Error sending invitations:', error);
      setError(error instanceof Error ? error.message : 'Failed to send invitations');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Loading...</h1>
          <p className="text-slate-400">Loading team members...</p>
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
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-slate-100">Manage Team Members</h1>
                <p className="text-slate-400 mt-1">
                  View and manage members for <strong>{team.name}</strong>
                </p>
              </div>
              <button
                onClick={() => router.push(`/launcher/team?teamId=${teamId}`)}
                className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
              >
                ←
              </button>
            </div>
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

        {successMessage && (
          <div className="mb-6 p-4 bg-green-900/50 border border-green-700 rounded-md">
            <p className="text-green-400 text-sm">{successMessage}</p>
          </div>
        )}

        <div className="space-y-8">
          {/* Current Team Members */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-slate-100 mb-6">Current Team Members ({existingMembers.length})</h3>
            
            {existingMembers.length === 0 ? (
              <p className="text-slate-400 text-sm italic">No team members yet</p>
            ) : (
              <div className="space-y-3">
                {existingMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-4 bg-slate-700 rounded border border-slate-600">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-slate-600 rounded-full flex items-center justify-center">
                        <span className="text-slate-300 font-medium">
                          {(member.profiles?.full_name || member.profiles?.email || 'M').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="text-slate-100 font-medium">
                          {member.profiles?.full_name || member.profiles?.email || `Member ${member.user_id.slice(0, 8)}`}
                        </div>
                        <div className="text-slate-400 text-sm">
                          {member.profiles?.email || `ID: ${member.user_id.slice(0, 8)}...`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        member.role === 'manager' 
                          ? 'bg-purple-900/50 text-purple-300 border border-purple-700' 
                          : 'bg-blue-900/50 text-blue-300 border border-blue-700'
                      }`}>
                        {member.role}
                      </span>
                      {member.user_id !== user.id && (
                        <button
                          onClick={() => removeMember(member.id, member.profiles?.email || `Member ${member.user_id.slice(0, 8)}`)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Invitations */}
          {pendingInvites.length > 0 && (
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-slate-100 mb-6">Pending Invitations ({pendingInvites.length})</h3>
              
              <div className="space-y-3">
                {pendingInvites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between p-4 bg-slate-700 rounded border border-slate-600">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-amber-900/50 rounded-full flex items-center justify-center">
                        <span className="text-amber-300 font-medium">{invite.name.charAt(0)}</span>
                      </div>
                      <div>
                        <div className="text-slate-100 font-medium">{invite.name}</div>
                        <div className="text-slate-400 text-sm">{invite.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        invite.role === 'manager' 
                          ? 'bg-purple-900/50 text-purple-300 border border-purple-700' 
                          : 'bg-blue-900/50 text-blue-300 border border-blue-700'
                      }`}>
                        {invite.role}
                      </span>
                      <span className="px-2 py-1 rounded text-xs font-medium bg-amber-900/50 text-amber-300 border border-amber-700">
                        Pending
                      </span>
                      <button
                        onClick={() => cancelInvite(invite.id, invite.email)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add New Members */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-slate-100 mb-6">Invite New Members</h3>
            
            <div className="space-y-4">
              {newInvites.map((invite, index) => (
                <div key={index} className="p-4 bg-slate-700 rounded border border-slate-600">
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="text-slate-200 font-medium">New Invitation {index + 1}</h4>
                    {newInvites.length > 1 && (
                      <button
                        onClick={() => removeNewInvite(index)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Full Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={invite.name}
                        onChange={(e) => updateNewInvite(index, 'name', e.target.value)}
                        placeholder="John Smith"
                        className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Email Address <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="email"
                        value={invite.email}
                        onChange={(e) => updateNewInvite(index, 'email', e.target.value)}
                        placeholder="john@company.com"
                        className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Role <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={invite.role}
                        onChange={(e) => updateNewInvite(index, 'role', e.target.value as 'manager' | 'member')}
                        className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="member">Team Member</option>
                        <option value="manager">Manager</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-between">
              <button
                onClick={addNewInvite}
                className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-md font-medium transition-colors"
              >
                + Add Another Invitation
              </button>

              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-6 py-2 rounded-md font-medium transition-colors"
              >
                {isSubmitting ? 'Sending Invitations...' : 'Send Invitations'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EditMembersPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EditMembersContent />
    </Suspense>
  );
} 