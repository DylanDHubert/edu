# RAG System Page Citations - Implementation Plan

## The Problem

Our RAG system currently gives answers without showing where they came from. This creates two issues:
1. Users can't verify if answers are correct
2. Even when answers are wrong, users trust them because they're presented confidently

OpenAI's Assistants API does return file citations, but they have fundamental problems:
- The `file_id` doesn't include page numbers
- The `quote` field that should contain the cited text is missing or broken
- Citations often point to the wrong files
- There's no way to map citations back to specific PDF pages

We need a way to show users "this answer came from Page 5 of document.pdf" so they can click and verify.

## The Solution

The core insight: we can embed page number metadata directly into the text before uploading to OpenAI. When OpenAI retrieves chunks to answer questions, those chunks will still contain the page markers. We extract the markers and show them to users as sources.

**Key insight:** We need to inject page markers every 400 tokens throughout the document, not just at page boundaries. This ensures that when OpenAI chunks the document (which happens automatically), every chunk will contain a page number.

### How It Works

**During Upload:**
- Parse PDFs with LlamaParse (which gives us page boundaries like `<<1>>`, `<<2>>`, etc.)
- **Post-process the markdown** to inject `--- Page N ---` markers every 400 tokens between page boundaries
- Upload the processed text to OpenAI's vector store
- OpenAI chunks this text normally, and every chunk will contain a page marker

**During Queries:**
- User asks a question
- OpenAI Assistant uses file_search to retrieve relevant chunks and generate an answer
- We inspect the run steps to see exactly which chunks OpenAI used (we already do this for analytics)
- Extract page numbers from the markers in those chunks
- Return both the answer AND the source citations

**Showing Sources:**
- Display the answer normally
- Below the answer, show "Sources:" with clickable links like "Page 5 of document.pdf"
- Each link opens the PDF in a new tab at the correct page
- Users can verify the answer themselves

---

## Implementation Steps

### Phase 1: Modify Document Processing Pipeline

**Location:** `/api/cron/process-documents/route.ts`

**Changes needed:**
- After LlamaParse returns markdown, add post-processing step
- Implement `addPageMarkersEvery400Tokens()` function using `tiktoken` library
- Inject `--- Page N ---` markers every 400 tokens between LlamaParse page boundaries
- Keep existing LlamaParse page boundaries (`<<1>>`, `<<2>>`, etc.) as-is

**Implementation:**
```typescript
import { encoding_for_model } from 'tiktoken';

function addPageMarkersEvery400Tokens(markdown: string): string {
  const tokenizer = encoding_for_model('gpt-4');
  const parts = markdown.split(/(<<\d+>>)/);
  const result = [];
  
  for (let i = 0; i < parts.length; i += 2) {
    const content = parts[i];
    const pageMarker = parts[i + 1]; // <<N>>
    
    if (content) {
      const tokens = tokenizer.encode(content);
      const pageNum = pageMarker ? pageMarker.match(/\d+/)?.[0] : '1';
      
      // Add page markers every 400 tokens
      for (let j = 0; j < tokens.length; j += 400) {
        result.push(tokenizer.decode(tokens.slice(j, j + 400)));
        if (j + 400 < tokens.length) {
          result.push(`--- Page ${pageNum} ---`);
        }
      }
    }
    
    if (pageMarker) {
      result.push(pageMarker);
    }
  }
  
  return result.join('\n');
}
```

**Key Points:**
- Use `tiktoken` for accurate token counting (same as OpenAI)
- Page marker format: `--- Page N ---` (matches LlamaParse style)
- Preserve existing LlamaParse page boundaries
- Upload processed markdown to OpenAI as single file

---

### Phase 2: Chat/Query Endpoint - Extract Sources

**Location:** Existing chat endpoints (not Safe Mode)

**Changes needed:**
- Extract retrieved chunks from run steps using existing analytics code
- Parse chunks to extract page numbers from `--- Page N ---` markers
- Look up document info from `course_documents` table
- Return sources alongside the answer

**Implementation:**
```typescript
// Use existing analytics code from chunks-experiment-service.ts
const runSteps = await client.beta.threads.runs.steps.list(threadId, runId, {
  include: ['step_details.tool_calls[*].file_search.results[*].content']
});

// Extract page numbers from chunks
function extractPageNumbersFromChunks(chunks: any[]): Array<{fileId: string, pageNumber: number}> {
  const sources = [];
  
  for (const chunk of chunks) {
    if (chunk.content) {
      for (const contentItem of chunk.content) {
        if (contentItem.type === 'text') {
          const pageMatches = contentItem.text.match(/--- Page (\d+) ---/g);
          if (pageMatches) {
            pageMatches.forEach(match => {
              const pageNumber = parseInt(match.match(/\d+/)[0]);
              sources.push({
                fileId: chunk.file_id,
                pageNumber: pageNumber
              });
            });
          }
        }
      }
    }
  }
  
  return sources;
}

// Look up document info
async function getDocumentInfo(fileId: string): Promise<{originalName: string, docId: string}> {
  const { data: document } = await serviceClient
    .from('course_documents')
    .select('id, original_name')
    .eq('openai_file_id', fileId)
    .single();
    
  return {
    originalName: document.original_name,
    docId: document.id
  };
}
```

