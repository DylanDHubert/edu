-- HHB Launcher Schema Updates
-- Run this after the existing launcher_database_schema.sql

-- Add team_id column to existing notes table for team scoping (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'notes' AND column_name = 'team_id') THEN
        ALTER TABLE notes ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add general knowledge vector store to teams table
ALTER TABLE teams ADD COLUMN general_knowledge_vector_store_id TEXT;
ALTER TABLE teams ADD COLUMN general_knowledge_vector_store_name TEXT; -- Semantic description

-- Create team accounts table (hospitals, practices, etc.)
CREATE TABLE team_accounts (
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
CREATE TABLE account_portfolios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID REFERENCES team_accounts(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES team_portfolios(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(account_id, portfolio_id) -- One assignment per account-portfolio pair
);

-- Account-Portfolio Vector Stores (knowledge specific to account+portfolio combination)
CREATE TABLE account_portfolio_stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  account_id UUID REFERENCES team_accounts(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES team_portfolios(id) ON DELETE CASCADE,
  vector_store_id TEXT NOT NULL, -- OpenAI vector store ID (exact match)
  vector_store_name TEXT NOT NULL, -- Semantic description: "{AccountName} - {PortfolioName} Knowledge"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(account_id, portfolio_id) -- One store per account-portfolio combination
);

-- Update team_portfolios to include vector store name
ALTER TABLE team_portfolios ADD COLUMN vector_store_name TEXT; -- Semantic description: "{TeamName} - {PortfolioName} PDFs"

-- Update team_knowledge table to support account-specific knowledge
ALTER TABLE team_knowledge ADD COLUMN account_id UUID REFERENCES team_accounts(id) ON DELETE CASCADE;

-- Assistant configurations (cached assistants for team+account+portfolio combinations)
CREATE TABLE team_assistants (
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

-- Add indexes for performance
CREATE INDEX idx_team_accounts_team_id ON team_accounts(team_id);
CREATE INDEX idx_account_portfolios_account_id ON account_portfolios(account_id);
CREATE INDEX idx_account_portfolios_portfolio_id ON account_portfolios(portfolio_id);
CREATE INDEX idx_account_portfolio_stores_team_id ON account_portfolio_stores(team_id);
CREATE INDEX idx_account_portfolio_stores_account_id ON account_portfolio_stores(account_id);
CREATE INDEX idx_account_portfolio_stores_portfolio_id ON account_portfolio_stores(portfolio_id);
CREATE INDEX idx_team_assistants_team_id ON team_assistants(team_id);
CREATE INDEX idx_team_assistants_account_id ON team_assistants(account_id);
CREATE INDEX idx_team_assistants_portfolio_id ON team_assistants(portfolio_id);
CREATE INDEX idx_notes_team_id ON notes(team_id);
CREATE INDEX idx_team_knowledge_account_id ON team_knowledge(account_id);

-- Enable RLS on new tables
ALTER TABLE team_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_portfolio_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_assistants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for new tables
CREATE POLICY "Team members can access their team accounts" ON team_accounts
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Team members can access their account portfolios" ON account_portfolios
  FOR ALL USING (
    account_id IN (
      SELECT ta.id FROM team_accounts ta
      JOIN team_members tm ON ta.team_id = tm.team_id
      WHERE tm.user_id = auth.uid() AND tm.status = 'active'
    )
  );

CREATE POLICY "Team members can access their account portfolio stores" ON account_portfolio_stores
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Team members can access their team assistants" ON team_assistants
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Update notes RLS policy to include team scoping
DROP POLICY IF EXISTS "USERS CAN ACCESS THEIR OWN NOTES" ON notes;
DROP POLICY IF EXISTS "USERS CAN ACCESS SHARED NOTES" ON notes;

CREATE POLICY "USERS CAN ACCESS THEIR OWN TEAM NOTES" ON notes
  FOR ALL USING (
    auth.uid() = user_id AND 
    (team_id IS NULL OR team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    ))
  );

CREATE POLICY "USERS CAN ACCESS SHARED TEAM NOTES" ON notes
  FOR SELECT USING (
    is_shared = TRUE AND 
    (team_id IS NULL OR team_id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    ))
  );

-- Add triggers for updated_at timestamps on new tables
CREATE TRIGGER update_team_accounts_updated_at
  BEFORE UPDATE ON team_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE team_accounts IS 'Accounts (hospitals, practices) managed by teams';
COMMENT ON TABLE account_portfolios IS 'Which portfolios are available at each account';
COMMENT ON TABLE account_portfolio_stores IS 'OpenAI vector stores for account-portfolio specific knowledge';
COMMENT ON TABLE team_assistants IS 'Cached OpenAI assistants for team+account+portfolio configurations';
COMMENT ON COLUMN team_portfolios.vector_store_name IS 'Semantic name like "{TeamName} - {PortfolioName} PDFs"';
COMMENT ON COLUMN account_portfolio_stores.vector_store_name IS 'Semantic name like "{AccountName} - {PortfolioName} Knowledge"';
COMMENT ON COLUMN teams.general_knowledge_vector_store_name IS 'Semantic name like "{TeamName} - General Knowledge"';
COMMENT ON COLUMN team_assistants.assistant_name IS 'Semantic name like "{TeamName} - {AccountName} - {PortfolioName} Assistant"'; 