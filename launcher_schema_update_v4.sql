-- HHB Launcher Schema Update v4: Manager invitation completion and original manager flag
-- This update adds missing columns for the manager invitation flow

-- Add is_original_manager flag to team_members table
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS is_original_manager BOOLEAN DEFAULT FALSE;

-- Add completed status to manager_invitations status enum
-- First, let's check if we need to modify the constraint
ALTER TABLE manager_invitations DROP CONSTRAINT IF EXISTS manager_invitations_status_check;
ALTER TABLE manager_invitations ADD CONSTRAINT manager_invitations_status_check 
    CHECK (status IN ('pending', 'accepted', 'expired', 'completed'));

-- Add index for original manager lookup
CREATE INDEX IF NOT EXISTS idx_team_members_original_manager ON team_members(team_id, is_original_manager) WHERE is_original_manager = true;

-- Add comments for documentation
COMMENT ON COLUMN team_members.is_original_manager IS 'Flag to identify the original manager who was invited by HHB admin';
COMMENT ON CONSTRAINT manager_invitations_status_check ON manager_invitations IS 'Status: pending (sent), accepted (user accepted), expired (time limit), completed (team created)';

-- Test query to verify the changes
-- SELECT * FROM team_members WHERE is_original_manager = true; 