# UNIFIED JOB-BASED DOCUMENT PROCESSING SYSTEM

## OVERVIEW
This document outlines the implementation of a unified job-based document processing system that handles all document uploads (Standard, Enhanced, Super) through background jobs to bypass Vercel's 4.5MB request/response body limit and Supabase's 50MB file size limit.

## PROBLEM STATEMENT
- **Vercel Limit:** 4.5MB request/response body limit for serverless functions
- **Supabase Limit:** 50MB file size limit
- **Current Issue:** Standard mode does direct OpenAI upload, hitting Vercel limits
- **Solution:** All processing through background jobs using cron

## UNIFIED DATAFLOW

### CURRENT FLOW (Mixed):
```
STANDARD: Upload → Supabase → Direct OpenAI → Save (❌ hits Vercel limits)
ENHANCED: Upload → Supabase → LlamaParse → Job Queue → OpenAI → Save (✅)
SUPER: Upload → Supabase → LlamaParse → Job Queue → OpenAI → Save (✅)
```

### NEW UNIFIED FLOW (All Modes):
```
1. Upload → Supabase Storage (bypasses Vercel limits) ✅
2. Save to course_documents (status: 'pending', openai_file_id: null) ✅
3. Create processing_jobs record (ALL modes) ✅
4. Status: 'pending' → 'processing' ✅
5. Cron job processes based on processing_type:
   - STANDARD: Direct OpenAI upload (no LlamaParse)
   - ENHANCED: LlamaParse → OpenAI upload  
   - SUPER: LlamaParse (technical preset) → OpenAI upload
6. Update course_documents with openai_file_id ✅
7. Status: 'completed' ✅
```

## CLEAN STATUS TRACKING DESIGN

### Status Field Usage:
- **`course_documents.status`**: Processing status (pending/processing/completed/failed)
- **`course_documents.openai_file_id`**: Actual OpenAI file ID when completed (null otherwise)
- **`processing_jobs`**: Detailed job tracking (progress, steps, errors, timing)

### Status Flow:
```
1. Document created: status='pending', openai_file_id=null
2. Job starts: status='processing', openai_file_id=null
3. Job completes: status='completed', openai_file_id='file-xxxxx'
4. Job fails: status='failed', openai_file_id=null
```

## DATABASE SCHEMA CHANGES

### Added Table: `processing_jobs`
```sql
CREATE TABLE public.processing_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  course_id uuid NOT NULL,
  portfolio_id uuid,
  processing_type text NOT NULL DEFAULT 'standard'::text CHECK (processing_type = ANY (ARRAY['standard'::text, 'enhanced'::text, 'super'::text])),
  llamaparse_job_id text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])),
  progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_step text,
  error_message text,
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  created_at timestamp with time zone DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  CONSTRAINT processing_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT processing_jobs_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.course_documents(id),
  CONSTRAINT processing_jobs_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT processing_jobs_portfolio_id_fkey FOREIGN KEY (portfolio_id) REFERENCES public.course_portfolios(id)
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX idx_processing_jobs_status ON public.processing_jobs(status);
CREATE INDEX idx_processing_jobs_document_id ON public.processing_jobs(document_id);
CREATE INDEX idx_processing_jobs_llamaparse_job_id ON public.processing_jobs(llamaparse_job_id);
```

### Fixed Schema Issue:
- Changed `citations ARRAY` to `citations text[]` in `message_ratings` table

## CODE CHANGES REQUIRED

### 1. Upload Endpoint Changes
**File:** `app/api/courses/documents/upload/route.ts`
- Remove direct OpenAI upload for standard mode
- Always create `processing_jobs` record for ALL processing types
- Always set `course_documents.status: 'pending'` initially
- Remove conditional logic between standard/enhanced/super
- Use proper status field instead of openai_file_id for status tracking

### 2. Cron Job Updates
**File:** `app/api/cron/process-documents/route.ts`
- Add handling for `processing_type: 'standard'`
- Route to appropriate processing logic based on `processing_type`
- Update `course_documents.status` field throughout processing
- Handle all three processing types in unified flow

### 3. Job Queue Service Updates
**File:** `app/services/job-queue-service.ts`
- Add `processing_type` parameter to job creation
- Update job processing logic to handle standard mode
- Ensure proper status updates using `course_documents.status` field