**Key Points:**
- Uses existing analytics code from `chunks-experiment-service.ts`
- Regex extracts page numbers from `--- Page N ---` markers
- Looks up document info from `course_documents` table using `openai_file_id`
- Returns top 5 sources with document names and page numbers

---

### Phase 3: PDF Serving Endpoint

**Location:** New endpoint `/api/documents/[docId]/pdf`

**Implementation:**
```typescript
export async function GET(request: NextRequest, { params }: { params: { docId: string } }) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page');
  
  // Get document info from course_documents table
  const { data: document } = await serviceClient
    .from('course_documents')
    .select('file_path, original_name')
    .eq('id', params.docId)
    .single();
    
  // Get PDF from Supabase Storage
  const { data: pdfData } = await serviceClient.storage
    .from('course-documents')
    .download(document.file_path);
    
  // Return PDF with page anchor
  return new NextResponse(pdfData, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${document.original_name}"`
    }
  });
}
```

**Functionality:**
- Serve PDFs from Supabase Storage using `file_path`
- Support `?page=N` query parameter for page anchors
- Return PDF with proper headers for inline display

---

### Phase 4: Frontend - Show Sources

**Location:** Chat interface components

**Implementation:**
```typescript
// Display sources below each answer
const sources = [
  { documentName: "HHB Pitch Deck.pdf", pageNumber: 5, docId: "51f466a4-0820-4541-a09f-cc3bf4ccd1ba" },
  { documentName: "Dr. Kirby Hitt Suggestions.pdf", pageNumber: 12, docId: "9ebe932c-11f7-428e-a1d6-d15febc9c4d3" }
];

// Render as clickable links
{sources.map(source => (
  <a 
    href={`/api/documents/${source.docId}/pdf?page=${source.pageNumber}`}
    target="_blank"
    className="source-link"
  >
    Page {source.pageNumber} of {source.documentName}
  </a>
))}
```

**Changes needed:**
- Display sources below each answer
- Format: "Page 5 of document.pdf", "Page 12 of document.pdf"
- Each source opens PDF in new tab at correct page
- Only show sources when file_search is used

---

## Testing Plan

### Test 1: Document Processing
1. Upload a multi-page PDF
2. Verify LlamaParse returns markdown with page boundaries (`<<1>>`, `<<2>>`, etc.)
3. Check post-processing adds `--- Page N ---` markers every 400 tokens
4. Confirm processed markdown uploaded to OpenAI as single file

### Test 2: Retrieval Accuracy
1. Ask question that requires specific page
2. Check run steps to see retrieved chunks
3. Verify `--- Page N ---` markers present in chunks
4. Confirm page numbers extracted correctly from markers

### Test 3: Multi-Page Answers
1. Ask question spanning multiple pages
2. Verify all relevant pages in sources
3. Check deduplication working
4. Ensure sources sorted by relevance

### Test 4: PDF Opening
1. Click source links (e.g., "Page 5 of document.pdf")
2. Verify PDF opens in new tab
3. Confirm opens to correct page using `#page=N` anchor
4. Test with multiple different PDFs

### Test 5: Edge Cases
- PDF with 1 page
- PDF with 100+ pages
- Question with no sources
- Malformed page markers
- Very short pages (less than 400 tokens)

---

## Deployment Checklist

- [ ] Set `LLAMAPARSE_API_KEY` in Vercel environment variables (already done)
- [ ] Set `OPENAI_API_KEY` in Vercel environment variables (already done)
- [ ] Install `tiktoken` package for accurate token counting
- [ ] Modify `/api/cron/process-documents/route.ts` to add post-processing step
- [ ] Create `/api/documents/[docId]/pdf` endpoint for PDF serving
- [ ] Update chat endpoints to extract sources using existing analytics code
- [ ] Update frontend to display sources below answers
- [ ] Test with sample PDFs (1 page, multi-page, large documents)
- [ ] Test PDF opening in multiple browsers
- [ ] Monitor token usage (page markers add ~1% overhead)

## Data Structure Analysis

