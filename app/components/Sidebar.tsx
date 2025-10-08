"use client";

import { useState, useEffect, useContext } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useChat } from "../contexts/ChatContext";
import AssistantSelectModal from "./AssistantSelectModal";
import ConfirmationModal from "./ConfirmationModal";

interface SidebarProps {
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  isDesktopOpen: boolean;
  setIsDesktopOpen: (open: boolean) => void;
}

export default function Sidebar({ isMobileOpen, setIsMobileOpen, isDesktopOpen, setIsDesktopOpen }: SidebarProps) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { 
    chatHistory, 
    currentChat, 
    setCurrentChat, 
    createNewChat, 
    deleteChat,
    refreshChatHistory,
    loading 
  } = useChat();

  // MOBILE STATE MANAGEMENT
  const [activeTab, setActiveTab] = useState<'chat'>('chat');
  const [activeAssistant, setActiveAssistant] = useState<any>(null);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [isAssistantModalOpen, setIsAssistantModalOpen] = useState(false);
  
  // CONFIRMATION MODAL STATE
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'danger'
  });
  const [isDeletingChat, setIsDeletingChat] = useState(false);

  // Load active assistant from localStorage
  useEffect(() => {
    const loadActiveAssistant = () => {
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
      } else {
        setActiveAssistant(null);
      }
    };

    // Load initially
    loadActiveAssistant();

    // Listen for changes to active assistant
    const handleActiveAssistantChanged = () => {
      loadActiveAssistant();
    };

    window.addEventListener('activeAssistantChanged', handleActiveAssistantChanged);

    return () => {
      window.removeEventListener('activeAssistantChanged', handleActiveAssistantChanged);
    };
  }, []);

  // CONFIRMATION MODAL HELPERS
  const showConfirmationModal = (
    title: string,
    message: string,
    onConfirm: () => void,
    variant: 'danger' | 'warning' | 'info' = 'danger'
  ) => {
    setConfirmationModal({
      isOpen: true,
      title,
      message,
      onConfirm,
      variant
    });
  };

  const closeConfirmationModal = () => {
    setConfirmationModal(prev => ({ ...prev, isOpen: false }));
  };

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // PREVENT CHAT SELECTION WHEN CLICKING DELETE
    
    // FIND THE CHAT TO GET ITS TITLE
    const chatToDelete = chatHistory.find(chat => chat.id === chatId);
    const chatTitle = chatToDelete?.title || 'this chat';
    
    showConfirmationModal(
      'Delete Chat',
      `Are you sure you want to delete "${chatTitle}"? This will permanently remove all messages and cannot be undone.`,
      async () => {
        try {
          setIsDeletingChat(true);
          await deleteChat(chatId);
          closeConfirmationModal();
        } catch (error) {
          console.error('Error deleting chat:', error);
          // Could add error notification here
        } finally {
          setIsDeletingChat(false);
        }
      },
      'danger'
    );
  };

  const handleNewChat = async () => {
    if (!activeAssistant || isCreatingNewChat) return;
    
    setIsCreatingNewChat(true);
    
    try {
      // Create new chat with current activeAssistant configuration
      const response = await fetch('/api/chat/create-team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId: activeAssistant.teamId,
          portfolioId: activeAssistant.portfolioId,
          assistantId: activeAssistant.assistantId,
          title: `Untitled ${activeAssistant.portfolioName || 'Chat'}`
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create new chat');
      }

      const newChat = await response.json();
      
      // Set as current chat
      setCurrentChat(newChat);
      
      // Refresh chat history to show the new chat
      await refreshChatHistory();
      
      // Close mobile sidebar
      setIsMobileOpen(false);
      
    } catch (error) {
      console.error('Error creating new chat:', error);
      // Could add user notification here
    } finally {
      setIsCreatingNewChat(false);
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
          className="lg:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <div className={`
        fixed inset-y-0 left-0 z-40
        w-full lg:w-80 bg-slate-800 border-r border-slate-700 flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        ${isDesktopOpen ? 'lg:translate-x-0' : 'lg:-translate-x-full'}
      `}>

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
          {/* Notes tab removed */}
          {/* MOBILE CLOSE TAB - ONLY VISIBLE ON MOBILE */}
          <button
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden w-12 p-3 text-slate-400 hover:text-slate-300 hover:bg-slate-700 transition-colors flex items-center justify-center"
            title="CLOSE MENU"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'chat' ? (
            // CHAT HISTORY TAB
            <div className="p-4 flex flex-col h-full">
              <div className="flex-shrink-0 mb-4">
                <h2 className="text-sm font-semibold text-slate-300 mb-3">CHAT HISTORY</h2>
                {/* NEW CHAT BUTTON */}
                <button
                  onClick={handleNewChat}
                  disabled={!activeAssistant || isCreatingNewChat}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
                >
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="flex-1 text-center">
                    {isCreatingNewChat ? 'Creating...' : 'New Chat'}
                  </span>
                </button>
              </div>
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
                          // CLOSE MOBILE SIDEBAR WHEN SELECTING CHAT
                          setIsMobileOpen(false);
                        }}
                        className="w-full text-left text-sm"
                      >
                        {/* TEAM CONTEXT BADGE */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs px-2 py-1 rounded bg-blue-500 text-white">
                            {activeAssistant?.portfolioName?.toUpperCase() || 'TEAM CHAT'}
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
            // NOTES TAB REMOVED
            <div className="flex flex-col h-full">
              <div className="text-center py-8">
                <p className="text-slate-400 text-sm">
                  NOTES SYSTEM REMOVED
                </p>
              </div>
            </div>
          )}
        </div>

        {/* SWITCH ASSISTANT BUTTON */}
        <div className="p-4 border-t border-slate-700">
          <button
            onClick={() => setIsAssistantModalOpen(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <span className="flex-1 text-center">Switch Assistant</span>
          </button>
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-700">
          <div className="text-xs pb-2 text-slate-400 text-center">
            WELCOME & THANKS, FROM THE HHB TEAM!
          </div>
        </div>
      </div>

      {/* ASSISTANT SELECT MODAL */}
      <AssistantSelectModal
        isOpen={isAssistantModalOpen}
        onClose={() => setIsAssistantModalOpen(false)}
        currentAssistant={activeAssistant}
      />

      {/* CONFIRMATION MODAL */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={closeConfirmationModal}
        onConfirm={confirmationModal.onConfirm}
        title={confirmationModal.title}
        message={confirmationModal.message}
        variant={confirmationModal.variant}
        isLoading={isDeletingChat}
        loadingText="Deleting chat..."
      />
    </>
  );
} 