-- ADD MISSING COLUMNS TO EXISTING MESSAGE_RATINGS TABLE
ALTER TABLE message_ratings 
ADD COLUMN IF NOT EXISTS portfolio_type TEXT CHECK (portfolio_type IN ('hip', 'knee', 'ts_knee'));

ALTER TABLE message_ratings 
ADD COLUMN IF NOT EXISTS response_time_ms INTEGER;

ALTER TABLE message_ratings 
ADD COLUMN IF NOT EXISTS citations TEXT[];

-- ADD INDEXES FOR NEW COLUMNS
CREATE INDEX IF NOT EXISTS idx_message_ratings_portfolio_type ON message_ratings(portfolio_type);
CREATE INDEX IF NOT EXISTS idx_message_ratings_rating ON message_ratings(rating); 