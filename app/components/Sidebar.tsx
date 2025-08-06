"use client";

import { useState } from "react";
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

        {/* PORTFOLIO SELECTION */}
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">SELECT PORTFOLIO</h2>
          <div className="flex space-x-2">
            <button
              onClick={() => handlePortfolioSelect('hip')}
              disabled={loading}
              className={`flex-1 p-2 rounded-md text-sm transition-colors ${
                currentPortfolio === 'hip'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-slate-100'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              HIP
            </button>
            <button
              onClick={() => handlePortfolioSelect('knee')}
              disabled={loading}
              className={`flex-1 p-2 rounded-md text-sm transition-colors ${
                currentPortfolio === 'knee'
                  ? 'bg-green-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-slate-100'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              KNEE
            </button>
            <button
              onClick={() => handlePortfolioSelect('ts_knee')}
              disabled={loading}
              className={`flex-1 p-2 rounded-md text-sm transition-colors ${
                currentPortfolio === 'ts_knee'
                  ? 'bg-purple-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-slate-100'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              TS KNEE
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
                  {chatHistory
                    .filter(chat => !currentPortfolio || chat.portfolio_type === currentPortfolio)
                    .map((chat) => (
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
                          setCurrentPortfolio(chat.portfolio_type);
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
                             (chat.portfolio_type as string).toUpperCase()}
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
              <NotesSection onNoteSelect={() => setIsMobileOpen(false)} />
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