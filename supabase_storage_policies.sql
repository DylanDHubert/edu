-- SUPABASE STORAGE POLICIES FOR USER NOTE IMAGES
-- NOTE: THESE POLICIES MUST BE CREATED THROUGH THE SUPABASE DASHBOARD
-- OR USING THE SUPABASE CLI, NOT THROUGH DIRECT SQL

-- STEP 1: CREATE THE BUCKET MANUALLY
-- 1. GO TO SUPABASE DASHBOARD > STORAGE
-- 2. CLICK "CREATE BUCKET"
-- 3. NAME: "user_note_images"
-- 4. SET TO PUBLIC

-- STEP 2: CREATE POLICIES THROUGH DASHBOARD
-- GO TO SUPABASE DASHBOARD > STORAGE > POLICIES
-- CREATE THE FOLLOWING POLICIES:

/*
POLICY 1: "USERS CAN UPLOAD THEIR OWN IMAGES"
- Target: user_note_images bucket
- Operation: INSERT
- Policy definition:
  auth.uid()::text = (storage.foldername(name))[1]

POLICY 2: "USERS CAN UPDATE THEIR OWN IMAGES"
- Target: user_note_images bucket
- Operation: UPDATE
- Policy definition:
  auth.uid()::text = (storage.foldername(name))[1]

POLICY 3: "USERS CAN DELETE THEIR OWN IMAGES"
- Target: user_note_images bucket
- Operation: DELETE
- Policy definition:
  auth.uid()::text = (storage.foldername(name))[1]

POLICY 4: "PUBLIC READ ACCESS TO IMAGES"
- Target: user_note_images bucket
- Operation: SELECT
- Policy definition:
  bucket_id = 'user_note_images'

POLICY 5: "USERS CAN SELECT THEIR OWN IMAGES"
- Target: user_note_images bucket
- Operation: SELECT
- Policy definition:
  auth.uid()::text = (storage.foldername(name))[1]
*/

-- ALTERNATIVE: USE SUPABASE CLI
-- IF YOU HAVE SUPABASE CLI INSTALLED, YOU CAN CREATE THESE POLICIES PROGRAMMATICALLY
-- BUT FOR NOW, USE THE DASHBOARD APPROACH ABOVE
