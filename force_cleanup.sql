-- FORCE CLEANUP DUPLICATE PORTFOLIO ASSISTANTS
-- This will show and remove ALL duplicates

-- First, let's see what we're dealing with
SELECT 'BEFORE CLEANUP - ALL PORTFOLIO ASSISTANTS:' as status;
SELECT id, team_id, portfolio_id, assistant_name, created_at
FROM team_assistants 
WHERE account_id IS NULL
ORDER BY team_id, portfolio_id, created_at DESC;

-- Show duplicates specifically
SELECT 'DUPLICATES FOUND:' as status;
SELECT team_id, portfolio_id, COUNT(*) as count
FROM team_assistants 
WHERE account_id IS NULL
GROUP BY team_id, portfolio_id
HAVING COUNT(*) > 1;

-- Delete ALL portfolio assistants (we'll recreate them)
SELECT 'DELETING ALL PORTFOLIO ASSISTANTS...' as status;
DELETE FROM team_assistants 
WHERE account_id IS NULL;

-- Verify they're gone
SELECT 'AFTER CLEANUP - REMAINING ASSISTANTS:' as status;
SELECT id, team_id, portfolio_id, assistant_name, created_at
FROM team_assistants 
WHERE account_id IS NULL
ORDER BY team_id, portfolio_id, created_at DESC;
