-- ADD MESSAGE CITATIONS TABLE FOR PERSISTENT CITATION STORAGE
-- FOLLOWS THE SAME PATTERN AS MESSAGE_RATINGS TABLE

-- FIRST, ADD UNIQUE CONSTRAINT TO CHAT_HISTORY THREAD_ID (IF NOT EXISTS)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chat_history_thread_id_unique'
    ) THEN
        ALTER TABLE public.chat_history ADD CONSTRAINT chat_history_thread_id_unique UNIQUE (thread_id);
    END IF;
END $$;

-- CREATE MESSAGE CITATIONS TABLE
CREATE TABLE public.message_citations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  thread_id text NOT NULL,
  openai_message_id text NOT NULL,
  citation_number integer NOT NULL,
  file_id text NOT NULL,
  quote text,
  full_chunk_content text,
  file_name text,
  relevance_score decimal,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT message_citations_pkey PRIMARY KEY (id),
  CONSTRAINT message_citations_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.chat_history(thread_id) ON DELETE CASCADE
);

-- CREATE INDEX FOR EFFICIENT LOOKUPS BY THREAD AND MESSAGE ID
CREATE INDEX idx_message_citations_thread_message ON public.message_citations(thread_id, openai_message_id);
CREATE INDEX idx_message_citations_message_id ON public.message_citations(openai_message_id);
