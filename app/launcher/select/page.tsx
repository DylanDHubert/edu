"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { BrainCog, FileText } from "lucide-react";
import StandardHeader from "../../components/StandardHeader";

interface Portfolio {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  documents: Array<{ original_name: string }>;
}

interface Account {
  id: string;
  name: string;
  description: string;
}

interface TeamData {
  id: string;
  name: string;
  location: string;
}

function AccountPortfolioSelectContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<TeamData | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('');
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [creatingAssistant, setCreatingAssistant] = useState(false);

  useEffect(() => {
    if (!authLoading && user && teamId) {
      loadTeamData();
    } else if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && !teamId) {
      router.push('/');
    }
  }, [authLoading, user, teamId, router]);

  const loadTeamData = async () => {
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

      // Load portfolios with document counts
      const { data: portfoliosData, error: portfoliosError } = await supabase
        .from('team_portfolios')
        .select(`
          id,
          name,
          description,
          team_documents (
            original_name
          )
        `)
        .eq('team_id', teamId)
        .order('name');

      if (portfoliosError) {
        console.error('Error loading portfolios:', portfoliosError);
        setError('Failed to load portfolios');
        return;
      }

      const transformedPortfolios = portfoliosData?.map(portfolio => ({
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description || '',
        documentCount: portfolio.team_documents?.length || 0,
        documents: portfolio.team_documents || []
      })) || [];

      setPortfolios(transformedPortfolios);

      // Auto-select first portfolio if only one
      if (transformedPortfolios.length === 1) {
        setSelectedPortfolio(transformedPortfolios[0].id);
      }

    } catch (error) {
      console.error('Error loading team data:', error);
      setError('Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  // Load accounts when portfolio is selected
  useEffect(() => {
    if (selectedPortfolio) {
      loadAccountsForPortfolio();
    } else {
      setAccounts([]);
      setSelectedAccounts(new Set());
    }
  }, [selectedPortfolio]);

  const loadAccountsForPortfolio = async () => {
    try {
      // Load accounts assigned to this portfolio
      const { data: accountPortfolios, error: portfolioError } = await supabase
        .from('account_portfolios')
        .select('account_id')
        .eq('portfolio_id', selectedPortfolio);

      if (portfolioError) {
        console.error('Error loading account portfolios:', portfolioError);
        setError('Failed to load accounts for this portfolio');
        return;
      }

      const accountIds = accountPortfolios?.map(ap => ap.account_id) || [];

      if (accountIds.length === 0) {
        setAccounts([]);
        setSelectedAccounts(new Set());
        return;
      }

      const { data: accountsData, error: accountsError } = await supabase
        .from('team_accounts')
        .select(`
          id,
          name,
          description
        `)
        .eq('team_id', teamId)
        .in('id', accountIds)
        .order('name');

      if (accountsError) {
        console.error('Error loading accounts:', accountsError);
        setError('Failed to load accounts for this portfolio');
        return;
      }

      const transformedAccounts = accountsData?.map(account => ({
        id: account.id,
        name: account.name,
        description: account.description || ''
      })) || [];

      setAccounts(transformedAccounts);

      // Select all accounts by default
      setSelectedAccounts(new Set(transformedAccounts.map(a => a.id)));

    } catch (error) {
      console.error('Error loading accounts for portfolio:', error);
      setError('Failed to load accounts');
    }
  };

  const handlePortfolioChange = (portfolioId: string) => {
    setSelectedPortfolio(portfolioId);
  };

  const handleAccountToggle = (accountId: string) => {
    const newSelected = new Set(selectedAccounts);
    if (newSelected.has(accountId)) {
      newSelected.delete(accountId);
    } else {
      newSelected.add(accountId);
    }
    setSelectedAccounts(newSelected);
  };

  const handleStartChat = async () => {
    if (!selectedPortfolio) {
      setError('Please select a portfolio');
      return;
    }

    if (selectedAccounts.size === 0) {
      setError('Please select at least one account');
      return;
    }

    setCreatingAssistant(true);
    setError(null);

    try {
      // For now, use the first selected account (we'll modify the API later to handle multiple)
      const firstAccountId = Array.from(selectedAccounts)[0];
      
      // Call API to create/get dynamic assistant for this team+account+portfolio combination
      const response = await fetch('/api/assistants/create-dynamic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId,
          accountId: firstAccountId,
          portfolioId: selectedPortfolio
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create assistant');
      }

      const { assistantId, assistantName } = await response.json();

      // Get portfolio name
      const selectedPortfolioData = portfolios.find(p => p.id === selectedPortfolio);

      // Store assistant context and redirect to chat
      const activeAssistant = {
        assistantId,
        assistantName,
        teamId,
        accountId: firstAccountId, // For now, just use first account
        portfolioId: selectedPortfolio,
        accountName: accounts.find(a => a.id === firstAccountId)?.name,
        portfolioName: selectedPortfolioData?.name,
        teamName: team?.name,
        teamLocation: team?.location,
        userRole: userRole
      };
      
      localStorage.setItem('activeAssistant', JSON.stringify(activeAssistant));
      
      // Dispatch custom event to notify ChatContext of the change
      window.dispatchEvent(new CustomEvent('activeAssistantChanged'));
      
      // CLEAR CURRENT CHAT TO ENSURE FRESH START
      window.dispatchEvent(new CustomEvent('clearCurrentChat'));
      
      console.log('ACTIVE ASSISTANT SET:', activeAssistant);

      // Redirect to the main chat interface
      router.push('/chat');

    } catch (error) {
      console.error('Error creating assistant:', error);
      setError(error instanceof Error ? error.message : 'Failed to start chat');
    } finally {
      setCreatingAssistant(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Loading...</h1>
          <p className="text-slate-400">Loading portfolios and accounts...</p>
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

  if (!team || portfolios.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold text-slate-400 mb-4">No Portfolios Found</h1>
          <p className="text-slate-400 mb-6">
            This team doesn't have any portfolios set up yet. Please contact your team manager.
          </p>
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
        <div className="space-y-8">
          
          {/* Portfolio Selection */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <h2 className="text-xl font-semibold text-slate-100 mb-4">Select Portfolio</h2>
            <p className="text-slate-400 text-sm mb-6">
              Choose the type of procedure or specialty you're working with.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {portfolios.map((portfolio) => (
                <label
                  key={portfolio.id}
                  className={`cursor-pointer p-4 rounded-lg border transition-colors ${
                    selectedPortfolio === portfolio.id
                      ? 'border-purple-500 bg-purple-900/20'
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="portfolio"
                    value={portfolio.id}
                    checked={selectedPortfolio === portfolio.id}
                    onChange={(e) => handlePortfolioChange(e.target.value)}
                    className="sr-only"
                  />
                  <div>
                    <h3 className="text-slate-100 font-medium">{portfolio.name}</h3>
                    {portfolio.description && (
                      <p className="text-slate-400 text-sm mt-1">{portfolio.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <FileText className="w-4 h-4 text-slate-500" />
                      <p className="text-slate-500 text-xs">
                        {portfolio.documentCount} document{portfolio.documentCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {portfolio.documents.length > 0 && (
                      <div className="mt-2">
                        <p className="text-slate-500 text-xs font-medium">Documents:</p>
                        <ul className="text-slate-500 text-xs mt-1 space-y-1">
                          {portfolio.documents.slice(0, 3).map((doc, index) => (
                            <li key={index} className="truncate">• {doc.original_name}</li>
                          ))}
                          {portfolio.documents.length > 3 && (
                            <li className="text-slate-400">• +{portfolio.documents.length - 3} more</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Account Selection */}
          {selectedPortfolio && (
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-slate-100 mb-4">Select Accounts</h2>
              <p className="text-slate-400 text-sm mb-6">
                Choose which hospitals or locations to include in your chat context. All accounts are selected by default.
              </p>
              
              {accounts.length > 0 ? (
                <div className="space-y-3">
                  {accounts.map((account) => (
                    <label
                      key={account.id}
                      className="flex items-center p-3 rounded-lg border border-slate-600 hover:border-slate-500 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAccounts.has(account.id)}
                        onChange={() => handleAccountToggle(account.id)}
                        className="w-4 h-4 text-purple-600 bg-slate-700 border-slate-600 rounded focus:ring-purple-500 focus:ring-2"
                      />
                      <div className="ml-3">
                        <h3 className="text-slate-100 font-medium">{account.name}</h3>
                        {account.description && (
                          <p className="text-slate-400 text-sm mt-1">{account.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-slate-400">
                    No accounts are assigned to this portfolio. Please contact your team manager.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded-md p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Start Chat Button */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <button
              onClick={handleStartChat}
              disabled={!selectedPortfolio || selectedAccounts.size === 0 || creatingAssistant}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
            >
              <BrainCog className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 text-center">
                {creatingAssistant ? 'Creating Assistant...' : 'Start Chat'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AccountPortfolioSelectPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AccountPortfolioSelectContent />
    </Suspense>
  );
} 