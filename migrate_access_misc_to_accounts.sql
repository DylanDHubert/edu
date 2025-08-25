-- MIGRATION: Move access_misc from general to account-specific knowledge
-- This script moves existing access_misc records from team-wide to account-specific
-- Run this in Supabase SQL editor after deploying the code changes

-- STEP 1: Create temporary table to track migration progress
CREATE TEMP TABLE migration_log (
    id SERIAL PRIMARY KEY,
    team_id UUID,
    account_id UUID,
    portfolio_id UUID,
    original_access_id UUID,
    new_access_id UUID,
    migrated_at TIMESTAMP DEFAULT NOW()
);

-- STEP 2: Migrate existing access_misc records from general to account-specific
-- For each team, find all accounts and their portfolios, then create account-specific access_misc records
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
    ap.account_id,
    ap.portfolio_id,
    'access_misc' as category,
    tk.title,
    tk.content,
    tk.metadata,
    tk.created_by,
    NOW() as created_at,
    NOW() as updated_at
FROM team_knowledge tk
CROSS JOIN account_portfolios ap
WHERE tk.category = 'access_misc'
  AND tk.account_id IS NULL
  AND tk.portfolio_id IS NULL
  AND tk.team_id = (
    SELECT ta.team_id 
    FROM team_accounts ta 
    WHERE ta.id = ap.account_id
  );

-- STEP 3: Log the migration
INSERT INTO migration_log (team_id, account_id, portfolio_id, original_access_id, new_access_id)
SELECT 
    tk.team_id,
    ap.account_id,
    ap.portfolio_id,
    original_tk.id as original_access_id,
    tk.id as new_access_id
FROM team_knowledge tk
CROSS JOIN account_portfolios ap
JOIN team_knowledge original_tk ON original_tk.category = 'access_misc' 
    AND original_tk.account_id IS NULL 
    AND original_tk.portfolio_id IS NULL
    AND original_tk.team_id = (
        SELECT ta.team_id 
        FROM team_accounts ta 
        WHERE ta.id = ap.account_id
    )
WHERE tk.category = 'access_misc'
  AND tk.account_id = ap.account_id
  AND tk.portfolio_id = ap.portfolio_id
  AND tk.created_at >= NOW() - INTERVAL '1 minute';

-- STEP 4: Delete the original general access_misc records
DELETE FROM team_knowledge 
WHERE category = 'access_misc' 
  AND account_id IS NULL 
  AND portfolio_id IS NULL;

-- STEP 5: Verify migration results
SELECT 
    'Migration Summary' as summary,
    COUNT(*) as total_migrated_records
FROM migration_log;

SELECT 
    'Teams with migrated access_misc' as info,
    COUNT(DISTINCT team_id) as team_count
FROM migration_log;

SELECT 
    'Accounts with migrated access_misc' as info,
    COUNT(DISTINCT account_id) as account_count
FROM migration_log;

-- STEP 6: Show sample of migrated data
SELECT 
    tk.team_id,
    tk.account_id,
    tk.portfolio_id,
    tk.title,
    LEFT(tk.content, 100) as content_preview,
    tk.created_at
FROM team_knowledge tk
WHERE tk.category = 'access_misc'
  AND tk.account_id IS NOT NULL
  AND tk.portfolio_id IS NOT NULL
ORDER BY tk.created_at DESC
LIMIT 10;

-- STEP 7: Clean up temporary table
DROP TABLE migration_log;
