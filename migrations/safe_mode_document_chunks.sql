-- SAFE MODE: DOCUMENT CHUNKS TABLE WITH VECTOR SEARCH
-- THIS MIGRATION CREATES THE FOUNDATION FOR SAFE MODE DOCUMENT SEARCH

-- DOCUMENT CHUNKS TABLE WITH PAGE ENFORCEMENT
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES team_documents(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL, -- CLEANED CONTENT FOR EMBEDDING
  chunk_summary TEXT NOT NULL, -- 2-5 SENTENCE SUMMARY GENERATED DURING VECTORIZATION
  embedding vector(1536), -- OPENAI EMBEDDING DIMENSION
  page_number INTEGER NOT NULL, -- ABSOLUTE PAGE NUMBER (EXTRACTED FROM LLAMAPARSE)
  chunk_index INTEGER NOT NULL, -- ORDER WITHIN THE DOCUMENT
  token_count INTEGER NOT NULL, -- ACTUAL TOKEN COUNT FOR THIS CHUNK
  -- RICH METADATA
  metadata JSONB DEFAULT '{}', -- INCLUDES ORIGINAL CONTENT, CLEANING INFO, ETC.
  created_at TIMESTAMP DEFAULT NOW()
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX ON document_chunks (document_id);
CREATE INDEX ON document_chunks (page_number);
CREATE INDEX ON document_chunks (chunk_index);
CREATE INDEX ON document_chunks USING GIN (metadata); -- FOR JSONB QUERIES
CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops);

-- VECTOR SEARCH FUNCTION
CREATE OR REPLACE FUNCTION search_chunks(
  query_embedding vector(1536),
  team_id UUID,
  portfolio_id UUID,
  result_limit INT DEFAULT 5
)
RETURNS TABLE (
  chunk_text TEXT,
  chunk_summary TEXT,
  page_number INTEGER,
  document_name TEXT,
  similarity FLOAT
)
AS $$
  SELECT 
    dc.chunk_text,
    dc.chunk_summary,
    dc.page_number,
    td.original_name,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM document_chunks dc
  JOIN team_documents td ON dc.document_id = td.id
  WHERE td.team_id = search_chunks.team_id
    AND td.portfolio_id = search_chunks.portfolio_id
  ORDER BY dc.embedding <=> query_embedding
  LIMIT search_chunks.result_limit;
$$ LANGUAGE sql;

-- ADD ROW LEVEL SECURITY
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- RLS POLICY: USERS CAN ONLY ACCESS CHUNKS FROM THEIR TEAM'S DOCUMENTS
CREATE POLICY "Users can access chunks from their team documents" ON document_chunks
  FOR ALL USING (
    document_id IN (
      SELECT id FROM team_documents 
      WHERE team_id IN (
        SELECT team_id FROM team_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- HELPER FUNCTION TO GET CHUNK COUNT BY DOCUMENT
CREATE OR REPLACE FUNCTION get_document_chunk_count(document_uuid UUID)
RETURNS INTEGER
AS $$
  SELECT COUNT(*)::INTEGER FROM document_chunks WHERE document_id = document_uuid;
$$ LANGUAGE sql;

-- HELPER FUNCTION TO GET CHUNKS BY PAGE
CREATE OR REPLACE FUNCTION get_chunks_by_page(
  document_uuid UUID,
  page_num INTEGER
)
RETURNS TABLE (
  chunk_text TEXT,
  chunk_summary TEXT,
  chunk_index INTEGER,
  token_count INTEGER
)
AS $$
  SELECT 
    chunk_text,
    chunk_summary,
    chunk_index,
    token_count
  FROM document_chunks 
  WHERE document_id = document_uuid 
    AND page_number = page_num
  ORDER BY chunk_index;
$$ LANGUAGE sql;