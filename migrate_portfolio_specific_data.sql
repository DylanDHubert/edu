-- MIGRATION SCRIPT: Convert account-level data to portfolio-specific data
-- This script copies existing account-level instruments and technical info to all assigned portfolios
-- Access & misc data remains account-level

-- STEP 1: Copy account-level instruments to all assigned portfolios
INSERT INTO team_knowledge (
  team_id,
  account_id,
  portfolio_id,
  category,
  title,
  content,
  metadata,
  created_by,
  created_at,
  updated_at
)
SELECT 
  tk.team_id,
  tk.account_id,
  ap.portfolio_id,
  tk.category,
  tk.title,
  tk.content,
  tk.metadata,
  tk.created_by,
  NOW(),
  NOW()
FROM team_knowledge tk
JOIN account_portfolios ap ON tk.account_id = ap.account_id
WHERE tk.portfolio_id IS NULL 
  AND tk.category IN ('instruments', 'technical')
  AND NOT EXISTS (
    -- Avoid duplicates by checking if this knowledge already exists for this portfolio
    SELECT 1 FROM team_knowledge tk2 
    WHERE tk2.team_id = tk.team_id 
      AND tk2.account_id = tk.account_id 
      AND tk2.portfolio_id = ap.portfolio_id 
      AND tk2.category = tk.category 
      AND tk2.title = tk.title
  );

-- STEP 2: Copy account-level technical info to all assigned portfolios
-- (This is already covered by the above query, but keeping for clarity)

-- STEP 3: Remove old account-level instruments and technical data
-- (Keep access_misc as account-level)
DELETE FROM team_knowledge 
WHERE portfolio_id IS NULL 
  AND category IN ('instruments', 'technical');

-- STEP 4: Verify migration results
-- Check how many records were created
SELECT 
  'Portfolio-specific instruments created' as description,
  COUNT(*) as count
FROM team_knowledge 
WHERE portfolio_id IS NOT NULL 
  AND category = 'instruments'
  AND created_at >= NOW() - INTERVAL '1 hour'

UNION ALL

SELECT 
  'Portfolio-specific technical info created' as description,
  COUNT(*) as count
FROM team_knowledge 
WHERE portfolio_id IS NOT NULL 
  AND category = 'technical'
  AND created_at >= NOW() - INTERVAL '1 hour'

UNION ALL

SELECT 
  'Account-level access_misc remaining' as description,
  COUNT(*) as count
FROM team_knowledge 
WHERE portfolio_id IS NULL 
  AND category = 'access_misc';
