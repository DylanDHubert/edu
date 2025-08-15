"use client";

import { useAuth } from "../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";
import { useState, useEffect } from "react";

export default function DebugPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [adminCheck, setAdminCheck] = useState<any>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const checkAdminStatus = async () => {
    if (!user?.email) return;
    
    setAdminLoading(true);
    try {
      console.log('Checking admin status for:', user.email);
      
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', user.email)
        .single();

      console.log('Admin check result:', { data, error });
      setAdminCheck({ data, error, timestamp: new Date().toISOString() });
    } catch (error) {
      console.error('Error checking admin:', error);
      setAdminCheck({ error: error, timestamp: new Date().toISOString() });
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      checkAdminStatus();
    }
  }, [user]);

  if (loading) {
    return <div className="p-8 bg-slate-900 text-white">Loading...</div>;
  }

  return (
    <div className="p-8 bg-slate-900 text-white min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Debug Info</h1>
      
      <div className="space-y-4">
        <div>
          <strong>User Status:</strong> {user ? 'Logged In' : 'Not Logged In'}
        </div>
        
        {user && (
          <>
            <div>
              <strong>Email:</strong> {user.email}
            </div>
            <div>
              <strong>User ID:</strong> {user.id}
            </div>
            <div>
              <strong>Created:</strong> {user.created_at}
            </div>
            
            <div className="border-t border-gray-600 pt-4">
              <strong>Admin Status Check:</strong>
              <button
                onClick={checkAdminStatus}
                disabled={adminLoading}
                className="ml-2 bg-purple-600 px-3 py-1 rounded text-white text-sm"
              >
                {adminLoading ? 'Checking...' : 'Refresh'}
              </button>
              
              {adminCheck && (
                <div className="mt-2 p-3 bg-slate-800 rounded text-sm">
                  <div><strong>Timestamp:</strong> {adminCheck.timestamp}</div>
                  <div><strong>Has Admin Data:</strong> {adminCheck.data ? 'YES' : 'NO'}</div>
                  {adminCheck.data && (
                    <div>
                      <strong>Admin Info:</strong> 
                      <pre className="text-xs mt-1">{JSON.stringify(adminCheck.data, null, 2)}</pre>
                    </div>
                  )}
                  {adminCheck.error && (
                    <div>
                      <strong>Error:</strong> 
                      <pre className="text-xs mt-1 text-red-400">{JSON.stringify(adminCheck.error, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
        
        <div className="space-x-4 mt-8">
          <button
            onClick={() => router.push('/login')}
            className="bg-blue-600 px-4 py-2 rounded text-white"
          >
            Go to Login
          </button>
          <button
            onClick={() => router.push('/admin')}
            className="bg-green-600 px-4 py-2 rounded text-white"
          >
            Try Admin
          </button>
          {user && (
            <button
              onClick={handleLogout}
              className="bg-red-600 px-4 py-2 rounded text-white"
            >
              Logout
            </button>
          )}
        </div>
      </div>
    </div>
  );
} 