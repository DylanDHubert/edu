-- SUPABASE STORAGE POLICIES - CORRECT APPROACH
-- NOTE: YOU CANNOT DIRECTLY MODIFY storage.objects TABLE
-- USE THE SUPABASE DASHBOARD OR SUPABASE CLI INSTEAD

-- OPTION 1: USE SUPABASE DASHBOARD (RECOMMENDED)
-- 1. GO TO SUPABASE DASHBOARD > STORAGE
-- 2. CREATE BUCKET: "user_note_images" (set to public)
-- 3. GO TO STORAGE > POLICIES
-- 4. CLICK "NEW POLICY" FOR user_note_images BUCKET
-- 5. CREATE THESE POLICIES:

/*
POLICY 1: "ALLOW AUTHENTICATED UPLOADS"
- Target: user_note_images bucket
- Operation: INSERT
- Policy definition: auth.role() = 'authenticated'

POLICY 2: "ALLOW AUTHENTICATED UPDATES"
- Target: user_note_images bucket
- Operation: UPDATE
- Policy definition: auth.role() = 'authenticated'

POLICY 3: "ALLOW AUTHENTICATED DELETES"
- Target: user_note_images bucket
- Operation: DELETE
- Policy definition: auth.role() = 'authenticated'

POLICY 4: "ALLOW PUBLIC READS"
- Target: user_note_images bucket
- Operation: SELECT
- Policy definition: true
*/

-- OPTION 2: TEMPORARILY DISABLE RLS THROUGH DASHBOARD
-- 1. GO TO SUPABASE DASHBOARD > STORAGE > user_note_images
-- 2. CLICK "SETTINGS"
-- 3. TURN OFF "Row Level Security (RLS)"
-- 4. TEST UPLOAD
-- 5. RE-ENABLE RLS AND CREATE POLICIES ABOVE

-- OPTION 3: USE SUPABASE CLI (IF YOU HAVE IT INSTALLED)
-- supabase storage create-bucket user_note_images --public
-- supabase storage policy create user_note_images "Allow authenticated uploads" --operation insert --definition "auth.role() = 'authenticated'"
