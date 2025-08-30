"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import ImageUpload from "../../components/ImageUpload";
import StandardHeader from "../../components/StandardHeader";
import { Save, ChevronDown, ChevronRight } from "lucide-react";

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

interface Account {
  id?: string;
  name: string;
  description: string;
  assignedPortfolios: string[];
  inventory: Inventory[];
  instruments: Instrument[];
  technicalInfo: string;
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
  // Add state for managing expanded accounts
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

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
      // Verify user is a manager of this team
      const { data: membership, error: membershipError } = await supabase
        .from('team_members')
        .select('role')
        .eq('team_id', teamId)
        .eq('user_id', user?.id)
        .eq('status', 'active')
        .single();

      if (membershipError || !membership || membership.role !== 'manager') {
        setError('Manager access required');
        return;
      }
      
      setUserRole(membership.role);

      // Load team info
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

      // Load portfolios
      const { data: portfoliosData, error: portfoliosError } = await supabase
        .from('team_portfolios')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at');

      if (portfoliosError) {
        console.error('Error loading portfolios:', portfoliosError);
        setError('Failed to load portfolios');
        return;
      }
      setPortfolios(portfoliosData || []);

      // Load existing accounts and their knowledge
      const { data: accountsData, error: accountsError } = await supabase
        .from('team_accounts')
        .select(`
          *,
          account_portfolios (portfolio_id),
          team_knowledge!team_knowledge_account_id_fkey (*)
        `)
        .eq('team_id', teamId)
        .order('created_at');

      if (accountsError) {
        console.error('Error loading accounts:', accountsError);
        setError('Failed to load existing accounts');
        return;
      }

      // Transform data for editing
      const transformedAccounts = accountsData?.map(account => {
        // Get account-level knowledge (portfolio_id = null)
        const accountKnowledge = account.team_knowledge?.filter((k: any) => k.portfolio_id === null) || [];
        
        // Extract inventory from any portfolio (we'll keep inventory portfolio-specific for now)
        const allKnowledge = account.team_knowledge || [];
        
        const inventory = allKnowledge
          .filter((k: any) => k.category === 'inventory')
          .map((k: any) => ({
            id: k.id,
            name: k.metadata?.name || k.title || '',
            quantity: k.metadata?.quantity || 0
          }));

        // Extract instruments from account-level knowledge only
        const instruments = accountKnowledge
          .filter((k: any) => k.category === 'instruments')
          .map((k: any) => ({
            id: k.id,
            name: k.metadata?.name || k.title || '',
            description: k.metadata?.description || k.content || '',
            imageUrl: k.metadata?.image_url || '',
            imageName: k.metadata?.image_name || '',
            quantity: k.metadata?.quantity ?? null
          }));

        // Extract technical info from account-level knowledge
        const techKnowledge = accountKnowledge.find((k: any) => k.category === 'technical');
        const technicalInfo = techKnowledge?.content || techKnowledge?.metadata?.content || '';

        // Extract access misc info from account-level knowledge
        const accessKnowledge = accountKnowledge.find((k: any) => k.category === 'access_misc');
        const accessMisc = accessKnowledge?.content || accessKnowledge?.metadata?.content || '';

        return {
          id: account.id,
          name: account.name,
          description: account.description || '',
          assignedPortfolios: account.account_portfolios?.map((ap: any) => ap.portfolio_id) || [],
          inventory,
          instruments,
          technicalInfo,
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
          inventory: [],
          instruments: [],
          technicalInfo: '',
          accessMisc: ''
        });
      }

