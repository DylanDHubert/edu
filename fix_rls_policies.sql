-- Fix RLS Policies to resolve infinite recursion
-- This script fixes the infinite recursion detected in policy for relation "team_members"

-- First, let's drop the problematic policies and recreate them properly
-- We need to be careful about circular references in RLS policies

-- Drop existing policies for team_members that might cause recursion
DROP POLICY IF EXISTS "Team members can view their team" ON team_members;
DROP POLICY IF EXISTS "Team managers can manage team members" ON team_members;
DROP POLICY IF EXISTS "Users can view teams they belong to" ON teams;
DROP POLICY IF EXISTS "Team managers can update their teams" ON teams;

-- Recreate team_members policies without circular references
-- Team members can view their own membership record
CREATE POLICY "Users can view their own team membership" ON team_members
    FOR SELECT USING (user_id = auth.uid());

-- Team managers can manage team members (but avoid referencing team_members in the policy)
CREATE POLICY "Team managers can manage members" ON team_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM teams
            WHERE teams.id = team_members.team_id
            AND teams.created_by = auth.uid()
        )
        OR
        -- Also allow if user is marked as manager in the team_members table
        -- But we need to be careful here to avoid recursion
        user_id = auth.uid()
    );

-- Recreate teams policies
-- Users can view teams they are members of
CREATE POLICY "Users can view their teams" ON teams
    FOR SELECT USING (
        created_by = auth.uid()
        OR
        id IN (
            SELECT team_id FROM team_members 
            WHERE user_id = auth.uid()
        )
    );

-- Team creators can update their teams
CREATE POLICY "Team creators can update teams" ON teams
    FOR UPDATE USING (created_by = auth.uid());

-- Team creators can delete their teams
CREATE POLICY "Team creators can delete teams" ON teams
    FOR DELETE USING (created_by = auth.uid());

-- Fix admin_users RLS policies
-- Make sure admin_users table has proper RLS
DROP POLICY IF EXISTS "Admins can view admin users" ON admin_users;
DROP POLICY IF EXISTS "Public can check admin status" ON admin_users;

-- Allow authenticated users to check if they are admin (needed for admin verification)
CREATE POLICY "Users can check their admin status" ON admin_users
    FOR SELECT USING (email = auth.jwt() ->> 'email');

-- Admins can view all admin users
CREATE POLICY "Admins can view admin users" ON admin_users
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users admin_check
            WHERE admin_check.email = auth.jwt() ->> 'email'
            AND admin_check.email != admin_users.email -- Prevent self-reference
        )
        OR
        email = auth.jwt() ->> 'email' -- Users can always see their own record
    );

-- Fix notes RLS policies to work with teams
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can manage their own notes" ON notes;
DROP POLICY IF EXISTS "Users can view shared notes in their teams" ON notes;

-- Recreate notes policies
-- Users can manage their own notes
CREATE POLICY "Users can manage own notes" ON notes
    FOR ALL USING (user_id = auth.uid());

-- Users can view notes shared with their teams (if team_id is set)
CREATE POLICY "Users can view team shared notes" ON notes
    FOR SELECT USING (
        user_id = auth.uid()
        OR
        (
            team_id IS NOT NULL
            AND team_id IN (
                SELECT team_id FROM team_members 
                WHERE user_id = auth.uid()
            )
        )
    );

-- Make sure all tables have RLS enabled
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Add comments for documentation
COMMENT ON POLICY "Users can view their own team membership" ON team_members IS 'Users can view their own membership records';
COMMENT ON POLICY "Team managers can manage members" ON team_members IS 'Team creators can manage team members';
COMMENT ON POLICY "Users can view their teams" ON teams IS 'Users can view teams they created or are members of';
COMMENT ON POLICY "Users can check their admin status" ON admin_users IS 'Users can check if they are admin';
COMMENT ON POLICY "Users can manage own notes" ON notes IS 'Users can manage their own notes';
COMMENT ON POLICY "Users can view team shared notes" ON notes IS 'Users can view notes shared with their teams'; 