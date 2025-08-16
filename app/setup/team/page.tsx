"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import StandardHeader from "../../components/StandardHeader";

export default function TeamSetupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [formData, setFormData] = useState({
    teamName: '',
    description: '',
    location: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.teamName.trim()) {
      setError('Team name is required');
      return;
    }

    if (!formData.location.trim()) {
      setError('Location is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/teams/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.teamName.trim(),
          description: formData.description.trim(),
          location: formData.location.trim()
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create team');
      }

      const { team } = await response.json();
      
      // Redirect back to launcher to show all teams
      router.push('/launcher');

    } catch (error) {
      console.error('Error creating team:', error);
      setError(error instanceof Error ? error.message : 'Failed to create team');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Loading...</h1>
          <p className="text-slate-400">Preparing team setup...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <StandardHeader
        backText="←"
        showBackButton={true}
        onBackClick={() => router.push('/launcher')}
      />

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-100 mb-2">Create Your Team</h1>
          <p className="text-slate-400">Create your team to get started with the HHB RAG Assistant</p>
        </div>
        
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-100 mb-2">Team Information</h2>
            <p className="text-slate-400 text-sm">
              Provide basic information about your team. You'll be able to manage portfolios, accounts, and team members from your team dashboard.
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-md">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Team Name */}
            <div>
              <label htmlFor="teamName" className="block text-sm font-medium text-slate-300 mb-2">
                Team Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                id="teamName"
                name="teamName"
                value={formData.teamName}
                onChange={handleInputChange}
                placeholder="e.g., Atlanta Regional Team"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Location */}
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-slate-300 mb-2">
                Location <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                id="location"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                placeholder="e.g., Atlanta, GA"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-slate-300 mb-2">
                Description <span className="text-slate-500">(Optional)</span>
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Brief description of your team's territory or focus"
                rows={3}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Info Box */}
            <div className="bg-blue-900/30 border border-blue-700 rounded-md p-4">
              <h3 className="text-sm font-medium text-blue-400 mb-2">What's Next:</h3>
              <ul className="text-blue-300 text-sm space-y-1">
                <li>• You'll be taken back to the team selection page</li>
                <li>• From there you can manage portfolios, accounts, and members</li>
                <li>• Upload documents and create team knowledge</li>
                <li>• Invite team members and start using your AI assistant</li>
              </ul>
            </div>

            {/* Submit Button */}
            <div className="flex justify-center">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
              >
                <svg 
                  className="w-5 h-5 flex-shrink-0" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6" 
                  />
                </svg>
                <span className="flex-1 text-center">
                  {isSubmitting ? 'Creating Team...' : 'Create Team'}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 