-- HHB Launcher Schema Update v5: General Team Knowledge Vector Stores
-- This update adds general vector store support to complete the 3-tier architecture

-- Add general vector store columns to teams table
ALTER TABLE teams ADD COLUMN IF NOT EXISTS general_vector_store_id TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS general_vector_store_name TEXT;

-- Add indexes for general vector store lookup
CREATE INDEX IF NOT EXISTS idx_teams_general_vector_store ON teams(general_vector_store_id) WHERE general_vector_store_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN teams.general_vector_store_id IS 'OpenAI vector store ID for general team knowledge (doctor info, access details)';
COMMENT ON COLUMN teams.general_vector_store_name IS 'Human-readable name of the general team knowledge vector store';

-- Update team_knowledge table to support general knowledge (account_id and portfolio_id can be NULL)
-- This should already be supported, but let's make it explicit
ALTER TABLE team_knowledge ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE team_knowledge ALTER COLUMN portfolio_id DROP NOT NULL;

-- Add new categories for general knowledge
-- First check if we need to update the constraint
DO $$
BEGIN
    -- Drop existing constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE constraint_name = 'team_knowledge_category_check'
    ) THEN
        ALTER TABLE team_knowledge DROP CONSTRAINT team_knowledge_category_check;
    END IF;
    
    -- Add updated constraint with new categories
    ALTER TABLE team_knowledge ADD CONSTRAINT team_knowledge_category_check 
        CHECK (category IN ('inventory', 'instruments', 'technical', 'doctor_info', 'access_misc'));
END $$;

-- Add index for general knowledge queries
CREATE INDEX IF NOT EXISTS idx_team_knowledge_general ON team_knowledge(team_id, category) 
    WHERE account_id IS NULL AND portfolio_id IS NULL;

-- Add comments for new categories
COMMENT ON CONSTRAINT team_knowledge_category_check ON team_knowledge IS 'Categories: inventory, instruments, technical (account-specific), doctor_info, access_misc (general)';

-- Test queries to verify the structure
-- SELECT team_id, general_vector_store_id, general_vector_store_name FROM teams WHERE general_vector_store_id IS NOT NULL;
-- SELECT team_id, category, title FROM team_knowledge WHERE account_id IS NULL AND portfolio_id IS NULL; 