-- CREATE CHAT HISTORY TABLE
CREATE TABLE IF NOT EXISTS chat_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_type TEXT NOT NULL CHECK (portfolio_type IN ('hip', 'knee', 'ts_knee')),
  thread_id TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CREATE NOTES TABLE
CREATE TABLE IF NOT EXISTS notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_type TEXT NOT NULL CHECK (portfolio_type IN ('general', 'hip', 'knee', 'ts_knee')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT, -- SUPABASE STORAGE URL FOR NOTE IMAGE
  is_shared BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CREATE INDEXES FOR BETTER PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_portfolio_type ON chat_history(portfolio_type);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at);

-- CREATE INDEXES FOR NOTES TABLE
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_portfolio_type ON notes(portfolio_type);
CREATE INDEX IF NOT EXISTS idx_notes_is_shared ON notes(is_shared);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at);

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY TO ALLOW USERS TO ACCESS THEIR OWN CHAT HISTORY
CREATE POLICY "USERS CAN ACCESS THEIR OWN CHAT HISTORY" ON chat_history
  FOR ALL USING (auth.uid() = user_id);

-- CREATE POLICIES FOR NOTES TABLE
-- USERS CAN ACCESS THEIR OWN NOTES
CREATE POLICY "USERS CAN ACCESS THEIR OWN NOTES" ON notes
  FOR ALL USING (auth.uid() = user_id);

-- USERS CAN ACCESS SHARED NOTES
CREATE POLICY "USERS CAN ACCESS SHARED NOTES" ON notes
  FOR SELECT USING (is_shared = TRUE);

-- CREATE FUNCTION TO UPDATE UPDATED_AT TIMESTAMP
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- CREATE MESSAGE RATINGS TABLE
CREATE TABLE IF NOT EXISTS message_ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  message_id TEXT NOT NULL, -- OPENAI MESSAGE ID
  rating INTEGER NOT NULL CHECK (rating IN (1, -1)), -- 1 FOR THUMBS UP, -1 FOR THUMBS DOWN
  portfolio_type TEXT NOT NULL CHECK (portfolio_type IN ('hip', 'knee', 'ts_knee')),
  response_time_ms INTEGER, -- TIME IT TOOK FOR SYSTEM TO RESPOND (MILLISECONDS)
  citations TEXT[], -- ARRAY OF CITATION DOCUMENTS/SOURCES
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, message_id) -- PREVENT DUPLICATE RATINGS
);

-- CREATE INDEXES FOR MESSAGE RATINGS TABLE
CREATE INDEX IF NOT EXISTS idx_message_ratings_user_id ON message_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_message_ratings_thread_id ON message_ratings(thread_id);
CREATE INDEX IF NOT EXISTS idx_message_ratings_message_id ON message_ratings(message_id);
CREATE INDEX IF NOT EXISTS idx_message_ratings_portfolio_type ON message_ratings(portfolio_type);
CREATE INDEX IF NOT EXISTS idx_message_ratings_rating ON message_ratings(rating);

-- ENABLE ROW LEVEL SECURITY FOR MESSAGE RATINGS
ALTER TABLE message_ratings ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY FOR MESSAGE RATINGS
CREATE POLICY "USERS CAN ACCESS THEIR OWN MESSAGE RATINGS" ON message_ratings
  FOR ALL USING (auth.uid() = user_id);

-- CREATE TRIGGER TO AUTOMATICALLY UPDATE UPDATED_AT
CREATE TRIGGER update_chat_history_updated_at
  BEFORE UPDATE ON chat_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column(); 