-- Fix team_members RLS policies to eliminate infinite recursion
-- The issue is that team_members policies are referencing themselves, creating loops

-- Drop all existing team_members policies
DROP POLICY IF EXISTS "Users can view their own team membership" ON team_members;
DROP POLICY IF EXISTS "Team managers can manage members" ON team_members;
DROP POLICY IF EXISTS "Team members can view their team" ON team_members;
DROP POLICY IF EXISTS "Team managers can manage team members" ON team_members;

-- Temporarily disable RLS on team_members to break the recursion
ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS with simple, non-recursive policies
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies
-- Allow users to see their own team memberships
CREATE POLICY "Users can view own membership" ON team_members
    FOR SELECT USING (user_id = auth.uid());

-- Allow users to insert their own membership (for team creation)
CREATE POLICY "Users can create own membership" ON team_members
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Allow team creators to manage memberships in their teams
CREATE POLICY "Team creators can manage memberships" ON team_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM teams
            WHERE teams.id = team_members.team_id
            AND teams.created_by = auth.uid()
        )
    );

-- Add comments for documentation
COMMENT ON POLICY "Users can view own membership" ON team_members IS 'Users can view their own team membership records';
COMMENT ON POLICY "Users can create own membership" ON team_members IS 'Users can create their own membership records';
COMMENT ON POLICY "Team creators can manage memberships" ON team_members IS 'Team creators can manage all memberships in their teams';

-- Test the fix
-- SELECT * FROM team_members WHERE user_id = auth.uid(); 