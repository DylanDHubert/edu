-- ADD MULTIPLE IMAGES SUPPORT TO NOTES TABLE
-- ADD JSON COLUMN TO STORE ARRAY OF IMAGE OBJECTS
ALTER TABLE notes ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- ADD COMMENT
COMMENT ON COLUMN notes.images IS 'JSON ARRAY OF IMAGE OBJECTS WITH URL AND DESCRIPTION: [{"url": "...", "description": "..."}]';

-- ADD CONSTRAINT TO ENSURE VALID JSON STRUCTURE
ALTER TABLE notes ADD CONSTRAINT check_images_structure 
CHECK (
  jsonb_typeof(images) = 'array' AND
  (jsonb_array_length(images) = 0 OR 
   jsonb_array_length(images) > 0 AND 
   jsonb_array_length(images) <= 10) -- MAX 10 IMAGES PER NOTE
);

-- ADD CONSTRAINT TO ENSURE EACH IMAGE OBJECT HAS REQUIRED FIELDS
ALTER TABLE notes ADD CONSTRAINT check_image_objects
CHECK (
  jsonb_array_length(images) = 0 OR
  (SELECT bool_and(
    jsonb_typeof(value) = 'object' AND
    value ? 'url' AND 
    value ? 'description' AND
    jsonb_typeof(value->'url') = 'string' AND
    jsonb_typeof(value->'description') = 'string' AND
    length(value->>'url') > 0 AND
    length(value->>'description') > 0
  ) FROM jsonb_array_elements(images))
);

-- MIGRATE EXISTING SINGLE IMAGE DATA TO NEW FORMAT
UPDATE notes 
SET images = CASE 
  WHEN image_url IS NOT NULL AND image_description IS NOT NULL 
  THEN jsonb_build_array(
    jsonb_build_object(
      'url', image_url,
      'description', image_description
    )
  )
  ELSE '[]'::jsonb
END
WHERE image_url IS NOT NULL OR image_description IS NOT NULL;

-- DROP OLD COLUMNS AFTER MIGRATION (OPTIONAL - KEEP FOR BACKWARD COMPATIBILITY)
-- ALTER TABLE notes DROP COLUMN IF EXISTS image_url;
-- ALTER TABLE notes DROP COLUMN IF EXISTS image_description;
