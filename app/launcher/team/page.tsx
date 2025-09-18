"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { FolderOpen, Building2, BookOpen, Users, BrainCog, Trash2, AlertTriangle, ClipboardList } from "lucide-react";
import StandardHeader from "../../components/StandardHeader";
import LoadingScreen from "../../components/LoadingScreen";

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
  const isAdminView = searchParams.get('admin') === 'true';
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<TeamData | null>(null);
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isOriginalManager, setIsOriginalManager] = useState<boolean>(false);
  
  // Team deletion state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user && teamId) {
      loadTeamDashboard();
    } else if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && !teamId) {
      router.push('/');
    }
  }, [authLoading, user, teamId, router]);

  const loadTeamDashboard = async () => {
    try {
      setLoading(true);
      
      // USE ADMIN API ENDPOINT IF ACCESSING AS ADMIN
      const apiEndpoint = isAdminView 
        ? `/api/admin/teams/${teamId}/data`
        : `/api/teams/${teamId}/data`;
      
      const response = await fetch(apiEndpoint);
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to load team data');
        return;
      }

      if (!result.success) {
        setError('Failed to load team data');
        return;
      }

      // Set team data and user role
      setTeam(result.data.team);
      setUserRole(result.data.userRole);
      setIsOriginalManager(result.data.isOriginalManager || false);
      setStats(result.data.stats);

    } catch (error) {
      console.error('Error loading team dashboard:', error);
      setError('Failed to load team dashboard');
    } finally {
      setLoading(false);
    }
  };

  // loadTeamStats function removed - now handled by the team data API endpoint

  const handleStartChat = () => {
    // Go to account/portfolio selection for chat
    router.push(`/launcher/select?teamId=${teamId}`);
  };

  const handleEditTeamDetails = () => {
    // Go to surgeon management page
    router.push(`/edit/surgeons?teamId=${teamId}`);
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

  const handleManageInventory = () => {
    // Go to inventory management page
    router.push(`/edit/inventory?teamId=${teamId}`);
  };

  const handleDeleteTeam = () => {
    setDeleteError(null);
    setShowDeleteModal(true);
  };

  const confirmDeleteTeam = async () => {
    if (!team || deleteConfirmation !== team.name) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirmation: deleteConfirmation,
          deleteExternalResources: true
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete team');
      }

      if (!result.success) {
        throw new Error(result.error || 'Team deletion failed');
      }

      // SUCCESS - REDIRECT TO HOME
      router.push('/');

    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDeleteTeam = () => {
    setShowDeleteModal(false);
    setDeleteConfirmation('');
    setDeleteError(null);
  };

  if (authLoading || loading) {
    return (
      <LoadingScreen 
        title="HHB Assistant" 
        subtitle="Loading team dashboard..." 
      />
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold text-red-400 mb-4">Error</h1>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
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
        teamName={isAdminView ? `${team.name} (Admin View)` : team.name}
        teamLocation={team.location}
        userRole={userRole}
        isOriginalManager={isOriginalManager}
        backUrl={isAdminView ? "/admin" : "/"}
        backText={isAdminView ? "← Back to Admin" : "←"}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ADMIN VIEW INDICATOR */}
        {isAdminView && (
          <div className="mb-6 bg-blue-900/30 border border-blue-700 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <span className="text-blue-300 font-medium">Admin View - Full Access</span>
            </div>
            <p className="text-blue-200 text-sm mt-1">
              You are viewing this team dashboard with administrative privileges, regardless of team membership.
            </p>
          </div>
        )}
        
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
                          <span className="flex-1 text-center">Surgeons</span>
                        </button>
                        
                        <button
                          onClick={handleManageInventory}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
                        >
                          <ClipboardList className="w-5 h-5 flex-shrink-0" />
                          <span className="flex-1 text-center">Inventory</span>
                        </button>
                      </div>
                    </div>

                    {/* Team Management */}
                    <div>
                      <h4 className="text-md font-medium text-slate-200 mb-3">Manage Team</h4>
                      <div className="space-y-3">
                        <button
                          onClick={handleManageMembers}
                          className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
                        >
                          <Users className="w-5 h-5 flex-shrink-0" />
                          <span className="flex-1 text-center">Members</span>
                        </button>
                        
                        {/* DELETE TEAM BUTTON - ONLY FOR ORIGINAL MANAGERS */}
                        {isOriginalManager && team && (
                          <button
                            onClick={handleDeleteTeam}
                            className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
                          >
                            <Trash2 className="w-5 h-5 flex-shrink-0" />
                            <span className="flex-1 text-center">Delete Team</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DELETE TEAM CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4 border border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400" />
              <h3 className="text-lg font-semibold text-slate-100">Delete Team</h3>
            </div>
            
            <div className="mb-6">
              <p className="text-slate-300 mb-4">
                <strong className="text-red-400">WARNING:</strong> This action cannot be undone. 
                Deleting the team will permanently remove:
              </p>
              <ul className="text-slate-400 text-sm space-y-1 mb-4">
                <li>• All team data and settings</li>
                <li>• All portfolios, accounts, and knowledge</li>
                <li>• All chat history and notes</li>
                <li>• All uploaded documents and files</li>
                <li>• All AI assistants and vector stores</li>
                <li>• All team members and invitations</li>
              </ul>
              <p className="text-slate-300">
                To confirm deletion, type the team name exactly: <strong className="text-slate-100">{team?.name}</strong>
              </p>
            </div>

            <div className="mb-6">
              <input
                type="text"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="Type team name to confirm"
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                disabled={isDeleting}
              />
              
              {/* ERROR MESSAGE */}
              {deleteError && (
                <div className="mt-3 p-3 bg-red-900/30 border border-red-700 rounded text-red-200 text-sm">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{deleteError}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={cancelDeleteTeam}
                disabled={isDeleting}
                className="flex-1 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-800 text-white px-4 py-2 rounded font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteTeam}
                disabled={isDeleting || deleteConfirmation !== team?.name}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white px-4 py-2 rounded font-medium transition-colors flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete Team
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeamDashboardPage() {
  return (
    <Suspense fallback={
      <LoadingScreen 
        title="HHB Assistant" 
        subtitle="Loading..." 
      />
    }>
      <TeamDashboardContent />
    </Suspense>
  );
} 