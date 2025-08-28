-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.account_portfolio_stores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid,
  account_id uuid,
  portfolio_id uuid,
  vector_store_id text NOT NULL,
  vector_store_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT account_portfolio_stores_pkey PRIMARY KEY (id),
  CONSTRAINT account_portfolio_stores_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.team_portfolios(id),
  CONSTRAINT account_portfolio_stores_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT account_portfolio_stores_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.team_accounts(id)
);
CREATE TABLE public.account_portfolios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_id uuid,
  portfolio_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT account_portfolios_pkey PRIMARY KEY (id),
  CONSTRAINT account_portfolios_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.team_accounts(id),
  CONSTRAINT account_portfolios_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.team_portfolios(id)
);
CREATE TABLE public.admin_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text DEFAULT 'admin'::text CHECK (role = ANY (ARRAY['admin'::text, 'super_admin'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admin_users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.chat_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  portfolio_type text,
  thread_id text NOT NULL,
  title text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  team_id uuid,
  account_id uuid,
  portfolio_id uuid,
  assistant_id text,
  CONSTRAINT chat_history_pkey PRIMARY KEY (id),
  CONSTRAINT chat_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT chat_history_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);
-- MANAGER_INVITATIONS TABLE REMOVED
-- This table was used for the old manager invitation system
-- It has been removed as part of the simplification where any authenticated user can create teams
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
  account_id uuid,
  portfolio_id uuid,
  CONSTRAINT message_ratings_pkey PRIMARY KEY (id),
  CONSTRAINT message_ratings_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.team_portfolios(id),
  CONSTRAINT message_ratings_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.team_accounts(id),
  CONSTRAINT message_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT message_ratings_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);
CREATE TABLE public.note_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  note_id uuid,
  tag_name text NOT NULL CHECK (tag_name = ANY (ARRAY['account'::text, 'team'::text])),
  tag_value text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT note_tags_pkey PRIMARY KEY (id),
  CONSTRAINT note_tags_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id)
);
CREATE TABLE public.notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  portfolio_type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  is_shared boolean DEFAULT false,
  is_portfolio_shared boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  images jsonb DEFAULT '[]'::jsonb CHECK (jsonb_typeof(images) = 'array'::text AND jsonb_array_length(images) <= 10),
  team_id uuid,
  account_id uuid,
  portfolio_id uuid,
  CONSTRAINT notes_pkey PRIMARY KEY (id),
  CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT notes_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.team_portfolios(id),
  CONSTRAINT notes_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.team_accounts(id),
  CONSTRAINT notes_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);
CREATE TABLE public.surgeons (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid,
  name text NOT NULL,
  specialty text NOT NULL,
  procedure_focus text NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT surgeons_pkey PRIMARY KEY (id),
  CONSTRAINT surgeons_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT surgeons_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.team_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid,
  name text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT team_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT team_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT team_accounts_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);
CREATE TABLE public.team_assistants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid,
  account_id uuid,
  portfolio_id uuid,
  assistant_id text NOT NULL,
  assistant_name text NOT NULL,
  general_vector_store_id text NOT NULL,
  account_portfolio_vector_store_id text NOT NULL,
  portfolio_vector_store_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  consolidated_vector_store_id text,
  consolidated_vector_store_name text,
  CONSTRAINT team_assistants_pkey PRIMARY KEY (id),
  CONSTRAINT team_assistants_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT team_assistants_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.team_portfolios(id),
  CONSTRAINT team_assistants_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.team_accounts(id),
  CONSTRAINT team_assistants_portfolio_unique UNIQUE (team_id, portfolio_id)
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
  CONSTRAINT team_documents_pkey PRIMARY KEY (id),
  CONSTRAINT team_documents_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.team_portfolios(id),
  CONSTRAINT team_documents_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT team_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
);
CREATE TABLE public.team_knowledge (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid,
  portfolio_id uuid,
  account_name text,
  category text NOT NULL CHECK (category = ANY (ARRAY['inventory'::text, 'instruments'::text, 'technical'::text, 'access_misc'::text, 'surgeon_info'::text])),
  title text NOT NULL,
  content text NOT NULL,
  images jsonb,
  metadata jsonb,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  account_id uuid,
  CONSTRAINT team_knowledge_pkey PRIMARY KEY (id),
  CONSTRAINT team_knowledge_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.team_portfolios(id),
  CONSTRAINT team_knowledge_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.team_accounts(id),
  CONSTRAINT team_knowledge_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT team_knowledge_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
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
  CONSTRAINT team_member_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id),
  CONSTRAINT team_member_invitations_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
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
  CONSTRAINT team_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id),
  CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
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
  general_knowledge_vector_store_id text,
  general_knowledge_vector_store_name text,
  general_vector_store_id text,
  general_vector_store_name text,
  CONSTRAINT teams_pkey PRIMARY KEY (id),
  CONSTRAINT teams_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);