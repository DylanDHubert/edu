"use client";

import { useState, useEffect, Suspense } from "react";
import { createClient } from "../utils/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function SignupPageContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  
  // GET INVITATION CONTEXT FROM URL PARAMETERS
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [invitationType, setInvitationType] = useState<string | null>(null);
  const [prefillEmail, setPrefillEmail] = useState<string | null>(null);
  
  // PARSE URL PARAMETERS ON CLIENT SIDE
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');
      const type = urlParams.get('type');
      const email = urlParams.get('email');
      
      console.log('=== SIGNUP PAGE DEBUG ===');
      console.log('URL search:', window.location.search);
      console.log('Token from URL:', token);
      console.log('Type from URL:', type);
      console.log('Email from URL:', email);
      
      setInvitationToken(token);
      setInvitationType(type);
      setPrefillEmail(email);
    }
  }, []);
  
  // SET EMAIL IF PROVIDED IN URL
  useEffect(() => {
    if (prefillEmail) {
      setEmail(prefillEmail);
    }
  }, [prefillEmail]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // VALIDATE PASSWORDS MATCH
    if (password !== confirmPassword) {
      setError("PASSWORDS DO NOT MATCH");
      setLoading(false);
      return;
    }

    // VALIDATE PASSWORD LENGTH
    if (password.length < 6) {
      setError("PASSWORD MUST BE AT LEAST 6 CHARACTERS");
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      } else {
        // SIGN IN THE USER IMMEDIATELY AFTER SIGNUP
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setError("ACCOUNT CREATED BUT SIGN IN FAILED. PLEASE TRY LOGGING IN.");
        } else {
          // CHECK IF WE HAVE INVITATION CONTEXT TO AUTO-ACCEPT
          console.log('=== SIGNUP SUCCESS DEBUG ===');
          console.log('Invitation token:', invitationToken);
          console.log('Invitation type:', invitationType);
          
          if (invitationToken && invitationType) {
            // AUTO-ACCEPT INVITATION AND REDIRECT TO HOME
            console.log('Auto-accepting invitation and redirecting to home');
            try {
              const acceptResponse = await fetch('/api/managers/accept-manager-invitation', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  token: invitationToken
                }),
              });

              if (acceptResponse.ok) {
                console.log('Invitation accepted successfully, redirecting to home');
                router.push('/');
              } else {
                console.error('Failed to auto-accept invitation, redirecting to invitation page');
                // FALLBACK: REDIRECT TO INVITATION PAGE IF AUTO-ACCEPT FAILS
                const invitationPath = invitationType === 'manager' 
                  ? `/invite/manager?token=${invitationToken}`
                  : `/invite/member?token=${invitationToken}`;
                router.push(invitationPath);
              }
            } catch (error) {
              console.error('Error auto-accepting invitation:', error);
              // FALLBACK: REDIRECT TO INVITATION PAGE IF AUTO-ACCEPT FAILS
              const invitationPath = invitationType === 'manager' 
                ? `/invite/manager?token=${invitationToken}`
                : `/invite/member?token=${invitationToken}`;
              router.push(invitationPath);
            }
          } else {
            // NORMAL FLOW - GO TO CHAT
            console.log('No invitation context, redirecting to chat');
            router.push("/chat");
          }
          router.refresh();
        }
      }
    } catch (error) {
      setError("AN UNEXPECTED ERROR OCCURRED");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-to-r from-slate-300 to-slate-400 rounded-md shadow-lg relative overflow-hidden p-4">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
              <img src="/logo.png" alt="HHB" className="relative z-10 h-24 w-auto" />
            </div>
          </div>
          <p className="text-slate-400">CREATE YOUR ACCOUNT</p>
          {invitationToken && invitationType && (
            <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700 rounded-md">
              <p className="text-blue-300 text-sm">
                {invitationType === 'manager' ? 'Team Manager Invitation' : 'Team Member Invitation'}
              </p>
              <p className="text-blue-200 text-xs mt-1">Your invitation will be automatically accepted after signup</p>
            </div>
          )}
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSignup}>
          {error && (
            <div className="bg-red-900/20 border border-red-500 text-red-200 px-4 py-3 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                EMAIL ADDRESS
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                placeholder="ENTER YOUR EMAIL"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                PASSWORD
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                placeholder="ENTER YOUR PASSWORD"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
                CONFIRM PASSWORD
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                placeholder="CONFIRM YOUR PASSWORD"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-slate-100 bg-slate-600 hover:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "CREATING ACCOUNT..." : "CREATE ACCOUNT"}
            </button>
          </div>

          <div className="text-center">
            <p className="text-slate-400">
              ALREADY HAVE AN ACCOUNT?{" "}
              <Link 
                href={invitationToken && invitationType 
                  ? `/login?email=${encodeURIComponent(email)}&token=${invitationToken}&type=${invitationType}`
                  : "/login"
                } 
                className="text-slate-300 hover:text-slate-100 underline"
              >
                SIGN IN
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-to-r from-slate-300 to-slate-400 rounded-md shadow-lg relative overflow-hidden p-4">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
              <img src="/logo.png" alt="HHB" className="relative z-10 h-16 w-auto" />
            </div>
          </div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    }>
      <SignupPageContent />
    </Suspense>
  );
} 