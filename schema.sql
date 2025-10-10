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
  course_id uuid,
  portfolio_id uuid,
  assistant_id text,
  CONSTRAINT chat_history_pkey PRIMARY KEY (id),
  CONSTRAINT chat_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT chat_history_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT chat_history_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.course_portfolios(id)
);
CREATE TABLE public.course_assistants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  portfolio_id uuid,
  name text NOT NULL,
  description text,
  openai_assistant_id text NOT NULL,
  openai_thread_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  portfolio_vector_store_id text,
  CONSTRAINT course_assistants_pkey PRIMARY KEY (id),
  CONSTRAINT course_assistants_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT course_assistants_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.course_portfolios(id)
);
CREATE TABLE public.course_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  portfolio_id uuid,
  name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  document_type text DEFAULT 'portfolio'::text CHECK (document_type = ANY (ARRAY['portfolio'::text, 'inventory'::text])),
  processing_type text DEFAULT 'standard'::text CHECK (processing_type = ANY (ARRAY['standard'::text, 'enhanced'::text, 'super'::text])),
  status text NOT NULL CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])),
  openai_file_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  filename text,
  original_name text,
  uploaded_by uuid,
  CONSTRAINT course_documents_pkey PRIMARY KEY (id),
  CONSTRAINT course_documents_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT course_documents_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.course_portfolios(id),
  CONSTRAINT course_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
);
CREATE TABLE public.course_member_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['manager'::text, 'member'::text])),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'declined'::text])),
  invited_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  invitation_token text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT course_member_invitations_pkey PRIMARY KEY (id),
  CONSTRAINT course_member_invitations_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT course_member_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id)
);
CREATE TABLE public.course_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member'::text CHECK (role = ANY (ARRAY['manager'::text, 'member'::text])),
  created_at timestamp with time zone DEFAULT now(),
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text])),
  invited_by uuid,
  is_original_manager boolean DEFAULT false,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT course_members_pkey PRIMARY KEY (id),
  CONSTRAINT course_members_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT course_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT course_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id)
);
CREATE TABLE public.course_portfolios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  vector_store_id text,
  vector_store_name text,
  CONSTRAINT course_portfolios_pkey PRIMARY KEY (id),
  CONSTRAINT course_portfolios_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id)
);
CREATE TABLE public.courses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  location text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT courses_pkey PRIMARY KEY (id),
  CONSTRAINT courses_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
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
  CONSTRAINT message_citations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.message_ratings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  thread_id text NOT NULL,
  message_id text NOT NULL,
  rating integer CHECK (rating = ANY (ARRAY[1, '-1'::integer])),
  created_at timestamp with time zone DEFAULT now(),
  response_time_ms integer,
  citations text[],
  feedback_text text,
  course_id uuid,
  portfolio_id uuid,
  CONSTRAINT message_ratings_pkey PRIMARY KEY (id),
  CONSTRAINT message_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT message_ratings_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.course_portfolios(id),
  CONSTRAINT message_ratings_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id)
);
CREATE TABLE public.message_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  thread_id text NOT NULL,
  openai_message_id text NOT NULL,
  document_id uuid NOT NULL,
  file_id text NOT NULL,
  file_name text,
  quote text,
  full_chunk_content text,
  relevance_score numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT message_sources_pkey PRIMARY KEY (id),
  CONSTRAINT message_sources_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.course_documents(id)
);

-- PROCESSING JOBS TABLE FOR UNIFIED JOB QUEUE
CREATE TABLE public.processing_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  course_id uuid NOT NULL,
  portfolio_id uuid,
  processing_type text NOT NULL DEFAULT 'standard'::text CHECK (processing_type = ANY (ARRAY['standard'::text, 'enhanced'::text, 'super'::text])),
  llamaparse_job_id text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])),
  progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_step text,
  error_message text,
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  created_at timestamp with time zone DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  CONSTRAINT processing_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT processing_jobs_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.course_documents(id),
  CONSTRAINT processing_jobs_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT processing_jobs_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.course_portfolios(id)
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX idx_processing_jobs_status ON public.processing_jobs(status);
CREATE INDEX idx_processing_jobs_document_id ON public.processing_jobs(document_id);
CREATE INDEX idx_processing_jobs_llamaparse_job_id ON public.processing_jobs(llamaparse_job_id);