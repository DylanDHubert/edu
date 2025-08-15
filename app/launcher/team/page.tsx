"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { FolderOpen, Building2, BookOpen, Users, BrainCog } from "lucide-react";
import StandardHeader from "../../components/StandardHeader";

interface TeamStats {
  portfolios: number;
  accounts: number;
  documents: number;
  knowledgeItems: number;
  teamMembers: number;
  pendingInvitations: number;
}

interface TeamData {
  id: string;
  name: string;
  description: string;
  location: string;
  created_at: string;
}

function TeamDashboardContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<TeamData | null>(null);
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');

  useEffect(() => {
    if (!authLoading && user && teamId) {
      loadTeamDashboard();
    } else if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && !teamId) {
      router.push('/launcher');
    }
  }, [authLoading, user, teamId, router]);

  const loadTeamDashboard = async () => {
    try {
      setLoading(true);
      
      // Verify user is a member of this team
      const { data: membership, error: membershipError } = await supabase
        .from('team_members')
        .select('role')
        .eq('team_id', teamId)
        .eq('user_id', user?.id)
        .eq('status', 'active')
        .single();

      if (membershipError || !membership) {
        setError('You do not have access to this team');
        return;
      }

      setUserRole(membership.role);

      // Load team data
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

      // Load team statistics
      await loadTeamStats();

    } catch (error) {
      console.error('Error loading team dashboard:', error);
      setError('Failed to load team dashboard');
    } finally {
      setLoading(false);
    }
  };

  const loadTeamStats = async () => {
    try {
      // Count portfolios
      const { count: portfoliosCount } = await supabase
        .from('team_portfolios')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);

      // Count accounts
      const { count: accountsCount } = await supabase
        .from('team_accounts')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);

      // Count documents
      const { count: documentsCount } = await supabase
        .from('team_documents')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);

      // Count knowledge items
      const { count: knowledgeCount } = await supabase
        .from('team_knowledge')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);

      // Count team members
      const { count: membersCount } = await supabase
        .from('team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('status', 'active');

      // Count pending invitations
      const { count: pendingCount } = await supabase
        .from('team_member_invitations')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('status', 'pending');

      setStats({
        portfolios: portfoliosCount || 0,
        accounts: accountsCount || 0,
        documents: documentsCount || 0,
        knowledgeItems: knowledgeCount || 0,
        teamMembers: membersCount || 0,
        pendingInvitations: pendingCount || 0
      });

    } catch (error) {
      console.error('Error loading team stats:', error);
    }
  };

  const handleStartChat = () => {
    // Go to account/portfolio selection for chat
    router.push(`/launcher/select?teamId=${teamId}`);
  };

  const handleEditTeamDetails = () => {
    // Go to general team info editing page
    router.push(`/edit/general?teamId=${teamId}`);
  };

  const handleManagePortfolios = () => {
    // Go to portfolio management page
    router.push(`/edit/portfolios?teamId=${teamId}`);
  };

  const handleManageAccounts = () => {
    // Go to account management page
    router.push(`/edit/accounts?teamId=${teamId}`);
  };

  const handleManageMembers = () => {
    // Go to member management page
    router.push(`/edit/members?teamId=${teamId}`);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Loading...</h1>
          <p className="text-slate-400">Loading team dashboard...</p>
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
            onClick={() => router.push('/launcher')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
          >
            ←
          </button>
        </div>
      </div>
    );
  }

  if (!team || !stats) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <StandardHeader
        teamName={team.name}
        teamLocation={team.location}
        userRole={userRole}
        backUrl="/launcher"
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Team Stats */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-slate-100 mb-6">Team Overview</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-slate-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-slate-100">{stats.portfolios}</div>
                  <div className="text-slate-400 text-sm">Portfolios</div>
                </div>
                
                <div className="bg-slate-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-slate-100">{stats.accounts}</div>
                  <div className="text-slate-400 text-sm">Accounts</div>
                </div>
                
                <div className="bg-slate-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-slate-100">{stats.documents}</div>
                  <div className="text-slate-400 text-sm">Documents</div>
                </div>
                
                <div className="bg-slate-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-slate-100">{stats.knowledgeItems}</div>
                  <div className="text-slate-400 text-sm">Knowledge Items</div>
                </div>
                
                <div className="bg-slate-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-slate-100">{stats.teamMembers}</div>
                  <div className="text-slate-400 text-sm">Team Members</div>
                </div>
                
                <div className="bg-slate-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-slate-100">{stats.pendingInvitations}</div>
                  <div className="text-slate-400 text-sm">Pending Invites</div>
                </div>
              </div>
              
              {/* Team Description - Directly under stats */}
              {team.description && (
                <div className="mt-6">
                  <p className="text-slate-300">{team.description}</p>
                </div>
              )}
            </div>
          </div>

          {/* Actions Sidebar */}
          <div className="space-y-6">
            {/* Actions Sidebar */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <div className="space-y-6">
                {/* Start Chat Button - Always visible */}
                <button
                  onClick={handleStartChat}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
                >
                  <BrainCog className="w-5 h-5 flex-shrink-0" />
                  <span className="flex-1 text-center">Start Chat</span>
                </button>

                {/* Management Section - Only for managers */}
                {userRole === 'manager' && (
                  <div className="space-y-6">
                    {/* Knowledge Management */}
                    <div>
                      <h4 className="text-md font-medium text-slate-200 mb-3">Manage Knowledge</h4>
                      <div className="space-y-3">
                        <button
                          onClick={handleManagePortfolios}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
                        >
                          <FolderOpen className="w-5 h-5 flex-shrink-0" />
                          <span className="flex-1 text-center">Portfolios</span>
                        </button>
                        
                        <button
                          onClick={handleManageAccounts}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
                        >
                          <Building2 className="w-5 h-5 flex-shrink-0" />
                          <span className="flex-1 text-center">Accounts</span>
                        </button>
                        
                        <button
                          onClick={handleEditTeamDetails}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
                        >
                          <BookOpen className="w-5 h-5 flex-shrink-0" />
                          <span className="flex-1 text-center">General Knowledge</span>
                        </button>
                      </div>
                    </div>

                    {/* Team Management */}
                    <div>
                      <h4 className="text-md font-medium text-slate-200 mb-3">Manage Team</h4>
                      <button
                        onClick={handleManageMembers}
                        className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
                      >
                        <Users className="w-5 h-5 flex-shrink-0" />
                        <span className="flex-1 text-center">Members</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TeamDashboardPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TeamDashboardContent />
    </Suspense>
  );
} 