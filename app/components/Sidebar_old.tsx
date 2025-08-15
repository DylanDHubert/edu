"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useChat } from "../contexts/ChatContext";
import NotesSection from "./NotesSection";

interface SidebarProps {
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

export default function Sidebar({ isMobileOpen, setIsMobileOpen }: SidebarProps) {
  const { user, signOut } = useAuth();
  const { 
    chatHistory, 
    currentChat, 
    setCurrentChat, 
    createNewChat, 
    deleteChat,
    loading 
  } = useChat();

  // MOBILE STATE MANAGEMENT
  const [activeTab, setActiveTab] = useState<'chat' | 'notes'>('chat');
  const [activeAssistant, setActiveAssistant] = useState<any>(null);

  // LOAD ACTIVE ASSISTANT FROM LOCALSTORAGE
  useEffect(() => {
    const storedAssistant = localStorage.getItem('activeAssistant');
    if (storedAssistant) {
      try {
        const assistant = JSON.parse(storedAssistant);
        setActiveAssistant(assistant);
      } catch (error) {
        console.error('Error parsing activeAssistant from localStorage:', error);
      }
    }
  }, []);

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // PREVENT CHAT SELECTION WHEN CLICKING DELETE
    if (confirm('ARE YOU SURE YOU WANT TO DELETE THIS CHAT?')) {
      await deleteChat(chatId);
    }
  };

  const handleChatSelect = (chat: any) => {
    setCurrentChat(chat);
    // CLOSE MOBILE SIDEBAR WHEN CHAT IS SELECTED
    if (isMobileOpen) {
      setIsMobileOpen(false);
    }
  };

  const handleNewChat = () => {
    if (!activeAssistant) {
      alert('Please select an assistant from the launcher first');
      return;
    }
    setCurrentChat(null);
    // CLOSE MOBILE SIDEBAR
    if (isMobileOpen) {
      setIsMobileOpen(false);
    }
  };

