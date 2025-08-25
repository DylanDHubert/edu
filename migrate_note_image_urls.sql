-- MIGRATE EXISTING NOTE IMAGE URLS
-- This script updates existing note image URLs from Supabase public URLs to our custom API URLs

-- First, let's see what we're working with
SELECT 'BEFORE MIGRATION - CURRENT IMAGE URLS:' as status;
SELECT id, title, images 
FROM notes 
WHERE images IS NOT NULL 
AND jsonb_array_length(images) > 0
LIMIT 3;

-- Create a function to convert Supabase URLs to our API URLs
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

-- Update URLs in the images array
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
AND jsonb_array_length(images) > 0;

-- Show the results
SELECT 'AFTER MIGRATION - UPDATED IMAGE URLS:' as status;
SELECT id, title, images 
FROM notes 
WHERE images IS NOT NULL 
AND jsonb_array_length(images) > 0
LIMIT 3;

-- Count how many notes were updated
SELECT 'MIGRATION SUMMARY:' as status;
SELECT 
  COUNT(*) as total_notes_with_images,
  COUNT(CASE WHEN images IS NOT NULL AND jsonb_array_length(images) > 0 THEN 1 END) as notes_with_image_arrays
FROM notes;

-- Clean up the function
DROP FUNCTION convert_supabase_url_to_api_url(TEXT);
