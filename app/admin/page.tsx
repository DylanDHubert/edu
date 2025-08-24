"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";

interface Team {
  id: string;
  name: string;
  description: string;
  location: string;
  created_at: string;
  created_by: string;
  member_count: number;
  status: string;
}

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [isAdminLoading, setIsAdminLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState({
    totalTeams: 0,
    totalMembers: 0,
    activeTeams: 0,
  });

  const supabase = createClient();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (user) {
      checkAdminAccess();
    }
  }, [user, loading, router]);

  const checkAdminAccess = async () => {
    try {
      console.log('Checking admin access for user:', user?.email);
      
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', user?.email)
        .single();

      console.log('Admin query result:', { data, error });

      if (error || !data) {
        console.log('Admin access denied - no data or error:', error);
        router.push("/");
        return;
      }

      console.log('Admin access granted for:', data);
      setIsAdmin(true);
      await loadDashboardData();
    } catch (error) {
      console.error('Error checking admin access:', error);
      router.push("/");
    } finally {
      setIsAdminLoading(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      // Load teams with member counts
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select(`
          *,
          team_members(count)
        `)
        .order('created_at', { ascending: false });

      if (teamsError) throw teamsError;

      // Format teams data
      const formattedTeams = teamsData?.map(team => ({
        ...team,
        member_count: team.team_members?.[0]?.count || 0,
        status: team.team_members?.[0]?.count > 0 ? 'Active' : 'Pending'
      })) || [];

      setTeams(formattedTeams);

      // Calculate stats
      const totalTeams = formattedTeams.length;
      const totalMembers = formattedTeams.reduce((sum, team) => sum + team.member_count, 0);
      const activeTeams = formattedTeams.filter(team => team.member_count > 0).length;

      setStats({ totalTeams, totalMembers, activeTeams });

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  if (loading || isAdminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">HHB Admin</h1>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-red-400 mb-4">Access Denied</h1>
          <p className="text-slate-400">You don't have admin permissions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-100">HHB Admin Dashboard</h1>
              <p className="text-slate-400 mt-1">Manage teams and monitor system usage</p>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => router.push('/admin/create-team')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
              >
                Invite Manager
              </button>
              <button
                onClick={() => router.push('/admin/dashboard')}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
              >
                Analytics Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center">
              <div className="p-2 bg-blue-600 rounded-md">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM9 9a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-400">Total Teams</p>
                <p className="text-2xl font-bold text-slate-100">{stats.totalTeams}</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center">
              <div className="p-2 bg-green-600 rounded-md">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-400">Total Members</p>
                <p className="text-2xl font-bold text-slate-100">{stats.totalMembers}</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center">
              <div className="p-2 bg-orange-600 rounded-md">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-400">Active Teams</p>
                <p className="text-2xl font-bold text-slate-100">{stats.activeTeams}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Teams Table */}
        <div className="bg-slate-800 rounded-lg border border-slate-700">
          <div className="px-6 py-4 border-b border-slate-700">
            <h2 className="text-xl font-semibold text-slate-100">Teams</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700">
              <thead className="bg-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Team Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Members
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-slate-800 divide-y divide-slate-700">
                {teams.map((team) => (
                  <tr key={team.id} className="hover:bg-slate-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-slate-100">{team.name}</div>
                        {team.description && (
                          <div className="text-sm text-slate-400">{team.description}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      {team.location || 'Not specified'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      {team.member_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        team.status === 'Active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {team.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      {new Date(team.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => router.push(`/admin/teams/${team.id}`)}
                        className="text-blue-400 hover:text-blue-300 mr-4"
                      >
                        View
                      </button>
                      <button
                        onClick={() => router.push(`/admin/teams/${team.id}/edit`)}
                        className="text-slate-400 hover:text-slate-300"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {teams.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-slate-400">No teams created yet.</p>
              <button
                onClick={() => router.push('/admin/create-team')}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
              >
                Invite First Manager
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 