"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

export default function DebugKnowledgePage() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const teamId = searchParams.get('teamId');
  const supabase = createClient();

  const [knowledgeData, setKnowledgeData] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [portfolios, setPortfolios] = useState<any[]>([]);

  useEffect(() => {
    if (user && teamId) {
      loadDebugData();
    }
  }, [user, teamId]);

  const loadDebugData = async () => {
    // Load all team knowledge
    const { data: knowledge } = await supabase
      .from('team_knowledge')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at');

    // Load accounts
    const { data: accountsData } = await supabase
      .from('team_accounts')
      .select('*')
      .eq('team_id', teamId);

    // Load portfolios
    const { data: portfoliosData } = await supabase
      .from('team_portfolios')
      .select('*')
      .eq('team_id', teamId);

    setKnowledgeData(knowledge || []);
    setAccounts(accountsData || []);
    setPortfolios(portfoliosData || []);
  };

  if (loading) return <div>Loading...</div>;
  if (!user || !teamId) return <div>Need user and team ID</div>;

  return (
    <div className="p-8 bg-slate-900 min-h-screen text-white">
      <h1 className="text-2xl font-bold mb-6">Debug: Team Knowledge Data</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Accounts ({accounts.length})</h2>
        <div className="grid gap-2">
          {accounts.map(account => (
            <div key={account.id} className="bg-slate-800 p-3 rounded">
              <strong>{account.name}</strong> - ID: {account.id}
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Portfolios ({portfolios.length})</h2>
        <div className="grid gap-2">
          {portfolios.map(portfolio => (
            <div key={portfolio.id} className="bg-slate-800 p-3 rounded">
              <strong>{portfolio.name}</strong> - ID: {portfolio.id}
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Knowledge Records ({knowledgeData.length})</h2>
        <div className="grid gap-4">
          {knowledgeData.map((item, index) => (
            <div key={index} className="bg-slate-800 p-4 rounded">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Category:</strong> {item.category}
                </div>
                <div>
                  <strong>Account ID:</strong> {item.account_id || 'null'}
                </div>
                <div>
                  <strong>Portfolio ID:</strong> {item.portfolio_id || 'null'}
                </div>
                <div>
                  <strong>Created:</strong> {new Date(item.created_at).toLocaleString()}
                </div>
              </div>
              <div className="mt-2">
                <strong>Data:</strong>
                <pre className="bg-slate-700 p-2 rounded mt-1 text-xs overflow-auto">
                  {JSON.stringify(item.data, null, 2)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button 
        onClick={loadDebugData}
        className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
      >
        Refresh Data
      </button>
    </div>
  );
} 