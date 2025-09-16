-- ADD MESSAGE CITATIONS TABLE FOR PERSISTENT CITATION STORAGE
-- FOLLOWS THE SAME PATTERN AS MESSAGE_RATINGS TABLE

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
