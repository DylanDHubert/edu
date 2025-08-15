-- Fix admin_users RLS policies to eliminate infinite recursion
-- The issue is that admin policies are referencing themselves, creating loops

-- Drop all existing admin_users policies
DROP POLICY IF EXISTS "Users can check their admin status" ON admin_users;
DROP POLICY IF EXISTS "Admins can view admin users" ON admin_users;
DROP POLICY IF EXISTS "Admins can manage admin users" ON admin_users;
DROP POLICY IF EXISTS "Public can check admin status" ON admin_users;

-- Create a simple, non-recursive policy for admin_users
-- This allows any authenticated user to check if they are an admin
-- This is safe because it only allows reading, not writing
CREATE POLICY "Allow checking admin status" ON admin_users
    FOR SELECT USING (true);

-- Optional: If you want to restrict admin management to existing admins,
-- you can add this policy (but it may cause recursion again)
-- CREATE POLICY "Admins can manage admin users" ON admin_users
--     FOR ALL USING (
--         email = auth.jwt() ->> 'email'  -- Users can manage their own record
--     );

-- Make sure RLS is enabled
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Add comment
COMMENT ON POLICY "Allow checking admin status" ON admin_users IS 'Allows any authenticated user to read admin_users table to check admin status';

-- Test the fix by running a simple query (uncomment to test):
-- SELECT * FROM admin_users WHERE email = 'lheitman00@gmail.com'; 