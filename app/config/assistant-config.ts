/**
 * ASSISTANT CONFIGURATION CONSTANTS
 */

export const ASSISTANT_CONFIG = {
  DEFAULT_MODEL: 'gpt-4o',
  CACHE_TTL_HOURS: 24,
  MAX_RETRIES: 3,
  VECTOR_STORE_CLEANUP_DAYS: 30,
  BACKUP_BATCH_SIZE: 10,
  MAX_MESSAGES_PER_THREAD: 1000
} as const;

export const ASSISTANT_TOOLS = [
  { type: 'file_search' }
] as const;

export const ASSISTANT_MODELS = {
  GPT4O: 'gpt-4o',
  GPT4O_MINI: 'gpt-4o-mini',
  GPT4_TURBO: 'gpt-4-turbo'
} as const;
