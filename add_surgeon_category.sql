-- Add surgeon_info category to team_knowledge table
-- This migration updates the category constraint to include 'surgeon_info'

-- First, drop the existing constraint
ALTER TABLE public.team_knowledge 
DROP CONSTRAINT IF EXISTS team_knowledge_category_check;

-- Add the new constraint with surgeon_info included
ALTER TABLE public.team_knowledge 
ADD CONSTRAINT team_knowledge_category_check 
CHECK (category = ANY (ARRAY['inventory'::text, 'instruments'::text, 'technical'::text, 'doctor_info'::text, 'access_misc'::text, 'surgeon_info'::text]));
