-- MIGRATION: Add file_size column to team_documents table
-- This migration adds a file_size column to store file sizes for uploaded documents
-- The column allows NULL values to accommodate existing documents uploaded before this feature

-- Add the file_size column to team_documents table
ALTER TABLE public.team_documents 
ADD COLUMN file_size bigint;

-- Add a comment to document the column purpose
COMMENT ON COLUMN public.team_documents.file_size IS 'File size in bytes. NULL for documents uploaded before this feature was implemented.';

-- Optional: Create an index on file_size for potential future queries
-- CREATE INDEX idx_team_documents_file_size ON public.team_documents(file_size) WHERE file_size IS NOT NULL;
