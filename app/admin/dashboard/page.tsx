"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { BarChart3, MessageSquare, FileText, Download, Filter, RefreshCw, Calendar } from "lucide-react";

interface ChatAnalyticsData {
  user_email: string;
  team_name: string;
  account_name: string;
  portfolio_name: string;
  chat_title: string;
  timestamp: string;
  query: string;
  response: string;
  feedback: {
    rating: number;
    text_feedback: string | null;
    feedback_timestamp: string;
  } | null;
}

interface FeedbackData {
  feedback_id: string;
  user_email: string;
  team_name: string;
  account_name: string;
  portfolio_name: string;
  chat_title: string;
  timestamp: string;
  rating: number;
  written_feedback: string;
  original_query: string;
  ai_response: string;
}

interface NotesData {
  note_id: string;
  user_email: string;
  team_name: string;
  account_name: string;
  portfolio_name: string;
  title: string;
  content: string;
  is_shared: boolean;
  images: Array<{
    api_url: string;
    description: string;
  }>;
  created_at: string;
}

type TabType = 'chats' | 'feedback' | 'notes';

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isAdminLoading, setIsAdminLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('chats');
  
  // Data state
  const [chatData, setChatData] = useState<ChatAnalyticsData[]>([]);
  const [feedbackData, setFeedbackData] = useState<FeedbackData[]>([]);
  const [notesData, setNotesData] = useState<NotesData[]>([]);
  
  // Loading states
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  
  // Filter states
  const [feedbackFilter, setFeedbackFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  
  // Metadata
  const [metadata, setMetadata] = useState<any>({});
  
  const supabase = createClient();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (user) {
      checkAdminAccess();
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (isAdmin) {
      // Load initial data based on active tab
      if (activeTab === 'chats') {
        loadChatAnalytics();
      } else if (activeTab === 'feedback') {
        loadFeedbackAnalytics();
      } else if (activeTab === 'notes') {
        loadNotesAnalytics();
      }
    }
  }, [isAdmin, activeTab]);

  const checkAdminAccess = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', user?.email)
        .single();

      if (error || !data) {
        router.push("/");
        return;
      }

      setIsAdmin(true);
    } catch (error) {
      console.error('Error checking admin access:', error);
      router.push("/");
    } finally {
      setIsAdminLoading(false);
    }
  };

  const loadChatAnalytics = async () => {
    try {
      setLoadingChats(true);
      console.log('🔄 Loading chat analytics...');
      
      const params = new URLSearchParams();
      params.append('feedback_filter', feedbackFilter);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (teamFilter) params.append('team_id', teamFilter);

      const response = await fetch(`/api/admin/analytics/chats?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to load chat analytics');
      }

      const result = await response.json();
      setChatData(result.data || []);
      setMetadata((prev: any) => ({ ...prev, chats: result.metadata }));
      
      console.log('✅ Chat analytics loaded:', result.data?.length, 'records');
    } catch (error) {
      console.error('Error loading chat analytics:', error);
    } finally {
      setLoadingChats(false);
    }
  };

  const loadFeedbackAnalytics = async () => {
    try {
      setLoadingFeedback(true);
      console.log('🔄 Loading feedback analytics...');
      
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (teamFilter) params.append('team_id', teamFilter);

      const response = await fetch(`/api/admin/analytics/feedback?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to load feedback analytics');
      }

      const result = await response.json();
      setFeedbackData(result.data || []);
      setMetadata((prev: any) => ({ ...prev, feedback: result.metadata }));
      
      console.log('✅ Feedback analytics loaded:', result.data?.length, 'records');
    } catch (error) {
      console.error('Error loading feedback analytics:', error);
    } finally {
      setLoadingFeedback(false);
    }
  };

  const loadNotesAnalytics = async () => {
    try {
      setLoadingNotes(true);
      console.log('🔄 Loading notes analytics...');
      
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (teamFilter) params.append('team_id', teamFilter);

      const response = await fetch(`/api/admin/analytics/notes?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to load notes analytics');
      }

      const result = await response.json();
      setNotesData(result.data || []);
      setMetadata((prev: any) => ({ ...prev, notes: result.metadata }));
      
      console.log('✅ Notes analytics loaded:', result.data?.length, 'records');
    } catch (error) {
      console.error('Error loading notes analytics:', error);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleExport = async () => {
    try {
      let dataToExport: any[] = [];
      let dataType = '';
      let currentFilters: any = {};

      if (activeTab === 'chats') {
        dataToExport = chatData;
        dataType = 'chats';
        currentFilters = { feedback_filter: feedbackFilter, start_date: startDate, end_date: endDate, team_filter: teamFilter };
      } else if (activeTab === 'feedback') {
        dataToExport = feedbackData;
        dataType = 'feedback';
        currentFilters = { start_date: startDate, end_date: endDate, team_filter: teamFilter };
      } else if (activeTab === 'notes') {
        dataToExport = notesData;
        dataType = 'notes';
        currentFilters = { start_date: startDate, end_date: endDate, team_filter: teamFilter };
      }

      const response = await fetch('/api/admin/analytics/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataType,
          filters: currentFilters,
          data: dataToExport
        }),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `hhb_${dataType}_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log('✅ Export completed');
    } catch (error) {
      console.error('Error exporting data:', error);
    }
  };

  const handleRefresh = () => {
    if (activeTab === 'chats') {
      loadChatAnalytics();
    } else if (activeTab === 'feedback') {
      loadFeedbackAnalytics();
    } else if (activeTab === 'notes') {
      loadNotesAnalytics();
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  const isLoading = loadingChats || loadingFeedback || loadingNotes;

  if (loading || isAdminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">HHB Admin Analytics</h1>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-red-400 mb-4">Access Denied</h1>
          <p className="text-slate-400">You don't have admin permissions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-100">HHB Analytics Dashboard</h1>
              <p className="text-slate-400 mt-1">Monitor user interactions and system usage</p>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => router.push('/admin')}
                className="bg-slate-600 hover:bg-slate-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
              >
                ← Back to Admin
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => handleTabChange('chats')}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === 'chats'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <MessageSquare className="w-5 h-5" />
              Chat Analytics
              {metadata.chats?.total_pairs && (
                <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded-full text-xs">
                  {metadata.chats.total_pairs}
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabChange('feedback')}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === 'feedback'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              Written Feedback
              {metadata.feedback?.processed_feedback && (
                <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded-full text-xs">
                  {metadata.feedback.processed_feedback}
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabChange('notes')}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === 'notes'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <FileText className="w-5 h-5" />
              Notes Analytics
              {metadata.notes?.total_notes && (
                <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded-full text-xs">
                  {metadata.notes.total_notes}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-400">Filters:</span>
            </div>
            
            {/* Date Range */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-sm text-slate-100"
                placeholder="Start date"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-sm text-slate-100"
                placeholder="End date"
              />
            </div>

            {/* Feedback Filter (only for chats tab) */}
            {activeTab === 'chats' && (
              <select
                value={feedbackFilter}
                onChange={(e) => setFeedbackFilter(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-sm text-slate-100"
              >
                <option value="all">All Feedback</option>
                <option value="positive">Positive Only</option>
                <option value="negative">Negative Only</option>
                <option value="none">No Feedback</option>
              </select>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-3 py-1 rounded text-sm font-medium transition-colors flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              
              <button
                onClick={handleExport}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white px-3 py-1 rounded text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-4" />
              <p className="text-slate-400">Loading {activeTab} data...</p>
              {metadata[activeTab]?.processing_time_ms && (
                <p className="text-slate-500 text-sm mt-2">
                  This may take a moment while we fetch data from OpenAI...
                </p>
              )}
            </div>
          </div>
        )}

        {/* Chat Analytics Tab */}
        {activeTab === 'chats' && !isLoading && (
          <div className="space-y-6">
            {/* Stats Cards */}
            {metadata.chats && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <div className="text-2xl font-bold text-slate-100">{metadata.chats.total_chats}</div>
                  <div className="text-slate-400 text-sm">Total Chats</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <div className="text-2xl font-bold text-slate-100">{metadata.chats.total_pairs}</div>
                  <div className="text-slate-400 text-sm">Q&A Pairs</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <div className="text-2xl font-bold text-slate-100">{metadata.chats.valid_chats}</div>
                  <div className="text-slate-400 text-sm">Valid Chats</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <div className="text-2xl font-bold text-slate-100">{metadata.chats.threads_with_errors}</div>
                  <div className="text-slate-400 text-sm">Errors</div>
                </div>
              </div>
            )}

            {/* Chat Data Table */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-700">
                  <thead className="bg-slate-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Context</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Question</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Response</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Feedback</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Time</th>
                    </tr>
                  </thead>
                  <tbody className="bg-slate-800 divide-y divide-slate-700">
                    {chatData.map((chat, index) => (
                      <tr key={index} className="hover:bg-slate-700">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                          {chat.user_email}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-300">
                          <div className="space-y-1">
                            <div className="font-medium">{chat.team_name}</div>
                            <div className="text-slate-400">{chat.account_name}</div>
                            <div className="text-slate-400">{chat.portfolio_name}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-300 max-w-md">
                          <div className="truncate" title={chat.query}>
                            {chat.query.substring(0, 100)}
                            {chat.query.length > 100 && '...'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-300 max-w-md">
                          <div className="truncate" title={chat.response}>
                            {chat.response.substring(0, 100)}
                            {chat.response.length > 100 && '...'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {chat.feedback ? (
                            <div className="space-y-1">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                chat.feedback.rating === 1 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {chat.feedback.rating === 1 ? 'Positive' : 'Negative'}
                              </span>
                              {chat.feedback.text_feedback && (
                                <div className="text-slate-400 text-xs truncate max-w-xs" title={chat.feedback.text_feedback}>
                                  {chat.feedback.text_feedback}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500">No feedback</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                          {new Date(chat.timestamp).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {chatData.length === 0 && !isLoading && (
                <div className="px-6 py-12 text-center">
                  <p className="text-slate-400">No chat data found with current filters.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Feedback Tab */}
        {activeTab === 'feedback' && !isLoading && (
          <div className="space-y-6">
            {/* Stats Cards */}
            {metadata.feedback && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <div className="text-2xl font-bold text-slate-100">{metadata.feedback.total_feedback_ratings}</div>
                  <div className="text-slate-400 text-sm">Total Feedback</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <div className="text-2xl font-bold text-slate-100">{metadata.feedback.processed_feedback}</div>
                  <div className="text-slate-400 text-sm">With Text</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <div className="text-2xl font-bold text-slate-100">{metadata.feedback.threads_with_errors}</div>
                  <div className="text-slate-400 text-sm">Errors</div>
                </div>
              </div>
            )}

            {/* Feedback Data */}
            <div className="space-y-4">
              {feedbackData.map((feedback) => (
                <div key={feedback.feedback_id} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-slate-100 font-medium">{feedback.user_email}</span>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          feedback.rating === 1 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {feedback.rating === 1 ? 'Positive' : 'Negative'}
                        </span>
                      </div>
                      <div className="text-slate-400 text-sm">
                        {feedback.team_name} → {feedback.account_name} → {feedback.portfolio_name}
                      </div>
                    </div>
                    <div className="text-slate-400 text-sm">
                      {new Date(feedback.timestamp).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="text-slate-300 font-medium mb-2">Original Question:</div>
                      <div className="bg-slate-700 rounded p-3 text-slate-100">
                        {feedback.original_query}
                      </div>
                    </div>

                    <div>
                      <div className="text-slate-300 font-medium mb-2">AI Response:</div>
                      <div className="bg-slate-700 rounded p-3 text-slate-100">
                        {feedback.ai_response}
                      </div>
                    </div>

                    <div>
                      <div className="text-slate-300 font-medium mb-2">User Feedback:</div>
                      <div className="bg-blue-900/30 border border-blue-700 rounded p-3 text-blue-100">
                        {feedback.written_feedback}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {feedbackData.length === 0 && !isLoading && (
              <div className="bg-slate-800 rounded-lg p-12 border border-slate-700 text-center">
                <p className="text-slate-400">No written feedback found with current filters.</p>
              </div>
            )}
          </div>
        )}

        {/* Notes Tab */}
        {activeTab === 'notes' && !isLoading && (
          <div className="space-y-6">
            {/* Stats Cards */}
            {metadata.notes && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <div className="text-2xl font-bold text-slate-100">{metadata.notes.total_notes}</div>
                  <div className="text-slate-400 text-sm">Total Notes</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <div className="text-2xl font-bold text-slate-100">{metadata.notes.notes_with_images}</div>
                  <div className="text-slate-400 text-sm">With Images</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <div className="text-2xl font-bold text-slate-100">{metadata.notes.shared_notes}</div>
                  <div className="text-slate-400 text-sm">Shared</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <div className="text-2xl font-bold text-slate-100">{metadata.notes.total_images}</div>
                  <div className="text-slate-400 text-sm">Total Images</div>
                </div>
              </div>
            )}

            {/* Notes Data */}
            <div className="space-y-4">
              {notesData.map((note) => (
                <div key={note.note_id} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-slate-100 font-medium">{note.user_email}</span>
                        {note.is_shared && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                            Shared
                          </span>
                        )}
                      </div>
                      <div className="text-slate-400 text-sm">
                        {note.team_name} → {note.account_name} → {note.portfolio_name}
                      </div>
                    </div>
                    <div className="text-slate-400 text-sm">
                      {new Date(note.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="text-slate-100 font-semibold text-lg mb-2">{note.title}</div>
                      <div className="text-slate-300 whitespace-pre-wrap">{note.content}</div>
                    </div>

                    {note.images && note.images.length > 0 && (
                      <div>
                        <div className="text-slate-300 font-medium mb-3">Images ({note.images.length}):</div>
                        <div className="space-y-4">
                          {note.images.map((image, idx) => (
                            <div key={idx} className="space-y-2">
                              <div className="text-slate-400 text-sm">{image.description}</div>
                              <img
                                src={image.api_url}
                                alt={image.description}
                                className="max-w-full h-auto rounded border border-slate-600"
                                onError={(e) => {
                                  console.error('Failed to load image:', image.api_url);
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {notesData.length === 0 && !isLoading && (
              <div className="bg-slate-800 rounded-lg p-12 border border-slate-700 text-center">
                <p className="text-slate-400">No notes found with current filters.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 