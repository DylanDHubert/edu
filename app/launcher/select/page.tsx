"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

interface Portfolio {
  id: string;
  name: string;
  description: string;
}

interface Account {
  id: string;
  name: string;
  description: string;
  portfolios: Portfolio[];
}

interface TeamData {
  id: string;
  name: string;
  location: string;
}

export default function AccountPortfolioSelectPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<TeamData | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [creatingAssistant, setCreatingAssistant] = useState(false);

  useEffect(() => {
    if (!authLoading && user && teamId) {
      loadAccountsAndPortfolios();
    } else if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && !teamId) {
      router.push('/launcher');
    }
  }, [authLoading, user, teamId, router]);

  const loadAccountsAndPortfolios = async () => {
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
        .select('id, name, location')
        .eq('id', teamId)
        .single();

      if (teamError || !teamData) {
        setError('Failed to load team information');
        return;
      }

      setTeam(teamData);

      // Load accounts and their assigned portfolios
      const { data: accountsData, error: accountsError } = await supabase
        .from('team_accounts')
        .select(`
          id,
          name,
          description,
          account_portfolios (
            team_portfolios (
              id,
              name,
              description
            )
          )
        `)
        .eq('team_id', teamId)
        .order('name');

      if (accountsError) {
        console.error('Error loading accounts:', accountsError);
        setError('Failed to load accounts and portfolios');
        return;
      }

      // Transform the data structure
      const transformedAccounts = accountsData?.map(account => ({
        id: account.id,
        name: account.name,
        description: account.description || '',
        portfolios: account.account_portfolios?.map((ap: any) => ({
          id: ap.team_portfolios.id,
          name: ap.team_portfolios.name,
          description: ap.team_portfolios.description || ''
        })) || []
      })) || [];

      setAccounts(transformedAccounts);

      // Auto-select first account/portfolio if only one option
      if (transformedAccounts.length === 1) {
        setSelectedAccount(transformedAccounts[0].id);
        if (transformedAccounts[0].portfolios.length === 1) {
          setSelectedPortfolio(transformedAccounts[0].portfolios[0].id);
        }
      }

    } catch (error) {
      console.error('Error loading accounts and portfolios:', error);
      setError('Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  const handleAccountChange = (accountId: string) => {
    setSelectedAccount(accountId);
    setSelectedPortfolio(''); // Reset portfolio selection when account changes
  };

  const handleStartChat = async () => {
    if (!selectedAccount || !selectedPortfolio) {
      setError('Please select both an account and portfolio');
      return;
    }

    setCreatingAssistant(true);
    setError(null);

    try {
      // Call API to create/get dynamic assistant for this team+account+portfolio combination
      const response = await fetch('/api/assistants/create-dynamic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId,
          accountId: selectedAccount,
          portfolioId: selectedPortfolio
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create assistant');
      }

      const { assistantId, assistantName } = await response.json();

      // Store assistant context and redirect to chat
      localStorage.setItem('activeAssistant', JSON.stringify({
        assistantId,
        assistantName,
        teamId,
        accountId: selectedAccount,
        portfolioId: selectedPortfolio,
        teamName: team?.name
      }));

      // Redirect to the main chat interface
      router.push('/');

    } catch (error) {
      console.error('Error creating assistant:', error);
      setError(error instanceof Error ? error.message : 'Failed to start chat');
    } finally {
      setCreatingAssistant(false);
    }
  };

  const selectedAccountData = accounts.find(a => a.id === selectedAccount);
  const availablePortfolios = selectedAccountData?.portfolios || [];

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Loading...</h1>
          <p className="text-slate-400">Loading accounts and portfolios...</p>
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
            Back to Team Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!team || accounts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold text-slate-400 mb-4">No Accounts Found</h1>
          <p className="text-slate-400 mb-6">
            This team doesn't have any accounts set up yet. Please contact your team manager.
          </p>
          <button
            onClick={() => router.push(`/launcher/team?teamId=${teamId}`)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
          >
            Back to Team Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-slate-100">Start AI Chat</h1>
                <p className="text-slate-400 mt-1">
                  Select account and portfolio for <strong>{team.name}</strong>
                </p>
              </div>
              <button
                onClick={() => router.push(`/launcher/team?teamId=${teamId}`)}
                className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
              >
                ← Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          
          {/* Account Selection */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <h2 className="text-xl font-semibold text-slate-100 mb-4">Select Account</h2>
            <p className="text-slate-400 text-sm mb-6">
              Choose the hospital, surgery center, or location where you're working.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accounts.map((account) => (
                <label
                  key={account.id}
                  className={`cursor-pointer p-4 rounded-lg border transition-colors ${
                    selectedAccount === account.id
                      ? 'border-blue-500 bg-blue-900/20'
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="account"
                    value={account.id}
                    checked={selectedAccount === account.id}
                    onChange={(e) => handleAccountChange(e.target.value)}
                    className="sr-only"
                  />
                  <div>
                    <h3 className="text-slate-100 font-medium">{account.name}</h3>
                    {account.description && (
                      <p className="text-slate-400 text-sm mt-1">{account.description}</p>
                    )}
                    <p className="text-slate-500 text-xs mt-2">
                      {account.portfolios.length} portfolio(s) available
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Portfolio Selection */}
          {selectedAccount && (
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-slate-100 mb-4">Select Portfolio</h2>
              <p className="text-slate-400 text-sm mb-6">
                Choose the type of procedure or specialty you're working with.
              </p>
              
              {availablePortfolios.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availablePortfolios.map((portfolio) => (
                    <label
                      key={portfolio.id}
                      className={`cursor-pointer p-4 rounded-lg border transition-colors ${
                        selectedPortfolio === portfolio.id
                          ? 'border-green-500 bg-green-900/20'
                          : 'border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      <input
                        type="radio"
                        name="portfolio"
                        value={portfolio.id}
                        checked={selectedPortfolio === portfolio.id}
                        onChange={(e) => setSelectedPortfolio(e.target.value)}
                        className="sr-only"
                      />
                      <div>
                        <h3 className="text-slate-100 font-medium">{portfolio.name}</h3>
                        {portfolio.description && (
                          <p className="text-slate-400 text-sm mt-1">{portfolio.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-slate-400">
                    No portfolios are assigned to this account. Please contact your team manager.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* AI Integration Info
          {selectedAccount && selectedPortfolio && (
            <div className="bg-blue-900/30 border border-blue-700 rounded-md p-6">
              <h3 className="text-blue-400 font-medium mb-3">🤖 AI Assistant Ready</h3>
              <p className="text-blue-300 text-sm mb-4">
                Your AI assistant will have access to:
              </p>
              <ul className="text-blue-300 text-sm space-y-1 mb-4">
                <li>• <strong>Portfolio Documents</strong>: All PDFs uploaded for {availablePortfolios.find(p => p.id === selectedPortfolio)?.name}</li>
                <li>• <strong>Account Knowledge</strong>: Inventory, instruments, and technical info for {selectedAccountData?.name}</li>
                <li>• <strong>General Team Knowledge</strong>: Doctor information, access details, and team-wide info</li>
              </ul>
              <p className="text-blue-400 text-xs">
                The assistant combines all relevant knowledge sources for intelligent, context-aware responses.
              </p>
            </div>
          )} */}

          {/* Error Display */}
          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded-md p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Start Chat Button */}
          <div className="flex justify-end">
            <button
              onClick={handleStartChat}
              disabled={!selectedAccount || !selectedPortfolio || creatingAssistant}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white px-8 py-3 rounded-md font-medium transition-colors"
            >
              {creatingAssistant ? 'Creating Assistant...' : 'Start Chat'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 