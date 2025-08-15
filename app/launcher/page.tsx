"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";
import { MapPin } from "lucide-react";

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

export default function LauncherPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [teamMemberships, setTeamMemberships] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    if (!authLoading && user) {
      loadUserTeams();
    } else if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

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
        setError('You are not a member of any teams yet. Please contact your administrator.');
        return;
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

    // Check if team setup is complete before routing
    const isSetupComplete = await checkTeamSetupCompletion(membership.team_id);
    
    if (membership.role === 'manager') {
      if (isSetupComplete) {
        // Team is fully set up, go to team dashboard
        router.push(`/launcher/team?teamId=${membership.team_id}`);
      } else {
        // Team setup is incomplete, continue setup
        router.push(`/setup/portfolios?teamId=${membership.team_id}`);
      }
    } else {
      // Members go to team selection for chat
      router.push(`/launcher/select?teamId=${membership.team_id}`);
    }
  };

  const checkTeamSetupCompletion = async (teamId: string): Promise<boolean> => {
    try {
      // Check if team has portfolios
      const { data: portfolios, error: portfolioError } = await supabase
        .from('team_portfolios')
        .select('id')
        .eq('team_id', teamId)
        .limit(1);

      if (portfolioError || !portfolios || portfolios.length === 0) {
        return false;
      }

      // Check if team has accounts
      const { data: accounts, error: accountError } = await supabase
        .from('team_accounts')
        .select('id')
        .eq('team_id', teamId)
        .limit(1);

      if (accountError || !accounts || accounts.length === 0) {
        return false;
      }

      // Check if team has general knowledge
      const { data: generalKnowledge, error: generalError } = await supabase
        .from('team_knowledge')
        .select('id')
        .eq('team_id', teamId)
        .is('account_id', null)
        .is('portfolio_id', null)
        .limit(1);

      if (generalError || !generalKnowledge || generalKnowledge.length === 0) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking setup completion:', error);
      return false;
    }
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

  // Show team selection if user is a member of multiple teams
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Select Your Team</h1>
          <p className="text-slate-400">Choose which team you'd like to work with today</p>
        </div>

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

        <div className="text-center mt-12">
          <p className="text-slate-400 mb-4">
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
  );
} 