-- HHB Launcher Schema Updates V2
-- This script updates the existing launcher_database_schema.sql to match our new architecture

-- ==========================================
-- UPDATE EXISTING TABLES FOR NEW ARCHITECTURE
-- ==========================================

-- Add general knowledge vector store columns to teams table
ALTER TABLE teams ADD COLUMN IF NOT EXISTS general_knowledge_vector_store_id TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS general_knowledge_vector_store_name TEXT;

-- Add vector store name column to existing team_portfolios table
ALTER TABLE team_portfolios ADD COLUMN IF NOT EXISTS vector_store_name TEXT;

-- ==========================================
-- CREATE NEW TABLES FOR ACCOUNT-BASED ARCHITECTURE
-- ==========================================

-- Team accounts table (hospitals, practices, etc.)
CREATE TABLE IF NOT EXISTS team_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- "Mercy Hospital", "Malvern Practice"
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, name) -- No duplicate account names per team
);

-- Account-Portfolio assignments (which portfolios are used at each account)
CREATE TABLE IF NOT EXISTS account_portfolios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID REFERENCES team_accounts(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES team_portfolios(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(account_id, portfolio_id) -- One assignment per account-portfolio pair
);

-- Account-Portfolio Vector Stores (knowledge specific to account+portfolio combination)
CREATE TABLE IF NOT EXISTS account_portfolio_stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  account_id UUID REFERENCES team_accounts(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES team_portfolios(id) ON DELETE CASCADE,
  vector_store_id TEXT NOT NULL, -- OpenAI vector store ID (exact match)
  vector_store_name TEXT NOT NULL, -- Semantic description: "{AccountName} - {PortfolioName} Knowledge"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(account_id, portfolio_id) -- One store per account-portfolio combination
);

-- Assistant configurations (cached assistants for team+account+portfolio combinations)
CREATE TABLE IF NOT EXISTS team_assistants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  account_id UUID REFERENCES team_accounts(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES team_portfolios(id) ON DELETE CASCADE,
  assistant_id TEXT NOT NULL, -- OpenAI assistant ID (exact match)
  assistant_name TEXT NOT NULL, -- Semantic description: "{TeamName} - {AccountName} - {PortfolioName} Assistant"
  general_vector_store_id TEXT NOT NULL, -- Team general knowledge
  account_portfolio_vector_store_id TEXT NOT NULL, -- Account-portfolio specific knowledge
  portfolio_vector_store_id TEXT NOT NULL, -- Portfolio PDFs
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, account_id, portfolio_id) -- One assistant per configuration
);

-- ==========================================
-- UPDATE EXISTING TEAM_KNOWLEDGE TABLE
-- ==========================================

-- Add account_id reference to existing team_knowledge table
ALTER TABLE team_knowledge ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES team_accounts(id) ON DELETE CASCADE;

-- Update team_knowledge to remove account_name (replaced by account_id reference)
-- Note: We'll keep account_name for backward compatibility but use account_id going forward

-- ==========================================
-- ADD NEW INDEXES FOR PERFORMANCE
-- ==========================================

-- Team accounts indexes
CREATE INDEX IF NOT EXISTS idx_team_accounts_team_id ON team_accounts(team_id);
CREATE INDEX IF NOT EXISTS idx_team_accounts_name ON team_accounts(team_id, name);

-- Account portfolios indexes
CREATE INDEX IF NOT EXISTS idx_account_portfolios_account_id ON account_portfolios(account_id);
CREATE INDEX IF NOT EXISTS idx_account_portfolios_portfolio_id ON account_portfolios(portfolio_id);

