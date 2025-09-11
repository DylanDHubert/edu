# LlamaParse Integration Plan

## Overview

This document outlines the plan to integrate LlamaParse with agentic plus settings to convert PDF documents to Markdown format before uploading to OpenAI, replacing the current direct PDF upload process.

## Current System

### Existing Flow
1. **File Upload**: PDFs uploaded directly to Supabase Storage via signed URLs
2. **Processing**: Files downloaded from Supabase, validated, and uploaded to OpenAI as PDFs
3. **Storage**: Document metadata stored in `team_documents` table with `openai_file_id`
4. **Vector Stores**: Vector stores created later using `VectorStoreService` which gathers all PDFs for a portfolio

### Key Components
- **Upload Flow**: `uploadFilesToSupabase()` → `processUploadedFiles()` → `/api/teams/documents/upload`
- **Storage**: Supabase Storage bucket `team-documents` with path structure `teams/{teamId}/portfolios/{portfolioId}/{filename}`
- **Database**: `team_documents` table stores metadata including `openai_file_id`
- **Vector Stores**: Created via `VectorStoreService.createPortfolioVectorStore()` using `createAndPoll()`

## New Architecture

### Core Flow
1. **Upload PDF** → Supabase Storage (fast, <5s)
2. **Create Document Record** → Database with processing status
3. **Start Processing** → Immediate API call to process
4. **Poll Status** → Frontend polls for updates every 2 seconds
5. **Update UI** → Show progress in real-time

### Key Constraints
- **Vercel**: 10s execution time (Hobby), 60s (Pro), 50MB request body limit
- **Supabase**: Request size limits, function timeout limits
- **LlamaParse**: Processing can take minutes for large PDFs
- **No Schema Changes**: Must use existing `team_documents` table

## Implementation Strategy

### No Schema Changes Solution

**Use Existing `team_documents` Table Fields:**
- `id` - Document ID
- `team_id` - Team reference
- `portfolio_id` - Portfolio reference  
- `filename` - Unique filename
- `original_name` - Original PDF name
- `file_path` - Supabase storage path
- `file_size` - File size
- `openai_file_id` - Will store processing status and final OpenAI file ID
- `uploaded_by` - User who uploaded
- `created_at` - Upload timestamp

**Processing Status Strategy:**
Use the `openai_file_id` field to track processing status:
- `null` = Processing not started
- `"processing"` = Currently processing with LlamaParse
- `"failed"` = Processing failed
- `"file_abc123"` = Completed, OpenAI file ID for markdown

### API Endpoints

#### 1. Upload with Processing (Fast Response)
- **Endpoint**: `POST /api/teams/documents/upload-with-llamaparse`
- **Purpose**: Upload PDF to Supabase, create document record, start processing
- **Response Time**: <5 seconds
- **Returns**: Document ID and processing status

#### 2. Background Processing
- **Endpoint**: `POST /api/process-document`
- **Purpose**: Process document with LlamaParse, store markdown, upload to OpenAI
- **Called By**: Immediate API call after upload (fire-and-forget)
- **Processing**: Downloads PDF → LlamaParse → Markdown → Supabase → OpenAI

#### 3. Status Check (Fast)
- **Endpoint**: `GET /api/teams/documents/processing-status/{documentId}`
- **Purpose**: Check current processing status and progress
- **Response Time**: <1 second
- **Returns**: Status, progress percentage, error message

### Services

#### LlamaParse Service
```typescript
export class LlamaParseService {
  async submitDocument(pdfBuffer: Buffer, filename: string): Promise<string>
  async checkStatus(jobId: string): Promise<{ status: string, progress?: number }>
  async downloadResult(jobId: string): Promise<string>
}
```

#### Document Processing Service
```typescript
export class DocumentProcessingService {
  async createJob(teamId: string, portfolioId: string, documentId: string): Promise<string>
  async updateJobStatus(jobId: string, status: string, progress?: number, error?: string): Promise<void>
  async completeJob(jobId: string, markdownContent: string, openaiFileId: string): Promise<void>
}
```

## UI Integration

### Portfolio Page Integration

#### Processing Status Section
Add new section between existing documents and file upload:
- **Processing Documents**: Shows documents currently being processed
- **Progress Bars**: Visual indicators for each document
- **Status Icons**: Pending, Processing, Completed, Failed states
- **Real-time Updates**: Live progress without page refresh

#### Visual States
- **Processing State**: Blue progress bar with animation, spinning loader icon, "Processing... X%" text
- **Completed State**: Green checkmark icon, "Completed ✓" text, progress bar at 100%
- **Failed State**: Red X icon, error message, retry button
- **Pending State**: Yellow clock icon, "Queued..." text, progress bar at 0%

