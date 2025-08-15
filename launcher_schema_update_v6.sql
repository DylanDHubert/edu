-- HHB Launcher Schema Update v6: Team Member Invitations
-- This update adds team member invitation system to complete the setup wizard

-- Add team_member_invitations table
CREATE TABLE IF NOT EXISTS team_member_invitations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'member' CHECK (role IN ('manager', 'member')) NOT NULL,
    invitation_token TEXT NOT NULL UNIQUE,
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'declined')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days',
    accepted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(team_id, email, status) -- Prevent multiple pending invitations for same email to same team
);

-- Add indexes for team_member_invitations
CREATE INDEX IF NOT EXISTS idx_team_member_invitations_team ON team_member_invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_team_member_invitations_email ON team_member_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_member_invitations_token ON team_member_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_team_member_invitations_status ON team_member_invitations(status);
CREATE INDEX IF NOT EXISTS idx_team_member_invitations_invited_by ON team_member_invitations(invited_by);

-- Add RLS policies for team_member_invitations
ALTER TABLE team_member_invitations ENABLE ROW LEVEL SECURITY;

-- Team managers can view and create invitations for their teams
CREATE POLICY "Team managers can manage member invitations" ON team_member_invitations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM team_members
            WHERE team_members.team_id = team_member_invitations.team_id
            AND team_members.user_id = auth.uid()
            AND team_members.role = 'manager'
            AND team_members.status = 'active'
        )
    );

-- Invited users can view their own invitations (by token, handled in application logic)
-- This will be handled in the application since RLS requires auth

-- Add trigger for updated_at (optional, for consistency)
-- CREATE TRIGGER update_team_member_invitations_updated_at
--     BEFORE UPDATE ON team_member_invitations
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE team_member_invitations IS 'Stores invitations for team members to join teams';
COMMENT ON COLUMN team_member_invitations.email IS 'Email address of the invited team member';
COMMENT ON COLUMN team_member_invitations.name IS 'Full name of the invited team member';
COMMENT ON COLUMN team_member_invitations.role IS 'Role to assign: manager or member';
COMMENT ON COLUMN team_member_invitations.invitation_token IS 'Unique token for invitation acceptance';
COMMENT ON COLUMN team_member_invitations.invited_by IS 'Team manager who sent the invitation';
COMMENT ON COLUMN team_member_invitations.status IS 'Status: pending, accepted, expired, or declined';
COMMENT ON COLUMN team_member_invitations.expires_at IS 'When the invitation expires (7 days from creation)';
COMMENT ON COLUMN team_member_invitations.accepted_at IS 'When the invitation was accepted';

-- Test queries to verify the structure
-- SELECT team_id, email, name, role, status FROM team_member_invitations WHERE status = 'pending';
-- SELECT COUNT(*) as pending_invitations FROM team_member_invitations WHERE status = 'pending' GROUP BY team_id; 