  const handleSignOut = async () => {
    try {
      // Clear active assistant when signing out
      localStorage.removeItem('activeAssistant');
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // MOBILE OVERLAY - BACKDROP
  if (isMobileOpen) {
    return (
      <>
        {/* BACKDROP */}
        <div 
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
        
        {/* MOBILE SIDEBAR */}
        <div className="lg:hidden fixed left-0 top-0 h-full w-80 bg-slate-900 border-r border-slate-700 z-50 flex flex-col">
          
          {/* MOBILE HEADER */}
          <div className="p-4 border-b border-slate-700 flex justify-between items-center">
            <h1 className="text-lg font-bold text-slate-100">HHB RAG</h1>
            <button
              onClick={() => setIsMobileOpen(false)}
              className="text-slate-400 hover:text-slate-100 text-xl"
            >
              ✕
            </button>
          </div>

          {/* MOBILE TAB NAVIGATION */}
          <div className="flex border-b border-slate-700">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === 'chat'
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              CHAT
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === 'notes'
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              NOTES
            </button>
          </div>

          {/* MOBILE CONTENT */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'chat' ? (
              <div className="h-full flex flex-col">
                
                {/* ACTIVE ASSISTANT INFO */}
                <div className="p-4 border-b border-slate-700">
                  <h2 className="text-sm font-semibold text-slate-300 mb-3">ACTIVE ASSISTANT</h2>
                  <div className="bg-slate-700 rounded-lg p-3">
                    <div className="text-sm text-slate-100 font-medium">
                      {activeAssistant?.assistantName || 'No Assistant Selected'}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {activeAssistant ? `Team: ${activeAssistant.teamName || 'Unknown'}` : 'Go to launcher to select'}
                    </div>
                  </div>
                  <div className="mt-3">
                    <button
                      onClick={() => window.location.href = '/launcher'}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors"
                    >
                      Change Assistant
                    </button>
                  </div>
                </div>

                {/* CHAT HISTORY - MOBILE */}
                <div className="p-4 border-b border-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-slate-300">CHAT HISTORY</h2>
                    <button 
                      onClick={handleNewChat}
                      disabled={!activeAssistant || loading}
                      className="bg-blue-600 text-white px-3 py-1 rounded-md text-xs hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      NEW
                    </button>
                  </div>
                  
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {loading ? (
                      <div className="text-slate-400 text-sm">LOADING...</div>
                    ) : chatHistory.length === 0 ? (
                      <div className="text-slate-500 text-sm">NO CHATS YET</div>
                    ) : (
                      chatHistory.map((chat) => (
                        <div
                          key={chat.id}
                          onClick={() => handleChatSelect(chat)}
                          className={`p-3 rounded-lg cursor-pointer transition-colors group ${
                            currentChat?.id === chat.id
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {chat.title}
                              </div>
                              <div className={`text-xs mt-1 ${
                                currentChat?.id === chat.id ? 'text-blue-200' : 'text-slate-500'
                              }`}>
                                {chat.portfolio_type}
                              </div>
                            </div>
                            <button
                              onClick={(e) => handleDeleteChat(chat.id, e)}
                              className={`ml-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 ${
                                currentChat?.id === chat.id ? 'text-white' : 'text-slate-400'
                              }`}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* SPACER */}
                <div className="flex-1"></div>

                {/* USER INFO - MOBILE */}
                <div className="p-4 border-t border-slate-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-medium">
                          {user?.email?.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-100 truncate max-w-32">
                          {user?.email}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="text-slate-400 hover:text-slate-100 text-sm"
                    >
                      SIGN OUT
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <NotesSection />
            )}
          </div>
        </div>
      </>
    );
  }

  // DESKTOP SIDEBAR
  return (
    <div className="hidden lg:flex lg:w-80 bg-slate-900 border-r border-slate-700 flex-col h-screen">
      
      {/* HEADER */}
      <div className="p-4 border-b border-slate-700">
        <h1 className="text-xl font-bold text-slate-100">HHB RAG ASSISTANT</h1>
      </div>

      {/* ACTIVE ASSISTANT INFO */}
      <div className="p-4 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">ACTIVE ASSISTANT</h2>
        <div className="bg-slate-700 rounded-lg p-3">
          <div className="text-sm text-slate-100 font-medium">
            {activeAssistant?.assistantName || 'No Assistant Selected'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {activeAssistant ? `Team: ${activeAssistant.teamName || 'Unknown'}` : 'Go to launcher to select'}
          </div>
        </div>
        <div className="mt-3">
          <button
            onClick={() => window.location.href = '/launcher'}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors"
          >
            Change Assistant
          </button>
        </div>
      </div>

      {/* CHAT HISTORY */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300">CHAT HISTORY</h2>
          <button 
            onClick={handleNewChat}
            disabled={!activeAssistant || loading}
            className="bg-blue-600 text-white px-3 py-1 rounded-md text-xs hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            NEW
          </button>
        </div>
        
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="text-slate-400 text-sm">LOADING...</div>
          ) : chatHistory.length === 0 ? (
            <div className="text-slate-500 text-sm">NO CHATS YET</div>
          ) : (
            chatHistory.map((chat) => (
              <div
                key={chat.id}
                onClick={() => handleChatSelect(chat)}
                className={`p-3 rounded-lg cursor-pointer transition-colors group ${
                  currentChat?.id === chat.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {chat.title}
                    </div>
                    <div className={`text-xs mt-1 ${
                      currentChat?.id === chat.id ? 'text-blue-200' : 'text-slate-500'
                    }`}>
                      {chat.portfolio_type}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteChat(chat.id, e)}
                    className={`ml-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 ${
                      currentChat?.id === chat.id ? 'text-white' : 'text-slate-400'
                    }`}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* NOTES SECTION */}
      <div className="flex-1 overflow-hidden">
        <NotesSection />
      </div>

      {/* USER INFO */}
      <div className="p-4 border-t border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">
                {user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-100 truncate max-w-32">
                {user?.email}
              </div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="text-slate-400 hover:text-slate-100 text-sm"
          >
            SIGN OUT
          </button>
        </div>
      </div>
    </div>
  );
} 