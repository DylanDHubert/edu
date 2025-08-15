-- Completely disable RLS on team_members to fix infinite recursion
-- This is a temporary fix to get the system working

-- Drop ALL policies on team_members
DROP POLICY IF EXISTS "Users can view own membership" ON team_members;
DROP POLICY IF EXISTS "Users can create own membership" ON team_members;
DROP POLICY IF EXISTS "Team creators can manage memberships" ON team_members;
DROP POLICY IF EXISTS "Users can view their own team membership" ON team_members;
DROP POLICY IF EXISTS "Team managers can manage members" ON team_members;
DROP POLICY IF EXISTS "Team members can view their team" ON team_members;
DROP POLICY IF EXISTS "Team managers can manage team members" ON team_members;

-- Completely disable RLS on team_members
ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;

-- Also check and fix teams table while we're at it
DROP POLICY IF EXISTS "Users can view their teams" ON teams;
DROP POLICY IF EXISTS "Team creators can update teams" ON teams;
DROP POLICY IF EXISTS "Team creators can delete teams" ON teams;

-- Disable RLS on teams temporarily too
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT 
    schemaname,
    tablename,
    rowsecurity,
    forcerowsecurity
FROM pg_tables 
WHERE tablename IN ('teams', 'team_members'); 