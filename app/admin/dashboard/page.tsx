"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { BarChart3, MessageSquare, FileText, Download, Filter, RefreshCw, Calendar, AlertTriangle, ChevronDown, ChevronRight, Play } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import dynamic from 'next/dynamic';
import StandardHeader from "../../components/StandardHeader";
import LoadingScreen from "../../components/LoadingScreen";

// Dynamically import PDFViewer to avoid SSR issues
const PDFViewer = dynamic(() => import('../../components/PDFViewer'), {
  ssr: false,
  loading: () => <div className="text-center p-4">Loading PDF viewer...</div>,
});

interface ChatAnalyticsData {
  user_email: string;
  team_name: string;
  account_name: string;
  portfolio_name: string;
  chat_title: string;
  thread_id: string;
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
  id: string;
  thread_id: string;
  message_id: string;
  rating: number;
  feedback_text: string;
  original_query: string;
  ai_response: string;
  created_at: string;
  team_name: string;
  account_name: string;
  portfolio_name: string;
  chat_title: string;
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

interface TestData {
  id: string;
  original_query: string;
  ai_response: string;
  assistant_id: string;
  thread_id: string;
  team_name: string;
  account_name: string;
  portfolio_name: string;
  feedback_text: string;
  created_at: string;
}

type TabType = 'chats' | 'feedback' | 'notes' | 'test';

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
  const [testData, setTestData] = useState<TestData[]>([]);
  