**✅ Perfect Setup Confirmed:**
- `course_documents` table has all required fields: `id`, `openai_file_id`, `original_name`, `file_path`
- Supabase Storage contains original PDFs at `file_path` locations
- OpenAI file IDs link processed markdown to original documents
- No database changes needed - uses existing structure

**Document Flow:**
1. **Upload**: PDF → Supabase Storage → LlamaParse → Post-process → OpenAI
2. **Query**: OpenAI chunks → Extract page markers → Lookup document info → Return sources
3. **Display**: Sources → PDF serving endpoint → Original PDF with page anchor

---

## Cost Considerations

**Token Overhead:**
- Page marker: ~5 tokens (`--- Page N ---`)
- Per 400-token interval: 5/400 = 1.25% increase
- For 1000-token page: ~2.5% overhead
- Negligible cost impact

**Storage:**
- Single file per document in OpenAI (not per page)
- Page markers embedded in text, not separate files
- No additional storage costs

**API Calls:**
- `runs.steps.list` with `include` parameter: standard rate (already used for analytics)
- No additional cost vs. basic Assistant usage

---

## Troubleshooting

### Page numbers not appearing
- Check LlamaParse output has page boundaries (`<<1>>`, `<<2>>`, etc.)
- Verify post-processing adds `--- Page N ---` markers every 400 tokens
- Inspect OpenAI file content directly to confirm markers present
- Check `tiktoken` token counting accuracy

### Wrong pages shown
- Review regex pattern for marker extraction (`--- Page (\d+) ---`)
- Check token counting accuracy (use `tiktoken` library)
- Verify page number extraction from LlamaParse boundaries
- Ensure 400-token intervals are calculated correctly

### PDF won't open to page
- Test with `#page=5` manually in browser
- Some PDF viewers don't support page anchors
- Consider using react-pdf for consistent behavior
- Verify Supabase Storage file paths are correct

### Sources missing entirely
- Check `include` parameter in steps.list call (already used for analytics)
- Verify file_search tool enabled on Assistant
- Ensure vector store attached to Assistant
- Confirm post-processing step completed successfully
- Check `course_documents` table has correct `openai_file_id` mappings

### Document lookup fails
- Verify `openai_file_id` exists in `course_documents` table
- Check document status is "Processed" not "Failed"
- Ensure `file_path` points to valid Supabase Storage location
- Test PDF download from Supabase Storage directly

---

## Success Metrics

After implementation, you should see:

✅ Every answer has clickable sources  
✅ Sources open to exact page in PDF  
✅ Multi-page answers show all relevant pages  
✅ User confidence increases (can verify answers)  
✅ Fewer "is this correct?" follow-up questions  

---

## UPDATED IMPLEMENTATION: React Component Approach

**Date:** Oct 6, 2025

### Problem with Original Plan
The original plan to redirect to PDF.js viewer with signed URLs failed because:
- PDF.js's URL parser treats ALL ampersands as parameter separators
- Supabase signed URLs contain `?token=abc&expires=123&signature=xyz`
- PDF.js corrupts the signed URL, invalidating authentication
- Page anchors (`#page=N`) don't work because the PDF fails to load first

### New Solution: Client-Side React Component
Instead of redirecting to external PDF.js viewer, we:
1. **Created `PDFViewer.tsx` component** - Client-side PDF rendering with react-pdf
2. **Pass page as prop** - `<PDFViewer docId="..." initialPage={5} />` (not URL param)
3. **Generate signed URLs internally** - Component fetches from Supabase, auto-refreshes
4. **State-based navigation** - React state manages current page, not URL fragments
5. **Modal display** - Opens in modal instead of new tab, better UX

### Implementation Summary
```
✅ Installed react-pdf + pdfjs-dist
✅ Created app/components/PDFViewer.tsx (modal with signed URL handling)
✅ Updated app/components/SourcesDisplay.tsx (clickable buttons open modal)
✅ Updated app/admin/dashboard/page.tsx (PDF test section uses component)
✅ All linter errors resolved
```

### How It Works Now
1. User asks question → OpenAI returns chunks with `--- Page N ---` markers
2. Backend extracts sources: `[{ docId, documentName, pageNumber }]`
3. Frontend shows sources as clickable links
4. Click source → Opens `PDFViewer` modal with `docId` + `initialPage`
5. Component fetches document info + signed URL from Supabase
6. react-pdf renders PDF, jumps to `initialPage` via React state
7. User can navigate with Previous/Next buttons or arrow keys

### Testing
Use analytics dashboard test section:
- Document ID: `0b8853cc-2e26-4191-805c-00935cf22db8`
- Try different page numbers (1, 2, 3, etc.)
- PDF should open in modal at exact page

