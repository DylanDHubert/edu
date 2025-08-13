-- ADD NOTE TAGS TABLE FOR CUSTOM TAGGING SYSTEM
CREATE TABLE IF NOT EXISTS note_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL CHECK (tag_name IN ('account', 'team')),
  tag_value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CREATE INDEXES FOR BETTER PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_name_value ON note_tags(tag_name, tag_value);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag_name ON note_tags(tag_name);

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE note_tags ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY TO ALLOW USERS TO ACCESS TAGS FOR THEIR OWN NOTES
CREATE POLICY "USERS CAN ACCESS TAGS FOR THEIR OWN NOTES" ON note_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM notes 
      WHERE notes.id = note_tags.note_id 
      AND notes.user_id = auth.uid()
    )
  );

-- CREATE POLICY TO ALLOW USERS TO ACCESS TAGS FOR SHARED NOTES
CREATE POLICY "USERS CAN ACCESS TAGS FOR SHARED NOTES" ON note_tags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM notes 
      WHERE notes.id = note_tags.note_id 
      AND notes.is_shared = TRUE
    )
  );
