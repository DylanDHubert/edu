"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useChat } from "../contexts/ChatContext";
import { PORTFOLIOS, PortfolioType } from "../utils/portfolios";
import NotesSection from "./NotesSection";

interface SidebarProps {
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

export default function Sidebar({ isMobileOpen, setIsMobileOpen }: SidebarProps) {
  const { user, signOut } = useAuth();
  const { 
    currentPortfolio, 
    setCurrentPortfolio, 
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

  // Load active assistant from localStorage
  useEffect(() => {
    const storedAssistant = localStorage.getItem('activeAssistant');
    if (storedAssistant) {
      try {
        const assistant = JSON.parse(storedAssistant);
        setActiveAssistant(assistant);
        
        // Update the sidebar info elements
        const nameEl = document.getElementById('sidebar-assistant-name');
        const contextEl = document.getElementById('sidebar-assistant-context');
        if (nameEl) nameEl.textContent = assistant.assistantName || 'Team Assistant';
        if (contextEl) contextEl.textContent = assistant.teamName ? `Team: ${assistant.teamName}` : 'Team Mode';
      } catch (error) {
        console.error('Error parsing activeAssistant from localStorage:', error);
      }
    }
  }, []);

  const handlePortfolioSelect = (portfolioType: PortfolioType) => {
    setCurrentPortfolio(portfolioType);
    setCurrentChat(null); // CLEAR CURRENT CHAT WHEN SELECTING NEW PORTFOLIO
  };

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // PREVENT CHAT SELECTION WHEN CLICKING DELETE
    if (confirm('ARE YOU SURE YOU WANT TO DELETE THIS CHAT?')) {
      await deleteChat(chatId);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("ERROR LOGGING OUT:", error);
    }
  };

  return (
    <>
      {/* MOBILE OVERLAY */}
      {isMobileOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-full lg:w-80 bg-slate-800 border-r border-slate-700 flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* HEADER */}
        <div className="p-4 border-b border-slate-700">
          <h1 className="text-xl font-bold text-slate-100 mb-2">HHB Stryker Assistant</h1>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">
              {user?.email?.toUpperCase()}
            </span>
            <button
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              LOGOUT
            </button>
          </div>
        </div>

        {/* ACTIVE ASSISTANT INFO */}
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">ACTIVE ASSISTANT</h2>
          <div className="bg-slate-700 rounded-lg p-3">
            <div className="text-sm text-slate-100 font-medium" id="sidebar-assistant-name">
              Loading...
            </div>
            <div className="text-xs text-slate-400 mt-1" id="sidebar-assistant-context">
              No assistant selected
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

        {/* TABS */}
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 p-3 text-sm font-medium transition-colors ${
              activeTab === 'chat'
                ? 'bg-slate-600 text-slate-100 border-b-2 border-slate-400'
                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700'
            }`}
          >
            CHAT HISTORY
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 p-3 text-sm font-medium transition-colors ${
              activeTab === 'notes'
                ? 'bg-slate-600 text-slate-100 border-b-2 border-slate-400'
                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700'
            }`}
          >
            NOTES
          </button>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'chat' ? (
            // CHAT HISTORY TAB
            <div className="p-4 flex flex-col h-full">
              <h2 className="text-sm font-semibold text-slate-300 mb-3 flex-shrink-0">CHAT HISTORY</h2>
              {chatHistory.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">
                  NO CHAT HISTORY YET
                </p>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {chatHistory.map((chat) => (
                    <div
                      key={chat.id}
                      className={`rounded-md text-sm group relative mb-2 p-2 ${
                        currentChat?.id === chat.id
                          ? 'bg-slate-600'
                          : 'bg-slate-700'
                      }`}
                    >
                      <button
                        onClick={() => {
                          setCurrentChat(chat);
                          // Only set portfolio for individual chats
                          if (chat.portfolio_type) {
                            setCurrentPortfolio(chat.portfolio_type);
                          }
                          // CLOSE MOBILE SIDEBAR WHEN SELECTING CHAT
                          setIsMobileOpen(false);
                        }}
                        className="w-full text-left text-sm"
                      >
                        {/* PORTFOLIO BADGE */}
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs px-2 py-1 rounded ${
                            chat.portfolio_type === 'hip' ? 'bg-blue-500' :
                            chat.portfolio_type === 'knee' ? 'bg-green-500' :
                            chat.portfolio_type === 'ts_knee' ? 'bg-purple-500' :
                            'bg-slate-500'
                          } text-white`}>
                            {chat.portfolio_type === 'hip' ? 'HIP' :
                             chat.portfolio_type === 'knee' ? 'KNEE' :
                             chat.portfolio_type === 'ts_knee' ? 'TS KNEE' :
                             chat.team_id ? 'TEAM' : 'UNKNOWN'}
                          </span>
                        </div>

                        {/* CHAT TITLE */}
                        <div className="font-medium text-slate-100 mb-1 truncate">
                          {chat.title.toUpperCase()}
                        </div>

                        {/* CHAT METADATA */}
                        <div className="text-xs text-slate-500 mb-2">
                          {new Date(chat.updated_at).toLocaleDateString()}
                        </div>
                      </button>
                      
                      {/* DELETE BUTTON - MOVED TO BOTTOM RIGHT */}
                      <button
                        onClick={(e) => handleDeleteChat(chat.id, e)}
                        className="absolute bottom-2 right-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 text-xs p-1"
                        title="DELETE CHAT"
                      >
                        TRASH
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // NOTES TAB
            <div className="flex flex-col h-full">
              <NotesSection 
                onNoteSelect={() => setIsMobileOpen(false)} 
                teamContext={activeAssistant ? {
                  teamId: activeAssistant.teamId,
                  teamName: activeAssistant.teamName || 'Team',
                  accountId: activeAssistant.accountId,
                  accountName: activeAssistant.accountName || 'Account',
                  portfolioId: activeAssistant.portfolioId,
                  portfolioName: activeAssistant.portfolioName || 'Portfolio'
                } : null}
              />
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-700">
          <div className="text-xs pb-2 text-slate-400 text-center">
            WELCOME & THANKS, FROM THE HHB TEAM!
          </div>
        </div>
      </div>
    </>
  );
} 