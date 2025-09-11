# LlamaParse Job Queue Deployment Checklist

## ✅ Code Review Complete

### Fixed Issues:
1. **LlamaParse Base URL**: Fixed to properly append `/api/v1` to the base URL
2. **Cron Job Response**: Fixed duplicate `success` field in response
3. **Database Schema**: Created `processing_jobs` table with proper indexes
4. **API Integration**: Verified LlamaParse API works correctly

### Files Modified:
- `app/services/llamaparse-service.ts` - Direct API integration
- `app/services/job-queue-service.ts` - Job queue management
- `app/api/teams/documents/upload-with-llamaparse/route.ts` - Updated upload flow
- `app/api/cron/process-documents/route.ts` - Cron job processing
- `vercel.json` - Cron job configuration

## 🚀 Deployment Steps

### 1. Environment Variables (Vercel)
Make sure these are set in Vercel:
```
LLAMAPARSE_API_KEY=llx-wb375Hhx1xRBrLSdu7P3IN2rVAaQNO4k6S9l2CGh0urveGpp
LLAMAPARSE_BASE_URL=https://api.llamaindex.ai
LLAMAPARSE_AGENTIC_PLUS=false
```

### 2. Database (Supabase)
✅ **Table Created**: `processing_jobs` table with proper indexes
✅ **Schema Verified**: All foreign key relationships correct

### 3. Vercel Configuration
✅ **Cron Job**: Configured to run every 5 minutes
✅ **Function Timeout**: Should be sufficient for cron job processing

## 🧪 Testing

### Local Testing Results:
✅ **LlamaParse API**: Direct API calls work correctly
✅ **Job Creation**: Database operations work
✅ **Cron Job**: Processes jobs correctly
✅ **File Processing**: PDF to markdown conversion works

### Production Testing:
1. **Upload a PDF** through the portfolio interface
2. **Check job creation** in `processing_jobs` table
3. **Wait for cron job** to process (up to 5 minutes)
4. **Verify completion** in database and OpenAI

## 🔍 Monitoring

### Key Metrics to Watch:
- **Job Success Rate**: Should be >95%
- **Processing Time**: Typically 1-5 minutes per document
- **Error Rate**: Should be <5%
- **Cron Job Execution**: Should run every 5 minutes

### Debugging Queries:
```sql
-- Check pending jobs
SELECT * FROM processing_jobs WHERE status IN ('pending', 'processing') ORDER BY created_at;

-- Check failed jobs
SELECT * FROM processing_jobs WHERE status = 'failed' ORDER BY created_at DESC;

-- Check processing times
SELECT 
  id, 
  document_id, 
  status,
  EXTRACT(EPOCH FROM (completed_at - started_at)) as processing_seconds
FROM processing_jobs 
WHERE completed_at IS NOT NULL;
```

## 🚨 Rollback Plan

If issues occur:
1. **Disable cron job** by removing from `vercel.json`
2. **Revert upload endpoint** to previous version
3. **Clean up failed jobs** in database
4. **Monitor logs** for error patterns

## ✅ Ready for Deployment

The system is ready for production deployment. All components have been tested and verified to work correctly.
