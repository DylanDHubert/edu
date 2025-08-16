"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";
import { MapPin } from "lucide-react";
import StandardHeader from "../components/StandardHeader";

interface TeamMember {
  id: string;
  team_id: string;
  role: string;
  is_original_manager: boolean;
  status: string;
  teams: {
    id: string;
    name: string;
    description: string;
    location: string;
  };
}

interface ManagerPrivileges {
  hasManagerPrivileges: boolean;
}

export default function LauncherPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [teamMemberships, setTeamMemberships] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [managerPrivileges, setManagerPrivileges] = useState<ManagerPrivileges>({ hasManagerPrivileges: false });

  const supabase = createClient();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      loadUserTeams();
      checkManagerPrivileges();
    } else if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const checkManagerPrivileges = async () => {
    try {
      const { data: invitation, error } = await supabase
        .from('manager_invitations')
        .select('id')
        .eq('email', user?.email)
        .eq('status', 'completed')
        .single();

      setManagerPrivileges({
        hasManagerPrivileges: !error && !!invitation
      });
    } catch (error) {
      console.error('Error checking manager privileges:', error);
      setManagerPrivileges({ hasManagerPrivileges: false });
    }
  };

  const loadUserTeams = async () => {
    try {
      const { data: memberships, error: membershipError } = await supabase
        .from('team_members')
        .select(`
          *,
          teams (
            id,
            name,
            description,
            location
          )
        `)
        .eq('user_id', user?.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (membershipError) {
        console.error('Error loading teams:', membershipError);
        setError('Failed to load your teams');
        return;
      }

      if (!memberships || memberships.length === 0) {
        // Check if user has manager privileges - if so, they can create teams
        const { data: invitation } = await supabase
          .from('manager_invitations')
          .select('id')
          .eq('email', user?.email)
          .eq('status', 'completed')
          .single();

        if (!invitation) {
          setError('You are not a member of any teams yet. Please contact your administrator.');
          return;
        }
        // If they have manager privileges, continue with empty teams list
      }

      setTeamMemberships(memberships as TeamMember[]);

      // REMOVED AUTO-SELECTION - USER MUST MANUALLY SELECT TEAM
      // This prevents the redirect loop and gives user control

    } catch (error) {
      console.error('Error loading user teams:', error);
      setError('Failed to load team information');
    } finally {
      setLoading(false);
    }
  };

  const handleTeamSelect = async (membership: TeamMember) => {
    // Store selected team in localStorage for other components to use
    localStorage.setItem('selectedTeam', JSON.stringify({
      teamId: membership.team_id,
      teamName: membership.teams.name,
      userRole: membership.role,
      isOriginalManager: membership.is_original_manager
    }));

    // Always go to team dashboard - all setup can be done from there
    router.push(`/launcher/team?teamId=${membership.team_id}`);
  };



  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">HHB RAG Assistant</h1>
          <p className="text-slate-400">Loading your teams...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold text-red-400 mb-4">Team Access Required</h1>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  // Show team selection or create team option
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <StandardHeader
        backText="LOGOUT"
        showBackButton={true}
        onBackClick={handleLogout}
      />
      
      <div className="max-w-4xl mx-auto px-4 py-6">
        {teamMemberships.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {teamMemberships.map((membership) => (
            <div
              key={membership.id}
              className="bg-slate-800 rounded-lg border border-slate-700 p-6 hover:border-blue-500 transition-colors cursor-pointer"
              onClick={() => handleTeamSelect(membership)}
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-xl font-semibold text-slate-100">
                  {membership.teams.name}
                </h3>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  membership.is_original_manager 
                    ? 'bg-purple-100 text-purple-800'
                    : membership.role === 'manager' 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'bg-green-100 text-green-800'
                }`}>
                  {membership.is_original_manager ? 'owner' : membership.role}
                </span>
              </div>

              {membership.teams.location && (
                <p className="text-slate-400 mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {membership.teams.location}
                </p>
              )}

              {membership.teams.description && (
                <p className="text-slate-300 text-sm mb-4">
                  {membership.teams.description}
                </p>
              )}

              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">
                  {membership.role === 'manager' ? 'Manage Team' : 'Access Chat'}
                </span>
                <svg 
                  className="h-5 w-5 text-slate-400" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M9 5l7 7-7 7" 
                  />
                </svg>
              </div>
            </div>
          ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-slate-100 mb-4">No Teams Yet</h2>
            <p className="text-slate-400 mb-6">
              {managerPrivileges.hasManagerPrivileges 
                ? "You have manager privileges. Create your first team to get started!"
                : "You don't have any teams yet. Please contact your administrator."
              }
            </p>
            {managerPrivileges.hasManagerPrivileges && (
              <button
                onClick={() => router.push('/setup/team')}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
              >
                <svg 
                  className="w-5 h-5 flex-shrink-0" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6" 
                  />
                </svg>
                <span className="flex-1 text-center">Create Your First Team</span>
              </button>
            )}
          </div>
        )}

        <div className="text-center mt-6 space-y-4">
          {managerPrivileges.hasManagerPrivileges && (
            <div className="mb-4">
              <button
                onClick={() => router.push('/setup/team')}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
              >
                <svg 
                  className="w-5 h-5 flex-shrink-0" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6" 
                  />
                </svg>
                <span className="flex-1 text-center">Create New Team</span>
              </button>
            </div>
          )}
          
          <div>
            <p className="text-slate-400">
              Need to join a different team?
            </p>
            <button
              onClick={() => router.push('/support')}
              className="text-blue-400 hover:text-blue-300 font-medium"
            >
              Contact Support
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 