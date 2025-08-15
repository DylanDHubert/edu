-- HHB Launcher Schema Update v3: Manager Invitations
-- This update adds the manager_invitations table for the corrected flow where
-- HHB Admin invites Managers, and Managers create their own teams

-- Add manager_invitations table
CREATE TABLE IF NOT EXISTS manager_invitations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    invitation_token TEXT NOT NULL UNIQUE,
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days',
    accepted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(email, status) -- Prevent multiple pending invitations for same email
);

-- Add indexes for manager_invitations
CREATE INDEX IF NOT EXISTS idx_manager_invitations_email ON manager_invitations(email);
CREATE INDEX IF NOT EXISTS idx_manager_invitations_token ON manager_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_manager_invitations_status ON manager_invitations(status);
CREATE INDEX IF NOT EXISTS idx_manager_invitations_invited_by ON manager_invitations(invited_by);

-- Add RLS policies for manager_invitations
ALTER TABLE manager_invitations ENABLE ROW LEVEL SECURITY;

-- Admins can view and create invitations
CREATE POLICY "Admins can manage manager invitations" ON manager_invitations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_users 
            WHERE admin_users.email = auth.jwt() ->> 'email'
        )
    );

-- Invited managers can view their own invitations (by token, not requiring auth)
-- This will be handled in the application logic since RLS requires auth

-- Add comments for documentation
COMMENT ON TABLE manager_invitations IS 'Stores invitations for people to become team managers';
COMMENT ON COLUMN manager_invitations.email IS 'Email address of the invited manager';
COMMENT ON COLUMN manager_invitations.name IS 'Full name of the invited manager';
COMMENT ON COLUMN manager_invitations.invitation_token IS 'Unique token for invitation acceptance';
COMMENT ON COLUMN manager_invitations.invited_by IS 'Admin who sent the invitation';
COMMENT ON COLUMN manager_invitations.status IS 'Status: pending, accepted, or expired';
COMMENT ON COLUMN manager_invitations.expires_at IS 'When the invitation expires (7 days from creation)';
COMMENT ON COLUMN manager_invitations.accepted_at IS 'When the invitation was accepted';

-- Add trigger for updated_at (though not needed for this table currently)
-- CREATE TRIGGER update_manager_invitations_updated_at 
--     BEFORE UPDATE ON manager_invitations 
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 