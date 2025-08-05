"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "../contexts/ChatContext";
import { PORTFOLIOS } from "../utils/portfolios";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: Array<{
    type: 'text';
    text: {
      value: string;
      annotations?: Array<{
        type: string;
        text: string;
        file_citation?: {
          file_id: string;
          quote: string;
        };
      }>;
    };
  }>;
  created_at: number;
}

export default function ChatInterface() {
  const { currentChat, currentPortfolio, setCurrentChat, setCurrentPortfolio, refreshChatHistory } = useChat();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [pendingChat, setPendingChat] = useState<{portfolioType: string, message: string} | null>(null);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // CLEANUP ABORT CONTROLLER ON UNMOUNT
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // LOAD MESSAGES WHEN CHAT CHANGES
  useEffect(() => {
    if (currentChat && !isCreatingNewChat) {
      loadMessages();
      setPendingChat(null);
    } else if (!currentChat) {
      setMessages([]);
      setPendingChat(null);
    }
  }, [currentChat, isCreatingNewChat]);

  const loadMessages = async () => {
    if (!currentChat) return;

    setIsLoadingMessages(true);
    try {
      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threadId: currentChat.thread_id,
          portfolioType: currentChat.portfolio_type
        }),
      });

      if (!response.ok) {
        throw new Error('FAILED TO LOAD MESSAGES');
      }

      const { messages: loadedMessages } = await response.json();
      // REVERSE THE MESSAGES TO SHOW IN CHRONOLOGICAL ORDER (OLDEST FIRST)
      setMessages((loadedMessages || []).reverse());
    } catch (error) {
      console.error('ERROR LOADING MESSAGES:', error);
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    // CANCEL ANY PENDING REQUEST
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // CREATE NEW ABORT CONTROLLER FOR THIS REQUEST
    abortControllerRef.current = new AbortController();

    // SETUP TIMEOUT TO RESET LOADING STATE
    const timeoutId = setTimeout(() => {
      console.log('REQUEST TIMEOUT - RESETTING LOADING STATE');
      setIsLoading(false);
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    }, 120000); // 2 MINUTE TIMEOUT

    // IF NO CURRENT CHAT, CREATE ONE WITH THE MESSAGE
    if (!currentChat && currentPortfolio) {
      setIsLoading(true);
      setIsCreatingNewChat(true); // PREVENT LOADING MESSAGES
      try {
        const response = await fetch('/api/chat/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            portfolioType: currentPortfolio,
            title: inputMessage.length > 50 ? inputMessage.substring(0, 50) + '...' : inputMessage,
            initialMessage: inputMessage
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'FAILED TO CREATE NEW CHAT');
        }

        const newChat = await response.json();
        
        // UPDATE CHAT CONTEXT WITH THE NEW CHAT IMMEDIATELY
        setCurrentChat(newChat);
        await refreshChatHistory(); // REFRESH TO UPDATE SIDEBAR
        
        // ADD USER MESSAGE IMMEDIATELY TO SHOW IT RIGHT AWAY
        const userMessage: Message = {
          id: `user-${Date.now()}`,
          role: 'user',
          content: [{ type: 'text', text: { value: inputMessage } }],
          created_at: Date.now() / 1000
        };
        setMessages([userMessage]);
        setInputMessage("");
        
        // NOW SEND THE MESSAGE TO GET ASSISTANT RESPONSE
        try {
          const sendResponse = await fetch('/api/chat/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              threadId: newChat.thread_id,
              message: inputMessage,
              portfolioType: currentPortfolio,
              streaming: true
            }),
            signal: abortControllerRef.current?.signal,
          });

          if (!sendResponse.ok) {
            const errorData = await sendResponse.json().catch(() => ({}));
            throw new Error(errorData.error || 'FAILED TO GET ASSISTANT RESPONSE');
          }

          // HANDLE STREAMING RESPONSE
          const reader = sendResponse.body?.getReader();
          const decoder = new TextDecoder();
          
          if (reader) {
            let assistantMessage = '';
            let citations: string[] = [];
            
            // ADD ASSISTANT MESSAGE TO STATE
            const assistantMessageObj: Message = {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: [{ type: 'text', text: { value: '' } }],
              created_at: Date.now() / 1000
            };
            setMessages(prev => [...prev, assistantMessageObj]);
            
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.slice(6));
                    
                    if (data.type === 'update') {
                      assistantMessage = data.content;
                      citations = data.citations;
                      
                      // UPDATE THE ASSISTANT MESSAGE
                      setMessages(prev => prev.map(msg => 
                        msg.id === assistantMessageObj.id 
                          ? { ...msg, content: [{ type: 'text', text: { value: assistantMessage } }] }
                          : msg
                      ));
                    } else if (data.type === 'done') {
                      // STREAMING COMPLETE
                      break;
                    } else if (data.type === 'error') {
                      throw new Error(data.error);
                    }
                  }
                }
              }
            } finally {
              reader.releaseLock();
            }
          } else {
            // FALLBACK TO NON-STREAMING
            const { messages: newMessages } = await sendResponse.json();
            setMessages(newMessages.reverse());
          }
        } catch (sendError) {
          if (sendError instanceof Error && sendError.name === 'AbortError') {
            console.log('SEND REQUEST CANCELLED');
            return;
          }
          console.error('ERROR GETTING ASSISTANT RESPONSE:', sendError);
          // ADD ERROR MESSAGE
          const errorMessage: Message = {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: [{ type: 'text', text: { value: sendError instanceof Error ? sendError.message : 'SORRY, THERE WAS AN ERROR GETTING THE ASSISTANT RESPONSE. PLEASE TRY AGAIN.' } }],
            created_at: Date.now() / 1000
          };
          setMessages(prev => [...prev, errorMessage]);
        } finally {
          setIsLoading(false);
          setIsCreatingNewChat(false); // ALLOW LOADING MESSAGES AGAIN
        }
        
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('REQUEST CANCELLED');
          return;
        }
        console.error('ERROR CREATING NEW CHAT:', error);
        setIsLoading(false);
        setIsCreatingNewChat(false); // ALLOW LOADING MESSAGES AGAIN
        return;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // REGULAR MESSAGE SENDING
    if (!currentChat || !currentPortfolio) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: [{ type: 'text', text: { value: inputMessage } }],
      created_at: Date.now() / 1000
    };

    // ADD USER MESSAGE TO THE END
    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threadId: currentChat.thread_id,
          message: inputMessage,
          portfolioType: currentPortfolio,
          streaming: true
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'FAILED TO SEND MESSAGE');
      }

      // HANDLE STREAMING RESPONSE
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (reader) {
        let assistantMessage = '';
        let citations: string[] = [];
        
        // ADD ASSISTANT MESSAGE TO STATE
        const assistantMessageObj: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: [{ type: 'text', text: { value: '' } }],
          created_at: Date.now() / 1000
        };
        setMessages(prev => [...prev, assistantMessageObj]);
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'update') {
                  assistantMessage = data.content;
                  citations = data.citations;
                  
                  // UPDATE THE ASSISTANT MESSAGE
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessageObj.id 
                      ? { ...msg, content: [{ type: 'text', text: { value: assistantMessage } }] }
                      : msg
                  ));
                } else if (data.type === 'done') {
                  // STREAMING COMPLETE
                  break;
                } else if (data.type === 'error') {
                  throw new Error(data.error);
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      } else {
        // FALLBACK TO NON-STREAMING
        const { messages: newMessages } = await response.json();
        setMessages(newMessages.reverse());
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('REQUEST CANCELLED');
        return;
      }
      console.error('ERROR SENDING MESSAGE:', error);
      // ADD ERROR MESSAGE
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: [{ type: 'text', text: { value: error instanceof Error ? error.message : 'SORRY, THERE WAS AN ERROR PROCESSING YOUR MESSAGE. PLEASE TRY AGAIN.' } }],
        created_at: Date.now() / 1000
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      clearTimeout(timeoutId);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!currentChat && !currentPortfolio) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-100 mb-4">
            WELCOME TO HHB RAG ASSISTANT
          </h2>
          <p className="text-slate-400 mb-6">
            SELECT A PORTFOLIO FROM THE SIDEBAR TO START A NEW CHAT
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
            {Object.entries(PORTFOLIOS).map(([key, portfolio]) => (
              <div key={key} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <h3 className="font-semibold text-slate-100 mb-2">{portfolio.name}</h3>
                <p className="text-sm text-slate-400">{portfolio.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-900">
      {/* CHAT HEADER */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <h2 className="text-lg font-semibold text-slate-100">
          {currentChat ? currentChat.title : `NEW ${currentPortfolio ? PORTFOLIOS[currentPortfolio].name : 'CHAT'}`}
        </h2>
        <p className="text-sm text-slate-400">
          {currentPortfolio ? PORTFOLIOS[currentPortfolio].name : 'SELECT A PORTFOLIO'}
        </p>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoadingMessages ? (
          <div className="flex justify-center py-8">
            <div className="text-slate-400">LOADING MESSAGES...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-400">
              {currentPortfolio 
                ? `START A CONVERSATION WITH THE ${PORTFOLIOS[currentPortfolio].name} ASSISTANT`
                : 'SELECT A PORTFOLIO TO START CHATTING'
              }
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-3xl rounded-lg px-4 py-2 flex items-center ${
                  message.role === 'user'
                    ? 'bg-slate-600 text-slate-100'
                    : 'bg-slate-700 text-slate-100'
                }`}
              >
                {message.content.map((content, index) => {
                  if (content.type === 'text') {
                    let text = content.text.value;
                    
                    // HANDLE CITATIONS
                    if (content.text.annotations) {
                      content.text.annotations.forEach((annotation, annIndex) => {
                        if (annotation.type === 'file_citation' && annotation.file_citation) {
                          text = text.replace(
                            annotation.text,
                            `[${annIndex + 1}]`
                          );
                        }
                      });
                    }
                    
                    return (
                      <div key={index} className="whitespace-pre-wrap">
                        {text}
                        {message.role === 'assistant' && content.text.annotations && (
                          <div className="mt-2 text-xs text-slate-400 border-t border-slate-600 pt-2">
                            <div className="font-semibold mb-1">SOURCES:</div>
                            {content.text.annotations
                              .filter(ann => ann.type === 'file_citation')
                              .map((annotation, annIndex) => (
                                <div key={annIndex} className="mb-1">
                                  <span className="font-medium">[{annIndex + 1}]</span> {annotation.file_citation?.quote}
                                  {annotation.file_citation?.file_id && (
                                    <span className="text-slate-500 ml-1">
                                      (File: {annotation.file_citation.file_id})
                                    </span>
                                  )}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-700 text-slate-100 rounded-lg px-4 py-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
      <div className="bg-slate-800 border-t border-slate-700 p-4">
        <div className="flex space-x-4">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={currentPortfolio ? "TYPE YOUR MESSAGE HERE..." : "SELECT A PORTFOLIO TO START CHATTING"}
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-slate-100 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-slate-500"
            rows={1}
            disabled={isLoading || isLoadingMessages || !currentPortfolio}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading || isLoadingMessages || !currentPortfolio}
            className="bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-100 px-4 py-2 rounded-lg transition-colors"
          >
            SEND
          </button>
        </div>
      </div>
    </div>
  );
} 