-- Account portfolio stores indexes
CREATE INDEX IF NOT EXISTS idx_account_portfolio_stores_team_id ON account_portfolio_stores(team_id);
CREATE INDEX IF NOT EXISTS idx_account_portfolio_stores_account_id ON account_portfolio_stores(account_id);
CREATE INDEX IF NOT EXISTS idx_account_portfolio_stores_portfolio_id ON account_portfolio_stores(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_account_portfolio_stores_vector_id ON account_portfolio_stores(vector_store_id);

-- Team assistants indexes
CREATE INDEX IF NOT EXISTS idx_team_assistants_team_id ON team_assistants(team_id);
CREATE INDEX IF NOT EXISTS idx_team_assistants_account_id ON team_assistants(account_id);
CREATE INDEX IF NOT EXISTS idx_team_assistants_portfolio_id ON team_assistants(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_team_assistants_assistant_id ON team_assistants(assistant_id);
CREATE INDEX IF NOT EXISTS idx_team_assistants_config ON team_assistants(team_id, account_id, portfolio_id);

-- New team_knowledge account_id index
CREATE INDEX IF NOT EXISTS idx_team_knowledge_account_id ON team_knowledge(account_id);

-- ==========================================
-- ROW LEVEL SECURITY FOR NEW TABLES
-- ==========================================

-- Enable RLS on new tables
ALTER TABLE team_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_portfolio_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_assistants ENABLE ROW LEVEL SECURITY;

-- Team accounts policies
CREATE POLICY "Team members can access their team accounts" ON team_accounts
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Account portfolios policies
CREATE POLICY "Team members can access their account portfolios" ON account_portfolios
  FOR ALL USING (
    account_id IN (
      SELECT ta.id FROM team_accounts ta
      JOIN team_members tm ON ta.team_id = tm.team_id
      WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    )
  );

-- Account portfolio stores policies
CREATE POLICY "Team members can access their account portfolio stores" ON account_portfolio_stores
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Team assistants policies
CREATE POLICY "Team members can access their team assistants" ON team_assistants
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ==========================================
-- UPDATE TRIGGERS FOR NEW TABLES
-- ==========================================

-- Add triggers for updated_at timestamps on new tables
CREATE TRIGGER update_team_accounts_updated_at
  BEFORE UPDATE ON team_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- COMMENTS FOR DOCUMENTATION
-- ==========================================

COMMENT ON TABLE team_accounts IS 'Accounts (hospitals, practices) managed by teams';
COMMENT ON TABLE account_portfolios IS 'Which portfolios are available at each account';
COMMENT ON TABLE account_portfolio_stores IS 'OpenAI vector stores for account-portfolio specific knowledge';
COMMENT ON TABLE team_assistants IS 'Cached OpenAI assistants for team+account+portfolio configurations';

COMMENT ON COLUMN teams.general_knowledge_vector_store_id IS 'OpenAI vector store ID for team general knowledge';
COMMENT ON COLUMN teams.general_knowledge_vector_store_name IS 'Semantic name like "{TeamName} - General Knowledge"';
COMMENT ON COLUMN team_portfolios.vector_store_name IS 'Semantic name like "{TeamName} - {PortfolioName} PDFs"';
COMMENT ON COLUMN account_portfolio_stores.vector_store_name IS 'Semantic name like "{AccountName} - {PortfolioName} Knowledge"';
COMMENT ON COLUMN team_assistants.assistant_name IS 'Semantic name like "{TeamName} - {AccountName} - {PortfolioName} Assistant"';
COMMENT ON COLUMN team_knowledge.account_id IS 'Reference to team_accounts table (replaces account_name for structured relationships)';

-- ==========================================
-- DATA MIGRATION (if needed)
-- ==========================================

-- If there's existing team_knowledge data with account_name, you could migrate it like this:
-- This is commented out - uncomment and run separately if you have existing data to migrate

/*
-- Create accounts from existing account_name values in team_knowledge
INSERT INTO team_accounts (team_id, name, created_by, created_at)
SELECT DISTINCT 
  tk.team_id, 
  tk.account_name, 
  tk.created_by,
  NOW()
FROM team_knowledge tk 
WHERE tk.account_name IS NOT NULL 
  AND tk.account_name != ''
  AND NOT EXISTS (
    SELECT 1 FROM team_accounts ta 
    WHERE ta.team_id = tk.team_id AND ta.name = tk.account_name
  );

-- Update team_knowledge to reference the new account_id
UPDATE team_knowledge 
SET account_id = (
  SELECT ta.id FROM team_accounts ta 
  WHERE ta.team_id = team_knowledge.team_id 
    AND ta.name = team_knowledge.account_name
)
WHERE account_name IS NOT NULL AND account_name != '';
*/

-- ==========================================
-- VERIFICATION QUERIES
-- ==========================================

-- Uncomment these to verify the schema after running the script

/*
-- Check all team-related tables
SELECT table_name, table_comment 
FROM information_schema.tables 
WHERE table_name LIKE 'team_%' OR table_name IN ('teams', 'account_portfolios');

-- Check new columns added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'teams' AND column_name LIKE '%vector_store%';

SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'team_portfolios' AND column_name = 'vector_store_name';
*/ 