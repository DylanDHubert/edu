"use client";

import { useState, useEffect } from "react";
import { BrainCog, X } from "lucide-react";
import CustomRadioButton from "./CustomRadioButton";

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

interface ActiveAssistant {
  assistantId: string;
  assistantName: string;
  teamId: string;
  accountId: string;
  portfolioId: string;
  accountName?: string;
  portfolioName?: string;
  teamName?: string;
  teamLocation?: string;
  userRole?: string;
  isOriginalManager?: boolean;
}

interface AssistantSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAssistant: ActiveAssistant | null;
}

export default function AssistantSelectModal({ 
  isOpen, 
  onClose, 
  currentAssistant 
}: AssistantSelectModalProps) {
  const [loading, setLoading] = useState(false);
  const [team, setTeam] = useState<TeamData | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isOriginalManager, setIsOriginalManager] = useState<boolean>(false);
  const [creatingAssistant, setCreatingAssistant] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<{
    isComplete: boolean;
    totalJobs: number;
    completedJobs: number;
    pendingJobs: number;
    processingJobs: number;
    failedJobs: number;
  } | null>(null);
  const [checkingProcessing, setCheckingProcessing] = useState(false);

  // RESET STATE WHEN MODAL OPENS/CLOSES
  useEffect(() => {
    if (isOpen && currentAssistant) {
      // PRE-SELECT CURRENT ASSISTANT'S PORTFOLIO AND ACCOUNT
      setSelectedPortfolio(currentAssistant.portfolioId);
      setSelectedAccount(currentAssistant.accountId);
      loadTeamData();
    } else if (!isOpen) {
      // RESET STATE WHEN MODAL CLOSES
      setTeam(null);
      setPortfolios([]);
      setAccounts([]);
      setSelectedPortfolio('');
      setSelectedAccount('');
      setError(null);
      setUserRole('');
      setIsOriginalManager(false);
      setCreatingAssistant(false);
      setProcessingStatus(null);
    }
  }, [isOpen, currentAssistant]);

  // CHECK PROCESSING STATUS WHEN PORTFOLIO CHANGES
  useEffect(() => {
    if (selectedPortfolio && currentAssistant?.teamId) {
      checkProcessingStatus();
    }
  }, [selectedPortfolio, currentAssistant?.teamId]);

  // POLL PROCESSING STATUS EVERY 5 SECONDS IF NOT COMPLETE
  useEffect(() => {
    if (!processingStatus?.isComplete && selectedPortfolio && currentAssistant?.teamId) {
      const interval = setInterval(() => {
        checkProcessingStatus();
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [processingStatus?.isComplete, selectedPortfolio, currentAssistant?.teamId]);

  const loadTeamData = async () => {
    if (!currentAssistant?.teamId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // USE THE SECURE TEAM DATA API ENDPOINT
      const response = await fetch(`/api/teams/${currentAssistant.teamId}/data`);
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

      // TRANSFORM PORTFOLIOS DATA FOR THE SELECT INTERFACE
      const transformedPortfolios = (result.data.portfolios || []).map((portfolio: any) => ({
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description || '',
        documentCount: portfolio.team_documents?.length || 0,
        documents: portfolio.team_documents || []
      }));

      setPortfolios(transformedPortfolios);

      // AUTO-SELECT CURRENT PORTFOLIO IF IT EXISTS
      if (currentAssistant.portfolioId && transformedPortfolios.some((p: Portfolio) => p.id === currentAssistant.portfolioId)) {
        setSelectedPortfolio(currentAssistant.portfolioId);
      } else if (transformedPortfolios.length === 1) {
        setSelectedPortfolio(transformedPortfolios[0].id);
      }

    } catch (error) {
      console.error('Error loading team data:', error);
      setError('Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  // LOAD ACCOUNTS WHEN PORTFOLIO IS SELECTED
  useEffect(() => {
    if (selectedPortfolio && currentAssistant?.teamId) {
      loadAccountsForPortfolio();
    } else {
      setAccounts([]);
      setSelectedAccount('');
    }
  }, [selectedPortfolio, currentAssistant?.teamId]);

  const loadAccountsForPortfolio = async () => {
    if (!currentAssistant?.teamId) return;
    
    try {
      // USE THE SECURE ACCOUNTS LIST API ENDPOINT
      const response = await fetch(`/api/teams/accounts/list?teamId=${currentAssistant.teamId}`);
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

      // FILTER ACCOUNTS THAT ARE ASSIGNED TO THE SELECTED PORTFOLIO
      const portfolioAccounts = allAccounts.filter((account: any) => {
        // CHECK IF THIS ACCOUNT HAS ACCOUNT_PORTFOLIOS RELATIONSHIP WITH THE SELECTED PORTFOLIO
        const accountPortfolios = account.account_portfolios || [];
        return accountPortfolios.some((ap: any) => ap.portfolio_id === selectedPortfolio);
      });

      const transformedAccounts = portfolioAccounts.map((account: any) => ({
        id: account.id,
        name: account.name,
        description: account.description || ''
      }));

      setAccounts(transformedAccounts);

      // AUTO-SELECT CURRENT ACCOUNT IF IT EXISTS
      if (currentAssistant?.accountId && transformedAccounts.some((a: Account) => a.id === currentAssistant.accountId)) {
        setSelectedAccount(currentAssistant.accountId);
      } else if (transformedAccounts.length > 0) {
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

  const checkProcessingStatus = async () => {
    if (!selectedPortfolio || !currentAssistant?.teamId) return;
    
    setCheckingProcessing(true);
    try {
      const response = await fetch(`/api/teams/portfolios/processing-status?teamId=${currentAssistant.teamId}&portfolioId=${selectedPortfolio}`);
      const result = await response.json();
      
      if (response.ok && result.success) {
        setProcessingStatus(result);
      } else {
        console.error('Failed to check processing status:', result.error);
        setProcessingStatus(null);
      }
    } catch (error) {
      console.error('Error checking processing status:', error);
      setProcessingStatus(null);
    } finally {
      setCheckingProcessing(false);
    }
  };

  const handleSwitchAssistant = async () => {
    if (!selectedPortfolio || !selectedAccount || !currentAssistant?.teamId) {
      setError('Please select a portfolio and account');
      return;
    }

    // CHECK PROCESSING STATUS FIRST
    await checkProcessingStatus();
    
    if (processingStatus && !processingStatus.isComplete && processingStatus.totalJobs > 0) {
      setError(`Documents still processing... ${processingStatus.completedJobs} of ${processingStatus.totalJobs} ready`);
      return;
    }

    setCreatingAssistant(true);
    setError(null);

    try {
      // CALL API TO CREATE/GET DYNAMIC ASSISTANT FOR THIS TEAM+ACCOUNT+PORTFOLIO COMBINATION
      const response = await fetch('/api/assistants/create-dynamic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId: currentAssistant.teamId,
          accountId: selectedAccount,
          portfolioId: selectedPortfolio
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create assistant');
      }

      const { assistantId, assistantName } = await response.json();

      // GET PORTFOLIO AND ACCOUNT NAMES
      const selectedPortfolioData = portfolios.find(p => p.id === selectedPortfolio);
      const selectedAccountData = accounts.find(a => a.id === selectedAccount);

      // STORE NEW ASSISTANT CONTEXT
      const newActiveAssistant = {
        assistantId,
        assistantName,
        teamId: currentAssistant.teamId,
        accountId: selectedAccount,
        portfolioId: selectedPortfolio,
        accountName: selectedAccountData?.name,
        portfolioName: selectedPortfolioData?.name,
        teamName: team?.name,
        teamLocation: team?.location,
        userRole: userRole,
        isOriginalManager: isOriginalManager
      };
      
      localStorage.setItem('activeAssistant', JSON.stringify(newActiveAssistant));
      
      // DISPATCH CUSTOM EVENT TO NOTIFY OTHER COMPONENTS OF THE CHANGE
      window.dispatchEvent(new CustomEvent('activeAssistantChanged'));
      
      // CLEAR CURRENT CHAT TO ENSURE FRESH START
      window.dispatchEvent(new CustomEvent('clearCurrentChat'));
      
      console.log('ACTIVE ASSISTANT SWITCHED:', newActiveAssistant);

      // CLOSE MODAL
      onClose();

    } catch (error) {
      console.error('Error switching assistant:', error);
      setError(error instanceof Error ? error.message : 'Failed to switch assistant');
    } finally {
      setCreatingAssistant(false);
    }
  };

  const handleClose = () => {
    if (!creatingAssistant) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* HEADER */}
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-slate-100">Change Assistant</h2>
          <button
            onClick={handleClose}
            disabled={creatingAssistant}
            className="text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENT */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="text-slate-400">Loading portfolios and accounts...</div>
            </div>
          ) : error ? (
            <div className="bg-red-900/50 border border-red-700 rounded-md p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          ) : !team || portfolios.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400">
                No portfolios found for this team. Please contact your team manager.
              </p>
            </div>
          ) : (
            <>
              {/* TEAM INFO */}
              <div className="bg-slate-700 rounded-lg p-4">
                <h3 className="text-lg font-medium text-slate-100 mb-2">{team.name}</h3>
                <p className="text-slate-400 text-sm">{team.location}</p>
              </div>

              {/* PORTFOLIO SELECTION */}
              <div className="bg-slate-700 rounded-lg border border-slate-600 p-4">
                <h3 className="text-lg font-semibold text-slate-100 mb-3">Select Portfolio</h3>
                <p className="text-slate-400 text-sm mb-4">
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

              {/* ACCOUNT SELECTION */}
              {selectedPortfolio && (
                <div className="bg-slate-700 rounded-lg border border-slate-600 p-4">
                  <h3 className="text-lg font-semibold text-slate-100 mb-3">Select Account</h3>
                  <p className="text-slate-400 text-sm mb-4">
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
                    <div className="text-center py-4">
                      <p className="text-slate-400">
                        No accounts are assigned to this portfolio. Please contact your team manager.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ERROR DISPLAY */}
              {error && (
                <div className="bg-red-900/50 border border-red-700 rounded-md p-4">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* SWITCH ASSISTANT BUTTON */}
              <div className="bg-slate-700 rounded-lg border border-slate-600 p-4">
                {processingStatus && !processingStatus.isComplete && processingStatus.totalJobs > 0 ? (
                  <div className="text-center">
                    <div className="text-yellow-400 text-sm mb-2">
                      Documents still processing...
                    </div>
                    <div className="text-slate-300 text-xs mb-3">
                      {processingStatus.completedJobs} of {processingStatus.totalJobs} ready
                    </div>
                    <button
                      disabled={true}
                      className="w-full bg-slate-600 text-slate-400 px-4 py-3 rounded-md font-medium cursor-not-allowed flex items-center gap-3"
                    >
                      <BrainCog className="w-5 h-5 flex-shrink-0" />
                      <span className="flex-1 text-center">
                        {checkingProcessing ? 'Checking...' : 'Waiting for documents...'}
                      </span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleSwitchAssistant}
                    disabled={!selectedPortfolio || !selectedAccount || creatingAssistant}
                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
                  >
                    <BrainCog className="w-5 h-5 flex-shrink-0" />
                    <span className="flex-1 text-center">
                      {creatingAssistant ? 'Switching Assistant...' : 'Switch Assistant'}
                    </span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