      setAccounts(transformedAccounts);

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
      inventory: [],
      instruments: [],
      technicalInfo: '',
      accessMisc: ''
    }]);
  };

  const removeAccount = async (index: number) => {
    const account = accounts[index];
    
    if (account.id) {
      if (!confirm(`Are you sure you want to delete "${account.name}"? This will remove all associated knowledge.`)) {
        return;
      }

      try {
        // Delete from database
        const { error: deleteError } = await supabase
          .from('team_accounts')
          .delete()
          .eq('id', account.id);

        if (deleteError) {
          console.error('Error deleting account:', deleteError);
          setError('Failed to delete account');
          return;
        }
      } catch (error) {
        console.error('Error deleting account:', error);
        setError('Failed to delete account');
        return;
      }
    }

    // Remove from state
    const newAccounts = accounts.filter((_, i) => i !== index);
    setAccounts(newAccounts.length > 0 ? newAccounts : [{
      id: undefined,
      name: '',
      description: '',
      assignedPortfolios: [],
      inventory: [],
      instruments: [],
      technicalInfo: '',
      accessMisc: ''
    }]);
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
    } else {
      account.assignedPortfolios = [...account.assignedPortfolios, portfolioId];
    }
    
    setAccounts(newAccounts);
  };

  const addInventoryItem = (accountIndex: number) => {
    const newAccounts = [...accounts];
    newAccounts[accountIndex].inventory.push({
      id: `temp-${Date.now()}`,
      name: '',
      quantity: 0
    });
    setAccounts(newAccounts);
  };

  const updateInventoryItem = (accountIndex: number, itemIndex: number, field: keyof Inventory, value: any) => {
    const newAccounts = [...accounts];
    newAccounts[accountIndex].inventory[itemIndex] = {
      ...newAccounts[accountIndex].inventory[itemIndex],
      [field]: value
    };
    setAccounts(newAccounts);
  };

  const removeInventoryItem = (accountIndex: number, itemIndex: number) => {
    const newAccounts = [...accounts];
    newAccounts[accountIndex].inventory = newAccounts[accountIndex].inventory.filter((_, i) => i !== itemIndex);
    setAccounts(newAccounts);
  };

  const addInstrument = (accountIndex: number) => {
    const newAccounts = [...accounts];
    newAccounts[accountIndex].instruments.push({
      id: `temp-${Date.now()}`,
      name: '',
      description: '',
      quantity: null
    });
    setAccounts(newAccounts);
  };

  const updateInstrument = (accountIndex: number, itemIndex: number, field: keyof Instrument, value: any) => {
    const newAccounts = [...accounts];
    newAccounts[accountIndex].instruments[itemIndex] = {
      ...newAccounts[accountIndex].instruments[itemIndex],
      [field]: value
    };
    setAccounts(newAccounts);
  };

  const removeInstrument = (accountIndex: number, itemIndex: number) => {
    const newAccounts = [...accounts];
    newAccounts[accountIndex].instruments = newAccounts[accountIndex].instruments.filter((_, i) => i !== itemIndex);
    setAccounts(newAccounts);
  };

  const handleInstrumentImageSelect = (accountIndex: number, itemIndex: number, file: File) => {
    const newAccounts = [...accounts];
    const instrument = newAccounts[accountIndex].instruments[itemIndex];
    instrument.imageFile = file;
    instrument.imageName = file.name;
    instrument.imageUrl = URL.createObjectURL(file);
    setAccounts(newAccounts);
  };

  const handleInstrumentImageRemove = (accountIndex: number, itemIndex: number) => {
    const newAccounts = [...accounts];
    const instrument = newAccounts[accountIndex].instruments[itemIndex];
    if (instrument.imageUrl && instrument.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(instrument.imageUrl);
    }
    instrument.imageFile = undefined;
    instrument.imageName = undefined;
    instrument.imageUrl = undefined;
    setAccounts(newAccounts);
  };

  const isFormValid = () => {
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
         account.instruments.some((instrument: any) => instrument.imageFile)
       );

      if (hasImages) {
        // Use FormData for accounts with images
        const formData = new FormData();
        formData.append('teamId', teamId!);
        
                 // Prepare accounts data for submission
         const accountsForSubmission = validAccounts.map((account: any) => {
          const instrumentsForSubmission = account.instruments.map((instrument: any, index: number) => {
            if (instrument.imageFile) {
              // Generate unique key for this image
              const imageKey = `image_${account.id || 'new'}_${index}`;
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

          return {
            id: account.id,
            name: account.name.trim(),
            description: account.description?.trim() || '',
            assignedPortfolios: account.assignedPortfolios,
            inventory: account.inventory,
            instruments: instrumentsForSubmission,
            technicalInfo: account.technicalInfo?.trim() || '',
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
          inventory: account.inventory,
          instruments: account.instruments.map((instrument: any) => ({
            ...instrument,
            imageFile: undefined // Remove file object
          })),
          technicalInfo: account.technicalInfo?.trim() || '',
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
    count += account.inventory.length;
    count += account.instruments.length;
    if (account.technicalInfo.trim()) count += 1;
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

  if (!user || !teamId || !team || portfolios.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">No Portfolios Found</h1>
          <p className="text-slate-400 mb-6">You need to create portfolios before setting up accounts.</p>
          <button
            onClick={() => router.push(`/edit/portfolios?teamId=${teamId}`)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
          >
            Go to Portfolios
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
        showBackButton={true}
        onBackClick={handleSubmit}
        backText={isSubmitting ? 'SAVING...' : 'SAVE'}
        backButtonDisabled={isSubmitting || !isFormValid()}
      />

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-md">
            <p className="text-red-400 text-sm">{error}</p>
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
                    className="text-red-400 hover:text-red-300 font-medium text-sm px-2 py-1 rounded hover:bg-red-900/20 transition-colors ml-2"
                    >
                      Delete
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
              </div>

              {/* Inventory Section */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-md font-medium text-slate-100">Inventory</h4>
                  <button
                    onClick={() => addInventoryItem(accountIndex)}
                    className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1 rounded text-sm"
                  >
                    + Add Item
                  </button>
                </div>
                
                {account.inventory.length === 0 ? (
                  <p className="text-slate-400 text-sm italic">No inventory items yet</p>
                ) : (
                  <div className="space-y-2">
                    {account.inventory.map((item, itemIndex) => (
                      <div key={item.id} className="flex gap-3 items-center p-3 bg-slate-700 rounded">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateInventoryItem(accountIndex, itemIndex, 'name', e.target.value)}
                          placeholder="Item name"
                          className="flex-1 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateInventoryItem(accountIndex, itemIndex, 'quantity', parseInt(e.target.value) || 0)}
                          placeholder="Qty"
                          className="w-20 px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => removeInventoryItem(accountIndex, itemIndex)}
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
                  <h4 className="text-md font-medium text-slate-100">Instruments/Trays</h4>
                  <button
                    onClick={() => addInstrument(accountIndex)}
                    className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1 rounded text-sm"
                  >
                    + Add Instrument
                  </button>
                </div>
                
                {account.instruments.length === 0 ? (
                  <p className="text-slate-400 text-sm italic">No instruments yet</p>
                ) : (
                  <div className="space-y-4">
                    {account.instruments.map((instrument, itemIndex) => (
                      <div key={instrument.id} className="p-4 bg-slate-700 rounded border border-slate-600">
                        <div className="flex justify-between items-start mb-3">
                          <h5 className="text-slate-200 font-medium">Instrument {itemIndex + 1}</h5>
                          <button
                            onClick={() => removeInstrument(accountIndex, itemIndex)}
                            className="text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <input
                            type="text"
                            value={instrument.name}
                            onChange={(e) => updateInstrument(accountIndex, itemIndex, 'name', e.target.value)}
                            placeholder="Instrument/Tray name"
                            className="px-3 py-2 bg-slate-600 border border-slate-500 rounded text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <input
                            type="text"
                            value={instrument.description}
                            onChange={(e) => updateInstrument(accountIndex, itemIndex, 'description', e.target.value)}
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
                                updateInstrument(accountIndex, itemIndex, 'quantity', null);
                              } else {
                                const numValue = parseInt(value);
                                if (!isNaN(numValue) && numValue >= 0) {
                                  updateInstrument(accountIndex, itemIndex, 'quantity', numValue);
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
                            onImageSelect={(file) => handleInstrumentImageSelect(accountIndex, itemIndex, file)}
                            onImageRemove={() => handleInstrumentImageRemove(accountIndex, itemIndex)}
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
                  value={account.technicalInfo}
                  onChange={(e) => updateAccount(accountIndex, 'technicalInfo', e.target.value)}
                  placeholder="Technical details, specifications, protocols, etc."
                  rows={4}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Access & Miscellaneous */}
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
              className="w-full bg-slate-700 hover:bg-slate-600 text-slate-100 px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
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
              disabled={isSubmitting || !isFormValid()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
            >
              <Save className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 text-center">{isSubmitting ? 'Saving Changes...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
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