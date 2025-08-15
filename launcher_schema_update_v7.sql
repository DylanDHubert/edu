-- ==========================================
-- LAUNCHER SCHEMA UPDATE V7
-- Add Consolidated Vector Store Support
-- ==========================================

-- Add consolidated vector store columns to team_assistants table
ALTER TABLE team_assistants 
ADD COLUMN IF NOT EXISTS consolidated_vector_store_id TEXT,
ADD COLUMN IF NOT EXISTS consolidated_vector_store_name TEXT;

-- Add index for consolidated vector store lookups
CREATE INDEX IF NOT EXISTS idx_team_assistants_consolidated_vector_store 
ON team_assistants(consolidated_vector_store_id) 
WHERE consolidated_vector_store_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN team_assistants.consolidated_vector_store_id IS 'OpenAI vector store ID containing combined portfolio PDFs + account knowledge + general knowledge';
COMMENT ON COLUMN team_assistants.consolidated_vector_store_name IS 'Human-readable name for the consolidated vector store (e.g., "TeamName-AccountName-PortfolioName-Consolidated")';

-- ==========================================
-- MIGRATION NOTES
-- ==========================================

-- This update adds support for consolidated vector stores that combine:
-- 1. Portfolio PDFs (from portfolio_vector_store_id)
-- 2. Account-specific knowledge (from account_portfolio_vector_store_id) 
-- 3. General team knowledge (from general_vector_store_id)
--
-- The existing separate vector store columns remain for backward compatibility
-- but new assistants will use the consolidated approach due to OpenAI's 
-- 1 vector store per assistant limitation.

-- ==========================================
-- VERIFICATION QUERY
-- ==========================================

-- Run this to verify the update was successful:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'team_assistants' 
-- AND column_name IN ('consolidated_vector_store_id', 'consolidated_vector_store_name'); 