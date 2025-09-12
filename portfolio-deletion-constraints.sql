-- PORTFOLIO DELETION SYSTEM - DATABASE CONSTRAINTS
-- This file ensures proper foreign key constraints for portfolio deletion
-- Run this in Supabase SQL Editor if you encounter foreign key constraint issues

-- CHECK CURRENT FOREIGN KEY CONSTRAINTS
-- This query will show you all foreign key constraints that reference team_portfolios
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_name
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND ccu.table_name = 'team_portfolios'
  AND tc.table_schema = 'public';

-- IF YOU NEED TO ADD CASCADE DELETE (OPTIONAL - NOT RECOMMENDED)
-- Uncomment these lines if you want automatic cascade deletion
-- WARNING: This will automatically delete related records when a portfolio is deleted
-- This is NOT recommended as it bypasses our application-level cleanup logic

-- ALTER TABLE chat_history DROP CONSTRAINT IF EXISTS chat_history_portfolio_id_fkey;
-- ALTER TABLE chat_history ADD CONSTRAINT chat_history_portfolio_id_fkey 
--   FOREIGN KEY (portfolio_id) REFERENCES team_portfolios(id) ON DELETE CASCADE;

-- ALTER TABLE message_ratings DROP CONSTRAINT IF EXISTS message_ratings_portfolio_id_fkey;
-- ALTER TABLE message_ratings ADD CONSTRAINT message_ratings_portfolio_id_fkey 
--   FOREIGN KEY (portfolio_id) REFERENCES team_portfolios(id) ON DELETE CASCADE;

-- ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_portfolio_id_fkey;
-- ALTER TABLE notes ADD CONSTRAINT notes_portfolio_id_fkey 
--   FOREIGN KEY (portfolio_id) REFERENCES team_portfolios(id) ON DELETE CASCADE;

-- ALTER TABLE team_assistants DROP CONSTRAINT IF EXISTS team_assistants_portfolio_id_fkey;
-- ALTER TABLE team_assistants ADD CONSTRAINT team_assistants_portfolio_id_fkey 
--   FOREIGN KEY (portfolio_id) REFERENCES team_portfolios(id) ON DELETE CASCADE;

-- ALTER TABLE account_portfolio_stores DROP CONSTRAINT IF EXISTS account_portfolio_stores_portfolio_id_fkey;
-- ALTER TABLE account_portfolio_stores ADD CONSTRAINT account_portfolio_stores_portfolio_id_fkey 
--   FOREIGN KEY (portfolio_id) REFERENCES team_portfolios(id) ON DELETE CASCADE;

-- ALTER TABLE account_portfolios DROP CONSTRAINT IF EXISTS account_portfolios_portfolio_id_fkey;
-- ALTER TABLE account_portfolios ADD CONSTRAINT account_portfolios_portfolio_id_fkey 
--   FOREIGN KEY (portfolio_id) REFERENCES team_portfolios(id) ON DELETE CASCADE;

-- ALTER TABLE team_knowledge DROP CONSTRAINT IF EXISTS team_knowledge_portfolio_id_fkey;
-- ALTER TABLE team_knowledge ADD CONSTRAINT team_knowledge_portfolio_id_fkey 
--   FOREIGN KEY (portfolio_id) REFERENCES team_portfolios(id) ON DELETE SET NULL;

-- ALTER TABLE team_documents DROP CONSTRAINT IF EXISTS team_documents_portfolio_id_fkey;
-- ALTER TABLE team_documents ADD CONSTRAINT team_documents_portfolio_id_fkey 
--   FOREIGN KEY (portfolio_id) REFERENCES team_portfolios(id) ON DELETE CASCADE;

-- VERIFY CONSTRAINTS AFTER CHANGES
-- Run this to verify all constraints are properly set
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_name,
    rc.delete_rule
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON tc.constraint_name = rc.constraint_name
      AND tc.table_schema = rc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND ccu.table_name = 'team_portfolios'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;
