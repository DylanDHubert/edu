"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./contexts/AuthContext";
import { useRouter } from "next/navigation";
import { createClient } from "./utils/supabase/client";
import { MapPin, LogOut } from "lucide-react";
import Link from "next/link";
import LoadingScreen from "./components/LoadingScreen";

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

interface TeamInvitation {
  id: string;
  team_id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
  teams: {
    id: string;
    name: string;
    description: string;
    location: string;
  };
  inviter: {
    email: string;
  };
}



export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [hasActiveAssistant, setHasActiveAssistant] = useState(false);
  const [teamMemberships, setTeamMemberships] = useState<TeamMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<TeamInvitation[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const supabase = createClient();

  // USER TIPS DATA
  const userTips = [
    {
      id: 1,
      title: "Partition Your Portfolios",
      content: "In some cases, smaller portfolios can give better results. You can use the switch assistant feature to quickly switch back and forth between different portfolios.",
      icon: (
        <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
      color: "blue"
    },
    {
      id: 2,
      title: "Saving Takes Time",
      content: "Please be patient to ensure saves are properly executed. When Saving, please do not close, exit, or reload the page.",
      icon: (
        <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: "green"
    },
    {
      id: 3,
      title: "Document Processing Time",
      content: "When you upload new documents to a portfolio, it may take some time for the AI to process them. This can be nearly instant for small files, but larger documents may take up to 2 hours to become available to your assistant.",
      icon: (
        <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      color: "purple"
    }
  ];

  // NAVIGATION FUNCTIONS
  const nextTip = () => {
    setCurrentTipIndex((prev) => (prev + 1) % userTips.length);
  };

  const prevTip = () => {
    setCurrentTipIndex((prev) => (prev - 1 + userTips.length) % userTips.length);
  };

  useEffect(() => {
    if (!loading && user) {
      // CHECK IF USER HAS AN ACTIVE ASSISTANT
      const activeAssistant = localStorage.getItem('activeAssistant');
      if (activeAssistant) {
        setHasActiveAssistant(true);
      }
      
      // LOAD USER TEAMS AND INVITATIONS
      loadUserTeams();
      loadPendingInvitations();
    }
  }, [user, loading]);

  // CLEAR ACTIVE ASSISTANT WHEN USER VISITS HOME PAGE (INDICATING THEY WANT TO CHANGE TEAMS)
  useEffect(() => {
    if (!loading && user) {
      // Clear any existing active assistant when visiting home page
      const existingAssistant = localStorage.getItem('activeAssistant');
      if (existingAssistant) {
        // Clearing active assistant on home page visit
        localStorage.removeItem('activeAssistant');
        // Dispatch event to notify ChatContext
        window.dispatchEvent(new CustomEvent('activeAssistantChanged'));
        setHasActiveAssistant(false);
      }
    }
  }, [user, loading]);

  const loadUserTeams = async () => {
    try {
      setLoadingTeams(true);
      
      // CHECK ACCESS VIA API (INCLUDES MANAGER PRIVILEGES AND ADMIN STATUS)
      
      const response = await fetch('/api/auth/check-access');
      let hasManagerPrivileges = false;
      let adminStatus = false;
      
      if (!response.ok) {
        console.error('Failed to check access:', response.status);
      } else {
        const { isAdmin: adminResult, userEmail } = await response.json();
        // Access check result
        adminStatus = adminResult;
        setIsAdmin(adminResult);
      }

      // THEN LOAD TEAM MEMBERSHIPS VIA SECURE API
      const teamsResponse = await fetch('/api/user/teams');
      let memberships: any[] = [];

      if (teamsResponse.ok) {
        const teamsResult = await teamsResponse.json();
        if (teamsResult.success) {
          memberships = teamsResult.memberships || [];
          // Team memberships loaded via API
        } else {
          console.error('Failed to load teams via API:', teamsResult.error);
        }
      } else {
        console.error('Error loading teams via API:', teamsResponse.status);
        // Just continue with empty teams list - user can still create teams
        console.log('Error loading teams, continuing with empty list');
      }

      if (!memberships || memberships.length === 0) {
        console.log('No team memberships found');
        // ANY AUTHENTICATED USER CAN CONTINUE WITH EMPTY TEAMS LIST
        // They can create teams or accept invitations
        console.log('Continuing with empty teams list - user can create teams');
      }

      setTeamMemberships(memberships as TeamMember[]);

    } catch (error) {
      console.error('Error loading user teams:', error);
      // Just continue with empty teams list - user can still create teams
      console.log('Error loading teams, continuing with empty list');
    } finally {
      setLoadingTeams(false);
    }
  };

  const loadPendingInvitations = async () => {
    try {
      const response = await fetch('/api/teams/invite');
      
      if (response.ok) {
        const { invitations } = await response.json();
        setPendingInvitations(invitations || []);
      } else {
        console.error('Failed to load pending invitations');
        setPendingInvitations([]);
      }
    } catch (error) {
      console.error('Error loading pending invitations:', error);
      setPendingInvitations([]);
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    try {
      const response = await fetch('/api/teams/accept-invitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invitationId
        }),
      });

      if (response.ok) {
        // Reload teams and invitations
        await loadUserTeams();
        await loadPendingInvitations();
      } else {
        const errorData = await response.json();
        console.error('Failed to accept invitation:', errorData.error);
      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
    }
  };

  const handleDeclineInvitation = async (invitationId: string) => {
    try {
      // For now, we'll just remove it from the local state
      // In a full implementation, you might want to update the invitation status to 'declined'
      setPendingInvitations(prev => prev.filter(inv => inv.id !== invitationId));
    } catch (error) {
      console.error('Error declining invitation:', error);
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
      <LoadingScreen 
        title="HHB Assistant" 
        subtitle={loading ? "Loading..." : "Loading teams..."} 
      />
    );
  }

  // LOGGED OUT USER - LANDING PAGE
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100">
        {/* HEADER */}
        <header className="bg-slate-800 border-b border-slate-700 p-4">
          <div className="flex items-center justify-between">
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
        <div className="flex items-center justify-between">
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



        {/* DEVELOPER TOOLS PANEL - ADMIN ONLY */}
        {isAdmin && (
          <div className="mb-8">
            <h3 className="text-2xl font-bold mb-4">Developer Tools</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => router.push('/admin')}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-green-500 rounded-lg p-4 transition-colors group"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mb-3 group-hover:bg-green-500/30 transition-colors">
                    <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z" />
                    </svg>
                  </div>
                  <span className="text-slate-300 text-sm font-medium">Dashboard</span>
                </div>
              </button>

              <button
                onClick={() => router.push('/admin/dashboard')}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-purple-500 rounded-lg p-4 transition-colors group"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center mb-3 group-hover:bg-purple-500/30 transition-colors">
                    <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <span className="text-slate-300 text-sm font-medium">Analytics</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* TEAM MEMBERSHIPS SECTION */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold">Your Teams</h3>
            {user && (
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
                Create your first team to get started!
              </p>
            </div>
          )}
        </div>

        {/* PENDING INVITATIONS SECTION */}
        {pendingInvitations.length > 0 && (
          <div className="mb-6">
            <h3 className="text-2xl font-bold mb-6">Pending Invitations</h3>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6">
              {pendingInvitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="bg-slate-800 rounded-lg border border-yellow-500/50 p-6"
                >
                  <div className="flex items-start justify-between mb-4">
                    <h4 className="text-xl font-semibold text-slate-100">
                      {invitation.teams.name}
                    </h4>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      invitation.role === 'manager' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
                    </span>
                  </div>

                  {invitation.teams.location && (
                    <p className="text-slate-400 mb-2 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      {invitation.teams.location}
                    </p>
                  )}

                  {invitation.teams.description && (
                    <p className="text-slate-300 text-sm mb-4">
                      {invitation.teams.description}
                    </p>
                  )}

                  <div className="mb-4">
                    <p className="text-slate-400 text-xs mt-1">
                      Expires: {new Date(invitation.expires_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => handleAcceptInvitation(invitation.id)}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium transition-colors text-sm"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleDeclineInvitation(invitation.id)}
                      className="flex-1 bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-md font-medium transition-colors text-sm"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* USER TIPS SECTION - INTERACTIVE STACK */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold">User Tips</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">
                {currentTipIndex + 1} of {userTips.length}
              </span>
            </div>
          </div>
          
          <div className="relative">
            {/* CURRENT TIP CARD */}
            <div className={`bg-slate-800 rounded-lg border border-slate-700 p-6 transition-all duration-300 hover:border-${userTips[currentTipIndex].color}-500`}>
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 bg-${userTips[currentTipIndex].color}-500/20 rounded-full flex items-center justify-center flex-shrink-0`}>
                  {userTips[currentTipIndex].icon}
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-semibold text-slate-100 mb-2">
                    {userTips[currentTipIndex].title}
                  </h4>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    {userTips[currentTipIndex].content}
                  </p>
                </div>
              </div>
            </div>

            {/* NAVIGATION CONTROLS */}
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={prevTip}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-slate-100 rounded-md transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Previous
              </button>
              
              {/* DOT INDICATORS */}
              <div className="flex gap-2">
                {userTips.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentTipIndex(index)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      index === currentTipIndex 
                        ? 'bg-slate-400' 
                        : 'bg-slate-600 hover:bg-slate-500'
                    }`}
                  />
                ))}
              </div>
              
              <button
                onClick={nextTip}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-slate-100 rounded-md transition-colors"
              >
                Next
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>


      </main>
    </div>
  );
}
