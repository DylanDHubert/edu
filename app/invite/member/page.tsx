"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { useAuth } from "../../contexts/AuthContext";

interface InvitationData {
  id: string;
  team_id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  expires_at: string;
  team_name: string;
  inviter_name: string;
}

function TeamMemberInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: userLoading } = useAuth();
  const supabase = createClient();
  
  const token = searchParams.get('token');
  
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  
  // Auth form state
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invalid invitation link - no token provided");
      setLoading(false);
      return;
    }
    
    validateInvitation();
  }, [token]);

  useEffect(() => {
    // If user becomes authenticated and we have a valid invitation, check if they can accept
    if (user && invitation && !userLoading) {
      checkUserEligibility();
    }
  }, [user, invitation, userLoading]);

  const validateInvitation = async () => {
    try {
      setLoading(true);
      setError(null);

      // Validate invitation via server-side API to bypass RLS
      const response = await fetch(`/api/invitations/validate-member?token=${token}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || "Invalid or expired invitation link");
        setLoading(false);
        return;
      }

      const { invitation: inviteData } = await response.json();

      // Get inviter name (simplified - just using "Team Manager" for now)
      const inviterName = "Team Manager";

      setInvitation({
        ...inviteData,
        inviter_name: inviterName
      });

      // Pre-fill email if we have it
      setEmail(inviteData.email);

    } catch (error) {
      console.error('Error validating invitation:', error);
      setError('Failed to validate invitation');
    } finally {
      setLoading(false);
    }
  };

  const checkUserEligibility = async () => {
    if (!user || !invitation) return;

    // Check if user's email matches invitation email
    if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      setError(`This invitation is for ${invitation.email}. Please sign in with the correct email address.`);
      return;
    }

    // Check if user is already a member of this team
    const { data: existingMember } = await supabase
      .from('team_members')
      .select('*')
      .eq('team_id', invitation.team_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (existingMember) {
      setError('You are already a member of this team');
      return;
    }

    // All good - user can accept the invitation
    setNeedsAuth(false);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      if (!invitation) return;

      // Validate email matches invitation
      if (email.toLowerCase() !== invitation.email.toLowerCase()) {
        setAuthError(`Please use the email address ${invitation.email} that received this invitation`);
        setAuthLoading(false);
        return;
      }

      if (isSignup) {
        // Sign up
        if (password !== confirmPassword) {
          setAuthError("Passwords do not match");
          setAuthLoading(false);
          return;
        }

        if (password.length < 6) {
          setAuthError("Password must be at least 6 characters");
          setAuthLoading(false);
          return;
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          setAuthError(error.message);
        }
        // User will be signed in automatically after signup
      } else {
        // Sign in
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setAuthError(error.message);
        }
      }
    } catch (error) {
      setAuthError("Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const acceptInvitation = async () => {
    if (!user || !invitation) return;

    setAccepting(true);
    try {
      // Call API to accept invitation
      const response = await fetch('/api/teams/accept-member-invitation', {
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

      // Success! Redirect to team dashboard or main app
      router.push('/launcher');
      
    } catch (error) {
      console.error('Error accepting invitation:', error);
      setError(error instanceof Error ? error.message : 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  if (loading || userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Loading...</h1>
          <p className="text-slate-400">Validating invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold text-red-400 mb-4">Invalid Invitation</h1>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return null;
  }

  // If user is not authenticated or needs to authenticate with correct email
  if (!user || needsAuth || (user.email?.toLowerCase() !== invitation.email.toLowerCase())) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="max-w-md w-full space-y-8 p-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-slate-100 mb-2">Team Invitation</h1>
            <p className="text-slate-400">You've been invited to join <strong>{invitation.team_name}</strong></p>
            <p className="text-slate-300 text-sm mt-2">Role: <strong>{invitation.role === 'manager' ? 'Team Manager' : 'Team Member'}</strong></p>
          </div>

          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">
              {isSignup ? 'Create Account' : 'Sign In'} to Accept Invitation
            </h3>
            
            <form onSubmit={handleAuth} className="space-y-4">
              {authError && (
                <div className="bg-red-900/20 border border-red-500 text-red-200 px-4 py-3 rounded-md text-sm">
                  {authError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={true} // Email is pre-filled from invitation
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 disabled:opacity-50"
                />
                <p className="text-slate-400 text-xs mt-1">This invitation is specifically for this email address</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {isSignup && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white py-3 rounded-md font-medium transition-colors"
              >
                {authLoading ? 'Please wait...' : (isSignup ? 'Create Account & Accept Invitation' : 'Sign In & Accept Invitation')}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => setIsSignup(!isSignup)}
                className="text-blue-400 hover:text-blue-300 text-sm"
              >
                {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
              
              {/* ALTERNATIVE: DIRECT LINKS TO LOGIN/SIGNUP WITH INVITATION CONTEXT */}
              <div className="mt-4 pt-4 border-t border-slate-700">
                <p className="text-slate-400 text-sm mb-2">Or use direct links:</p>
                <div className="flex space-x-4 justify-center">
                  <button
                    onClick={() => router.push(`/signup?email=${encodeURIComponent(invitation.email)}&token=${token}&type=member`)}
                    className="text-blue-400 hover:text-blue-300 text-sm underline"
                  >
                    Sign Up
                  </button>
                  <button
                    onClick={() => router.push(`/login?email=${encodeURIComponent(invitation.email)}&token=${token}&type=member`)}
                    className="text-blue-400 hover:text-blue-300 text-sm underline"
                  >
                    Sign In
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // User is authenticated and eligible - show acceptance screen
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Team Invitation</h1>
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">You're invited to join:</h3>
            
            <div className="space-y-3 text-left">
              <div>
                <span className="text-slate-400">Team:</span>
                <span className="text-slate-100 font-medium ml-2">{invitation.team_name}</span>
              </div>
              <div>
                <span className="text-slate-400">Role:</span>
                <span className="text-slate-100 font-medium ml-2">
                  {invitation.role === 'manager' ? 'Team Manager' : 'Team Member'}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Invited by:</span>
                <span className="text-slate-100 font-medium ml-2">{invitation.inviter_name}</span>
              </div>
            </div>

            {invitation.role === 'member' && (
              <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700 rounded text-blue-200 text-sm">
                <strong>Team Member Access:</strong>
                <ul className="mt-1 space-y-1 text-xs">
                  <li>• View team knowledge and documents</li>
                  <li>• Use AI assistant for searches</li>
                  <li>• Create and share personal notes</li>
                  <li>• Read-only access to team settings</li>
                </ul>
              </div>
            )}

            <div className="mt-6 space-y-3">
              <button
                onClick={acceptInvitation}
                disabled={accepting}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white py-3 rounded-md font-medium transition-colors"
              >
                {accepting ? 'Accepting Invitation...' : 'Accept Invitation'}
              </button>
              
              <button
                onClick={() => router.push('/login')}
                className="w-full bg-slate-600 hover:bg-slate-700 text-white py-2 rounded-md font-medium transition-colors"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TeamMemberInvitePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TeamMemberInviteContent />
    </Suspense>
  );
} 