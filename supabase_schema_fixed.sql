-- CREATE CHAT HISTORY TABLE (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS chat_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_type TEXT NOT NULL CHECK (portfolio_type IN ('hip', 'knee', 'ts_knee')),
  thread_id TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CREATE INDEXES FOR BETTER PERFORMANCE (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_portfolio_type ON chat_history(portfolio_type);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at);

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- DROP EXISTING POLICY IF IT EXISTS
DROP POLICY IF EXISTS "USERS CAN ACCESS THEIR OWN CHAT HISTORY" ON chat_history;

-- CREATE POLICY TO ALLOW USERS TO ACCESS THEIR OWN CHAT HISTORY
CREATE POLICY "USERS CAN ACCESS THEIR OWN CHAT HISTORY" ON chat_history
  FOR ALL USING (auth.uid() = user_id);

-- CREATE FUNCTION TO UPDATE UPDATED_AT TIMESTAMP
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- DROP EXISTING TRIGGER IF IT EXISTS
DROP TRIGGER IF EXISTS update_chat_history_updated_at ON chat_history;

-- CREATE TRIGGER TO AUTOMATICALLY UPDATE UPDATED_AT
CREATE TRIGGER update_chat_history_updated_at
  BEFORE UPDATE ON chat_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column(); 