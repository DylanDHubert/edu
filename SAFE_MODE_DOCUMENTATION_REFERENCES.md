# Safe Mode Implementation - Documentation References

## Essential Documentation Resources

### 1. OpenAI API Documentation

#### Embeddings API
- **URL**: https://platform.openai.com/docs/api-reference/embeddings
- **Key Model**: `text-embedding-3-small`
- **Purpose**: Generate embeddings for document chunks
- **Rate Limits**: Check your usage tier limits
- **Pricing**: Verify current pricing for embedding generation

#### Chat Completions API
- **URL**: https://platform.openai.com/docs/api-reference/chat
- **Key Model**: `gpt-4o-mini`
- **Purpose**: Generate 2-5 sentence chunk summaries
- **Token Limits**: 150 max tokens for summaries
- **Temperature**: 0.3 for consistent output

#### Error Handling
- **URL**: https://platform.openai.com/docs/guides/error-codes
- **Purpose**: Handle API errors gracefully in vectorization service

### 2. Supabase Documentation

#### pgvector Extension Setup
- **URL**: https://supabase.com/docs/guides/ai/vector-columns
- **Purpose**: Enable vector data type support
- **Setup Command**: `CREATE EXTENSION IF NOT EXISTS vector;`
- **Verification**: `SELECT * FROM pg_extension WHERE extname = 'vector';`

#### Vector Search Implementation
- **URL**: https://supabase.com/docs/guides/ai/vector-search
- **Purpose**: Implement similarity search functionality
- **Index Creation**: `CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops);`

#### Database Functions
- **URL**: https://supabase.com/docs/guides/database/functions
- **Purpose**: Create custom SQL functions for vector search
- **RPC Calls**: Client-side function calls for search operations

#### Vector Indexes Performance
- **URL**: https://supabase.com/docs/guides/ai/vector-indexes
- **Purpose**: Optimize vector search performance
- **Index Types**: ivfflat, hnsw for different use cases

### 3. Implementation-Specific Setup

#### Supabase pgvector Quick Setup
```sql
-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify vector support
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Create vector index for performance
CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops);
```

#### OpenAI API Verification Checklist
- [ ] Confirm `text-embedding-3-small` model access
- [ ] Check rate limits for your usage tier
- [ ] Verify GPT-4o-mini access for summaries
- [ ] Test API key permissions
- [ ] Monitor usage and costs

### 4. Current System Integration Points

#### Existing Infrastructure (Already Available)
- ✅ OpenAI integration (existing chat system)
- ✅ Supabase setup (existing database)
- ✅ Document processing pipeline
- ✅ Job queue system
- ✅ Authentication and access controls

#### New Components Required
- 🔧 pgvector extension (one-time setup)
- 🔧 Vector search function (custom SQL)
- 🔧 Embeddings API calls (similar to existing OpenAI usage)
- 🔧 Chunk summary generation (new service)

### 5. Key Implementation Notes

#### Vector Search Function
```sql
CREATE OR REPLACE FUNCTION search_chunks(
  query_embedding VECTOR(1536),
  team_id UUID,
  portfolio_id UUID,
  limit INT DEFAULT 5
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
  LIMIT search_chunks.limit;
$$;
```

#### Embeddings API Usage
```typescript
// Generate embeddings for chunks
const response = await openaiClient.embeddings.create({
  model: 'text-embedding-3-small',
  input: chunks
});

// Generate chunk summaries
const summaryResponse = await openaiClient.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    {
      role: 'system',
      content: 'Generate a 2-5 sentence summary of the following text. Focus on the key information and main points.'
    },
    {
      role: 'user',
      content: chunk
    }
  ],
  max_tokens: 150,
  temperature: 0.3
});
```

### 6. Performance Considerations

#### Vector Index Optimization
- Use `ivfflat` index for good performance with reasonable accuracy
- Consider `hnsw` index for larger datasets
- Monitor query performance and adjust index parameters

#### API Rate Limiting
- Batch embedding requests when possible
- Implement retry logic with exponential backoff
- Monitor OpenAI usage and costs

#### Database Performance
- Index on `document_id` for fast lookups
- Use connection pooling for concurrent requests
- Monitor query execution times

### 7. Error Handling Strategies

#### OpenAI API Errors
- Handle rate limit errors with retry logic
- Graceful degradation for summary generation failures
- Log errors for monitoring and debugging

#### Supabase Errors
- Handle RPC function errors
- Validate vector data before insertion
- Monitor database performance

### 8. Testing and Validation

#### Vector Search Testing
- Test similarity search accuracy
- Validate embedding quality
- Performance testing with large datasets

#### Integration Testing
- End-to-end document processing flow
- Safe mode query functionality
- PDF viewer integration

## Quick Start Checklist

### Prerequisites
- [ ] Supabase project with pgvector extension enabled
- [ ] OpenAI API access with appropriate models
- [ ] Existing document processing pipeline working

### Implementation Steps
1. [ ] Enable pgvector extension in Supabase
2. [ ] Create document_chunks table with vector column
3. [ ] Implement vectorization service
4. [ ] Add vectorization step to job queue
5. [ ] Create safe mode API endpoint
6. [ ] Build frontend components
7. [ ] Test end-to-end functionality

### Monitoring and Maintenance
- [ ] Set up OpenAI usage monitoring
- [ ] Monitor vector search performance
- [ ] Track error rates and response times
- [ ] Regular database maintenance and optimization

This documentation provides all the necessary references and implementation details for building the safe mode feature with embeddings and vector search.
