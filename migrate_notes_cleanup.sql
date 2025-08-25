-- MIGRATE NOTES SYSTEM - REMOVE LEGACY IMAGE FIELDS
-- This script migrates any remaining legacy image data to the new images array format
-- and removes the legacy image_url and image_description columns

-- STEP 1: SHOW CURRENT STATE
SELECT 'BEFORE MIGRATION - CURRENT STATE:' as status;
SELECT 
  COUNT(*) as total_notes,
  COUNT(CASE WHEN image_url IS NOT NULL THEN 1 END) as notes_with_legacy_image,
  COUNT(CASE WHEN images IS NOT NULL AND jsonb_array_length(images) > 0 THEN 1 END) as notes_with_new_images
FROM notes;

-- STEP 2: MIGRATE ANY REMAINING LEGACY IMAGE DATA TO NEW FORMAT
UPDATE notes 
SET images = CASE 
  WHEN image_url IS NOT NULL AND (images IS NULL OR jsonb_array_length(images) = 0) THEN
    jsonb_build_array(
      jsonb_build_object(
        'url', 
        CASE 
          WHEN image_url LIKE '%supabase.co/storage/v1/object/public/user_note_images/%' THEN
            -- CONVERT SUPABASE URL TO OUR API URL FORMAT
            '/api/images/' || split_part(split_part(image_url, '/user_note_images/', 2), '/', 1) || '/' || split_part(split_part(image_url, '/user_note_images/', 2), '/', 2)
          ELSE image_url
        END,
        'description', 
        COALESCE(image_description, 'Legacy image')
      )
    )
  ELSE images
END
WHERE image_url IS NOT NULL 
AND (images IS NULL OR jsonb_array_length(images) = 0);

-- STEP 3: SHOW MIGRATION RESULTS
SELECT 'AFTER MIGRATION - MIGRATED DATA:' as status;
SELECT 
  COUNT(*) as total_notes,
  COUNT(CASE WHEN image_url IS NOT NULL THEN 1 END) as notes_with_legacy_image,
  COUNT(CASE WHEN images IS NOT NULL AND jsonb_array_length(images) > 0 THEN 1 END) as notes_with_new_images
FROM notes;

-- STEP 4: DROP LEGACY COLUMNS
ALTER TABLE notes DROP COLUMN IF EXISTS image_url;
ALTER TABLE notes DROP COLUMN IF EXISTS image_description;

-- STEP 5: FINAL VERIFICATION
SELECT 'FINAL STATE - LEGACY COLUMNS REMOVED:' as status;
SELECT 
  COUNT(*) as total_notes,
  COUNT(CASE WHEN images IS NOT NULL AND jsonb_array_length(images) > 0 THEN 1 END) as notes_with_images
FROM notes;

-- STEP 6: SHOW SAMPLE OF MIGRATED DATA
SELECT 'SAMPLE MIGRATED NOTES:' as status;
SELECT id, title, images 
FROM notes 
WHERE images IS NOT NULL 
AND jsonb_array_length(images) > 0
LIMIT 5;
