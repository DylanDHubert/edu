"use client";

import { useState, useEffect, useRef, useContext } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useChat } from "../contexts/ChatContext";
import StandardHeader from "./StandardHeader";
import FeedbackModal from "./FeedbackModal";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

interface ActiveAssistant {
  assistantId: string;
  assistantName: string;
  teamId: string;
  accountId: string;
  portfolioId: string;
  accountName?: string;
  portfolioName?: string;
  teamName?: string;
  teamLocation?: string;
  userRole?: string;
}

export default function ChatInterface({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();
  const { currentChat, setCurrentChat, refreshChatHistory } = useChat();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [pendingChat, setPendingChat] = useState<{portfolioType: string, message: string} | null>(null);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [messageRatings, setMessageRatings] = useState<Record<string, any>>({});
  const [isRatingMessage, setIsRatingMessage] = useState<string | null>(null);
  const [responseStartTimes, setResponseStartTimes] = useState<Record<string, number>>({});
  const [feedbackModalOpen, setFeedbackModalOpen] = useState<string | null>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [activeAssistant, setActiveAssistant] = useState<ActiveAssistant | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load active assistant from localStorage on mount
  useEffect(() => {
    const storedAssistant = localStorage.getItem('activeAssistant');
    if (storedAssistant) {
      try {
        const assistant = JSON.parse(storedAssistant);
        setActiveAssistant(assistant);
        console.log('Team assistant loaded:', assistant);
      } catch (error) {
        console.error('Error parsing activeAssistant from localStorage:', error);
      }
    }
  }, []);

  // MARKDOWN STYLING COMPONENTS WITH MINIMAL SPACING
  const markdownComponents = {
    h1: ({children}: any) => <h1 className="text-2xl font-bold text-slate-100 mt-2 mb-1">{children}</h1>,
    h2: ({children}: any) => {
      console.log('🔍 H2 DEBUG - Content:', children);
      return <h2 className="text-xl font-semibold text-slate-100 mt-2 mb-1">{children}</h2>;
    },
    h3: ({children}: any) => <h3 className="text-lg font-semibold text-slate-100 mt-1 mb-0.5">{children}</h3>,
    p: ({children}: any) => {
      console.log('🔍 PARAGRAPH DEBUG - Content:', children);
      console.log('🔍 PARAGRAPH DEBUG - Is empty:', !children || (typeof children === 'string' && children.trim() === ''));
      
      // Don't render empty paragraphs
      if (!children || (typeof children === 'string' && children.trim() === '')) {
        return null;
      }
      
      return <p className="mb-1 text-slate-100">{children}</p>;
    },
    ul: ({children}: any) => {
      console.log('🔍 UL DEBUG - Content:', children);
      return <ul className="mb-1 ml-4 space-y-0">{children}</ul>;
    },
    ol: ({children}: any) => <ol className="mb-1 ml-4 space-y-0 list-decimal list-inside">{children}</ol>,
    li: ({children}: any) => <li className="text-slate-100">{children}</li>,
    strong: ({children}: any) => <strong className="font-semibold text-slate-100">{children}</strong>,
    em: ({children}: any) => <em className="italic text-slate-100">{children}</em>,
    // TABLE COMPONENTS
    table: ({children}: any) => {
      console.log('🔍 TABLE DEBUG - Table component rendered');
      return (
        <div className="overflow-x-auto mb-2">
          <table className="min-w-full border border-slate-600 bg-slate-800 rounded-lg border-collapse">{children}</table>
        </div>
      );
    },
    thead: ({children}: any) => <thead className="bg-slate-700">{children}</thead>,
    tbody: ({children}: any) => <tbody>{children}</tbody>,
    tr: ({children}: any) => <tr className="border-b border-slate-600">{children}</tr>,
    th: ({children}: any) => (
      <th className="px-3 py-1 text-left text-slate-100 font-semibold border-r border-slate-600 last:border-r-0">
        {children}
      </th>
    ),
    td: ({children}: any) => (
      <td className="px-3 py-1 text-slate-100 border-r border-slate-600 last:border-r-0">
        {children}
      </td>
    ),
  };

  // EXTRACT IMAGE URLS FROM TEXT
  const extractImageUrls = (text: string) => {
    console.log('🔥 extractImageUrls CALLED WITH TEXT:', text);
    
    const imageUrlFormatRegex = /\[IMAGE URL:\s*(\/api\/images\/[^\]]+\.(?:jpg|jpeg|png|gif|webp))\]/gi;
    const markdownImageRegex = /\[([^\]]+)\]\(\s*\/api\/images\/[^)]+\.(?:jpg|jpeg|png|gif|webp)\s*\)/gi;
    const plainUrlRegex = /\/api\/images\/[^\s]+\.(?:jpg|jpeg|png|gif|webp)/gi;
    
    const imageUrls: string[] = [];
    
    // EXTRACT FROM [IMAGE URL: ...] FORMAT
    let match;
    while ((match = imageUrlFormatRegex.exec(text)) !== null) {
      console.log('🖼️ FOUND [IMAGE URL: ...] FORMAT:', match[1]);
      imageUrls.push(match[1]);
    }
    
    // EXTRACT FROM MARKDOWN LINKS
    while ((match = markdownImageRegex.exec(text)) !== null) {
      const urlMatch = match[0].match(/\/api\/images\/[^)]+\.(?:jpg|jpeg|png|gif|webp)/i);
      if (urlMatch) {
        console.log('🖼️ FOUND MARKDOWN LINK FORMAT:', urlMatch[0]);
        imageUrls.push(urlMatch[0]);
      }
    }
    
    // EXTRACT FROM PLAIN URLS
    while ((match = plainUrlRegex.exec(text)) !== null) {
      console.log('🖼️ FOUND PLAIN URL FORMAT:', match[0]);
      imageUrls.push(match[0]);
    }
    
    // REMOVE DUPLICATES
    const uniqueUrls = [...new Set(imageUrls)];
    console.log('🖼️ EXTRACTED IMAGE URLS (WITH DUPLICATES):', imageUrls);
    console.log('🖼️ UNIQUE IMAGE URLS:', uniqueUrls);
    
    return uniqueUrls;
  };

  // RENDER TEXT WITHOUT IMAGE URLS (CLEAN TEXT)
  const renderTextWithImageUrlsAsText = (text: string) => {
    console.log('🔍 MARKDOWN DEBUG - Original text:', text);
    console.log('🔍 MARKDOWN DEBUG - Original text (escaped):', JSON.stringify(text));
    
    // REMOVE [IMAGE URL: ...] FORMAT COMPLETELY
    let processedText = text.replace(/\[IMAGE URL:\s*\/api\/images\/[^\]]+\.(?:jpg|jpeg|png|gif|webp)\]/gi, '');
    
    // REMOVE MARKDOWN IMAGE LINKS COMPLETELY
    processedText = processedText.replace(/\[([^\]]+)\]\(\s*\/api\/images\/[^)]+\.(?:jpg|jpeg|png|gif|webp)\s*\)/gi, '');
    
    // REMOVE PLAIN IMAGE URLS COMPLETELY
    processedText = processedText.replace(/\/api\/images\/[^\s]+\.(?:jpg|jpeg|png|gif|webp)/gi, '');
    
    // AGGRESSIVE WHITESPACE CLEANUP
    processedText = processedText.replace(/\s*\.\s*\./g, '.'); // REMOVE DOUBLE PERIODS
    processedText = processedText.replace(/[ \t]+/g, ' '); // NORMALIZE SPACES
    processedText = processedText.replace(/\n\s*\n\s*\n/g, '\n\n'); // MAX 2 consecutive newlines
    processedText = processedText.replace(/\n[ \t]+/g, '\n'); // REMOVE SPACES AFTER NEWLINES
    processedText = processedText.replace(/[ \t]+\n/g, '\n'); // REMOVE SPACES BEFORE NEWLINES
    processedText = processedText.trim(); // REMOVE LEADING/TRAILING SPACES
    
    console.log('🔍 MARKDOWN DEBUG - Processed text:', processedText);
    console.log('🔍 MARKDOWN DEBUG - Processed text (escaped):', JSON.stringify(processedText));
    console.log('🔍 MARKDOWN DEBUG - Has table syntax:', /\|.*\|/.test(processedText));
    
    return (
      <div className="markdown-content">
        <ReactMarkdown 
          components={markdownComponents}
          remarkPlugins={[remarkGfm]}
        >
          {processedText}
        </ReactMarkdown>
      </div>
    );
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // LOAD MESSAGE RATINGS FOR CURRENT THREAD
  const loadMessageRatings = async () => {
    if (!currentChat?.thread_id) return;
    
    try {
      const response = await fetch('/api/chat/ratings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threadId: currentChat.thread_id
        }),
      });

      if (response.ok) {
        const { ratings } = await response.json();
        setMessageRatings(ratings || {});
      }
    } catch (error) {
      console.error('ERROR LOADING RATINGS:', error);
    }
  };

  // HANDLE MESSAGE RATING
  const handleRateMessage = async (messageId: string, rating: number) => {
    if (!currentChat?.thread_id || isRatingMessage) return;
    
    setIsRatingMessage(messageId);
    
    // FIND THE MESSAGE TO GET CITATIONS
    const message = messages.find(msg => msg.id === messageId);
    const citations: string[] = [];
    
    if (message && message.role === 'assistant') {
      message.content.forEach(content => {
        if (content.type === 'text' && content.text.annotations) {
          content.text.annotations.forEach(annotation => {
            if (annotation.type === 'file_citation') {
              citations.push('Source cited');
            }
          });
        }
      });
    }
    
    try {
      const response = await fetch('/api/chat/rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threadId: currentChat.thread_id,
          messageId,
          rating,
          teamId: activeAssistant?.teamId,
          accountId: activeAssistant?.accountId,
          portfolioId: activeAssistant?.portfolioId,
          responseTimeMs: responseStartTimes[messageId] ? Date.now() - responseStartTimes[messageId] : null,
          citations: citations,
          feedbackText: messageRatings[messageId]?.feedbackText || null
        }),
      });

      if (response.ok) {
        // UPDATE LOCAL STATE
        setMessageRatings(prev => ({
          ...prev,
          [messageId]: {
            rating: rating,
            teamId: activeAssistant?.teamId,
            accountId: activeAssistant?.accountId,
            portfolioId: activeAssistant?.portfolioId,
            responseTimeMs: responseStartTimes[messageId] ? Date.now() - responseStartTimes[messageId] : null,
            citations: citations,
            feedbackText: messageRatings[messageId]?.feedbackText || null
          }
        }));
      } else {
        console.error('FAILED TO RATE MESSAGE');
      }
    } catch (error) {
      console.error('ERROR RATING MESSAGE:', error);
    } finally {
      setIsRatingMessage(null);
    }
  };

  // HANDLE FEEDBACK SUBMISSION
  const handleSubmitFeedback = async (messageId: string, feedbackText: string) => {
    if (!currentChat?.thread_id || isSubmittingFeedback) return;
    
    setIsSubmittingFeedback(true);
    
    // FIND THE MESSAGE TO GET CITATIONS
    const message = messages.find(msg => msg.id === messageId);
    const citations: string[] = [];
    
    if (message && message.role === 'assistant') {
      message.content.forEach(content => {
        if (content.type === 'text' && content.text.annotations) {
          content.text.annotations.forEach(annotation => {
            if (annotation.type === 'file_citation') {
              citations.push('Source cited');
            }
          });
        }
      });
    }
    
    try {
      const response = await fetch('/api/chat/rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threadId: currentChat.thread_id,
          messageId,
          rating: messageRatings[messageId]?.rating || null,
          teamId: activeAssistant?.teamId,
          accountId: activeAssistant?.accountId,
          portfolioId: activeAssistant?.portfolioId,
          responseTimeMs: responseStartTimes[messageId] ? Date.now() - responseStartTimes[messageId] : null,
          citations: citations,
          feedbackText: feedbackText
        }),
      });

      if (response.ok) {
        // UPDATE LOCAL STATE
        setMessageRatings(prev => ({
          ...prev,
          [messageId]: {
            ...prev[messageId],
            feedbackText: feedbackText
          }
        }));
        setFeedbackModalOpen(null);
      } else {
        console.error('FAILED TO SAVE FEEDBACK');
      }
    } catch (error) {
      console.error('ERROR SAVING FEEDBACK:', error);
    } finally {
      setIsSubmittingFeedback(false);
    }
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
          assistantId: activeAssistant?.assistantId,
          teamId: activeAssistant?.teamId,
          accountId: activeAssistant?.accountId,
          portfolioId: activeAssistant?.portfolioId
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
      
      // LOAD RATINGS FOR THIS THREAD
      await loadMessageRatings();
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
    if (!currentChat && activeAssistant) {
      setIsCreatingNewChat(true); // PREVENT LOADING MESSAGES
      
      // START LOADING STATE IMMEDIATELY
      setIsLoading(true);
        
        try {
          // Use team-based chat creation
          const response = await fetch('/api/chat/create-team', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              teamId: activeAssistant.teamId,
              accountId: activeAssistant.accountId,
              portfolioId: activeAssistant.portfolioId,
              assistantId: activeAssistant.assistantId,
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
          assistantId: activeAssistant.assistantId,
          teamId: activeAssistant.teamId,
          accountId: activeAssistant.accountId,
          portfolioId: activeAssistant.portfolioId,
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
                        const messageId = `assistant-${Date.now()}`;
                        assistantMessageObj = {
                          id: messageId,
                          role: 'assistant',
                          content: [{ type: 'text', text: { value: assistantMessage } }],
                          created_at: Date.now() / 1000
                        };
                        setMessages(prev => [...prev, assistantMessageObj!]);
                        // RECORD START TIME FOR RESPONSE TIME CALCULATION
                        setResponseStartTimes(prev => ({
                          ...prev,
                          [messageId]: Date.now()
                        }));
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
    if (!currentChat || !activeAssistant) return;

    // CHECK IF THIS IS THE FIRST MESSAGE (no existing messages and title starts with "Untitled")
    const isFirstMessage = messages.length === 0 && currentChat.title.startsWith('Untitled');
    
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

    // UPDATE CHAT TITLE IF THIS IS THE FIRST MESSAGE
    if (isFirstMessage) {
      try {
        const newTitle = messageToSend.length > 50 ? messageToSend.substring(0, 50) + '...' : messageToSend;
        const updateResponse = await fetch('/api/chat/update-title', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatId: currentChat.id,
            title: newTitle
          }),
        });

        if (updateResponse.ok) {
          // Update current chat title in context
          setCurrentChat({ ...currentChat, title: newTitle });
          // Refresh chat history to show updated title
          await refreshChatHistory();
        }
      } catch (error) {
        console.error('Error updating chat title:', error);
        // Continue with message sending even if title update fails
      }
    }

    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threadId: currentChat.thread_id,
          message: inputMessage,
          assistantId: activeAssistant.assistantId,
          teamId: activeAssistant.teamId,
          accountId: activeAssistant.accountId,
          portfolioId: activeAssistant.portfolioId,
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
                  
                  // DEBUG: LOG WHAT THE FRONTEND IS RECEIVING
                  console.log('🔍 FRONTEND RECEIVED:', {
                    content: assistantMessage,
                    citations: citations,
                    step: currentStep
                  });
                  
                  // CREATE ASSISTANT MESSAGE BUBBLE ONLY WHEN WE HAVE CONTENT
                  if (!assistantMessageObj && assistantMessage.trim()) {
                    const messageId = `assistant-${Date.now()}`;
                    assistantMessageObj = {
                      id: messageId,
                      role: 'assistant',
                      content: [{ 
                        type: 'text', 
                        text: { 
                          value: assistantMessage,
                          // ADD CITATIONS AS ANNOTATIONS FOR DISPLAY
                          annotations: citations.length > 0 ? citations.map((citation, index) => ({
                            type: 'file_citation',
                            text: `[${index + 1}]`,
                            file_citation: {
                              file_id: `citation-${index}`,
                              quote: citation.replace(`[${index + 1}] `, '')
                            }
                          })) : undefined
                        } 
                      }],
                      created_at: Date.now() / 1000
                    };
                    setMessages(prev => [...prev, assistantMessageObj!]);
                    // RECORD START TIME FOR RESPONSE TIME CALCULATION
                    setResponseStartTimes(prev => ({
                      ...prev,
                      [messageId]: Date.now()
                    }));
                  } else if (assistantMessageObj) {
                    // UPDATE THE ASSISTANT MESSAGE
                    setMessages(prev => prev.map(msg => 
                      msg.id === assistantMessageObj!.id 
                        ? { 
                            ...msg, 
                            content: [{ 
                              type: 'text', 
                              text: { 
                                value: assistantMessage,
                                // ADD CITATIONS AS ANNOTATIONS FOR DISPLAY
                                annotations: citations.length > 0 ? citations.map((citation, index) => ({
                                  type: 'file_citation',
                                  text: `[${index + 1}]`,
                                  file_citation: {
                                    file_id: `citation-${index}`,
                                    quote: citation.replace(`[${index + 1}] `, '')
                                  }
                                })) : undefined
                              } 
                            }] 
                          }
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

  // Show welcome screen only if no team assistant
  if (!activeAssistant) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-800">
        <div className="text-center px-4 lg:px-8">
          <h2 className="text-xl lg:text-2xl font-bold text-slate-100 mb-4">
            WELCOME TO HHB ASSISTANT
          </h2>
          <p className="text-slate-400 mb-6 text-sm lg:text-base">
                          PLEASE SELECT A TEAM FROM THE HOME PAGE
          </p>
          <button
            onClick={() => router.push('/')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            GO TO HOME
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-900 h-screen">
      <StandardHeader
        teamName={activeAssistant?.teamName}
        teamLocation={activeAssistant?.teamLocation}
        userRole={activeAssistant?.userRole}
        accountName={activeAssistant?.accountName}
        portfolioName={activeAssistant?.portfolioName}
        showBackButton={false}
        showMenuButton={true}
        onMenuClick={onMenuClick}
      />

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
                          <div>
                            {renderTextWithImageUrlsAsText(text)}
                            
                            {/* RENDER IMAGES BELOW TEXT */}
                            {(() => {
                              const imageUrls = extractImageUrls(text);
                              if (imageUrls.length > 0) {
                                return (
                                  <div className="mt-4 space-y-2">
                                    {imageUrls.map((imageUrl, imgIndex) => (
                                      <div key={imgIndex} className="my-2">
                                        <img
                                          src={imageUrl}
                                          alt="NOTE IMAGE"
                                          className="max-w-full max-h-64 rounded-lg border border-slate-600"
                                          onError={(e) => {
                                            console.log('❌ IMAGE FAILED TO LOAD:', imageUrl);
                                            // IF IMAGE FAILS TO LOAD, SHOW AS TEXT LINK
                                            e.currentTarget.style.display = 'none';
                                            const linkElement = document.createElement('a');
                                            linkElement.href = imageUrl;
                                            linkElement.textContent = 'View Image';
                                            linkElement.className = 'text-blue-400 hover:text-blue-300 underline';
                                            e.currentTarget.parentNode?.appendChild(linkElement);
                                          }}
                                          onLoad={() => {
                                            console.log('✅ IMAGE LOADED SUCCESSFULLY IN CHAT:', imageUrl);
                                          }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        ) : (
                          <div className="markdown-content">
                            <ReactMarkdown 
                              components={markdownComponents}
                              remarkPlugins={[remarkGfm]}
                            >
                              {text}
                            </ReactMarkdown>
                          </div>
                        )}
                        {message.role === 'assistant' && content.text.annotations && content.text.annotations.length > 0 && (
                          <div className="mt-2 text-xs text-slate-400 border-t border-slate-600 pt-2">
                            <div className="font-semibold mb-1">SOURCES:</div>
                            {content.text.annotations
                              .filter(ann => ann.type === 'file_citation')
                              .map((annotation, annIndex) => (
                                <div key={annIndex} className="mb-1">
                                  [{annIndex + 1}] {annotation.file_citation?.quote || annotation.text || 'Unknown source'}
                                </div>
                              ))}
                          </div>
                        )}
                        
                        {/* RATING BUTTONS FOR ASSISTANT MESSAGES */}
                        {message.role === 'assistant' && (
                          <div className="mt-2 pt-2 border-t border-slate-600 flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleRateMessage(message.id, 1)}
                                disabled={isRatingMessage === message.id}
                                className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
                                  messageRatings[message.id]?.rating === 1
                                    ? 'text-green-400 bg-green-900/20'
                                    : 'text-slate-400 hover:text-green-400 hover:bg-slate-600'
                                }`}
                                title="THUMBS UP"
                              >
                                <svg className="w-4 h-4" fill={messageRatings[message.id]?.rating === 1 ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                  <path d="M7 10v12"/>
                                  <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12.4 2.5a.6.6 0 0 1 .6-.4.6.6 0 0 1 .6.4L15 5.88Z"/>
                                </svg>
                              </button>
                              
                              <button
                                onClick={() => handleRateMessage(message.id, -1)}
                                disabled={isRatingMessage === message.id}
                                className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
                                  messageRatings[message.id]?.rating === -1
                                    ? 'text-red-400 bg-red-900/20'
                                    : 'text-slate-400 hover:text-red-400 hover:bg-slate-600'
                                }`}
                                title="THUMBS DOWN"
                              >
                                <svg className="w-4 h-4" fill={messageRatings[message.id]?.rating === -1 ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                  <path d="M17 14v2"/>
                                  <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L11.6 21.5a.6.6 0 0 1-.6.4.6.6 0 0 1-.6-.4L9 18.12Z"/>
                                </svg>
                              </button>
                              
                              {isRatingMessage === message.id && (
                                <span className="text-xs text-slate-500">SAVING...</span>
                              )}
                            </div>
                            
                            <button
                              onClick={() => setFeedbackModalOpen(message.id)}
                              className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
                                messageRatings[message.id]?.feedbackText
                                  ? 'text-blue-400 bg-blue-900/20'
                                  : 'text-slate-400 hover:text-blue-400 hover:bg-slate-600'
                              }`}
                              title="GIVE FEEDBACK"
                            >
                              <svg className="w-4 h-4" fill={messageRatings[message.id]?.feedbackText ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 1 14 18.469V19a2 2 0 0 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547Z" />
                              </svg>
                            </button>
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
            placeholder={activeAssistant ? "TYPE YOUR MESSAGE HERE..." : "SELECT A TEAM TO START CHATTING"}
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 lg:px-4 lg:py-2 text-slate-100 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-slate-500 text-base"
            rows={1}
            disabled={isLoading || isLoadingMessages || !activeAssistant}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading || isLoadingMessages || !activeAssistant}
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

      {/* FEEDBACK MODAL */}
      {feedbackModalOpen && (
        <FeedbackModal
          isOpen={!!feedbackModalOpen}
          onClose={() => setFeedbackModalOpen(null)}
          onSubmit={(feedbackText) => handleSubmitFeedback(feedbackModalOpen, feedbackText)}
          existingFeedback={messageRatings[feedbackModalOpen]?.feedbackText}
          isLoading={isSubmittingFeedback}
        />
      )}
    </div>
  );
} 