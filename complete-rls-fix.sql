-- =====================================================
-- COMPLETE RLS FIX - ELIMINATE CIRCULAR REFERENCES
-- =====================================================
-- This script fixes all infinite recursion issues by:
-- 1. Removing circular RLS policies
-- 2. Creating simple, non-recursive policies
-- 3. Relying on service role for complex team logic

-- =====================================================
-- STEP 1: CLEAN TEAM_MEMBERS POLICIES
-- =====================================================

-- DROP ALL EXISTING TEAM_MEMBERS POLICIES
DROP POLICY IF EXISTS "add_team_members" ON public.team_members;
DROP POLICY IF EXISTS "read_own_memberships" ON public.team_members;
DROP POLICY IF EXISTS "read_team_members" ON public.team_members;
DROP POLICY IF EXISTS "remove_team_members" ON public.team_members;
DROP POLICY IF EXISTS "update_team_members" ON public.team_members;

-- CREATE SIMPLE, NON-RECURSIVE POLICIES
-- POLICY 1: Users can read their own team memberships
CREATE POLICY "users_read_own_memberships" ON public.team_members
  FOR SELECT USING (user_id = auth.uid());

-- POLICY 2: Service role can do everything (for team management)
CREATE POLICY "service_role_full_access" ON public.team_members
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- STEP 2: CLEAN ADMIN_USERS POLICIES
-- =====================================================

-- DROP ALL EXISTING ADMIN POLICIES
DROP POLICY IF EXISTS "admin_management" ON public.admin_users;
DROP POLICY IF EXISTS "admin_status_check" ON public.admin_users;

-- CREATE SIMPLE ADMIN POLICIES
-- POLICY 1: Users can check their own admin status
CREATE POLICY "users_check_admin_status" ON public.admin_users
  FOR SELECT USING (email = auth.jwt() ->> 'email');

-- POLICY 2: Service role can manage admins
CREATE POLICY "service_role_admin_management" ON public.admin_users
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- STEP 3: CLEAN TEAMS POLICIES
-- =====================================================

-- DROP EXISTING TEAMS POLICIES
DROP POLICY IF EXISTS "Admins can delete teams" ON public.teams;
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
DROP POLICY IF EXISTS "Managers can update teams" ON public.teams;
DROP POLICY IF EXISTS "Team members can access their teams" ON public.teams;
DROP POLICY IF EXISTS "Users can read their teams" ON public.teams;

-- CREATE SIMPLE TEAMS POLICIES
-- POLICY 1: Users can read teams they belong to (simple approach)
CREATE POLICY "users_read_their_teams" ON public.teams
  FOR SELECT USING (
    -- User is a member of this team (checked via service role in app code)
    EXISTS (
      SELECT 1 FROM public.team_members tm 
      WHERE tm.team_id = teams.id 
      AND tm.user_id = auth.uid() 
      AND tm.status = 'active'
    )
    OR
    -- User is an admin (checked via service role in app code)
    EXISTS (
      SELECT 1 FROM public.admin_users au 
      WHERE au.email = auth.jwt() ->> 'email'
    )
  );

-- POLICY 2: Authenticated users can create teams
CREATE POLICY "authenticated_create_teams" ON public.teams
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL 
    AND created_by = auth.uid()
  );

-- POLICY 3: Service role can manage teams
CREATE POLICY "service_role_team_management" ON public.teams
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- STEP 4: CLEAN ARCHIVED_MESSAGES POLICIES
-- =====================================================

-- DROP EXISTING ARCHIVED_MESSAGES POLICIES
DROP POLICY IF EXISTS "Admins can manage archived messages" ON public.archived_messages;
DROP POLICY IF EXISTS "System can insert archived messages" ON public.archived_messages;
DROP POLICY IF EXISTS "Users can read their team archived messages" ON public.archived_messages;

-- CREATE SIMPLE ARCHIVED_MESSAGES POLICIES
-- POLICY 1: Service role can manage archived messages
CREATE POLICY "service_role_archived_management" ON public.archived_messages
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- STEP 5: CLEAN OTHER TABLE POLICIES (Remove team_members references)
-- =====================================================

-- DROP POLICIES THAT REFERENCE TEAM_MEMBERS
DROP POLICY IF EXISTS "Team members can access their account portfolio stores" ON public.account_portfolio_stores;
DROP POLICY IF EXISTS "Team members can access their account portfolios" ON public.account_portfolios;
DROP POLICY IF EXISTS "Team members can access their team surgeons" ON public.surgeons;
DROP POLICY IF EXISTS "Team members can access their team accounts" ON public.team_accounts;
DROP POLICY IF EXISTS "Team members can access their team assistants" ON public.team_assistants;
DROP POLICY IF EXISTS "Team managers can manage team documents" ON public.team_documents;
DROP POLICY IF EXISTS "Team members can view team documents" ON public.team_documents;
DROP POLICY IF EXISTS "Team managers can manage team knowledge" ON public.team_knowledge;
DROP POLICY IF EXISTS "Team members can view team knowledge" ON public.team_knowledge;
DROP POLICY IF EXISTS "Team members can access their team portfolios" ON public.team_portfolios;
DROP POLICY IF EXISTS "Team managers can manage member invitations" ON public.team_member_invitations;

-- CREATE SIMPLE POLICIES FOR OTHER TABLES
-- These will rely on service role for team access control

-- ACCOUNT_PORTFOLIO_STORES
CREATE POLICY "service_role_account_portfolio_stores" ON public.account_portfolio_stores
  FOR ALL USING (auth.role() = 'service_role');

-- ACCOUNT_PORTFOLIOS  
CREATE POLICY "service_role_account_portfolios" ON public.account_portfolios
  FOR ALL USING (auth.role() = 'service_role');

-- SURGEONS
CREATE POLICY "service_role_surgeons" ON public.surgeons
  FOR ALL USING (auth.role() = 'service_role');

-- TEAM_ACCOUNTS
CREATE POLICY "service_role_team_accounts" ON public.team_accounts
  FOR ALL USING (auth.role() = 'service_role');

-- TEAM_ASSISTANTS
CREATE POLICY "service_role_team_assistants" ON public.team_assistants
  FOR ALL USING (auth.role() = 'service_role');

-- TEAM_DOCUMENTS
CREATE POLICY "service_role_team_documents" ON public.team_documents
  FOR ALL USING (auth.role() = 'service_role');

-- TEAM_KNOWLEDGE
CREATE POLICY "service_role_team_knowledge" ON public.team_knowledge
  FOR ALL USING (auth.role() = 'service_role');

-- TEAM_PORTFOLIOS
CREATE POLICY "service_role_team_portfolios" ON public.team_portfolios
  FOR ALL USING (auth.role() = 'service_role');

-- TEAM_MEMBER_INVITATIONS
CREATE POLICY "service_role_team_invitations" ON public.team_member_invitations
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Check that all policies are now clean and non-recursive
SELECT 
    tablename,
    policyname,
    cmd,
    CASE 
        WHEN qual LIKE '%team_members%' THEN '⚠️  REFERENCES TEAM_MEMBERS'
        WHEN qual LIKE '%admin_users%' THEN '⚠️  REFERENCES ADMIN_USERS'
        ELSE '✅ CLEAN'
    END as policy_status
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('team_members', 'admin_users', 'teams', 'archived_messages')
ORDER BY tablename, policyname;
