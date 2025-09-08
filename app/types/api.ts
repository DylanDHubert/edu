/**
 * TYPESCRIPT INTERFACES FOR API RESPONSES AND DATA STRUCTURES
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TeamMembership {
  id: string;
  team_id: string;
  user_id: string;
  role: 'manager' | 'member';
  status: 'active' | 'inactive';
  is_original_manager?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TeamPortfolio {
  id: string;
  team_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface TeamAccount {
  id: string;
  team_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface TeamDocument {
  id: string;
  team_id: string;
  portfolio_id?: string;
  account_id?: string;
  original_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  openai_file_id?: string;
  created_at: string;
  updated_at: string;
}

export interface TeamKnowledge {
  id: string;
  team_id: string;
  account_id?: string;
  portfolio_id?: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ChatHistory {
  id: string;
  thread_id: string;
  user_id: string;
  team_id: string;
  account_id: string;
  portfolio_id: string;
  assistant_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRating {
  id: string;
  thread_id: string;
  message_id: string;
  user_id: string;
  team_id: string;
  account_id: string;
  portfolio_id: string;
  rating?: number;
  response_time_ms?: number;
  citations?: any;
  feedback_text?: string;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  team_id?: string;
  account_id?: string;
  portfolio_id?: string;
  title: string;
  content: string;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMemberInvitation {
  id: string;
  team_id: string;
  email: string;
  name: string;
  role: 'manager' | 'member';
  status: 'pending' | 'accepted' | 'declined';
  token: string;
  created_at: string;
  updated_at: string;
}

// REQUEST/RESPONSE TYPES
export interface CreateTeamRequest {
  name: string;
  description?: string;
}

export interface InviteMemberRequest {
  teamId: string;
  email: string;
  name: string;
  role: 'manager' | 'member';
}

export interface CreateNoteRequest {
  title: string;
  content: string;
  teamId?: string;
  accountId?: string;
  portfolioId?: string;
  isShared?: boolean;
}

export interface UpdateNoteRequest {
  id: string;
  title?: string;
  content?: string;
  isShared?: boolean;
}

export interface RateMessageRequest {
  threadId: string;
  messageId: string;
  teamId: string;
  accountId: string;
  portfolioId: string;
  rating?: number;
  responseTimeMs?: number;
  citations?: any;
  feedbackText?: string;
}

export interface SendMessageRequest {
  threadId: string;
  message: string;
  assistantId: string;
  teamId: string;
  accountId: string;
  portfolioId: string;
  streaming?: boolean;
}