  // Loading states
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingTest, setLoadingTest] = useState(false);
  
  // Thread expansion state
  const [expandedThread, setExpandedThread] = useState<string | null>(null);
  const [threadData, setThreadData] = useState<any>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  
  // Test page specific state
  const [expandedQueries, setExpandedQueries] = useState<Set<string>>(new Set());
  const [experimentResults, setExperimentResults] = useState<Map<string, any>>(new Map());
  const [runningExperiments, setRunningExperiments] = useState<Set<string>>(new Set());
  
  // Filter states
  const [feedbackFilter, setFeedbackFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  
  // Metadata
  const [metadata, setMetadata] = useState<any>({});

  // AbortController refs for cancelling API requests
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const feedbackAbortControllerRef = useRef<AbortController | null>(null);
  const notesAbortControllerRef = useRef<AbortController | null>(null);
  const testAbortControllerRef = useRef<AbortController | null>(null);
  
  const supabase = createClient();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (user) {
      checkAdminAccess();
    }
  }, [user, loading, router]);

  // REMOVED AUTOMATIC DATA LOADING - NOW ON-DEMAND ONLY
  // useEffect(() => {
  //   if (isAdmin) {
  //     // Load initial data based on active tab
  //     if (activeTab === 'chats') {
  //       loadChatAnalytics();
  //     } else if (activeTab === 'feedback') {
  //       loadFeedbackAnalytics();
  //     } else if (activeTab === 'notes') {
  //       loadNotesAnalytics();
  //     }
  //   }
  // }, [isAdmin, activeTab]);

  // Cleanup function to cancel all ongoing requests
  const cancelAllRequests = () => {
    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
      chatAbortControllerRef.current = null;
      setLoadingChats(false);
    }
    if (feedbackAbortControllerRef.current) {
      feedbackAbortControllerRef.current.abort();
      feedbackAbortControllerRef.current = null;
      setLoadingFeedback(false);
    }
    if (notesAbortControllerRef.current) {
      notesAbortControllerRef.current.abort();
      notesAbortControllerRef.current = null;
      setLoadingNotes(false);
    }
    if (testAbortControllerRef.current) {
      testAbortControllerRef.current.abort();
      testAbortControllerRef.current = null;
      setLoadingTest(false);
    }
  };

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
      // Cancel any existing chat request
      if (chatAbortControllerRef.current) {
        chatAbortControllerRef.current.abort();
      }
      
      // Create new AbortController for this request
      chatAbortControllerRef.current = new AbortController();
      
      setLoadingChats(true);
      console.log('🔄 Loading chat analytics...');
      
      const params = new URLSearchParams();
      params.append('feedback_filter', feedbackFilter);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (teamFilter) params.append('team_id', teamFilter);

      const response = await fetch(`/api/admin/analytics/chats?${params}`, {
        signal: chatAbortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error('Failed to load chat analytics');
      }

      const result = await response.json();
      setChatData(result.data || []);
      setMetadata((prev: any) => ({ ...prev, chats: result.metadata }));
      
      console.log('✅ Chat analytics loaded:', result.data?.length, 'records');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('🚫 Chat analytics request cancelled');
      } else {
        console.error('Error loading chat analytics:', error);
      }
    } finally {
      setLoadingChats(false);
      chatAbortControllerRef.current = null;
    }
  };

  const loadFeedbackAnalytics = async () => {
    try {
      // Cancel any existing feedback request
      if (feedbackAbortControllerRef.current) {
        feedbackAbortControllerRef.current.abort();
      }
      
      // Create new AbortController for this request
      feedbackAbortControllerRef.current = new AbortController();
      
      setLoadingFeedback(true);
      console.log('🔄 Loading feedback analytics...');
      
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (teamFilter) params.append('team_id', teamFilter);

      const response = await fetch(`/api/admin/analytics/feedback?${params}`, {
        signal: feedbackAbortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error('Failed to load feedback analytics');
      }

      const result = await response.json();
      setFeedbackData(result.data || []);
      setMetadata((prev: any) => ({ ...prev, feedback: result.metadata }));
      
      console.log('✅ Feedback analytics loaded:', result.data?.length, 'records');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('🚫 Feedback analytics request cancelled');
      } else {
        console.error('Error loading feedback analytics:', error);
      }
    } finally {
      setLoadingFeedback(false);
      feedbackAbortControllerRef.current = null;
    }
  };

  const loadNotesAnalytics = async () => {
    try {
      // Cancel any existing notes request
      if (notesAbortControllerRef.current) {
        notesAbortControllerRef.current.abort();
      }
      
      // Create new AbortController for this request
      notesAbortControllerRef.current = new AbortController();
      
      setLoadingNotes(true);
      console.log('🔄 Loading notes analytics...');
      
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (teamFilter) params.append('team_id', teamFilter);

      const response = await fetch(`/api/admin/analytics/notes?${params}`, {
        signal: notesAbortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error('Failed to load notes analytics');
      }

      const result = await response.json();
      setNotesData(result.data || []);
      setMetadata((prev: any) => ({ ...prev, notes: result.metadata }));
      
      console.log('✅ Notes analytics loaded:', result.data?.length, 'records');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('🚫 Notes analytics request cancelled');
      } else {
        console.error('Error loading notes analytics:', error);
      }
    } finally {
      setLoadingNotes(false);
      notesAbortControllerRef.current = null;
    }
  };

  const loadTestAnalytics = async () => {
    try {
      // Cancel any existing test request
      if (testAbortControllerRef.current) {
        testAbortControllerRef.current.abort();
      }
      
      // Create new AbortController for this request
      testAbortControllerRef.current = new AbortController();
      
      setLoadingTest(true);
      console.log('🔄 Loading test analytics...');
      
      const params = new URLSearchParams();
      params.append('format', 'experiment'); // Use experiment format
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (teamFilter) params.append('team_id', teamFilter);

      const response = await fetch(`/api/admin/analytics/feedback?${params}`, {
        signal: testAbortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error('Failed to load test analytics');
      }

      const result = await response.json();
      setTestData(result.data || []);
      setMetadata((prev: any) => ({ ...prev, test: result.metadata }));
      
      console.log('✅ Test analytics loaded:', result.data?.length, 'records');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('🚫 Test analytics request cancelled');
      } else {
        console.error('Error loading test analytics:', error);
      }
    } finally {
      setLoadingTest(false);
      testAbortControllerRef.current = null;
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
      } else if (activeTab === 'test') {
        dataToExport = testData;
        dataType = 'test';
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
    } else if (activeTab === 'test') {
      loadTestAnalytics();
    }
  };

  // Test page specific functions
  const handleQueryExpand = (queryId: string) => {
    const newExpanded = new Set(expandedQueries);
    if (newExpanded.has(queryId)) {
      newExpanded.delete(queryId);
    } else {
      newExpanded.add(queryId);
    }
    setExpandedQueries(newExpanded);
  };

  const handleRunExperiment = async (query: TestData, forceRefresh = false) => {
    const queryId = query.id;
    
    if (!query.assistant_id) {
      console.error('No assistant_id available for query:', queryId);
      return;
    }

    if (!query.original_query) {
      console.error('No query text available for query:', queryId);
      return;
    }

    try {
      setRunningExperiments(prev => new Set([...prev, queryId]));
      console.log('🧪 Running experiment for query:', queryId);

      const response = await fetch('/api/admin/test/run-experiment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assistantId: query.assistant_id,
          query: query.original_query,
          forceRefresh
        })
      });

      if (!response.ok) {
        throw new Error('Failed to run experiment');
      }

      const result = await response.json();
      
      if (result.success) {
        setExperimentResults(prev => new Map([...prev, [queryId, result]]));
        console.log('✅ Experiment completed:', queryId, result.metadata?.cached ? '(cached)' : '(fresh)');
      } else {
        throw new Error(result.error || 'Unknown error');
      }

    } catch (error: any) {
      console.error('❌ Experiment failed:', error);
      
      // Store error in results for display
      const errorResult = {
        success: false,
        error: error.message || 'Unknown error',
        result: `# Experiment Failed\n\n**Error:** ${error.message || 'Unknown error'}\n\n**Query:** ${query.original_query}\n\n**Assistant ID:** ${query.assistant_id}`,
        metadata: {
          cached: false,
          error: true,
          timestamp: new Date().toISOString(),
          assistantId: query.assistant_id,
          query: query.original_query
        }
      };
      
      setExperimentResults(prev => new Map([...prev, [queryId, errorResult]]));
    } finally {
      setRunningExperiments(prev => {
        const newSet = new Set(prev);
        newSet.delete(queryId);
        return newSet;
      });
    }
  };

  const loadThreadData = async (threadId: string) => {
    try {
      setLoadingThread(true);
      console.log('🔄 Loading full thread:', threadId);
      
      const response = await fetch(`/api/admin/analytics/thread/${threadId}`);
      
      if (!response.ok) {
        throw new Error('Failed to load thread data');
      }

      const result = await response.json();
      setThreadData(result.data);
      setExpandedThread(threadId);
      
      console.log('✅ Thread loaded:', result.data?.stats);
    } catch (error) {
      console.error('Error loading thread:', error);
    } finally {
      setLoadingThread(false);
    }
  };

  const handleThreadClick = (threadId: string) => {
    if (expandedThread === threadId) {
      // Collapse if already expanded
      setExpandedThread(null);
      setThreadData(null);
    } else {
      // Expand new thread
      loadThreadData(threadId);
    }
  };

  // PDF Test state
  const [pdfTestDocId, setPdfTestDocId] = useState<string>('');
  const [pdfTestPage, setPdfTestPage] = useState<number>(1);
  const [showPdfViewer, setShowPdfViewer] = useState<boolean>(false);

  const handlePdfTest = () => {
    if (!pdfTestDocId || !pdfTestPage) {
      alert('Please enter both Document ID and Page Number');
      return;
    }
    
    console.log('🧪 Opening PDF Viewer:', {
      docId: pdfTestDocId,
      page: pdfTestPage
    });
    
    setShowPdfViewer(true);
  };

  const handleTabChange = (tab: TabType) => {
    // Cancel all ongoing requests before switching tabs
    console.log(`🔄 Switching from ${activeTab} to ${tab} tab - cancelling previous requests`);
    cancelAllRequests();
    
    setActiveTab(tab);
    // REMOVED AUTOMATIC DATA LOADING - NOW ON-DEMAND ONLY
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAllRequests();
    };
  }, []);

  const isLoading = loadingChats || loadingFeedback || loadingNotes || loadingTest;

  if (loading || isAdminLoading) {
    return (
      <LoadingScreen 
        title="HHB Admin Analytics" 
        subtitle="Loading..." 
      />
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
      <StandardHeader
        teamName="HHB Analytics Dashboard"
        teamLocation="Monitor user interactions and system usage"
        showBackButton={true}
        backText="← Back to Admin"
        backUrl="/admin"
      />

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
            <button
              onClick={() => handleTabChange('test')}
              className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === 'test'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
              Test Experiments
              {metadata.test?.total_feedback && (
                <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded-full text-xs">
                  {metadata.test.total_feedback}
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
                {isLoading ? 'Loading...' : (metadata[activeTab] ? 'Refresh' : 'Load Data')}
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
                      <React.Fragment key={index}>
                        <tr 
                          className="hover:bg-slate-700 cursor-pointer transition-colors"
                          onClick={() => handleThreadClick(chat.thread_id)}
                          title="Click to view full conversation"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                            <div className="flex items-center gap-2">
                              {chat.user_email}
                              {expandedThread === chat.thread_id && (
                                <span className="text-blue-400 text-xs">
                                  {loadingThread ? '⏳' : '👁️'}
                                </span>
                              )}
                            </div>
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
                      
                      {/* Expanded Thread View */}
                      {expandedThread === chat.thread_id && threadData && (
                        <tr>
                          <td colSpan={6} className="px-6 py-0">
                            <div className="bg-slate-700 rounded-lg p-6 my-4">
                              <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-slate-100">
                                  Full Conversation: {threadData.chat_title}
                                </h3>
                                <div className="text-sm text-slate-400">
                                  {threadData.stats.exchanges} exchanges • {threadData.stats.total_messages} messages
                                </div>
                              </div>
                              
                              <div className="space-y-4 max-h-96 overflow-y-auto">
                                {threadData.conversation.map((message: any, msgIndex: number) => (
                                  <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-4xl rounded-lg p-4 ${
                                      message.role === 'user' 
                                        ? 'bg-blue-600 text-white' 
                                        : 'bg-slate-600 text-slate-100'
                                    }`}>
                                      <div className="flex justify-between items-start gap-4 mb-2">
                                        <span className="font-medium text-sm">
                                          {message.role === 'user' ? 'User' : 'Assistant'}
                                        </span>
                                        <span className="text-xs opacity-75">
                                          {new Date(message.timestamp).toLocaleString()}
                                        </span>
                                      </div>
                                      <div className="whitespace-pre-wrap text-sm">
                                        {message.content}
                                      </div>
                                      {message.feedback && (
                                        <div className="mt-3 pt-3 border-t border-opacity-20 border-white">
                                          <div className="flex items-center gap-2">
                                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                              message.feedback.rating === 1 
                                                ? 'bg-green-100 text-green-800' 
                                                : 'bg-red-100 text-red-800'
                                            }`}>
                                              {message.feedback.rating === 1 ? 'Positive' : 'Negative'} Feedback
                                            </span>
                                          </div>
                                          {message.feedback.text_feedback && (
                                            <div className="mt-2 text-xs opacity-90">
                                              "{message.feedback.text_feedback}"
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
                <div key={feedback.id} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-slate-100 font-medium">{feedback.chat_title}</span>
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
                      {new Date(feedback.created_at).toLocaleDateString()}
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
                        {feedback.feedback_text}
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

        {/* Test Tab */}
        {activeTab === 'test' && !isLoading && (
          <div className="space-y-6">
            {/* Stats Cards */}
            {metadata.test && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <div className="text-2xl font-bold text-slate-100">{metadata.test.total}</div>
                  <div className="text-slate-400 text-sm">Negative Feedback</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <div className="text-2xl font-bold text-slate-100">{experimentResults.size}</div>
                  <div className="text-slate-400 text-sm">Experiments Run</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <div className="text-2xl font-bold text-slate-100">{runningExperiments.size}</div>
                  <div className="text-slate-400 text-sm">Running Now</div>
                </div>
              </div>
            )}

            {/* PDF Page Opening Test */}
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h3 className="text-slate-100 font-medium mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                PDF Page Opening Test
              </h3>
              <p className="text-slate-400 text-sm mb-4">
                Test the new React PDF viewer component with page navigation.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Document ID
                  </label>
                  <input
                    type="text"
                    placeholder="Enter document ID"
                    value={pdfTestDocId}
                    onChange={(e) => setPdfTestDocId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Page Number
                  </label>
                  <input
                    type="number"
                    placeholder="Enter page number"
                    min="1"
                    value={pdfTestPage}
                    onChange={(e) => setPdfTestPage(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div className="flex items-end">
                  <button
                    onClick={handlePdfTest}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Open PDF Viewer
                  </button>
                </div>
              </div>
              
              <div className="mt-4 bg-slate-700 rounded p-4">
                <div className="text-slate-300 text-sm">
                  <strong className="text-slate-100">How it works:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Enter a document ID from your database</li>
                    <li>Enter the page number you want to open</li>
                    <li>Click "Open PDF Viewer" to test the component</li>
                    <li>The PDF will open in a modal with the correct page displayed</li>
                  </ul>
                  <div className="mt-3 text-yellow-400 text-xs">
                    💡 <strong>Tip:</strong> Use document ID: 0b8853cc-2e26-4191-805c-00935cf22db8 for testing
                  </div>
                </div>
              </div>
            </div>
            
            {/* PDF Viewer Modal */}
            {showPdfViewer && (
              <PDFViewer
                docId={pdfTestDocId}
                initialPage={pdfTestPage}
                onClose={() => setShowPdfViewer(false)}
              />
            )}

            {/* Test Query Cards */}
            <div className="space-y-4">
              {testData.map((query) => {
                const isExpanded = expandedQueries.has(query.id);
                const isRunning = runningExperiments.has(query.id);
                const experimentResult = experimentResults.get(query.id);

                return (
                  <div key={query.id} className="bg-slate-800 rounded-lg border border-slate-700">
                    {/* Collapsed View */}
                    <div 
                      className="p-6 cursor-pointer hover:bg-slate-750 transition-colors"
                      onClick={() => handleQueryExpand(query.id)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            {isExpanded ? 
                              <ChevronDown className="w-5 h-5 text-slate-400" /> : 
                              <ChevronRight className="w-5 h-5 text-slate-400" />
                            }
                            <span className="text-slate-100 font-medium">
                              {query.team_name} → {query.account_name} → {query.portfolio_name}
                            </span>
                            <span className="text-xs text-slate-500">
                              {new Date(query.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          
                          <div className="ml-8">
                            <div className="text-slate-300 mb-2">
                              <strong>Query:</strong> {query.original_query ? (query.original_query.substring(0, 150) + (query.original_query.length > 150 ? '...' : '')) : 'No query available'}
                            </div>
                            <div className="text-slate-300">
                              <strong>Response:</strong> {query.ai_response ? (query.ai_response.substring(0, 150) + (query.ai_response.length > 150 ? '...' : '')) : 'No response available'}
                            </div>
                          </div>
                        </div>
                        
                        <div className="ml-4 text-right">
                          {experimentResult && !experimentResult.metadata?.error && (
                            <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 mb-2">
                              {experimentResult.metadata?.cached ? '📋 Cached' : '🆕 Fresh'}
                            </span>
                          )}
                          {experimentResult?.metadata?.error && (
                            <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 mb-2">
                              ❌ Failed
                            </span>
                          )}
                          {isRunning && (
                            <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                              ⏳ Running...
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded View */}
                    {isExpanded && (
                      <div className="border-t border-slate-700 p-6">
                        <div className="space-y-6">
                          {/* Full Query and Response */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <h4 className="text-slate-100 font-medium mb-3">Full Query</h4>
                              <div className="bg-slate-700 rounded p-4 text-slate-200 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                                {query.original_query || 'No query available'}
                              </div>
                            </div>
                            <div>
                              <h4 className="text-slate-100 font-medium mb-3">AI Response</h4>
                              <div className="bg-slate-700 rounded p-4 text-slate-200 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                                {query.ai_response || 'No response available'}
                              </div>
                            </div>
                          </div>

                          {/* User Feedback */}
                          <div>
                            <h4 className="text-slate-100 font-medium mb-3">User Feedback</h4>
                            <div className="bg-red-900/30 border border-red-700 rounded p-4 text-red-100">
                              {query.feedback_text || 'No feedback text available'}
                            </div>
                          </div>

                          {/* Experiment Controls */}
                          <div className="flex items-center gap-4">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRunExperiment(query, false);
                              }}
                              disabled={isRunning || !query.assistant_id || !query.original_query}
                              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2 rounded font-medium transition-colors flex items-center gap-2"
                            >
                              <Play className="w-4 h-4" />
                              {isRunning ? 'Running...' : 'Run Chunks Experiment'}
                            </button>
                            
                            {experimentResult && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRunExperiment(query, true);
                                }}
                                disabled={isRunning}
                                className="bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 text-white px-4 py-2 rounded font-medium transition-colors"
                              >
                                Force Refresh
                              </button>
                            )}
                            
                            {(!query.assistant_id || !query.original_query) && (
                              <span className="text-red-400 text-sm">
                                {!query.assistant_id && 'No assistant_id available'}
                                {!query.assistant_id && !query.original_query && ' • '}
                                {!query.original_query && 'No query text available'}
                              </span>
                            )}
                          </div>

                          {/* Experiment Results */}
                          {experimentResult && (
                            <div>
                              <h4 className="text-slate-100 font-medium mb-3">Experiment Results</h4>
                              <div className="bg-slate-900 rounded-lg p-4 border border-slate-600 max-h-96 overflow-y-auto prose prose-invert prose-sm max-w-none">
                                <ReactMarkdown>
                                  {experimentResult.result}
                                </ReactMarkdown>
                              </div>
                              
                              {experimentResult.metadata && (
                                <div className="mt-3 text-xs text-slate-400">
                                  Processed in {experimentResult.metadata.processingTime}ms • 
                                  {experimentResult.metadata.chunkCount} chunks retrieved • 
                                  {experimentResult.metadata.cached ? 'From cache' : 'Fresh run'}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {testData.length === 0 && !isLoading && (
              <div className="bg-slate-800 rounded-lg p-12 border border-slate-700 text-center">
                <p className="text-slate-400">No negative feedback found with current filters.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 