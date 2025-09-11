# LlamaParse Integration Test Guide

## Environment Setup

Before testing, ensure you have the following environment variables set:

```env
LLAMAPARSE_API_KEY=your_llamaparse_api_key
LLAMAPARSE_BASE_URL=https://api.llamaindex.ai
LLAMAPARSE_AGENTIC_PLUS=true
```

## Test Steps

### 1. Upload a PDF Document

1. Navigate to the portfolio editing page
2. Create a new portfolio or select an existing one
3. Upload a PDF file using the file upload area
4. Click "Save Changes"

### 2. Verify Processing Status

1. After upload, you should see a "Processing Documents" section appear
2. The document should show with a "Processing..." status and progress bar
3. The status should update in real-time without page refresh

### 3. Check Processing States

The document should progress through these states:
- **Pending**: Yellow icon, "Queued..." text
- **Processing**: Blue icon with spinner, "Processing... X%" text
- **Completed**: Green checkmark, "Completed ✓" text
- **Failed**: Red X icon, "Failed" text with retry button

### 4. Verify Real-time Updates

1. Keep the page open during processing
2. Status should update automatically every 2 seconds
3. No manual refresh should be needed
4. When complete, document should move to "Existing Documents" section

### 5. Test Error Handling

1. Try uploading an invalid file (non-PDF)
2. Verify appropriate error messages are shown
3. Test retry functionality for failed documents

## API Endpoints to Test

### Upload with LlamaParse
```
POST /api/teams/documents/upload-with-llamaparse
```

### Check Processing Status
```
GET /api/teams/documents/processing-status/{documentId}
```

### Retry Failed Processing
```
POST /api/teams/documents/processing-status/{documentId}
Body: { "action": "retry" }
```

### Background Processing
```
POST /api/process-document
```

## Expected Behavior

1. **Fast Upload Response**: Upload should complete in <5 seconds
2. **Background Processing**: LlamaParse processing happens in background
3. **Real-time Updates**: Status updates without page refresh
4. **Error Recovery**: Failed documents can be retried
5. **Seamless Integration**: Completed documents appear in existing documents list

## Troubleshooting

### Common Issues

1. **LlamaParse API Key**: Ensure API key is valid and has credits
2. **File Size**: Large files may take longer to process
3. **Network Issues**: Check internet connection for API calls
4. **Database Permissions**: Ensure Supabase RLS policies allow updates

### Debug Logs

Check browser console and server logs for:
- LlamaParse API responses
- Database update errors
- Real-time subscription issues
- File upload problems

## Success Criteria

- [ ] PDF uploads complete in <5 seconds
- [ ] Processing status shows in real-time
- [ ] Documents complete processing successfully
- [ ] Failed documents can be retried
- [ ] Completed documents appear in existing documents
- [ ] No page refresh required for status updates
