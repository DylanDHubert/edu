/**
 * TYPESCRIPT INTERFACES FOR ASSISTANT FUNCTIONALITY
 */

export interface CreateAssistantRequest {
  teamId: string;
  portfolioId: string;
  userId?: string;
}

export interface CreateAssistantResponse {
  success: boolean;
  assistantId?: string;
  error?: string;
}

export interface AssistantConfig {
  name: string;
  instructions: string;
  model: string;
  tools: any[];
  tool_resources?: any;
}

export interface AssistantResult {
  success: boolean;
  assistantId?: string;
  error?: string;
}

export interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: any[];
  created_at: number;
}

export interface BackupThread {
  thread_id: string;
  title: string;
  user_id: string;
  team_id: string;
  portfolio_id: string;
  created_at: string;
  messages: ThreadMessage[];
}

export interface PortfolioDocument {
  openai_file_id: string;
  original_name: string;
}

export interface TeamNames {
  teamName: string;
  portfolioName: string;
}

export interface AccountContext {
  accountInfo: string;
  portfolioInfo: string;
  surgeonInfo: string;
  knowledgeText: string;
}

export interface GeneralContext {
  teamInfo: string;
  knowledgeText: string;
}

export interface CacheStalenessResult {
  isStale: boolean;
  latestDocumentDate?: string;
  vectorStoreDate?: string;
}

export interface VectorStoreResult {
  vectorStoreId: string;
  fileIds: string[];
}