#### Modified Upload Flow
1. **User uploads PDF** → Added to portfolio state
2. **Immediate processing** → If portfolio has ID, start processing
3. **Show progress** → Processing section appears with real-time updates
4. **Non-blocking** → Users can continue editing while processing

### Frontend Components

#### Processing Document Item
```typescript
function ProcessingDocumentItem({ document }) {
  const { status, progress } = useDocumentProcessing(document.id);
  
  return (
    <div className="bg-slate-700/50 border border-slate-600 rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ProcessingStatusIcon status={status} />
          <span className="text-slate-300 text-sm font-medium">
            {document.original_name}
          </span>
        </div>
        <span className="text-xs text-slate-400">{progress}%</span>
      </div>
      
      <div className="w-full bg-slate-600 rounded-full h-2">
        <div 
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
```

#### Real-time Updates
```typescript
// Subscribe to document updates
useEffect(() => {
  const subscription = supabase
    .channel('processing-documents')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'team_documents',
      filter: `openai_file_id=in.(processing,failed)`
    }, (payload) => {
      // Update processing documents in state
    })
    .subscribe();
    
  return () => subscription.unsubscribe();
}, []);
```

## Environment Configuration

### Required Environment Variables
```env
LLAMAPARSE_API_KEY=your_llamaparse_api_key
LLAMAPARSE_BASE_URL=https://api.llamaindex.ai
LLAMAPARSE_AGENTIC_PLUS=true
```

### LlamaParse Configuration
- Use agentic plus setting for enhanced PDF parsing
- Configure appropriate parsing parameters
- Set up proper error handling and retries

## Error Handling & Edge Cases

### Error Scenarios
- LlamaParse API failures
- Processing timeouts
- Invalid PDF files
- Network connectivity issues
- OpenAI upload failures

### Recovery Mechanisms
- Automatic retries with exponential backoff
- Manual retry options in UI
- Fallback to original PDF processing (optional)
- Comprehensive error logging

### Retry Strategy
- **Exponential backoff**: 1s, 2s, 4s, 8s
- **Max retries**: 3 attempts
- **Manual retry**: UI option to retry failed jobs

## Performance Considerations

### Optimizations
- **Fast Response**: Upload returns immediately (<5s)
- **Background Processing**: No timeout issues
- **Efficient Polling**: Every 2 seconds while processing
- **Real-time Updates**: Supabase Realtime for live status
- **Batch Processing**: Multiple documents processed in parallel

### Monitoring
- Processing time metrics
- Success/failure rates
- API usage tracking
- Performance bottlenecks identification

## Benefits

### Technical Benefits
1. **No Schema Changes**: Uses existing `team_documents` table
2. **Vercel Compatible**: Works within serverless function limits
3. **Real-time Updates**: Live progress without page refresh
4. **Error Handling**: Robust retry and error management
5. **Scalable**: Can handle multiple documents in parallel

### User Experience Benefits
1. **Fast Response**: Upload returns immediately
2. **Clear Progress**: Visual indicators for each stage
3. **Non-blocking**: Continue editing while processing
4. **Error Recovery**: Retry options for failed jobs
5. **Real-time Feedback**: Live updates on processing status

## Implementation Phases

### Phase 1: Core Services
1. Implement `LlamaParseService`
2. Implement `DocumentProcessingService`
3. Create processing API endpoints
4. Test with sample PDFs

### Phase 2: UI Integration
1. Add processing status components
2. Integrate with portfolio page
3. Implement real-time updates
4. Add error handling UI

### Phase 3: Testing & Optimization
1. Test with various PDF sizes
2. Optimize polling frequency
3. Test error scenarios
4. Performance tuning

### Phase 4: Production Deployment
1. Environment configuration
2. Monitoring setup
3. User documentation
4. Rollout plan

## Success Metrics

### Technical Metrics
- Processing success rate >95%
- Average processing time <5 minutes
- API response time <5 seconds
- Error rate <5%

### User Experience Metrics
- Upload success rate >99%
- User satisfaction with progress tracking
- Reduced support tickets for upload issues
- Faster time to portfolio completion

## Conclusion

This plan provides a comprehensive approach to integrating LlamaParse while maintaining the existing functionality and adding robust progress tracking. The key advantages are:

1. **No database changes required**
2. **Works within Vercel/Supabase constraints**
3. **Provides excellent user experience**
4. **Maintains existing functionality**
5. **Scalable and maintainable architecture**

The implementation will significantly improve the document processing workflow while providing users with clear, real-time feedback on their upload progress.
