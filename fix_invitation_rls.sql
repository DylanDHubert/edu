-- FIX RLS POLICY FOR TEAM MEMBER INVITATIONS
-- This allows the validation API to access invitations by token

-- DROP THE EXISTING RESTRICTIVE POLICY
DROP POLICY IF EXISTS "Team managers can manage member invitations" ON team_member_invitations;

-- CREATE A MORE PERMISSIVE POLICY FOR TEAM MANAGERS
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

-- ADD POLICY TO ALLOW ACCESS BY INVITATION TOKEN (FOR VALIDATION API)
CREATE POLICY "Allow access by invitation token" ON team_member_invitations
    FOR SELECT USING (
        -- ALLOW ACCESS TO PENDING INVITATIONS ONLY
        status = 'pending'
    );

-- ADD POLICY TO ALLOW UPDATES FOR INVITATION ACCEPTANCE
CREATE POLICY "Allow invitation status updates" ON team_member_invitations
    FOR UPDATE USING (
        -- ALLOW UPDATES TO PENDING INVITATIONS (for acceptance)
        status = 'pending'
    ) WITH CHECK (
        -- ALLOW CHANGING STATUS TO 'accepted' OR 'declined'
        status IN ('accepted', 'declined')
    );

-- ALTERNATIVE: MORE RESTRICTIVE TOKEN-BASED POLICY
-- CREATE POLICY "Allow access by invitation token" ON team_member_invitations
--     FOR SELECT USING (
--         -- ONLY ALLOW ACCESS TO PENDING INVITATIONS
--         status = 'pending'
--     );

-- VERIFY THE POLICIES
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'team_member_invitations';
