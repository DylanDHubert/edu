-- CLEANUP DUPLICATE PORTFOLIO ASSISTANTS
-- Run this first, then run the constraint migration

-- Show what duplicates exist
SELECT team_id, portfolio_id, COUNT(*) as count
FROM team_assistants 
WHERE account_id IS NULL
GROUP BY team_id, portfolio_id
HAVING COUNT(*) > 1;

-- Delete duplicate portfolio assistants, keeping the most recent one
DELETE FROM team_assistants 
WHERE id IN (
  SELECT id FROM (
    SELECT id, 
           ROW_NUMBER() OVER (PARTITION BY team_id, portfolio_id ORDER BY created_at DESC) as rn
    FROM team_assistants 
    WHERE account_id IS NULL
  ) t 
  WHERE t.rn > 1
);

-- Verify cleanup worked
SELECT team_id, portfolio_id, COUNT(*) as count
FROM team_assistants 
WHERE account_id IS NULL
GROUP BY team_id, portfolio_id
HAVING COUNT(*) > 1;
