-- MIGRATE NOTES SYSTEM - ADD PORTFOLIO-LEVEL SHARING
-- This script adds support for sharing notes across all accounts within a portfolio

-- STEP 1: ADD NEW COLUMN FOR PORTFOLIO-LEVEL SHARING
ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_portfolio_shared BOOLEAN DEFAULT FALSE;

-- STEP 2: ADD COMMENT TO EXPLAIN THE NEW FIELD
COMMENT ON COLUMN notes.is_portfolio_shared IS 'When true, note is shared across all accounts in the portfolio (account_id will be null)';

-- STEP 3: ADD CONSTRAINT TO ENSURE LOGICAL CONSISTENCY
-- If portfolio_shared is true, account_id should be null
-- If portfolio_shared is false, account_id should be set (unless it's a general note)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'notes_portfolio_sharing_logic'
  ) THEN
    ALTER TABLE notes ADD CONSTRAINT notes_portfolio_sharing_logic 
      CHECK (
        (is_portfolio_shared = true AND account_id IS NULL) OR 
        (is_portfolio_shared = false)
      );
  END IF;
END $$;

-- STEP 4: CREATE INDEX FOR BETTER PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_notes_is_portfolio_shared ON notes(is_portfolio_shared);

-- STEP 5: SHOW CURRENT STATE
SELECT 'CURRENT NOTES DISTRIBUTION:' as status;
SELECT 
  COUNT(*) as total_notes,
  COUNT(CASE WHEN is_shared = true THEN 1 END) as shared_notes,
  COUNT(CASE WHEN is_portfolio_shared = true THEN 1 END) as portfolio_shared_notes,
  COUNT(CASE WHEN account_id IS NOT NULL THEN 1 END) as account_specific_notes,
  COUNT(CASE WHEN account_id IS NULL AND team_id IS NOT NULL THEN 1 END) as portfolio_level_notes
FROM notes;

-- STEP 6: UPDATE ROW LEVEL SECURITY POLICIES
-- Drop existing policies
DROP POLICY IF EXISTS "USERS CAN ACCESS THEIR OWN NOTES" ON notes;
DROP POLICY IF EXISTS "USERS CAN ACCESS SHARED NOTES" ON notes;

-- Create new comprehensive policies
CREATE POLICY "USERS CAN ACCESS THEIR OWN NOTES" ON notes
  FOR ALL USING (
    auth.uid() = user_id
  );

CREATE POLICY "USERS CAN ACCESS SHARED NOTES" ON notes
  FOR ALL USING (
    is_shared = true
  );

CREATE POLICY "USERS CAN ACCESS PORTFOLIO SHARED NOTES" ON notes
  FOR ALL USING (
    is_portfolio_shared = true
  );

-- STEP 7: VERIFICATION
SELECT 'MIGRATION COMPLETE - NEW SCHEMA:' as status;
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'notes' 
AND column_name IN ('is_portfolio_shared', 'is_shared', 'account_id', 'team_id', 'portfolio_id')
ORDER BY column_name;
