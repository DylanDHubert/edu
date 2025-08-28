-- MIGRATION: Remove Manager Invitations System
-- This migration removes the manager_invitations table and related functionality
-- as we've moved to a simplified system where any authenticated user can create teams

-- DROP THE MANAGER_INVITATIONS TABLE
-- This table is no longer needed since we removed the manager invite system
DROP TABLE IF EXISTS public.manager_invitations;

-- OPTIONAL: Clean up any orphaned data in team_member_invitations
-- Remove any invitations that reference non-existent teams (just in case)
DELETE FROM public.team_member_invitations 
WHERE team_id NOT IN (SELECT id FROM public.teams);

-- OPTIONAL: Clean up expired invitations (older than 30 days)
DELETE FROM public.team_member_invitations 
WHERE status = 'pending' 
AND expires_at < NOW() - INTERVAL '30 days';

-- VERIFY THE CHANGES
-- Check that manager_invitations table is gone
-- SELECT 'manager_invitations table dropped successfully' as status;

-- Check remaining team_member_invitations
-- SELECT COUNT(*) as remaining_invitations FROM public.team_member_invitations;
