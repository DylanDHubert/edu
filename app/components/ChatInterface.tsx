"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "../contexts/ChatContext";
import { PORTFOLIOS, PortfolioType } from "../utils/portfolios";
import ReactMarkdown from 'react-markdown';

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
  const [currentStep, setCurrentStep] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // FORMAT MARKDOWN FOR BOLD AND ITALICS ONLY
  const formatMarkdown = (text: string) => {
    // REPLACE **BOLD** WITH <strong>BOLD</strong>
    let formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // REPLACE *ITALIC* WITH <em>ITALIC</em>
    formattedText = formattedText.replace(/\*(.*?)\*/g, '<em>$1</em>');
    return formattedText;
  };

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
    
    // IF WE'RE CREATING A NEW CHAT, DON'T LOAD MESSAGES YET
    if (isCreatingNewChat) {
      return;
    }

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

      // CLEAN MESSAGES TO REMOVE NOTES CONTEXT FROM USER MESSAGES
      const cleanedMessages = (loadedMessages || []).map((msg: any) => {
        if (msg.role === 'user' && msg.content[0]?.text?.value) {
          const text = msg.content[0].text.value;
          // REMOVE NOTES CONTEXT FROM USER MESSAGES
          const userMessageMatch = text.match(/USER MESSAGE: (.+)/);
          if (userMessageMatch) {
            return {
              ...msg,
              content: [{
                ...msg.content[0],
                text: {
                  ...msg.content[0].text,
                  value: userMessageMatch[1]
                }
              }]
            };
          }
        }
        return msg;
      });

      // REVERSE THE MESSAGES TO SHOW IN CHRONOLOGICAL ORDER (OLDEST FIRST)
      // REPLACE ALL MESSAGES WITH THE REAL ONES FROM SERVER
      setMessages(cleanedMessages.reverse());
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

    // STORE THE MESSAGE FOR LATER USE
    const messageToSend = inputMessage;
    setInputMessage("");

    // IF NO CURRENT CHAT, CREATE ONE WITH THE MESSAGE
    if (!currentChat && currentPortfolio) {
      setIsCreatingNewChat(true); // PREVENT LOADING MESSAGES
      
      // START LOADING STATE IMMEDIATELY
      setIsLoading(true);
        
        try {
          const response = await fetch('/api/chat/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              portfolioType: currentPortfolio,
              title: messageToSend.length > 50 ? messageToSend.substring(0, 50) + '...' : messageToSend,
              initialMessage: messageToSend
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
          
          // ADD TEMPORARY USER MESSAGE AFTER CHAT IS CREATED AND TITLE IS UPDATED
          const tempUserMessage: Message = {
            id: `temp-user-${Date.now()}`,
            role: 'user',
            content: [{ type: 'text', text: { value: messageToSend } }],
            created_at: Date.now() / 1000
          };
          setMessages([tempUserMessage]);
        
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
            let currentStep = '';
            let assistantMessageObj: Message | null = null;
            
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
                      currentStep = data.step || '';
                      
                      // CREATE ASSISTANT MESSAGE BUBBLE ONLY WHEN WE HAVE CONTENT
                      if (!assistantMessageObj && assistantMessage.trim()) {
                        assistantMessageObj = {
                          id: `assistant-${Date.now()}`,
                          role: 'assistant',
                          content: [{ type: 'text', text: { value: assistantMessage } }],
                          created_at: Date.now() / 1000
                        };
                        setMessages(prev => [...prev, assistantMessageObj!]);
                      } else if (assistantMessageObj) {
                        // UPDATE THE ASSISTANT MESSAGE
                        setMessages(prev => prev.map(msg => 
                          msg.id === assistantMessageObj!.id 
                            ? { ...msg, content: [{ type: 'text', text: { value: assistantMessage } }] }
                            : msg
                        ));
                      }
                      
                      // UPDATE CURRENT STEP
                      setCurrentStep(data.step || '');
                    } else if (data.type === 'done') {
                      // STREAMING COMPLETE
                      setCurrentStep('');
                      break;
                    } else if (data.type === 'error') {
                      setCurrentStep('');
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

    // ADD TEMPORARY USER MESSAGE FOR EXISTING CHATS
    const tempUserMessage: Message = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: [{ type: 'text', text: { value: messageToSend } }],
      created_at: Date.now() / 1000
    };
    setMessages(prev => [...prev, tempUserMessage]);
    
    // START LOADING STATE IMMEDIATELY
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
        let currentStep = '';
        let assistantMessageObj: Message | null = null;
        
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
                  currentStep = data.step || '';
                  
                  // CREATE ASSISTANT MESSAGE BUBBLE ONLY WHEN WE HAVE CONTENT
                  if (!assistantMessageObj && assistantMessage.trim()) {
                    assistantMessageObj = {
                      id: `assistant-${Date.now()}`,
                      role: 'assistant',
                      content: [{ type: 'text', text: { value: assistantMessage } }],
                      created_at: Date.now() / 1000
                    };
                    setMessages(prev => [...prev, assistantMessageObj!]);
                  } else if (assistantMessageObj) {
                    // UPDATE THE ASSISTANT MESSAGE
                    setMessages(prev => prev.map(msg => 
                      msg.id === assistantMessageObj!.id 
                        ? { ...msg, content: [{ type: 'text', text: { value: assistantMessage } }] }
                        : msg
                    ));
                  }
                  
                  // UPDATE CURRENT STEP
                  setCurrentStep(data.step || '');
                } else if (data.type === 'done') {
                  // STREAMING COMPLETE
                  setCurrentStep('');
                  break;
                } else if (data.type === 'error') {
                  setCurrentStep('');
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

  if (!currentPortfolio) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-800">
        <div className="text-center px-4 lg:px-8">
          <h2 className="text-xl lg:text-2xl font-bold text-slate-100 mb-4">
            WELCOME TO HHB RAG ASSISTANT
          </h2>
          <p className="text-slate-400 mb-6 text-sm lg:text-base">
            SELECT A PORTFOLIO
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
            {Object.entries(PORTFOLIOS).map(([key, portfolio]) => (
              <button
                key={key}
                onClick={() => setCurrentPortfolio(key as PortfolioType)}
                className={`border rounded-lg p-3 lg:p-4 text-left transition-colors ${
                  key === 'hip' ? 'bg-blue-700 border-blue-600 hover:bg-blue-600' :
                  key === 'knee' ? 'bg-green-700 border-green-600 hover:bg-green-600' :
                  key === 'ts_knee' ? 'bg-purple-700 border-purple-600 hover:bg-purple-600' :
                  'bg-slate-700 border-slate-600 hover:bg-slate-600'
                }`}
              >
                <h3 className="font-semibold text-white mb-2 text-sm lg:text-base">{portfolio.name}</h3>
                <p className="text-xs lg:text-sm text-slate-200">{portfolio.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-900 h-screen">
      {/* CHAT HEADER - FIXED */}
      <div className="bg-slate-800 border-b border-slate-700 p-3 lg:p-4 flex-shrink-0">
        <h2 className="text-base lg:text-lg font-semibold text-slate-100 truncate">
          {currentChat ? currentChat.title : `NEW ${currentPortfolio ? PORTFOLIOS[currentPortfolio].name : 'CHAT'}`}
        </h2>
        <p className="text-xs lg:text-sm text-slate-400 truncate">
          {currentPortfolio ? (
            <span className={`font-medium ${
              currentPortfolio === 'hip' ? 'text-blue-400' :
              currentPortfolio === 'knee' ? 'text-green-400' :
              currentPortfolio === 'ts_knee' ? 'text-purple-400' :
              'text-slate-400'
            }`}>
              {PORTFOLIOS[currentPortfolio].name}
            </span>
          ) : (
            'SELECT A PORTFOLIO'
          )}
        </p>
      </div>

      {/* MESSAGES - SCROLLABLE */}
      <div className="flex-1 overflow-y-auto p-3 lg:p-4 space-y-3 lg:space-y-4 min-h-0">
        {isLoadingMessages ? (
          <div className="flex justify-center py-8">
            <div className="text-slate-400">LOADING MESSAGES...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            {/* EMPTY STATE - NO MESSAGE TO AVOID FLASHING */}
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] lg:max-w-3xl rounded-lg px-3 py-2 lg:px-4 lg:py-2 flex items-center ${
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
                        {message.role === 'assistant' ? (
                          <div 
                            className="whitespace-pre-wrap leading-none"
                            dangerouslySetInnerHTML={{ 
                              __html: formatMarkdown(text.split('\n').filter(line => line.trim() !== '').join('\n')) 
                            }}
                          />
                        ) : (
                          <span 
                            dangerouslySetInnerHTML={{ 
                              __html: formatMarkdown(text) 
                            }}
                          />
                        )}
                        {message.role === 'assistant' && content.text.annotations && content.text.annotations.length > 0 && (
                          <div className="mt-2 text-xs text-slate-400 border-t border-slate-600 pt-2">
                            <div className="font-semibold mb-1">SOURCES:</div>
                                                        {content.text.annotations
                              .filter(ann => ann.type === 'file_citation')
                              .map((annotation, annIndex) => {
                                // EXTRACT FILENAME AND PAGE INFO FROM CITATION TEXT (E.G., "【4:1†Knee_Triathlon Knee Replacement Presentation.pdf】")
                                const citationText = annotation.text;
                                const citationMatch = citationText.match(/【(\d+):(\d+)†(.+?)】/);
                                let filename = 'Unknown file';
                                let pageInfo = '';
                                
                                if (citationMatch) {
                                  const page = citationMatch[1];
                                  const paragraph = citationMatch[2];
                                  filename = citationMatch[3];
                                  pageInfo = ` (Page ${page}, Paragraph ${paragraph})`;
                                } else {
                                  filename = annotation.file_citation?.quote || 'Unknown file';
                                }
                                
                                // CLEAN UP FILENAME - REMOVE ANY REMAINING CITATION MARKERS
                                const cleanFilename = filename.replace(/【\d+:\d+†(.+?)】/g, '$1').trim();
                                
                                return (
                                  <div key={annIndex} className="mb-1">
                                    <span className="font-medium">[{annIndex + 1}]</span> {cleanFilename}{pageInfo}
                                  </div>
                                );
                              })}
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
        
        {isLoading && isCreatingNewChat && !currentStep ? (
          // CENTERED SPINNER FOR INITIAL CHAT CREATION
          <div className="flex justify-center items-center py-8">
            <div className="w-8 h-8 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : isLoading && (
          // TYPING INDICATOR FOR ASSISTANT RESPONSES
          <div className="flex justify-start">
            <div className="bg-slate-700 text-slate-100 rounded-lg px-4 py-2">
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-xs text-slate-400 ml-2">
                  {currentStep || 'ASSISTANT IS THINKING...'}
                </span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT - FIXED AT BOTTOM */}
      <div className="bg-slate-800 border-t border-slate-700 p-3 lg:p-4 flex-shrink-0">
        <div className="flex space-x-2 lg:space-x-4">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={currentPortfolio ? "TYPE YOUR MESSAGE HERE..." : "SELECT A PORTFOLIO TO START CHATTING"}
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 lg:px-4 lg:py-2 text-slate-100 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-slate-500 text-base"
            rows={1}
            disabled={isLoading || isLoadingMessages || !currentPortfolio}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading || isLoadingMessages || !currentPortfolio}
            className="bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-100 px-3 py-2 lg:px-4 lg:py-2 rounded-lg transition-colors text-base whitespace-nowrap"
          >
            SEND
          </button>
        </div>
        {/* FOOTER */}
        <div className="mt-2 text-center">
          <p className="text-slate-500 text-sm pb-2">The HHB System can be wrong. <br />Please verify critical information.</p>
        </div>
      </div>
    </div>
  );
} 