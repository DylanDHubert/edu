"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { BrainCog, FileText } from "lucide-react";
import StandardHeader from "../../components/StandardHeader";
import CustomRadioButton from "../../components/CustomRadioButton";

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
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isOriginalManager, setIsOriginalManager] = useState<boolean>(false);
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
      
      // Use the secure team data API endpoint
      const response = await fetch(`/api/teams/${teamId}/data`);
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to load team data');
        return;
      }

      if (!result.success) {
        setError('Failed to load team data');
        return;
      }

      setUserRole(result.data.userRole);
      setIsOriginalManager(result.data.isOriginalManager || false);
      setTeam({
        id: result.data.team.id,
        name: result.data.team.name,
        location: result.data.team.location
      });

      // Transform portfolios data for the select interface
      const transformedPortfolios = (result.data.portfolios || []).map((portfolio: any) => ({
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description || '',
        documentCount: portfolio.team_documents?.length || 0,
        documents: portfolio.team_documents || []
      }));

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
      setSelectedAccount('');
    }
  }, [selectedPortfolio]);

  const loadAccountsForPortfolio = async () => {
    try {
      // Use the secure accounts list API endpoint
      const response = await fetch(`/api/teams/accounts/list?teamId=${teamId}`);
      const result = await response.json();

      if (!response.ok) {
        console.error('Error loading accounts:', result.error);
        setError('Failed to load accounts for this portfolio');
        return;
      }

      if (!result.success) {
        console.error('Failed to load accounts');
        setError('Failed to load accounts for this portfolio');
        return;
      }

      const allAccounts = result.accounts || [];

      // Filter accounts that are assigned to the selected portfolio
      const portfolioAccounts = allAccounts.filter((account: any) => {
        // Check if this account has account_portfolios relationship with the selected portfolio
        const accountPortfolios = account.account_portfolios || [];
        return accountPortfolios.some((ap: any) => ap.portfolio_id === selectedPortfolio);
      });

      const transformedAccounts = portfolioAccounts.map((account: any) => ({
        id: account.id,
        name: account.name,
        description: account.description || ''
      }));

      setAccounts(transformedAccounts);

      // Select first account by default
      if (transformedAccounts.length > 0) {
        setSelectedAccount(transformedAccounts[0].id);
      }

    } catch (error) {
      console.error('Error loading accounts for portfolio:', error);
      setError('Failed to load accounts');
    }
  };

  const handlePortfolioChange = (portfolioId: string) => {
    setSelectedPortfolio(portfolioId);
  };

  const handleAccountSelect = (accountId: string) => {
    setSelectedAccount(accountId);
  };

  const handleStartChat = async () => {
    if (!selectedPortfolio) {
      setError('Please select a portfolio');
      return;
    }

    if (!selectedAccount) {
      setError('Please select an account');
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

      // Get portfolio name
      const selectedPortfolioData = portfolios.find(p => p.id === selectedPortfolio);

      // Store assistant context and redirect to chat
      const activeAssistant = {
        assistantId,
        assistantName,
        teamId,
        accountId: selectedAccount,
        portfolioId: selectedPortfolio,
        accountName: accounts.find(a => a.id === selectedAccount)?.name,
        portfolioName: selectedPortfolioData?.name,
        teamName: team?.name,
        teamLocation: team?.location,
        userRole: userRole,
        isOriginalManager: isOriginalManager
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
        isOriginalManager={isOriginalManager}
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
            
            <div className="space-y-3">
              {portfolios.map((portfolio) => (
                <CustomRadioButton
                  key={portfolio.id}
                  name="portfolio"
                  value={portfolio.id}
                  checked={selectedPortfolio === portfolio.id}
                  onChange={handlePortfolioChange}
                  label={portfolio.name}
                  description={portfolio.description}
                />
              ))}
            </div>
          </div>

          {/* Account Selection */}
          {selectedPortfolio && (
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-slate-100 mb-4">Select Account</h2>
              <p className="text-slate-400 text-sm mb-6">
                Choose which hospital or location to include in your chat context.
              </p>
              
              {accounts.length > 0 ? (
                <div className="space-y-3">
                  {accounts.map((account) => (
                    <CustomRadioButton
                      key={account.id}
                      name="account"
                      value={account.id}
                      checked={selectedAccount === account.id}
                      onChange={handleAccountSelect}
                      label={account.name}
                      description={account.description}
                    />
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
              disabled={!selectedPortfolio || !selectedAccount || creatingAssistant}
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