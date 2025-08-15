"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import ImageUpload from "../../components/ImageUpload";

interface Portfolio {
  id: string;
  name: string;
  description: string;
}

interface Account {
  id?: string;
  name: string;
  description: string;
  assignedPortfolios: string[]; // Array of portfolio IDs
  knowledge: {
    [portfolioId: string]: {
      inventory: Array<{ item: string; quantity: number; notes: string }>;
      instruments: Array<{ name: string; description: string; imageFile?: File; imageUrl?: string; imageName?: string }>;
      technical: Array<{ title: string; content: string }>;
    };
  };
}

export default function AccountsSetupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');
  const supabase = createClient();

  const [team, setTeam] = useState<any>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([
    { name: '', description: '', assignedPortfolios: [], knowledge: {} }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAccountIndex, setActiveAccountIndex] = useState(0);
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (!teamId) {
      router.push("/setup/team");
    } else if (user && teamId) {
      loadTeamData();
    }
  }, [user, loading, teamId, router]);

  const loadTeamData = async () => {
    try {
      // Load team info
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .eq('created_by', user?.id)
        .single();

      if (teamError || !teamData) {
        router.push("/setup/team");
        return;
      }
      setTeam(teamData);

      // Load portfolios created for this team
      const { data: portfoliosData, error: portfoliosError } = await supabase
        .from('team_portfolios')
        .select('id, name, description')
        .eq('team_id', teamId)
        .order('created_at', { ascending: true });

      if (portfoliosError) {
        setError('Failed to load portfolios');
        return;
      }

      if (!portfoliosData || portfoliosData.length === 0) {
        router.push(`/setup/portfolios?teamId=${teamId}`);
        return;
      }

      setPortfolios(portfoliosData);
      setActivePortfolioId(portfoliosData[0].id);

    } catch (error) {
      console.error('Error loading team data:', error);
      setError('Failed to load team information');
    }
  };

  const addAccount = () => {
    setAccounts([...accounts, { name: '', description: '', assignedPortfolios: [], knowledge: {} }]);
  };

  const removeAccount = (index: number) => {
    if (accounts.length > 1) {
      const newAccounts = accounts.filter((_, i) => i !== index);
      setAccounts(newAccounts);
      if (activeAccountIndex >= newAccounts.length) {
        setActiveAccountIndex(newAccounts.length - 1);
      }
    }
  };

  const updateAccount = (index: number, field: keyof Account, value: any) => {
    console.log('updateAccount called:', { index, field, value });
    const newAccounts = [...accounts];
    newAccounts[index] = { ...newAccounts[index], [field]: value };
    console.log('Updated account:', newAccounts[index]);
    setAccounts(newAccounts);
    console.log('State updated, new accounts:', newAccounts);
  };

  const togglePortfolioAssignment = (accountIndex: number, portfolioId: string) => {
    console.log('Toggle portfolio assignment:', { accountIndex, portfolioId });
    const account = accounts[accountIndex];
    const isAssigned = account.assignedPortfolios.includes(portfolioId);
    console.log('Current state:', { isAssigned, currentPortfolios: account.assignedPortfolios });
    
    const newAssignedPortfolios = isAssigned
      ? account.assignedPortfolios.filter(id => id !== portfolioId)
      : [...account.assignedPortfolios, portfolioId];

    console.log('New portfolios:', newAssignedPortfolios);

    // Prepare updated account with both portfolio assignment and knowledge
    const newAccounts = [...accounts];
    let updatedAccount = { ...account, assignedPortfolios: newAssignedPortfolios };

    // Initialize knowledge structure for newly assigned portfolio
    if (!isAssigned) {
      const newKnowledge = { ...account.knowledge };
      if (!newKnowledge[portfolioId]) {
        newKnowledge[portfolioId] = {
          inventory: [],
          instruments: [],
          technical: []
        };
      }
      updatedAccount.knowledge = newKnowledge;
    }

    newAccounts[accountIndex] = updatedAccount;
    setAccounts(newAccounts);
    console.log('Final updated account:', updatedAccount);
  };

  const addKnowledgeItem = (accountIndex: number, portfolioId: string, type: 'inventory' | 'instruments' | 'technical') => {
    const account = accounts[accountIndex];
    const newKnowledge = { ...account.knowledge };
    
    if (!newKnowledge[portfolioId]) {
      newKnowledge[portfolioId] = { inventory: [], instruments: [], technical: [] };
    }

    const newItem = type === 'inventory' 
      ? { item: '', quantity: 0, notes: '' }
      : type === 'instruments'
      ? { name: '', description: '', imageFile: undefined, imageUrl: '', imageName: '' }
      : { title: '', content: '' };

    newKnowledge[portfolioId][type].push(newItem);
    updateAccount(accountIndex, 'knowledge', newKnowledge);
  };

  const updateKnowledgeItem = (accountIndex: number, portfolioId: string, type: 'inventory' | 'instruments' | 'technical', itemIndex: number, field: string, value: any) => {
    const account = accounts[accountIndex];
    const newKnowledge = { ...account.knowledge };
    newKnowledge[portfolioId][type][itemIndex] = {
      ...newKnowledge[portfolioId][type][itemIndex],
      [field]: value
    };
    updateAccount(accountIndex, 'knowledge', newKnowledge);
  };

  const removeKnowledgeItem = (accountIndex: number, portfolioId: string, type: 'inventory' | 'instruments' | 'technical', itemIndex: number) => {
    const account = accounts[accountIndex];
    const newKnowledge = { ...account.knowledge };
    newKnowledge[portfolioId][type] = newKnowledge[portfolioId][type].filter((_, i) => i !== itemIndex);
    updateAccount(accountIndex, 'knowledge', newKnowledge);
  };

  const handleInstrumentImageSelect = (accountIndex: number, portfolioId: string, itemIndex: number, file: File) => {
    // Create preview URL for immediate display
    const previewUrl = URL.createObjectURL(file);
    
    updateKnowledgeItem(accountIndex, portfolioId, 'instruments', itemIndex, 'imageFile', file);
    updateKnowledgeItem(accountIndex, portfolioId, 'instruments', itemIndex, 'imageUrl', previewUrl);
    updateKnowledgeItem(accountIndex, portfolioId, 'instruments', itemIndex, 'imageName', file.name);
  };

  const handleInstrumentImageRemove = (accountIndex: number, portfolioId: string, itemIndex: number) => {
    // Clean up preview URL if it exists
    const currentItem = accounts[accountIndex]?.knowledge[portfolioId]?.instruments[itemIndex];
    if (currentItem?.imageUrl && currentItem.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(currentItem.imageUrl);
    }
    
    updateKnowledgeItem(accountIndex, portfolioId, 'instruments', itemIndex, 'imageFile', undefined);
    updateKnowledgeItem(accountIndex, portfolioId, 'instruments', itemIndex, 'imageUrl', '');
    updateKnowledgeItem(accountIndex, portfolioId, 'instruments', itemIndex, 'imageName', '');
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

    // Check for duplicate account names
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
      // Check if any accounts have image files
      const hasImages = accounts.some(account => 
        Object.values(account.knowledge).some(knowledge =>
          knowledge.instruments.some(instrument => instrument.imageFile)
        )
      );

      let response;

      if (hasImages) {
        // Use FormData for multipart upload with images
        const formData = new FormData();
        formData.append('teamId', teamId!);
        
        // Prepare accounts data without image files for JSON serialization
        const accountsForJson = accounts.map(a => ({
          name: a.name.trim(),
          description: a.description.trim(),
          assignedPortfolios: a.assignedPortfolios,
          knowledge: Object.fromEntries(
            Object.entries(a.knowledge).map(([portfolioId, knowledge]) => [
              portfolioId,
              {
                ...knowledge,
                instruments: knowledge.instruments.map(({ imageFile, ...rest }) => rest)
              }
            ])
          )
        }));
        
        formData.append('accounts', JSON.stringify(accountsForJson));

        // Add image files
        accounts.forEach((account, accountIndex) => {
          Object.entries(account.knowledge).forEach(([portfolioId, knowledge]) => {
            knowledge.instruments.forEach((instrument, instrumentIndex) => {
              if (instrument.imageFile) {
                const key = `image_${accountIndex}_${portfolioId}_${instrumentIndex}`;
                formData.append(key, instrument.imageFile);
              }
            });
          });
        });

        response = await fetch('/api/teams/accounts/create', {
          method: 'POST',
          body: formData,
        });
      } else {
        // Use JSON for simple data without images
        response = await fetch('/api/teams/accounts/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            teamId,
            accounts: accounts.map(a => ({
              name: a.name.trim(),
              description: a.description.trim(),
              assignedPortfolios: a.assignedPortfolios,
              knowledge: a.knowledge
            }))
          }),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create accounts');
      }

      // Redirect to general knowledge setup
      router.push(`/setup/general?teamId=${teamId}`);

    } catch (error) {
      console.error('Error creating accounts:', error);
      setError(error instanceof Error ? error.message : 'Failed to create accounts');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Loading...</h1>
          <p className="text-slate-400">Preparing account setup...</p>
        </div>
      </div>
    );
  }

  if (!user || !teamId || !team) {
    return null;
  }

  const activeAccount = accounts[activeAccountIndex];
  const assignedPortfoliosForActiveAccount = portfolios.filter(p => 
    activeAccount?.assignedPortfolios.includes(p.id)
  );

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-slate-100">Create Accounts & Team Knowledge</h1>
            <p className="text-slate-400 mt-1">
              Set up accounts for <strong>{team.name}</strong> and define team knowledge for each portfolio
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-md">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Sidebar - Account List */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-slate-100">Accounts</h3>
                <button
                  onClick={addAccount}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                >
                  + Add Account
                </button>
              </div>

              <div className="space-y-2">
                {accounts.map((account, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-md border cursor-pointer transition-colors ${
                      index === activeAccountIndex
                        ? 'border-blue-500 bg-blue-900/20'
                        : 'border-slate-600 hover:border-slate-500'
                    }`}
                    onClick={() => setActiveAccountIndex(index)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-slate-100 font-medium">
                          {account.name || `Account ${index + 1}`}
                        </p>
                        <p className="text-slate-400 text-sm">
                          {account.assignedPortfolios.length} portfolio(s) assigned
                        </p>
                      </div>
                      {accounts.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAccount(index);
                          }}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Content - Account Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Account Basic Info */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-slate-100 mb-4">
                Account {activeAccountIndex + 1} Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Account Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={activeAccount?.name || ''}
                    onChange={(e) => updateAccount(activeAccountIndex, 'name', e.target.value)}
                    placeholder="e.g., Mercy Hospital, St. Mary's Surgery Center"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Description <span className="text-slate-500">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={activeAccount?.description || ''}
                    onChange={(e) => updateAccount(activeAccountIndex, 'description', e.target.value)}
                    placeholder="Brief description or notes"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Portfolio Assignment */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-slate-100 mb-4">
                Assign Portfolios to {activeAccount?.name || 'Account'}
              </h3>
              <p className="text-slate-400 text-sm mb-4">
                Select which portfolios are used at this account:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {portfolios.map((portfolio) => (
                  <label key={portfolio.id} className="flex items-center space-x-3 p-3 border border-slate-600 rounded-md hover:border-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeAccount?.assignedPortfolios.includes(portfolio.id) || false}
                      onChange={() => togglePortfolioAssignment(activeAccountIndex, portfolio.id)}
                      className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-500 rounded focus:ring-blue-500 focus:ring-2"
                    />
                    <div>
                      <p className="text-slate-100 font-medium">{portfolio.name}</p>
                      {portfolio.description && (
                        <p className="text-slate-400 text-sm">{portfolio.description}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Knowledge Management for Assigned Portfolios */}
            {assignedPortfoliosForActiveAccount.length > 0 && (
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-slate-100 mb-4">
                  Team Knowledge for {activeAccount?.name || 'Account'}
                </h3>

                {/* Portfolio Tabs */}
                <div className="border-b border-slate-600 mb-6">
                  <nav className="-mb-px flex space-x-8">
                    {assignedPortfoliosForActiveAccount.map((portfolio) => (
                      <button
                        key={portfolio.id}
                        onClick={() => setActivePortfolioId(portfolio.id)}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                          activePortfolioId === portfolio.id
                            ? 'border-blue-500 text-blue-400'
                            : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-300'
                        }`}
                      >
                        {portfolio.name}
                      </button>
                    ))}
                  </nav>
                </div>

                {/* Knowledge Forms for Active Portfolio */}
                {activePortfolioId && (
                  <div className="space-y-6">
                    {/* Inventory Section */}
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-md font-medium text-slate-100">Inventory</h4>
                        <button
                          onClick={() => addKnowledgeItem(activeAccountIndex, activePortfolioId, 'inventory')}
                          className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1 rounded text-sm"
                        >
                          + Add Item
                        </button>
                      </div>
                      <div className="space-y-3">
                        {(activeAccount?.knowledge[activePortfolioId]?.inventory || []).map((item, idx) => (
                          <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-slate-700 rounded-md">
                            <input
                              type="text"
                              placeholder="Item name"
                              value={item.item}
                              onChange={(e) => updateKnowledgeItem(activeAccountIndex, activePortfolioId, 'inventory', idx, 'item', e.target.value)}
                              className="px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-100 text-sm"
                            />
                            <input
                              type="number"
                              placeholder="Qty"
                              value={item.quantity}
                              onChange={(e) => updateKnowledgeItem(activeAccountIndex, activePortfolioId, 'inventory', idx, 'quantity', parseInt(e.target.value) || 0)}
                              className="px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-100 text-sm"
                            />
                            <input
                              type="text"
                              placeholder="Notes"
                              value={item.notes}
                              onChange={(e) => updateKnowledgeItem(activeAccountIndex, activePortfolioId, 'inventory', idx, 'notes', e.target.value)}
                              className="px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-100 text-sm"
                            />
                            <button
                              onClick={() => removeKnowledgeItem(activeAccountIndex, activePortfolioId, 'inventory', idx)}
                              className="text-red-400 hover:text-red-300 text-sm"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Instruments Section */}
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-md font-medium text-slate-100">Instruments & Trays</h4>
                        <button
                          onClick={() => addKnowledgeItem(activeAccountIndex, activePortfolioId, 'instruments')}
                          className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1 rounded text-sm"
                        >
                          + Add Instrument
                        </button>
                      </div>
                      <div className="space-y-3">
                        {(activeAccount?.knowledge[activePortfolioId]?.instruments || []).map((item, idx) => (
                          <div key={idx} className="p-3 bg-slate-700 rounded-md space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <input
                                type="text"
                                placeholder="Instrument/Tray name"
                                value={item.name}
                                onChange={(e) => updateKnowledgeItem(activeAccountIndex, activePortfolioId, 'instruments', idx, 'name', e.target.value)}
                                className="px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-100 text-sm"
                              />
                              <button
                                onClick={() => removeKnowledgeItem(activeAccountIndex, activePortfolioId, 'instruments', idx)}
                                className="text-red-400 hover:text-red-300 text-sm"
                              >
                                Remove
                              </button>
                            </div>
                            <textarea
                              placeholder="Description and details"
                              value={item.description}
                              onChange={(e) => updateKnowledgeItem(activeAccountIndex, activePortfolioId, 'instruments', idx, 'description', e.target.value)}
                              rows={2}
                              className="w-full px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-100 text-sm"
                            />
                            
                            {/* Image Upload */}
                            <div>
                              <label className="block text-sm font-medium text-slate-300 mb-2">
                                Instrument Image <span className="text-slate-500">(Optional)</span>
                              </label>
                              <ImageUpload
                                onImageSelect={(file) => handleInstrumentImageSelect(activeAccountIndex, activePortfolioId, idx, file)}
                                onImageRemove={() => handleInstrumentImageRemove(activeAccountIndex, activePortfolioId, idx)}
                                currentImageUrl={item.imageUrl}
                                currentImageName={item.imageName}
                                placeholder="Upload instrument/tray image"
                                className="max-w-sm"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Technical Information Section */}
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-md font-medium text-slate-100">Technical Information</h4>
                        <button
                          onClick={() => addKnowledgeItem(activeAccountIndex, activePortfolioId, 'technical')}
                          className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1 rounded text-sm"
                        >
                          + Add Technical Info
                        </button>
                      </div>
                      <div className="space-y-3">
                        {(activeAccount?.knowledge[activePortfolioId]?.technical || []).map((item, idx) => (
                          <div key={idx} className="p-3 bg-slate-700 rounded-md space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <input
                                type="text"
                                placeholder="Title"
                                value={item.title}
                                onChange={(e) => updateKnowledgeItem(activeAccountIndex, activePortfolioId, 'technical', idx, 'title', e.target.value)}
                                className="px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-100 text-sm"
                              />
                              <button
                                onClick={() => removeKnowledgeItem(activeAccountIndex, activePortfolioId, 'technical', idx)}
                                className="text-red-400 hover:text-red-300 text-sm"
                              >
                                Remove
                              </button>
                            </div>
                            <textarea
                              placeholder="Technical information and details"
                              value={item.content}
                              onChange={(e) => updateKnowledgeItem(activeAccountIndex, activePortfolioId, 'technical', idx, 'content', e.target.value)}
                              rows={3}
                              className="w-full px-2 py-1 bg-slate-600 border border-slate-500 rounded text-slate-100 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-900/30 border border-blue-700 rounded-md p-4 mt-8">
          <h3 className="text-sm font-medium text-blue-400 mb-2">What You're Building:</h3>
          <ul className="text-blue-300 text-sm space-y-1">
            <li>• <strong>Accounts</strong>: Hospitals, surgery centers, or practice locations</li>
            <li>• <strong>Portfolio Assignment</strong>: Which procedures are performed at each account</li>
            <li>• <strong>Account-Specific Knowledge</strong>: Inventory quantities, instrument details, technical specs per location</li>
            <li>• <strong>Next</strong>: Add general team knowledge (parking, credentials, doctor preferences)</li>
          </ul>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end mt-8">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-8 py-3 rounded-md font-medium transition-colors"
          >
            {isSubmitting ? 'Creating Accounts...' : 'Save Accounts & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
} 