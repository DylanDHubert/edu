-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admin_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text DEFAULT 'admin'::text CHECK (role = ANY (ARRAY['admin'::text, 'super_admin'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admin_users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.archived_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  thread_id text NOT NULL,
  assistant_id text NOT NULL,
  message_id text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  message_order integer NOT NULL,
  archived_at timestamp with time zone DEFAULT now(),
  CONSTRAINT archived_messages_pkey PRIMARY KEY (id)
);
CREATE TABLE public.chat_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  portfolio_type text,
  thread_id text NOT NULL UNIQUE,
  title text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  team_id uuid,
  portfolio_id uuid,
  assistant_id text,
  CONSTRAINT chat_history_pkey PRIMARY KEY (id),
  CONSTRAINT chat_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT chat_history_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);
CREATE TABLE public.document_chunks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid,
  chunk_text text NOT NULL,
  chunk_summary text NOT NULL,
  embedding USER-DEFINED,
  page_number integer NOT NULL,
  chunk_index integer NOT NULL,
  token_count integer NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT document_chunks_pkey PRIMARY KEY (id),
  CONSTRAINT document_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.team_documents(id)
);
CREATE TABLE public.message_citations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  thread_id text NOT NULL,
  openai_message_id text NOT NULL,
  citation_number integer NOT NULL,
  file_id text NOT NULL,
  quote text,
  full_chunk_content text,
  file_name text,
  relevance_score numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT message_citations_pkey PRIMARY KEY (id),
  CONSTRAINT message_citations_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.chat_history(thread_id)
);
CREATE TABLE public.message_ratings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  thread_id text NOT NULL,
  message_id text NOT NULL,
  rating integer CHECK (rating = ANY (ARRAY[1, '-1'::integer])),
  created_at timestamp with time zone DEFAULT now(),
  response_time_ms integer,
  citations ARRAY,
  feedback_text text,
  team_id uuid,
  portfolio_id uuid,
  CONSTRAINT message_ratings_pkey PRIMARY KEY (id),
  CONSTRAINT message_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT message_ratings_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.team_portfolios(id),
  CONSTRAINT message_ratings_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
);
CREATE TABLE public.message_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  thread_id text NOT NULL,
  openai_message_id text NOT NULL,
  document_id uuid NOT NULL,
  document_name text NOT NULL,
  page_start integer NOT NULL,
  page_end integer NOT NULL,
  relevance_score numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT message_sources_pkey PRIMARY KEY (id),
  CONSTRAINT fk_message_sources_document FOREIGN KEY (document_id) REFERENCES public.team_documents(id)
);
CREATE TABLE public.portfolio_knowledge_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  portfolio_id uuid NOT NULL,
  filename text NOT NULL,
  openai_file_id text,
  last_generated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT portfolio_knowledge_files_pkey PRIMARY KEY (id),
  CONSTRAINT portfolio_knowledge_files_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT portfolio_knowledge_files_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.team_portfolios(id)
);
CREATE TABLE public.processing_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid,
  team_id uuid,
  portfolio_id uuid,
  llamaparse_job_id text NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])),
  progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_step text,
  error_message text,
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  created_at timestamp without time zone DEFAULT now(),
  started_at timestamp without time zone,
  completed_at timestamp without time zone,
  last_heartbeat timestamp without time zone DEFAULT now(),
  CONSTRAINT processing_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT processing_jobs_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.team_documents(id),
  CONSTRAINT processing_jobs_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT processing_jobs_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.team_portfolios(id)
);
CREATE TABLE public.team_assistants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid,
  portfolio_id uuid,
  assistant_id text NOT NULL,
  assistant_name text NOT NULL,
  general_vector_store_id text NOT NULL,
  portfolio_vector_store_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  consolidated_vector_store_id text,
  consolidated_vector_store_name text,
  CONSTRAINT team_assistants_pkey PRIMARY KEY (id),
  CONSTRAINT team_assistants_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT team_assistants_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.team_portfolios(id)
);
CREATE TABLE public.team_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid,
  portfolio_id uuid,
  filename text NOT NULL,
  original_name text NOT NULL,
  file_path text NOT NULL,
  openai_file_id text,
  uploaded_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  file_size bigint,
  document_type text DEFAULT 'portfolio'::text CHECK (document_type = ANY (ARRAY['portfolio'::text, 'inventory'::text])),
  CONSTRAINT team_documents_pkey PRIMARY KEY (id),
  CONSTRAINT team_documents_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT team_documents_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.team_portfolios(id),
  CONSTRAINT team_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
);
CREATE TABLE public.team_member_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'member'::text CHECK (role = ANY (ARRAY['manager'::text, 'member'::text])),
  invitation_token text NOT NULL UNIQUE,
  invited_by uuid,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'declined'::text])),
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
  accepted_at timestamp with time zone,
  CONSTRAINT team_member_invitations_pkey PRIMARY KEY (id),
  CONSTRAINT team_member_invitations_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT team_member_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id)
);
CREATE TABLE public.team_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid,
  user_id uuid,
  role text NOT NULL CHECK (role = ANY (ARRAY['manager'::text, 'member'::text])),
  is_original_manager boolean DEFAULT false,
  invited_by uuid,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'inactive'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT team_members_pkey PRIMARY KEY (id),
  CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT team_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id)
);
CREATE TABLE public.team_portfolios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid,
  name text NOT NULL,
  description text,
  assistant_id text,
  vector_store_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  vector_store_name text,
  CONSTRAINT team_portfolios_pkey PRIMARY KEY (id),
  CONSTRAINT team_portfolios_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);
CREATE TABLE public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  location text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT teams_pkey PRIMARY KEY (id),
  CONSTRAINT teams_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);