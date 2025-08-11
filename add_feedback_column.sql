-- ADD FEEDBACK TEXT COLUMN TO MESSAGE_RATINGS TABLE
ALTER TABLE message_ratings 
ADD COLUMN IF NOT EXISTS feedback_text TEXT;

-- ADD INDEX FOR FEEDBACK TEXT SEARCHES (OPTIONAL)
CREATE INDEX IF NOT EXISTS idx_message_ratings_feedback_text ON message_ratings USING gin(to_tsvector('english', feedback_text));
