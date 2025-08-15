-- Temporarily disable RLS on admin_users to eliminate infinite recursion
-- This is a debugging step to isolate the issue

-- Disable RLS entirely on admin_users table
ALTER TABLE admin_users DISABLE ROW LEVEL SECURITY;

-- Verify the table exists and has data
-- You can uncomment this to test:
-- SELECT * FROM admin_users;

-- Also, let's check if there are any triggers or other policies causing issues
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'admin_users';

-- Check if RLS is enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity,
    forcerowsecurity
FROM pg_tables 
WHERE tablename = 'admin_users'; 