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