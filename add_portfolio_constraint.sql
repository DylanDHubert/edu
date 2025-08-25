-- ADD UNIQUE CONSTRAINT FOR PORTFOLIO-LEVEL ASSISTANTS
-- This allows one assistant per portfolio (account_id = null)
-- NOTE: Run cleanup_duplicates.sql first if you get duplicate key errors

-- Add the unique constraint
ALTER TABLE team_assistants 
ADD CONSTRAINT team_assistants_portfolio_unique 
UNIQUE (team_id, portfolio_id);

-- Verify the constraint was added
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'team_assistants' 
AND constraint_name = 'team_assistants_portfolio_unique';
