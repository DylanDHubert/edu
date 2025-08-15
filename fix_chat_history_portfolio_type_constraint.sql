-- Remove the restrictive portfolio_type check constraint to allow team-based assistant names
-- This is needed for the new launcher system where assistantName can be something like:
-- "Atlanta Team - Mercy Hospital - Hip Assistant"

-- Drop the existing constraint
ALTER TABLE chat_history DROP CONSTRAINT IF EXISTS chat_history_portfolio_type_check;

-- Add a more flexible constraint that just ensures portfolio_type is not empty
ALTER TABLE chat_history ADD CONSTRAINT chat_history_portfolio_type_not_empty 
CHECK (portfolio_type IS NOT NULL AND length(trim(portfolio_type)) > 0);

-- Update the comment to reflect the new usage
COMMENT ON COLUMN chat_history.portfolio_type IS 'Stores assistant name (for team-based chats) or legacy portfolio type (hip, knee, ts_knee)'; 