"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import ImageUpload from "../../components/ImageUpload";
import StandardHeader from "../../components/StandardHeader";
import { Save, ChevronDown, ChevronRight } from "lucide-react";
import ConfirmationModal from "../../components/ConfirmationModal";

interface Inventory {
  id: string;
  name: string;
  quantity: number;
}

interface Instrument {
  id: string;
  name: string;
  description: string;
  quantity?: number | null;
  imageFile?: File;
  imageUrl?: string;
  imageName?: string;
}

interface PortfolioData {
  inventory: Inventory[];
  instruments: Instrument[];
  technicalInfo: string;
}

interface Account {
  id?: string;
  name: string;
  description: string;
  assignedPortfolios: string[];
  portfolioData: { [portfolioId: string]: PortfolioData };
  accessMisc: string;
}

function EditAccountsContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');
  const supabase = createClient();

  const [team, setTeam] = useState<any>(null);
  const [portfolios, setPortfolios] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isOriginalManager, setIsOriginalManager] = useState<boolean>(false);
  // Add state for managing expanded accounts
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  // Add state for active portfolio per account
  const [activePortfolios, setActivePortfolios] = useState<{ [accountIndex: number]: string }>({});
  // Add state for confirmation modal
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'danger'
  });
  // Add state for tracking which account is being deleted
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (!teamId) {
              router.push("/");
    } else if (user && teamId) {
      loadExistingData();
    }
  }, [user, loading, teamId, router]);

  const loadExistingData = async () => {
    try {
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

      // Check if user is a manager
      if (result.data.userRole !== 'manager') {
        setError('Manager access required');
        return;
      }

      setUserRole(result.data.userRole);
      setIsOriginalManager(result.data.isOriginalManager || false);
      setTeam(result.data.team);
      setPortfolios(result.data.portfolios || []);

      // Load existing accounts and their knowledge using service role via API
      const accountsResponse = await fetch(`/api/teams/accounts/list?teamId=${teamId}`);
      const accountsResult = await accountsResponse.json();

      if (!accountsResponse.ok) {
        console.error('Error loading accounts:', accountsResult.error);
        setError('Failed to load existing accounts');
        return;
      }

      const accountsData = accountsResult.accounts || [];

      // Transform data for editing
      const transformedAccounts = accountsData?.map((account: any) => {
        const allKnowledge = account.team_knowledge || [];
        const portfolioData: { [portfolioId: string]: PortfolioData } = {};
        
        // Get account-level access & misc
        const accessKnowledge = allKnowledge.find((k: any) => k.portfolio_id === null && k.category === 'access_misc');
        const accessMisc = accessKnowledge?.content || accessKnowledge?.metadata?.content || '';

        // Get assigned portfolios
        const assignedPortfolios = account.account_portfolios?.map((ap: any) => ap.portfolio_id) || [];

        // Process each assigned portfolio
        assignedPortfolios.forEach((portfolioId: string) => {
          const portfolioKnowledge = allKnowledge.filter((k: any) => k.portfolio_id === portfolioId);
          
          const inventory = portfolioKnowledge
            .filter((k: any) => k.category === 'inventory')
            .map((k: any) => ({
              id: k.id,
              name: k.metadata?.name || k.title || '',
              quantity: k.metadata?.quantity || 0
            }));

          const instruments = portfolioKnowledge
            .filter((k: any) => k.category === 'instruments')
            .map((k: any) => ({
              id: k.id,
              name: k.metadata?.name || k.title || '',
              description: k.metadata?.description || k.content || '',
              imageUrl: k.metadata?.image_url || '',
              imageName: k.metadata?.image_name || '',
              quantity: k.metadata?.quantity ?? null
            }));

          const techKnowledge = portfolioKnowledge.find((k: any) => k.category === 'technical');
          const technicalInfo = techKnowledge?.content || techKnowledge?.metadata?.content || '';

          portfolioData[portfolioId] = {
            inventory,
            instruments,
            technicalInfo
          };
        });

        return {
          id: account.id,
          name: account.name,
          description: account.description || '',
          assignedPortfolios,
          portfolioData,
          accessMisc
        };
      }) || [];

      // Add empty account if none exist
      if (transformedAccounts.length === 0) {
        transformedAccounts.push({
          id: undefined,
          name: '',
          description: '',
          assignedPortfolios: [],
          portfolioData: {},
          accessMisc: ''
        });
      }

      setAccounts(transformedAccounts);

      // Set first portfolio as active for each account
      const initialActivePortfolios: { [accountIndex: number]: string } = {};
      transformedAccounts.forEach((account: any, index: number) => {
        if (account.assignedPortfolios.length > 0) {
          initialActivePortfolios[index] = account.assignedPortfolios[0];
        }
      });
      setActivePortfolios(initialActivePortfolios);

    } catch (error) {
      console.error('Error loading existing data:', error);
      setError('Failed to load team data');
    }
  };

  const addAccount = () => {
    setAccounts([...accounts, {
      id: undefined,
      name: '',
      description: '',
      assignedPortfolios: [],
      portfolioData: {},
      accessMisc: ''
    }]);
  };

  // HELPER FUNCTION TO SHOW CONFIRMATION MODAL
  const showConfirmationModal = (
    title: string, 
    message: string, 
    onConfirm: () => void, 
    variant: 'danger' | 'warning' | 'info' = 'danger'
  ) => {
    setConfirmationModal({
      isOpen: true,
      title,
      message,
      onConfirm,
      variant
    });
  };

  // CLOSE CONFIRMATION MODAL
  const closeConfirmationModal = () => {
    setConfirmationModal(prev => ({ ...prev, isOpen: false }));
  };

  const removeAccount = async (index: number) => {
    const account = accounts[index];
    
    if (account.id) {
      // SHOW CONFIRMATION MODAL FOR EXISTING ACCOUNT
      showConfirmationModal(
        'Delete Account',
        `Are you sure you want to delete "${account.name}"? This will permanently remove all associated knowledge, inventory, instruments, and technical information. This action cannot be undone.`,
        async () => {
          try {
            // SHOW LOADING STATE
            setIsSubmitting(true);
            setDeletingAccountId(account.id || null);
            setError(null);

            // DELETE FROM DATABASE
            const { error: deleteError } = await supabase
              .from('team_accounts')
              .delete()
              .eq('id', account.id);

            if (deleteError) {
              console.error('Error deleting account:', deleteError);
              setError('Failed to delete account');
              closeConfirmationModal();
              return;
            }

            // REMOVE FROM STATE AFTER SUCCESSFUL DELETION
            const newAccounts = accounts.filter((_, i) => i !== index);
            setAccounts(newAccounts.length > 0 ? newAccounts : [{
              id: undefined,
              name: '',
              description: '',
              assignedPortfolios: [],
              portfolioData: {},
              accessMisc: ''
            }]);

            // UPDATE ACTIVE PORTFOLIOS
            const newActivePortfolios = { ...activePortfolios };
            delete newActivePortfolios[index];
            setActivePortfolios(newActivePortfolios);

            closeConfirmationModal();
          } catch (error) {
            console.error('Error deleting account:', error);
            setError('Failed to delete account');
            closeConfirmationModal();
          } finally {
            setIsSubmitting(false);
            setDeletingAccountId(null);
          }
        },
        'danger'
      );
    } else {
      // REMOVE NEW ACCOUNT DIRECTLY (NO CONFIRMATION NEEDED)
      const newAccounts = accounts.filter((_, i) => i !== index);
      setAccounts(newAccounts.length > 0 ? newAccounts : [{
        id: undefined,
        name: '',
        description: '',
        assignedPortfolios: [],
        portfolioData: {},
        accessMisc: ''
      }]);

      // UPDATE ACTIVE PORTFOLIOS
      const newActivePortfolios = { ...activePortfolios };
      delete newActivePortfolios[index];
      setActivePortfolios(newActivePortfolios);
    }
  };

  const updateAccount = (index: number, field: keyof Account, value: any) => {
    const newAccounts = [...accounts];
    newAccounts[index] = { ...newAccounts[index], [field]: value };
    setAccounts(newAccounts);
  };

  const togglePortfolioAssignment = (accountIndex: number, portfolioId: string) => {
    const newAccounts = [...accounts];
    const account = newAccounts[accountIndex];
    const isAssigned = account.assignedPortfolios.includes(portfolioId);
    
    if (isAssigned) {
      account.assignedPortfolios = account.assignedPortfolios.filter(id => id !== portfolioId);
      // Remove portfolio data when unassigned
      delete account.portfolioData[portfolioId];
      
      // If this was the active portfolio, switch to another one
      if (activePortfolios[accountIndex] === portfolioId) {
        const remainingPortfolios = account.assignedPortfolios;
        if (remainingPortfolios.length > 0) {
          setActivePortfolios({
            ...activePortfolios,
            [accountIndex]: remainingPortfolios[0]
          });
        } else {
          // No portfolios left, remove active portfolio
          const newActivePortfolios = { ...activePortfolios };
          delete newActivePortfolios[accountIndex];
          setActivePortfolios(newActivePortfolios);
        }
      }
    } else {
      account.assignedPortfolios = [...account.assignedPortfolios, portfolioId];
      // Initialize empty portfolio data when assigned
      account.portfolioData[portfolioId] = {
        inventory: [],
        instruments: [],
        technicalInfo: ''
      };
      
      // If this is the first portfolio, make it active
      if (account.assignedPortfolios.length === 1) {
        setActivePortfolios({
          ...activePortfolios,
          [accountIndex]: portfolioId
        });
      }
    }
    
    setAccounts(newAccounts);
  };

  const setActivePortfolio = (accountIndex: number, portfolioId: string) => {
    setActivePortfolios({
      ...activePortfolios,
      [accountIndex]: portfolioId
    });
  };

  const updatePortfolioData = (accountIndex: number, portfolioId: string, field: keyof PortfolioData, value: any) => {
    const newAccounts = [...accounts];
    const account = newAccounts[accountIndex];
    if (!account.portfolioData[portfolioId]) {
      account.portfolioData[portfolioId] = {
        inventory: [],
        instruments: [],
        technicalInfo: ''
      };
    }
    account.portfolioData[portfolioId] = { ...account.portfolioData[portfolioId], [field]: value };
    setAccounts(newAccounts);
  };

  const addInventoryItem = (accountIndex: number, portfolioId: string) => {
    const newAccounts = [...accounts];
    const account = newAccounts[accountIndex];
    if (!account.portfolioData[portfolioId]) {
      account.portfolioData[portfolioId] = {
        inventory: [],
        instruments: [],
        technicalInfo: ''
      };
    }
    account.portfolioData[portfolioId].inventory.push({
      id: `temp-${Date.now()}`,
      name: '',
      quantity: 0
    });
    setAccounts(newAccounts);
  };

  const updateInventoryItem = (accountIndex: number, portfolioId: string, itemIndex: number, field: keyof Inventory, value: any) => {
    const newAccounts = [...accounts];
    const account = newAccounts[accountIndex];
    account.portfolioData[portfolioId].inventory[itemIndex] = {
      ...account.portfolioData[portfolioId].inventory[itemIndex],
      [field]: value
    };
    setAccounts(newAccounts);
  };

  const removeInventoryItem = (accountIndex: number, portfolioId: string, itemIndex: number) => {
    const newAccounts = [...accounts];
    const account = newAccounts[accountIndex];
    account.portfolioData[portfolioId].inventory = account.portfolioData[portfolioId].inventory.filter((_, i) => i !== itemIndex);
    setAccounts(newAccounts);
  };

  const addInstrument = (accountIndex: number, portfolioId: string) => {
    const newAccounts = [...accounts];
    const account = newAccounts[accountIndex];
    if (!account.portfolioData[portfolioId]) {
      account.portfolioData[portfolioId] = {
        inventory: [],
        instruments: [],
        technicalInfo: ''
      };
    }
    account.portfolioData[portfolioId].instruments.push({
      id: `temp-${Date.now()}`,
      name: '',
      description: '',
      quantity: null
    });
    setAccounts(newAccounts);
  };

  const updateInstrument = (accountIndex: number, portfolioId: string, itemIndex: number, field: keyof Instrument, value: any) => {
    const newAccounts = [...accounts];
    const account = newAccounts[accountIndex];
    account.portfolioData[portfolioId].instruments[itemIndex] = {
      ...account.portfolioData[portfolioId].instruments[itemIndex],
      [field]: value
    };
    setAccounts(newAccounts);
  };

  const removeInstrument = (accountIndex: number, portfolioId: string, itemIndex: number) => {
    const newAccounts = [...accounts];
    const account = newAccounts[accountIndex];
    account.portfolioData[portfolioId].instruments = account.portfolioData[portfolioId].instruments.filter((_, i) => i !== itemIndex);
    setAccounts(newAccounts);
  };

  const handleInstrumentImageSelect = (accountIndex: number, portfolioId: string, itemIndex: number, file: File) => {
    const newAccounts = [...accounts];
    const account = newAccounts[accountIndex];
    const instrument = account.portfolioData[portfolioId].instruments[itemIndex];
    instrument.imageFile = file;
    instrument.imageName = file.name;
    instrument.imageUrl = URL.createObjectURL(file);
    setAccounts(newAccounts);
  };

  const handleInstrumentImageRemove = (accountIndex: number, portfolioId: string, itemIndex: number) => {
    const newAccounts = [...accounts];
    const account = newAccounts[accountIndex];
    const instrument = account.portfolioData[portfolioId].instruments[itemIndex];
    if (instrument.imageUrl && instrument.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(instrument.imageUrl);
    }
    instrument.imageFile = undefined;
    instrument.imageName = undefined;
    instrument.imageUrl = undefined;
    setAccounts(newAccounts);
  };

  const isFormValid = () => {
    // If no portfolios exist, accounts can't be valid
    if (portfolios.length === 0) return false;
    
    // Check if any account has empty name or no portfolios
    const hasInvalidAccount = accounts.some(account => 
      !account.name.trim() || account.assignedPortfolios.length === 0
    );
    
    if (hasInvalidAccount) return false;
    
    // Check for duplicate names
    const names = accounts.map(a => a.name.trim().toLowerCase());
    const uniqueNames = new Set(names);
    return names.length === uniqueNames.size;
  };

  const validateForm = () => {
    if (portfolios.length === 0) {
      setError('No portfolios available. Create portfolios first before setting up accounts.');
      return false;
    }

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      if (!account.name.trim()) {
        setError(`Account ${i + 1}: Name is required`);
        return false;
      }
      if (account.assignedPortfolios.length === 0) {
        setError(`Account ${i + 1}: At least one portfolio must be assigned`);
        return false;
      }
    }

    // Check for duplicate names
    const names = accounts.map(a => a.name.trim().toLowerCase());
    const uniqueNames = new Set(names);
    if (names.length !== uniqueNames.size) {
      setError('Account names must be unique');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    setError(null);
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Filter out accounts without names
      const validAccounts = accounts.filter((account: any) => account.name.trim());
      
      if (validAccounts.length === 0) {
        setError('No valid accounts to save');
        return;
      }

      // Check if we have any images to upload
      const hasImages = validAccounts.some((account: any) => 
        Object.values(account.portfolioData).some((portfolioData: any) =>
          portfolioData.instruments.some((instrument: any) => instrument.imageFile)
        )
      );

      if (hasImages) {
        // Use FormData for accounts with images
        const formData = new FormData();
        formData.append('teamId', teamId!);
        
        // Prepare accounts data for submission
        const accountsForSubmission = validAccounts.map((account: any) => {
          const portfolioDataForSubmission: any = {};
          
          Object.entries(account.portfolioData).forEach(([portfolioId, portfolioData]: [string, any]) => {
            const instrumentsForSubmission = portfolioData.instruments.map((instrument: any, index: number) => {
              if (instrument.imageFile) {
                // Generate unique key for this image
                const imageKey = `image_${account.id || 'new'}_${portfolioId}_${index}`;
                formData.append(imageKey, instrument.imageFile);
                return {
                  ...instrument,
                  imageFile: undefined, // Remove file object from JSON
                  hasNewImage: true,
                  imageKey: imageKey
                };
              }
              return { ...instrument, hasNewImage: false };
            });

            portfolioDataForSubmission[portfolioId] = {
              inventory: portfolioData.inventory,
              instruments: instrumentsForSubmission,
              technicalInfo: portfolioData.technicalInfo
            };
          });

          return {
            id: account.id,
            name: account.name.trim(),
            description: account.description?.trim() || '',
            assignedPortfolios: account.assignedPortfolios,
            portfolioData: portfolioDataForSubmission,
            accessMisc: account.accessMisc?.trim() || ''
          };
        });

        formData.append('accounts', JSON.stringify(accountsForSubmission));

        // Call API with FormData
        const response = await fetch('/api/teams/accounts/update', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to save accounts');
        }
      } else {
        // Use JSON for accounts without images
        const accountsForSubmission = validAccounts.map(account => ({
          id: account.id,
          name: account.name.trim(),
          description: account.description?.trim() || '',
          assignedPortfolios: account.assignedPortfolios,
          portfolioData: account.portfolioData,
          accessMisc: account.accessMisc?.trim() || ''
        }));

        // Call API with JSON
        const response = await fetch('/api/teams/accounts/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            teamId: teamId!,
            accounts: accountsForSubmission
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to save accounts');
        }
      }

      // Redirect to general knowledge editing
      router.push(`/launcher/team?teamId=${teamId}`);

    } catch (error) {
      console.error('Error updating accounts:', error);
      setError(error instanceof Error ? error.message : 'Failed to update accounts');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add toggle function for expanding/collapsing account details
  const toggleAccountDetails = (accountId: string | undefined, accountIndex: number) => {
    const key = accountId || `new-${accountIndex}`;
    const newExpanded = new Set(expandedAccounts);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedAccounts(newExpanded);
  };

  // Helper function to count knowledge items for an account
  const getKnowledgeItemCount = (account: Account) => {
    let count = 0;
    Object.values(account.portfolioData).forEach(portfolioData => {
      count += portfolioData.inventory.length;
      count += portfolioData.instruments.length;
      if (portfolioData.technicalInfo.trim()) count += 1;
    });
    if (account.accessMisc.trim()) count += 1;
    return count;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Loading...</h1>
          <p className="text-slate-400">Loading accounts...</p>
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

  if (!user || !teamId || !team) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Loading...</h1>
          <p className="text-slate-400">Loading team data...</p>
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
        showBackButton={true}
        onBackClick={handleSubmit}
        backText={isSubmitting ? 'SAVING...' : 'SAVE'}
        backButtonDisabled={isSubmitting || !isFormValid() || deletingAccountId !== null}
      />

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-md">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* No Portfolios Warning */}
        {portfolios.length === 0 && (
          <div className="mb-6 p-4 bg-amber-900/30 border border-amber-700 rounded-md">
            <div className="flex items-start space-x-3">
              <svg className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-amber-200 text-sm font-medium mb-1">No Portfolios Available</h3>
                <p className="text-amber-300 text-sm leading-relaxed mb-3">
                  You need to create portfolios before you can assign them to accounts. Accounts can be assigned to multiple portfolios to organize your knowledge.
                </p>
                <button
                  onClick={() => router.push(`/edit/portfolios?teamId=${teamId}`)}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Create Portfolios
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {accounts.map((account, accountIndex) => (
            <div key={accountIndex} className="bg-slate-800 rounded-lg border border-slate-700">
              {/* Collapsible Header */}
              <div className="p-6 pb-4">
                <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => toggleAccountDetails(account.id, accountIndex)}
                    className="flex items-center gap-3 flex-1 text-left hover:bg-slate-700/50 p-3 rounded-md transition-colors"
                >
                    <h3 className="text-lg font-semibold text-slate-100">
                      {account.name || `New Account ${accountIndex + 1}`}
                    </h3>
                    {account.name && (
                      <span className="text-sm text-slate-400 bg-slate-700 px-2 py-1 rounded-full">
                        {getKnowledgeItemCount(account)} knowledge item{getKnowledgeItemCount(account) !== 1 ? 's' : ''}
                      </span>
                    )}
                    {account.assignedPortfolios.length > 0 && (
                      <span className="text-xs text-slate-500 bg-slate-600 px-2 py-1 rounded-full">
                        {account.assignedPortfolios.length} portfolio{account.assignedPortfolios.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {expandedAccounts.has(account.id || `new-${accountIndex}`) ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 ml-auto" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 ml-auto" />
                    )}
                  </button>
                    <button
                      onClick={() => removeAccount(accountIndex)}
                      disabled={deletingAccountId === account.id || isSubmitting}
                      className={`font-medium transition-colors flex items-center gap-2 ${
                        deletingAccountId === account.id || isSubmitting
                          ? 'text-slate-500 cursor-not-allowed'
                          : 'text-red-400 hover:text-red-300'
                      }`}
                    >
                      {deletingAccountId === account.id ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Deleting...
                        </>
                      ) : (
                        'Delete Account'
                      )}
                    </button>
                  </div>
              </div>

              {/* Collapsible Content */}
              {expandedAccounts.has(account.id || `new-${accountIndex}`) && (
                <div className="px-6 pb-6 transition-all duration-200 ease-in-out">

              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Account Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={account.name}
                    onChange={(e) => updateAccount(accountIndex, 'name', e.target.value)}
                    placeholder="e.g., St. Mary's Hospital, Downtown Surgery Center"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Description <span className="text-slate-500">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={account.description}
                    onChange={(e) => updateAccount(accountIndex, 'description', e.target.value)}
                    placeholder="Brief description of this account"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Portfolio Assignment */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Assigned Portfolios <span className="text-red-400">*</span>
                </label>
                {portfolios.length === 0 ? (
                  <div className="p-4 bg-slate-700 rounded-md border border-slate-600">
                    <p className="text-slate-400 text-sm mb-3">
                      No portfolios available. Create portfolios first to assign them to accounts.
                    </p>
                    <button
                      onClick={() => router.push(`/edit/portfolios?teamId=${teamId}`)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      Create Portfolios
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {portfolios.map((portfolio) => (
                      <div
                        key={portfolio.id}
                        onClick={() => togglePortfolioAssignment(accountIndex, portfolio.id)}
                        className={`p-3 rounded-md cursor-pointer border-2 transition-colors ${
                          account.assignedPortfolios.includes(portfolio.id)
                            ? 'border-blue-500 bg-blue-900/20 text-blue-300'
                            : 'border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <div className="font-medium">{portfolio.name}</div>
                        {portfolio.description && (
                          <div className="text-sm opacity-80">{portfolio.description}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Portfolio Tabs and Data */}
              {account.assignedPortfolios.length > 0 && (
                <div className="space-y-6">
                  {/* Portfolio Tabs */}
                  <div className="flex border-b border-slate-700">
                    {account.assignedPortfolios.map(portfolioId => {
                      const portfolio = portfolios.find(p => p.id === portfolioId);
                      const isActive = activePortfolios[accountIndex] === portfolioId;
                      
                      return (
                        <button
                          key={portfolioId}
                          onClick={() => setActivePortfolio(accountIndex, portfolioId)}
                          className={`px-4 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-slate-600 text-slate-100 border-b-2 border-slate-400'
                              : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {portfolio?.name}
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Portfolio Data */}
                  {activePortfolios[accountIndex] && (() => {
                    const activePortfolioId = activePortfolios[accountIndex];
                    const portfolio = portfolios.find(p => p.id === activePortfolioId);
                    const portfolioData = account.portfolioData[activePortfolioId] || {
                      inventory: [],
                      instruments: [],
                      technicalInfo: ''
                    };

                    return (
                      <div className="border border-slate-600 rounded-lg p-4">
                        <h4 className="text-lg font-semibold text-slate-100 mb-4">
                          {portfolio?.name} Portfolio
                        </h4>

                        {/* Inventory Section */}
                        <div className="mb-6">
                          <div className="flex justify-between items-center mb-3">
                            <h5 className="text-md font-medium text-slate-100">Inventory</h5>
                            <button
                              onClick={() => addInventoryItem(accountIndex, activePortfolioId)}
                              className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1 rounded text-sm"
                            >
                              + Add Item
                            </button>
                          </div>
                          
                          {portfolioData.inventory.length === 0 ? (
                            <p className="text-slate-400 text-sm italic">No inventory items yet</p>
                          ) : (
                            <div className="space-y-2">
                              {portfolioData.inventory.map((item, itemIndex) => (
                                <div key={item.id} className="flex gap-3 items-center p-3 bg-slate-700 rounded">
                                  <input
                                    type="text"
                                    value={item.name}
                                    onChange={(e) => updateInventoryItem(accountIndex, activePortfolioId, itemIndex, 'name', e.target.value)}
                                    placeholder="Item name"
                                    className="flex-1 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                  <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => updateInventoryItem(accountIndex, activePortfolioId, itemIndex, 'quantity', parseInt(e.target.value) || 0)}
                                    placeholder="Qty"
                                    className="w-20 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                  <button
                                    onClick={() => removeInventoryItem(accountIndex, activePortfolioId, itemIndex)}
                                    className="text-red-400 hover:text-red-300"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Instruments Section */}
                        <div className="mb-6">
                          <div className="flex justify-between items-center mb-3">
                            <h5 className="text-md font-medium text-slate-100">Instruments/Trays</h5>
                            <button
                              onClick={() => addInstrument(accountIndex, activePortfolioId)}
                              className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1 rounded text-sm"
                            >
                              + Add Instrument
                            </button>
                          </div>
                          
                          {portfolioData.instruments.length === 0 ? (
                            <p className="text-slate-400 text-sm italic">No instruments yet</p>
                          ) : (
                            <div className="space-y-4">
                              {portfolioData.instruments.map((instrument, itemIndex) => (
                                <div key={instrument.id} className="p-4 bg-slate-700 rounded border border-slate-600">
                                  <div className="flex justify-between items-start mb-3">
                                    <h6 className="text-slate-200 font-medium">Instrument {itemIndex + 1}</h6>
                                    <button
                                      onClick={() => removeInstrument(accountIndex, activePortfolioId, itemIndex)}
                                      className="text-red-400 hover:text-red-300"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <input
                                      type="text"
                                      value={instrument.name}
                                      onChange={(e) => updateInstrument(accountIndex, activePortfolioId, itemIndex, 'name', e.target.value)}
                                      placeholder="Instrument/Tray name"
                                      className="px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                    <input
                                      type="text"
                                      value={instrument.description}
                                      onChange={(e) => updateInstrument(accountIndex, activePortfolioId, itemIndex, 'description', e.target.value)}
                                      placeholder="Description"
                                      className="px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                      Quantity <span className="text-slate-500">(Optional)</span>
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={instrument.quantity !== null && instrument.quantity !== undefined ? instrument.quantity : ''}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        if (value === '') {
                                          updateInstrument(accountIndex, activePortfolioId, itemIndex, 'quantity', null);
                                        } else {
                                          const numValue = parseInt(value);
                                          if (!isNaN(numValue) && numValue >= 0) {
                                            updateInstrument(accountIndex, activePortfolioId, itemIndex, 'quantity', numValue);
                                          }
                                        }
                                      }}
                                      placeholder="e.g., 10"
                                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                      Instrument Image <span className="text-slate-500">(Optional)</span>
                                    </label>
                                    <ImageUpload
                                      onImageSelect={(file) => handleInstrumentImageSelect(accountIndex, activePortfolioId, itemIndex, file)}
                                      onImageRemove={() => handleInstrumentImageRemove(accountIndex, activePortfolioId, itemIndex)}
                                      currentImageUrl={instrument.imageUrl}
                                      currentImageName={instrument.imageName}
                                      placeholder="Upload instrument/tray image"
                                      className="w-full"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Technical Information */}
                        <div className="mb-6">
                          <label className="block text-sm font-medium text-slate-300 mb-2">
                            Technical Information <span className="text-slate-500">(Optional)</span>
                          </label>
                          <textarea
                            value={portfolioData.technicalInfo}
                            onChange={(e) => updatePortfolioData(accountIndex, activePortfolioId, 'technicalInfo', e.target.value)}
                            placeholder="Technical details, specifications, protocols, etc."
                            rows={4}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Access & Miscellaneous (Account-level) */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Access & Miscellaneous <span className="text-slate-500">(Optional)</span>
                </label>
                <textarea
                  value={account.accessMisc}
                  onChange={(e) => updateAccount(accountIndex, 'accessMisc', e.target.value)}
                  placeholder="Parking instructions, door codes, vendor credentialing, facility access notes, etc."
                  rows={4}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-slate-500 text-sm mt-2">
                  Include any information specific to this account, such as facility access, parking, protocols, etc.
                </p>
              </div>
                </div>
              )}
            </div>
          ))}

          {/* Add Account Button */}
          <div className="text-center">
            <button
              onClick={addAccount}
              disabled={deletingAccountId !== null}
              className="w-full bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-slate-100 px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="flex-1 text-center">Add Another Account</span>
            </button>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !isFormValid() || deletingAccountId !== null}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
            >
              <Save className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 text-center">
                {isSubmitting ? 'Saving Changes...' : deletingAccountId ? 'Deleting Account...' : 'Save Changes'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* CONFIRMATION MODAL */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={closeConfirmationModal}
        onConfirm={confirmationModal.onConfirm}
        title={confirmationModal.title}
        message={confirmationModal.message}
        variant={confirmationModal.variant}
        isLoading={isSubmitting}
        loadingText="Deleting account..."
      />
    </div>
  );
}

export default function EditAccountsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EditAccountsContent />
    </Suspense>
  );
} 