### 4. Status Service Updates
**File:** `app/services/document-processing-service.ts`
- Update status tracking to use `course_documents.status` field
- Remove reliance on `openai_file_id` for status tracking
- Ensure consistent status updates across all processing types

## UI COMPATIBILITY (NO CHANGES NEEDED)

### Status Display Components
**Files that handle document processing status:**
- `app/components/ProcessingDocumentsSection.tsx` - Shows processing documents list
- `app/components/DocumentStatusIndicator.tsx` - Individual document status indicators
- `app/components/PortfolioProcessingSummary.tsx` - Portfolio-level processing summary
- `app/components/ProcessingDocumentItem.tsx` - Individual processing document items

### Portfolio Management Pages
**Files that display processing status:**
- `app/edit/portfolios/page.tsx` - Portfolio editing with processing status
- `app/launcher/select/page.tsx` - Chat launcher with processing status
- `app/launcher/course/page.tsx` - Course dashboard with processing status

### API Endpoints for Status
**Files that provide processing status data:**
- `app/api/courses/portfolios/processing-status/route.ts` - Portfolio processing status API
- `app/hooks/usePortfolioDocumentStatus.ts` - Hook for document status tracking

## PROCESSING TYPE LOGIC

### STANDARD Mode:
- No LlamaParse processing
- Direct OpenAI file upload
- Faster processing, basic file handling
- Suitable for simple PDFs and markdown files

### ENHANCED Mode:
- LlamaParse processing with default settings
- Screenshot generation disabled
- Page markers added every 400 tokens
- Better text extraction and formatting

### SUPER Mode:
- LlamaParse processing with technical documentation preset
- Enhanced parsing for technical documents
- Best for complex technical PDFs
- Most comprehensive processing

## IMPLEMENTATION STEPS

1. ✅ **Schema updated** (processing_jobs table + citations fix)
2. **Update upload endpoint** to always create jobs (remove direct OpenAI)
3. **Update cron job** to handle standard mode
4. **Update status tracking** to use proper status field
5. **Test unified flow** with all three processing types
6. **Verify UI compatibility** (should work unchanged)

## FILES REQUIRING CONTEXT

### Core Implementation Files:
- `app/api/courses/documents/upload/route.ts` - Main upload endpoint
- `app/api/cron/process-documents/route.ts` - Cron job processor
- `app/services/job-queue-service.ts` - Job queue management
- `app/services/llamaparse-service.ts` - LlamaParse integration
- `schema.sql` - Database schema

### UI Status Components:
- `app/components/ProcessingDocumentsSection.tsx`
- `app/components/DocumentStatusIndicator.tsx`
- `app/components/PortfolioProcessingSummary.tsx`
- `app/components/ProcessingDocumentItem.tsx`

### Portfolio Management Pages:
- `app/edit/portfolios/page.tsx`
- `app/launcher/select/page.tsx`
- `app/launcher/course/page.tsx`

### API Endpoints:
- `app/api/courses/portfolios/processing-status/route.ts`
- `app/hooks/usePortfolioDocumentStatus.ts`

### Utility Files:
- `app/utils/file-upload.ts` - File upload utilities
- `app/utils/supabase/server.ts` - Supabase service client

## BENEFITS

1. **Bypasses Vercel Limits:** All file processing happens in background jobs
2. **Unified Processing:** Single code path for all processing types
3. **Better Error Handling:** Centralized job status tracking
4. **Scalable:** Can handle large files without hitting request limits
5. **UI Compatible:** No changes needed to existing UI components
6. **Flexible:** Easy to add new processing types in the future
7. **Clean Design:** Proper separation of concerns with dedicated status field

## TESTING STRATEGY

1. **Test Standard Mode:** Upload small PDF, verify direct OpenAI processing
2. **Test Enhanced Mode:** Upload PDF, verify LlamaParse processing
3. **Test Super Mode:** Upload technical PDF, verify technical preset
4. **Test UI Updates:** Verify status indicators update correctly
5. **Test Error Handling:** Verify failed jobs are marked appropriately
6. **Test Large Files:** Verify files >4.5MB process successfully

## NOTES

- All existing UI components will work unchanged
- Processing status is tracked in `course_documents.status` field (clean design)
- Job progress is tracked in `processing_jobs.progress`
- Error handling is centralized in job queue system
- File size limits are now handled by Supabase Storage (50MB) instead of Vercel (4.5MB)
- `openai_file_id` field is used only for actual OpenAI file IDs, not status tracking
