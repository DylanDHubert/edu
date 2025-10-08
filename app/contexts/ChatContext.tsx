"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { createClient } from "../utils/supabase/client";

interface ChatHistory {
  id: string;
  team_id: string;
  portfolio_id: string;
  assistant_id: string;
  thread_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatContextType {
  chatHistory: ChatHistory[];
  currentChat: ChatHistory | null;
  setCurrentChat: (chat: ChatHistory | null) => void;
  createNewChat: () => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  refreshChatHistory: () => Promise<void>;
  loading: boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [currentChat, setCurrentChat] = useState<ChatHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeAssistant, setActiveAssistant] = useState<any>(null);
  const supabase = createClient();

  // Load active assistant from localStorage on mount and listen for changes
  useEffect(() => {
    const loadActiveAssistant = () => {
      const storedAssistant = localStorage.getItem('activeAssistant');
      if (storedAssistant) {
        try {
          const assistant = JSON.parse(storedAssistant);
          setActiveAssistant(assistant);
          // Active assistant updated in chat context
        } catch (error) {
          console.error('Error parsing activeAssistant from localStorage:', error);
        }
      } else {
        setActiveAssistant(null);
        // No active assistant found in localStorage
      }
    };

    // Load initially
    loadActiveAssistant();

    // Listen for storage changes (when user changes teams)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'activeAssistant') {
        loadActiveAssistant();
      }
    };

    // Listen for custom events (for same-tab changes)
    const handleCustomStorageChange = () => {
      loadActiveAssistant();
    };

    // Listen for clear current chat event
    const handleClearCurrentChat = () => {
      setCurrentChat(null);
      console.log('CURRENT CHAT CLEARED');
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('activeAssistantChanged', handleCustomStorageChange);
    window.addEventListener('clearCurrentChat', handleClearCurrentChat);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('activeAssistantChanged', handleCustomStorageChange);
      window.removeEventListener('clearCurrentChat', handleClearCurrentChat);
    };
  }, []);

  // LOAD CHAT HISTORY WHEN USER OR ACTIVE ASSISTANT CHANGES
  useEffect(() => {
    if (user) {
      refreshChatHistory();
    }
  }, [user, activeAssistant]);

  // SET UP REAL-TIME SUBSCRIPTION FOR CHAT HISTORY
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('chat-history-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_history',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          // REFRESH CHAT HISTORY WHEN ANY CHANGE OCCURS
          refreshChatHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase]);

  const refreshChatHistory = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('chat_history')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('ERROR LOADING CHAT HISTORY:', error);
        return;
      }

      let filteredData = data || [];
      
      // TEAM-BASED CHAT FILTERING ONLY
      if (activeAssistant) {
        // Show chats that match the current team/portfolio configuration
        filteredData = filteredData.filter(chat => {
          // MUST HAVE TEAM ID MATCH
          if (chat.team_id !== activeAssistant.teamId) {
            return false;
          }
          
          // MUST HAVE PORTFOLIO ID MATCH
          if (chat.portfolio_id !== activeAssistant.portfolioId) {
            return false;
          }
          
          // BOTH MATCH - THIS IS A VALID TEAM CHAT
          return true;
        });
        
        // Filtered team chats
      } else {
        // NO ACTIVE ASSISTANT - SHOW NO CHATS
        filteredData = [];
        // No active assistant - showing no chats
      }

      setChatHistory(filteredData);
    } catch (error) {
      console.error('ERROR LOADING CHAT HISTORY:', error);
    }
  };

  const createNewChat = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // TEAM-BASED CHAT CREATION ONLY
      if (!activeAssistant || !activeAssistant.teamId || !activeAssistant.portfolioId) {
        throw new Error('NO ACTIVE TEAM ASSISTANT - PLEASE SELECT FROM HOME PAGE');
      }

      const response = await fetch('/api/chat/create-team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId: activeAssistant.teamId,
          portfolioId: activeAssistant.portfolioId,
          assistantId: activeAssistant.assistantId,
          title: `NEW ${activeAssistant.portfolioName} CHAT`
        }),
      });

      if (!response.ok) {
        throw new Error('FAILED TO CREATE NEW TEAM CHAT');
      }

      const newChat = await response.json();
      setChatHistory(prev => [newChat, ...prev]);
      setCurrentChat(newChat);
    } catch (error) {
      console.error('ERROR CREATING NEW CHAT:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteChat = async (chatId: string) => {
    if (!user) return;

    try {
      const response = await fetch('/api/chat/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chatId }),
      });

      if (!response.ok) {
        throw new Error('FAILED TO DELETE CHAT');
      }

      // REMOVE FROM LOCAL STATE
      setChatHistory(prev => prev.filter(chat => chat.id !== chatId));
      
      // IF DELETED CHAT WAS CURRENT, CLEAR CURRENT CHAT
      if (currentChat?.id === chatId) {
        setCurrentChat(null);
      }
    } catch (error) {
      console.error('ERROR DELETING CHAT:', error);
    }
  };

  const value = {
    chatHistory,
    currentChat,
    setCurrentChat,
    createNewChat,
    deleteChat,
    refreshChatHistory,
    loading,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('USECHAT MUST BE USED WITHIN A CHATPROVIDER');
  }
  return context;
} 