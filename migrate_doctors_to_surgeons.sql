-- MIGRATION: Remove doctor_info category and migrate existing doctors to surgeons
-- This consolidates the medical professional data model to use only surgeons

-- STEP 1: Migrate existing doctor_info records to surgeon_info
UPDATE team_knowledge 
SET 
  category = 'surgeon_info',
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{procedure_focus}',
    '"General Practice"'
  )
WHERE category = 'doctor_info';

-- STEP 2: Update the category check constraint to remove doctor_info
ALTER TABLE team_knowledge 
DROP CONSTRAINT team_knowledge_category_check;

ALTER TABLE team_knowledge 
ADD CONSTRAINT team_knowledge_category_check 
CHECK (category = ANY (ARRAY['inventory'::text, 'instruments'::text, 'technical'::text, 'access_misc'::text, 'surgeon_info'::text]));

-- STEP 3: Log the migration
INSERT INTO team_knowledge (
  team_id,
  category,
  title,
  content,
  metadata,
  created_at
) VALUES (
  NULL, -- This is a system migration record
  'access_misc',
  'System Migration',
  'Migrated doctor_info records to surgeon_info category. All doctors are now stored as surgeons with procedure_focus set to "General Practice".',
  '{"migration_type": "doctor_to_surgeon_consolidation", "timestamp": "' || now() || '"}',
  now()
);
