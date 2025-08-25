-- MIGRATE NOTE IMAGE URLS TO API FORMAT
-- This script converts any remaining Supabase URLs to our custom API URLs

-- STEP 1: SHOW CURRENT STATE
SELECT 'BEFORE MIGRATION - CURRENT IMAGE URLS:' as status;
SELECT id, title, images 
FROM notes 
WHERE images IS NOT NULL 
AND jsonb_array_length(images) > 0
AND images::text LIKE '%supabase.co%'
LIMIT 3;

-- STEP 2: CREATE FUNCTION TO CONVERT SUPABASE URLS TO API URLS
CREATE OR REPLACE FUNCTION convert_supabase_url_to_api_url(supabase_url TEXT)
RETURNS TEXT AS $$
DECLARE
    path_part TEXT;
    user_id TEXT;
    filename TEXT;
BEGIN
    -- Extract the path after /user_note_images/
    path_part := split_part(supabase_url, '/user_note_images/', 2);
    
    -- Split into user_id and filename
    user_id := split_part(path_part, '/', 1);
    filename := split_part(path_part, '/', 2);
    
    -- Return our API URL format
    RETURN '/api/images/' || user_id || '/' || filename;
END;
$$ LANGUAGE plpgsql;

-- STEP 3: UPDATE URLS IN THE IMAGES ARRAY
UPDATE notes 
SET images = (
  SELECT jsonb_agg(
    CASE 
      WHEN image->>'url' LIKE '%supabase.co/storage/v1/object/public/user_note_images/%' THEN
        jsonb_build_object(
          'url', 
          convert_supabase_url_to_api_url(image->>'url'),
          'description', 
          image->>'description'
        )
      ELSE image
    END
  )
  FROM jsonb_array_elements(images) AS image
)
WHERE images IS NOT NULL 
AND jsonb_array_length(images) > 0
AND images::text LIKE '%supabase.co%';

-- STEP 4: SHOW RESULTS
SELECT 'AFTER MIGRATION - UPDATED IMAGE URLS:' as status;
SELECT id, title, images 
FROM notes 
WHERE images IS NOT NULL 
AND jsonb_array_length(images) > 0
LIMIT 3;

-- STEP 5: COUNT MIGRATED NOTES
SELECT 'MIGRATION SUMMARY:' as status;
SELECT 
  COUNT(*) as total_notes_with_images,
  COUNT(CASE WHEN images::text LIKE '%supabase.co%' THEN 1 END) as notes_with_supabase_urls,
  COUNT(CASE WHEN images::text LIKE '%/api/images/%' THEN 1 END) as notes_with_api_urls
FROM notes 
WHERE images IS NOT NULL 
AND jsonb_array_length(images) > 0;

-- STEP 6: CLEAN UP
DROP FUNCTION convert_supabase_url_to_api_url(TEXT);
