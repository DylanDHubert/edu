"use client";

import { useAuth } from "./contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

export default function NotFound() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // IF USER IS LOGGED IN, REDIRECT TO HOME AFTER A SHORT DELAY
    if (!loading && user) {
      const timer = setTimeout(() => {
        router.push('/');
      }, 5000); // 5 SECOND DELAY TO LET USER READ THE MESSAGE
      
      return () => clearTimeout(timer);
    }
  }, [user, loading, router]);

  if (loading) {
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
            <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-slate-100 mb-2">404 - Page Not Found</h1>
            <p className="text-slate-400 mb-4">
              The page you're looking for doesn't exist or has been moved.
            </p>
          </div>

          <div className="bg-slate-700 rounded-md p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-3">What you can do:</h2>
            <div className="space-y-3 text-left">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
                <div>
                  <p className="text-slate-200 font-medium">Go back to the home page</p>
                  <p className="text-slate-400 text-sm">Return to your dashboard and course selection</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                <div>
                  <p className="text-slate-200 font-medium">Check the URL</p>
                  <p className="text-slate-400 text-sm">Make sure you typed the address correctly</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-purple-400 rounded-full mt-2 flex-shrink-0"></div>
                <div>
                  <p className="text-slate-200 font-medium">Contact support</p>
                  <p className="text-slate-400 text-sm">If you believe this is an error, let us know</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <Link
              href="/"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium transition-colors inline-block"
            >
              Go to Home Page
            </Link>
            
            {!user && (
              <div className="flex space-x-4">
                <Link
                  href="/login"
                  className="flex-1 bg-slate-600 hover:bg-slate-700 text-white px-6 py-3 rounded-md font-medium transition-colors text-center"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-md font-medium transition-colors text-center"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-slate-600">
            <p className="text-slate-400 text-sm">
              Need help? Contact support at{" "}
              <a href="mailto:support@hhb.solutions" className="text-blue-400 hover:text-blue-300">
                support@hhb.solutions
              </a>
            </p>
            {user && (
              <p className="text-slate-500 text-xs mt-2">
                You'll be automatically redirected to the home page in a few seconds...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
