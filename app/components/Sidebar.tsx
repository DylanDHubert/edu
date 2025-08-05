"use client";

import { useAuth } from "../contexts/AuthContext";
import { useChat } from "../contexts/ChatContext";
import { PORTFOLIOS, PortfolioType } from "../utils/portfolios";

export default function Sidebar() {
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
    <div className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col h-screen">
      {/* HEADER */}
      <div className="p-4 border-b border-slate-700">
        <h1 className="text-xl font-bold text-slate-100 mb-2">HHB RAG ASSISTANT</h1>
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
        <div className="space-y-2">
          {Object.entries(PORTFOLIOS).map(([key, portfolio]) => (
            <button
              key={key}
              onClick={() => handlePortfolioSelect(key as PortfolioType)}
              disabled={loading}
              className={`w-full text-left p-3 rounded-md text-sm transition-colors ${
                currentPortfolio === key
                  ? 'bg-slate-600 text-slate-100'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-slate-100'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="font-medium">{portfolio.name}</div>
              <div className="text-xs text-slate-400 mt-1">
                {portfolio.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* CHAT HISTORY */}
      <div className="flex-1 overflow-y-auto p-4">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">CHAT HISTORY</h2>
        {chatHistory.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">
            NO CHAT HISTORY YET
          </p>
        ) : (
          <div className="space-y-2">
            {chatHistory.map((chat) => (
              <div
                key={chat.id}
                className={`relative group ${
                  currentChat?.id === chat.id
                    ? 'bg-slate-600 text-slate-100'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-slate-100'
                } rounded-md transition-colors`}
              >
                <button
                  onClick={() => {
                    setCurrentChat(chat);
                    setCurrentPortfolio(chat.portfolio_type);
                  }}
                  className="w-full text-left p-3 rounded-md text-sm"
                >
                  <div className="font-medium truncate pr-8">{chat.title}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {PORTFOLIOS[chat.portfolio_type].name}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {new Date(chat.updated_at).toLocaleDateString()}
                  </div>
                </button>
                
                {/* DELETE BUTTON - MOVED TO BOTTOM RIGHT */}
                <button
                  onClick={(e) => handleDeleteChat(chat.id, e)}
                  className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 text-xs p-1"
                  title="DELETE CHAT"
                >
                  TRASH
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="p-4 border-t border-slate-700">
        <div className="text-xs text-slate-400 text-center">
          POWERED BY OPENAI ASSISTANTS API
        </div>
      </div>
    </div>
  );
} 