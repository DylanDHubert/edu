"use client";

import { useAuth } from "../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function NoAccessPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasManagerPrivileges, setHasManagerPrivileges] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        // IF USER IS NOT LOGGED IN, REDIRECT TO LOGIN
        router.push('/login');
        return;
      }
      
      // CHECK MANAGER PRIVILEGES
      checkManagerPrivileges();
    }
  }, [authLoading, user, router]);

  const checkManagerPrivileges = async () => {
    try {
      const response = await fetch('/api/auth/check-access');
      if (response.ok) {
        const { hasManagerPrivileges: privileges, isAdmin: adminStatus } = await response.json();
        setHasManagerPrivileges(privileges);
        setIsAdmin(adminStatus);
        
        // IF USER IS ADMIN, THEY SHOULD NEVER BE ON THIS PAGE - REDIRECT TO HOME
        if (adminStatus) {
          console.log('Admin user detected on no-access page, redirecting to home');
          router.push('/');
          return;
        }
      }
    } catch (error) {
      console.error('Error checking access:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      console.log('=== LOGOUT DEBUG ===');
      console.log('Starting logout process...');
      await signOut();
      console.log('Sign out completed, redirecting to home...');
      router.replace('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">HHB Assistant</h1>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="max-w-2xl mx-auto px-4 text-center">
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-8">
          <div className="mb-6">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-slate-100 mb-2">Access Restricted</h1>
            <p className="text-slate-400">
              {hasManagerPrivileges 
                ? "You have manager privileges but are not a member of any teams yet."
                : "You don't have access to any teams or manager privileges."
              }
            </p>
          </div>

          <div className="bg-slate-700 rounded-md p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-3">What you can do:</h2>
            <div className="space-y-3 text-left">
              {hasManagerPrivileges ? (
                <>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                    <div>
                      <p className="text-slate-200 font-medium">Create a new team</p>
                      <p className="text-slate-400 text-sm">Use your manager privileges to set up your own team</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                    <div>
                      <p className="text-slate-200 font-medium">Wait for an invitation</p>
                      <p className="text-slate-400 text-sm">A team manager can invite you to join their team</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                    <div>
                      <p className="text-slate-200 font-medium">Request manager privileges</p>
                      <p className="text-slate-400 text-sm">Contact an administrator to get manager access</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                    <div>
                      <p className="text-slate-200 font-medium">Wait for an invitation</p>
                      <p className="text-slate-400 text-sm">A team manager can invite you to join their team</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {hasManagerPrivileges && (
              <button
                onClick={() => router.push('/setup/team')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium transition-colors"
              >
                
              </button>
            )}
            
            <button
              onClick={handleLogout}
              className="w-full bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-md font-medium transition-colors"
            >
              Sign Out
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-600">
            <p className="text-slate-400 text-sm">
              Need help? Contact support at{" "}
              <a href="mailto:support@hhb.solutions" className="text-blue-400 hover:text-blue-300">
                support@hhb.solutions
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
