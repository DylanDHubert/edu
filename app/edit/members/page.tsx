"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import StandardHeader from "../../components/StandardHeader";
import InviteModal from "../../components/InviteModal";

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
  is_original_manager?: boolean;
}

interface PendingInvite {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  created_at: string;
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [showInviteModal, setShowInviteModal] = useState(false);

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

      // Load existing team members with real user data via API
      const membersResponse = await fetch(`/api/teams/members/list?teamId=${teamId}`);
      
      if (membersResponse.ok) {
        const { members: membersData } = await membersResponse.json();
        console.log('Members data from API:', membersData);
        
        // Transform data to match expected format
        const membersWithProfiles = (membersData || []).map((member: any) => ({
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

  const handleInviteSent = () => {
    // Reload data after invitation is sent
    loadExistingData();
    setSuccessMessage('Invitation sent successfully');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const removeMember = async (memberId: string, memberEmail: string) => {
    try {
      // First, check if the member being removed is the original manager
      const { data: memberToRemove, error: fetchError } = await supabase
        .from('team_members')
        .select('is_original_manager, role')
        .eq('id', memberId)
        .single();

      if (fetchError) {
        console.error('Error fetching member data:', fetchError);
        setError('Failed to fetch member information');
        return;
      }

      // Prevent removal of original manager
      if (memberToRemove.is_original_manager) {
        setError('Cannot remove the original team manager. They are the team owner and cannot be removed.');
        return;
      }

      const displayName = memberEmail.includes('@unknown.com') ? 'this team member' : memberEmail;
      const roleText = memberToRemove.role === 'manager' ? 'manager' : 'member';
      
      if (!confirm(`Are you sure you want to remove ${displayName} (${roleText}) from the team? This action cannot be undone.`)) {
        return;
      }

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
      <StandardHeader
        teamName={team.name}
        teamLocation={team.location}
        userRole={userRole}
        backUrl={`/launcher/team?teamId=${teamId}`}
      />

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
                  <div key={member.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-700 rounded border border-slate-600 space-y-3 sm:space-y-0">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-slate-300 font-medium">
                          {(member.profiles?.full_name || member.profiles?.email || 'M').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-slate-100 font-medium truncate">
                          {member.profiles?.full_name || member.profiles?.email || `Member ${member.user_id.slice(0, 8)}`}
                        </div>
                        <div className="text-slate-400 text-sm truncate">
                          {member.profiles?.email || `ID: ${member.user_id.slice(0, 8)}...`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 flex-shrink-0">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        member.is_original_manager
                          ? 'bg-amber-900/50 text-amber-300 border border-amber-700'
                          : member.role === 'manager' 
                          ? 'bg-purple-900/50 text-purple-300 border border-purple-700' 
                          : 'bg-blue-900/50 text-blue-300 border border-blue-700'
                      }`}>
                        {member.is_original_manager 
                          ? 'Owner' 
                          : member.role.charAt(0).toUpperCase() + member.role.slice(1)
                        }
                      </span>
                      {member.user_id !== user.id && !member.is_original_manager && (
                        <button
                          onClick={() => removeMember(member.id, member.profiles?.email || `Member ${member.user_id.slice(0, 8)}`)}
                          className="px-2 py-1 rounded text-xs font-medium bg-red-900/50 text-red-300 border border-red-700 hover:bg-red-800/50"
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
                  <div key={invite.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-700 rounded border border-slate-600 space-y-3 sm:space-y-0">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-slate-300 font-medium">{invite.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-slate-100 font-medium truncate">{invite.name}</div>
                        <div className="text-slate-400 text-sm truncate">{invite.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 flex-shrink-0">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        invite.role === 'manager' 
                          ? 'bg-purple-900/50 text-purple-300 border border-purple-700' 
                          : 'bg-blue-900/50 text-blue-300 border border-blue-700'
                      }`}>
                        {invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}
                      </span>
                      <span className="px-2 py-1 rounded text-xs font-medium bg-amber-900/50 text-amber-300 border border-amber-700">
                        Pending
                      </span>
                      <button
                        onClick={() => cancelInvite(invite.id, invite.email)}
                        className="px-2 py-1 rounded text-xs font-medium bg-red-900/50 text-red-300 border border-red-700 hover:bg-red-800/50"
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
            
            <div className="text-center py-8">
              <p className="text-slate-400 mb-6">
                Invite new members to join your team. They'll receive an in-app invitation that they can accept or decline.
              </p>
              
              <button
                onClick={() => setShowInviteModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium transition-colors flex items-center gap-3 mx-auto"
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>Invite New Member</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Invitation Modal */}
      {showInviteModal && (
        <InviteModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          teamId={teamId!}
          teamName={team.name}
          onInviteSent={handleInviteSent}
        />
      )}
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