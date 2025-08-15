"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

interface ManagerInvitation {
  id: string;
  email: string;
  name: string;
  invitation_token: string;
  invited_by: string;
  status: string;
  created_at: string;
  expires_at: string;
}

function ManagerInviteContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [invitation, setInvitation] = useState<ManagerInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link');
      setLoading(false);
      return;
    }

    if (!authLoading) {
      loadInvitationData();
    }
  }, [authLoading, token, user]);

  const loadInvitationData = async () => {
    try {
      // Validate invitation via server-side API to bypass RLS
      const response = await fetch(`/api/invitations/validate-manager?token=${token}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Invitation not found or has expired');
        return;
      }

      const { invitation: invitationData } = await response.json();
      setInvitation(invitationData);

      // If user is logged in and email matches, we can proceed directly
      if (user && user.email === invitationData.email) {
        // User is already logged in with the correct email
        return;
      }

      // If user is logged in but with different email
      if (user && user.email !== invitationData.email) {
        setError(`You are logged in as ${user.email}, but this invitation is for ${invitationData.email}. Please log out and log in with the correct email.`);
        return;
      }

      // If user is not logged in, they need to sign up/login first

    } catch (error) {
      console.error('Error loading invitation data:', error);
      setError('Failed to load invitation information');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvitation = async () => {
    if (!user || !invitation) return;
    
    if (user.email !== invitation.email) {
      setError('Email mismatch. Please log in with the invited email address.');
      return;
    }
    
    setAccepting(true);
    try {
      // Accept invitation via API
      const response = await fetch('/api/managers/accept-manager-invitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: token
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to accept invitation');
      }

      // Redirect to team creation
      router.push('/setup/team');
      
    } catch (error) {
      console.error('Error accepting invitation:', error);
      setError(error instanceof Error ? error.message : 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Loading Invitation</h1>
          <p className="text-slate-400">Please wait...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold text-red-400 mb-4">Invitation Error</h1>
          <p className="text-slate-400 mb-6">{error}</p>
          <div className="space-y-4">
            <button
              onClick={() => router.push('/')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
            >
              Go to Home
            </button>
            {user && (
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push('/login');
                }}
                className="block w-full bg-slate-600 hover:bg-slate-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
              >
                Log Out & Try Again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold text-red-400 mb-4">Invitation Not Found</h1>
          <p className="text-slate-400 mb-6">This invitation may have expired or been used already.</p>
          <button
            onClick={() => router.push('/')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center max-w-2xl mx-auto px-4">
          <h1 className="text-4xl font-bold text-slate-100 mb-6">Team Manager Invitation</h1>
          
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 mb-8">
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">
              Hello {invitation.name}!
            </h2>
            <p className="text-slate-300 mb-4">
              You've been invited to become a Team Manager on the HHB RAG Assistant platform.
            </p>
            <div className="text-left bg-slate-700 rounded-md p-4">
              <div className="text-sm text-slate-400">Invited Email:</div>
              <div className="text-slate-100 font-medium">{invitation.email}</div>
            </div>
          </div>

          <div className="bg-blue-900/30 border border-blue-700 rounded-md p-6 mb-8">
            <h3 className="text-lg font-medium text-blue-400 mb-3">As a Team Manager, you'll be able to:</h3>
            <ul className="text-left text-blue-300 space-y-2">
              <li>• Create and manage your own team</li>
              <li>• Set up custom portfolios and upload documents</li>
              <li>• Create accounts and manage team knowledge</li>
              <li>• Invite and manage team members</li>
              <li>• Configure AI assistants for your team</li>
            </ul>
          </div>

          <p className="text-slate-400 mb-8">
            To accept this invitation, please sign up or log in with the email address: <strong>{invitation.email}</strong>
          </p>

          <div className="flex space-x-4 justify-center">
            <button
              onClick={() => router.push(`/signup?email=${encodeURIComponent(invitation.email)}`)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-md font-medium transition-colors"
            >
              Sign Up
            </button>
            <button
              onClick={() => router.push(`/login?email=${encodeURIComponent(invitation.email)}`)}
              className="bg-slate-600 hover:bg-slate-700 text-white px-8 py-3 rounded-md font-medium transition-colors"
            >
              Log In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // User is logged in and has a valid invitation
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center max-w-2xl mx-auto px-4">
        <h1 className="text-4xl font-bold text-slate-100 mb-6">Welcome, {invitation.name}!</h1>
        
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 mb-8">
          <h2 className="text-2xl font-semibold text-slate-100 mb-4">
            Ready to become a Team Manager?
          </h2>
          <p className="text-slate-300 mb-6">
            You've successfully verified your invitation. The next step is to accept your role and create your team.
          </p>
          <div className="text-left bg-slate-700 rounded-md p-4">
            <div className="text-sm text-slate-400">Your Email:</div>
            <div className="text-slate-100 font-medium">{invitation.email}</div>
          </div>
        </div>

        <div className="bg-green-900/30 border border-green-700 rounded-md p-6 mb-8">
          <h3 className="text-lg font-medium text-green-400 mb-3">Next Steps:</h3>
          <ul className="text-left text-green-300 space-y-2">
            <li>• Accept your manager invitation</li>
            <li>• Create and name your team</li>
            <li>• You'll be taken to your team dashboard</li>
            <li>• From there you can manage portfolios, accounts, and members</li>
            <li>• Upload documents and create team knowledge</li>
            <li>• Start using the AI assistant with your team</li>
          </ul>
        </div>

        <button
          onClick={handleAcceptInvitation}
          disabled={accepting}
          className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white px-8 py-3 rounded-md font-medium transition-colors"
        >
          {accepting ? 'Accepting...' : 'Accept Invitation & Create Team'}
        </button>
      </div>
    </div>
  );
}

export default function ManagerInvitePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ManagerInviteContent />
    </Suspense>
  );
} 