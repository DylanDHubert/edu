/**
 * TYPESCRIPT INTERFACES FOR CHAT FUNCTIONALITY
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: any[];
  created_at: number;
}

export interface SendMessageRequest {
  threadId: string;
  message: string;
  assistantId: string;
  courseId: string;
  portfolioId: string;
  streaming?: boolean;
}

export interface RateMessageRequest {
  threadId: string;
  messageId: string;
  rating?: number | null;
  courseId: string;
  portfolioId: string;
  responseTimeMs?: number;
  feedbackText?: string;
}

export interface GetRatingsRequest {
  threadId: string;
}

export interface GetMessagesRequest {
  threadId: string;
  portfolioType?: string;
}

export interface ChatResult {
  success: boolean;
  messages?: ChatMessage[];
  error?: string;
}

export interface RatingResult {
  success: boolean;
  rating?: any;
  error?: string;
}

export interface RatingsResult {
  success: boolean;
  ratings?: Record<string, any>;
  error?: string;
}

export interface ThreadOwnershipResult {
  success: boolean;
  chatHistory?: any;
  error?: string;
}

export interface StreamingUpdate {
  type: 'update' | 'done' | 'error';
  content?: string;
  citations?: string[];
  step?: string;
  error?: string;
}

