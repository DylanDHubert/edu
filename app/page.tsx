"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./contexts/AuthContext";
import { useRouter } from "next/navigation";
import { createClient } from "./utils/supabase/client";
import { MapPin, LogOut } from "lucide-react";
import Link from "next/link";

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

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [hasActiveAssistant, setHasActiveAssistant] = useState(false);
  const [teamMemberships, setTeamMemberships] = useState<TeamMember[]>([]);
  const [managerPrivileges, setManagerPrivileges] = useState<ManagerPrivileges>({ hasManagerPrivileges: false });
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (!loading && user) {
      // CHECK IF USER HAS AN ACTIVE ASSISTANT
      const activeAssistant = localStorage.getItem('activeAssistant');
      if (activeAssistant) {
        setHasActiveAssistant(true);
      }
      
      // LOAD USER TEAMS
      loadUserTeams();
    }
  }, [user, loading]);

  const loadUserTeams = async () => {
    try {
      setLoadingTeams(true);
      console.log('=== HOME PAGE DEBUG ===');
      console.log('User email:', user?.email);
      console.log('User ID:', user?.id);
      
      // CHECK ACCESS VIA API (INCLUDES MANAGER PRIVILEGES AND ADMIN STATUS)
      console.log('Checking access via API...');
      
      const response = await fetch('/api/auth/check-access');
      let hasManagerPrivileges = false;
      let adminStatus = false;
      
      if (!response.ok) {
        console.error('Failed to check access:', response.status);
        setManagerPrivileges({ hasManagerPrivileges: false });
      } else {
        const { hasManagerPrivileges: apiResult, isAdmin: adminResult, userEmail } = await response.json();
        console.log('Access check result:', { hasManagerPrivileges: apiResult, isAdmin: adminResult, userEmail });
        hasManagerPrivileges = apiResult;
        adminStatus = adminResult;
        setManagerPrivileges({ hasManagerPrivileges: apiResult });
        setIsAdmin(adminResult);
      }

      // THEN LOAD TEAM MEMBERSHIPS
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

      console.log('Team memberships query result:', { memberships, membershipError });

      if (membershipError) {
        console.error('Error loading teams:', membershipError);
        // REDIRECT TO NO-ACCESS PAGE ON ERROR
        router.push('/no-access');
        return;
      }

      if (!memberships || memberships.length === 0) {
        console.log('No team memberships found');
        // If no teams but user has manager privileges, that's OK
        // ADMINS CAN ALWAYS CONTINUE REGARDLESS OF MANAGER PRIVILEGES
        if (!hasManagerPrivileges && !isAdmin) {
          console.log('No manager privileges and not admin, redirecting to no-access page');
          router.push('/no-access');
          return;
        }
        console.log('Has manager privileges or is admin, continuing with empty teams list');
        // If they have manager privileges or are admin, continue with empty teams list
      }

      setTeamMemberships(memberships as TeamMember[]);

    } catch (error) {
      console.error('Error loading user teams:', error);
      // REDIRECT TO NO-ACCESS PAGE ON ERROR
      router.push('/no-access');
    } finally {
      setLoadingTeams(false);
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

    // Go to team dashboard
    router.push(`/launcher/team?teamId=${membership.team_id}`);
  };

  const handleGoToChat = () => {
    if (hasActiveAssistant) {
      router.push("/chat");
    } else {
      router.push("/");
    }
  };

  if (loading || loadingTeams) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">HHB Assistant</h1>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // LOGGED OUT USER - LANDING PAGE
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100">
        {/* HEADER */}
        <header className="bg-slate-800 border-b border-slate-700 p-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center">
              <div className="bg-gradient-to-r from-slate-300 to-slate-400 rounded-md p-2">
                <img src="/logo.png" alt="HHB" className="h-8 w-auto" />
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/login"
                className="text-slate-300 hover:text-slate-100 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
              >
                Sign Up
              </Link>
            </div>
          </div>
        </header>

        {/* HERO SECTION */}
        <section className="py-20 px-6">
          <div className="max-w-7xl mx-auto text-center">
            <div className="mb-6">
              <div className="bg-gradient-to-r from-slate-300 to-slate-400 rounded-lg inline-block p-6">
                <img src="/logo.png" alt="HHB" className="h-20 w-auto" />
              </div>
            </div>
            <p className="text-xl text-slate-400 max-w-3xl mx-auto">
              The intelligent AI assistant designed specifically for medical device sales representatives and field operations teams. 
            </p>
          </div>
        </section>

        {/* FEATURES SECTION */}
        <section className="py-16 px-6 bg-slate-800/50">
          <div className="max-w-7xl mx-auto">
            <h3 className="text-3xl font-bold text-center mb-12">Why Choose HHB Assistant?</h3>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h4 className="text-xl font-semibold mb-2">Intelligent AI</h4>
                <p className="text-slate-400">
                  Advanced AI that understands your team's context and provides relevant, accurate responses.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h4 className="text-xl font-semibold mb-2">Team Collaboration</h4>
                <p className="text-slate-400">
                  Create teams, share knowledge, and collaborate seamlessly with your colleagues.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h4 className="text-xl font-semibold mb-2">Document Management</h4>
                <p className="text-slate-400">
                  Upload and organize documents with intelligent search and retrieval capabilities.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="py-8 px-6 border-t border-slate-700">
          <div className="max-w-7xl mx-auto text-center">
            <p className="text-slate-400">
              Need help? Contact us at{" "}
              <a href="mailto:support@hhb.solutions" className="text-blue-400 hover:text-blue-300">
                support@hhb.solutions
              </a>
            </p>
          </div>
        </footer>
      </div>
    );
  }

  // LOGGED IN USER - DASHBOARD WITH TEAM SELECTION
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* HEADER */}
      <header className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <div className="bg-gradient-to-r from-slate-300 to-slate-400 rounded-md p-2">
              <img src="/logo.png" alt="HHB" className="h-8 w-auto" />
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={async () => {
                try {
                  await supabase.auth.signOut();
                  router.push('/login');
                } catch (error) {
                  console.error('Error logging out:', error);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-md transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto px-6 py-6">


        {/* USER INFO CARD */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-100 mb-1">Logged in as:</h3>
              <p className="text-slate-300 font-medium">{user.email}</p>
            </div>
            <div className="text-right flex gap-2">
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                {managerPrivileges.hasManagerPrivileges ? 'Manager' : 'User'}
              </span>
              {isAdmin && (
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                  Super
                </span>
              )}
            </div>
          </div>
        </div>

        {/* TEAM MEMBERSHIPS SECTION */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold">Your Teams</h3>
            {(managerPrivileges.hasManagerPrivileges || isAdmin) && (
              <button
                onClick={() => router.push('/setup/team')}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2"
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
                <span>Create New Team</span>
              </button>
            )}
          </div>
          {teamMemberships.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6">
              {teamMemberships.map((membership) => (
                <div
                  key={membership.id}
                  className="bg-slate-800 rounded-lg border border-slate-700 p-6 hover:border-blue-500 transition-colors cursor-pointer"
                  onClick={() => handleTeamSelect(membership)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <h4 className="text-xl font-semibold text-slate-100">
                      {membership.teams.name}
                    </h4>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      membership.is_original_manager 
                        ? 'bg-purple-100 text-purple-800'
                        : membership.role === 'manager' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {membership.is_original_manager ? 'Owner' : membership.role.charAt(0).toUpperCase() + membership.role.slice(1)}
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
            <div className="text-center py-8 bg-slate-800 rounded-lg border border-slate-700">
              <h4 className="text-2xl font-bold text-slate-100 mb-4">No Teams Yet</h4>
              <p className="text-slate-400">
                {(managerPrivileges.hasManagerPrivileges || isAdmin)
                  ? "You have manager privileges. Create your first team to get started!"
                  : "You don't have any teams yet. Please contact your administrator."
                }
              </p>
            </div>
          )}
        </div>



        {/* RECENT ACTIVITY SECTION - COMING SOON */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 mb-12">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h4 className="text-xl font-semibold text-slate-100 mb-2">Coming Soon</h4>
            <p className="text-slate-400">
              Track your recent conversations, team activities, and important updates
            </p>
          </div>
        </div>


      </main>
    </div>
  );
}
