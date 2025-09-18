-- UPDATE SEARCH_CHUNKS FUNCTION TO INCLUDE SCREENSHOT METADATA
-- THIS ALLOWS SAFE MODE SEARCH TO DISPLAY PAGE THUMBNAILS

-- DROP AND RECREATE THE SEARCH_CHUNKS FUNCTION WITH SCREENSHOT SUPPORT
DROP FUNCTION IF EXISTS search_chunks(vector(1536), UUID, UUID, INT);

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
  similarity FLOAT,
  screenshot_path TEXT,
  screenshot_filename TEXT,
  document_id UUID
)
AS $$
  SELECT 
    dc.chunk_text,
    dc.chunk_summary,
    dc.page_number,
    td.original_name,
    1 - (dc.embedding <=> query_embedding) as similarity,
    (dc.metadata->>'screenshot_path')::TEXT as screenshot_path,
    (dc.metadata->>'screenshot_filename')::TEXT as screenshot_filename,
    dc.document_id
  FROM document_chunks dc
  JOIN team_documents td ON dc.document_id = td.id
  WHERE td.team_id = search_chunks.team_id
    AND td.portfolio_id = search_chunks.portfolio_id
  ORDER BY dc.embedding <=> query_embedding
  LIMIT search_chunks.result_limit;
$$ LANGUAGE sql;
