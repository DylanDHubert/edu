-- VERIFICATION SCRIPT: Check migration results
-- Run this to verify the portfolio-specific data migration worked correctly

-- Check how many portfolio-specific records were created
SELECT 
  'Portfolio-specific instruments' as category,
  COUNT(*) as count
FROM team_knowledge 
WHERE portfolio_id IS NOT NULL 
  AND category = 'instruments'

UNION ALL

SELECT 
  'Portfolio-specific technical info' as category,
  COUNT(*) as count
FROM team_knowledge 
WHERE portfolio_id IS NOT NULL 
  AND category = 'technical'

UNION ALL

SELECT 
  'Portfolio-specific inventory' as category,
  COUNT(*) as count
FROM team_knowledge 
WHERE portfolio_id IS NOT NULL 
  AND category = 'inventory'

UNION ALL

SELECT 
  'Account-level access_misc (should remain)' as category,
  COUNT(*) as count
FROM team_knowledge 
WHERE portfolio_id IS NULL 
  AND category = 'access_misc'

UNION ALL

SELECT 
  'Account-level instruments (should be 0)' as category,
  COUNT(*) as count
FROM team_knowledge 
WHERE portfolio_id IS NULL 
  AND category = 'instruments'

UNION ALL

SELECT 
  'Account-level technical (should be 0)' as category,
  COUNT(*) as count
FROM team_knowledge 
WHERE portfolio_id IS NULL 
  AND category = 'technical';

-- Show sample of migrated data structure
SELECT 
  tk.category,
  tk.title,
  tk.portfolio_id,
  tp.name as portfolio_name,
  ta.name as account_name,
  tk.created_at
FROM team_knowledge tk
JOIN team_portfolios tp ON tk.portfolio_id = tp.id
JOIN team_accounts ta ON tk.account_id = ta.id
WHERE tk.portfolio_id IS NOT NULL 
  AND tk.category IN ('instruments', 'technical', 'inventory')
ORDER BY tk.category, ta.name, tp.name
LIMIT 20;
