"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { createClient } from "../utils/supabase/client";
import { PortfolioType, PORTFOLIOS } from "../utils/portfolios";

interface ChatHistory {
  id: string;
  portfolio_type: PortfolioType;
  thread_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatContextType {
  currentPortfolio: PortfolioType | null;
  setCurrentPortfolio: (portfolio: PortfolioType | null) => void;
  chatHistory: ChatHistory[];
  currentChat: ChatHistory | null;
  setCurrentChat: (chat: ChatHistory | null) => void;
  createNewChat: (portfolioType: PortfolioType) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  refreshChatHistory: () => Promise<void>;
  loading: boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [currentPortfolio, setCurrentPortfolio] = useState<PortfolioType | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [currentChat, setCurrentChat] = useState<ChatHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  // LOAD CHAT HISTORY WHEN USER CHANGES
  useEffect(() => {
    if (user) {
      refreshChatHistory();
    }
  }, [user]);

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

      setChatHistory(data || []);
    } catch (error) {
      console.error('ERROR LOADING CHAT HISTORY:', error);
    }
  };

  const createNewChat = async (portfolioType: PortfolioType) => {
    if (!user) return;

    setLoading(true);
    try {
      // CREATE NEW THREAD (THIS WILL BE HANDLED BY API ROUTE)
      const response = await fetch('/api/chat/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          portfolioType,
          title: `NEW ${PORTFOLIOS[portfolioType].name} CHAT`
        }),
      });

      if (!response.ok) {
        throw new Error('FAILED TO CREATE NEW CHAT');
      }

      const newChat = await response.json();
      setChatHistory(prev => [newChat, ...prev]);
      setCurrentChat(newChat);
      setCurrentPortfolio(portfolioType);
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
        setCurrentPortfolio(null);
      }
    } catch (error) {
      console.error('ERROR DELETING CHAT:', error);
    }
  };

  const value = {
    currentPortfolio,
    setCurrentPortfolio,
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