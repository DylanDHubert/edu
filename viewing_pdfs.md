# Solving PDF Page Navigation with Cloud Storage URLs in React Applications

**The core problem is solvable**: PDF.js fails to navigate to specific pages with signed URLs because its URL parser treats query parameters from signatures as viewer parameters, but this can be reliably solved using fragment identifiers (#page=N), API route proxying, or programmatic navigation. The best approach for a RAG citation system depends on your security requirements and infrastructure, with fragment identifiers offering the simplest path and server-side proxying providing the most control.

The issue stems from a fundamental conflict between how PDF.js processes URLs and how cloud storage services structure signed URLs. When Supabase or S3 generates a pre-signed URL, it includes multiple query parameters for authentication (`?token=abc&expires=123&signature=xyz`). PDF.js's `parseQueryString()` function naively splits on every ampersand character without distinguishing between parameters meant for the cloud storage service versus parameters meant for the PDF viewer itself, corrupting the signed URL and causing loading failures before page navigation can even occur.

Three proven patterns emerge from production systems: **fragment identifiers** that browsers process client-side without sending to servers, **server-side rendering** that converts PDFs to images with independent navigation, and **API route proxying** that isolates authentication from navigation. Each solves the problem differently, and the right choice depends on your performance requirements, security posture, and infrastructure constraints.

## Why PDF.js breaks with signed URLs

The technical root cause lies in PDF.js's `viewer.js` file, where the `parseQueryString()` function splits URLs on all ampersands indiscriminately. When you try to open a PDF with a URL like `viewer.html?file=https://bucket.supabase.co/file.pdf?token=abc&expires=123#page=5`, the parser incorrectly treats `expires=123` as a separate viewer parameter rather than part of the file URL. This corrupts the signed URL, invalidating the authentication signature and causing the request to fail with a 403 error before the viewer can process the `#page=5` fragment.

GitHub issues #9085, #4931, and #20137 document this extensively, with developers reporting that URLs containing query parameters simply don't work. The most recent regression in 2024 (issue #20137) introduced additional encoding logic that further breaks certain URL patterns, particularly relative URLs with query parameters. The PDF.js team's official recommendation is to use `encodeURIComponent()` on the entire file URL, but this approach has inconsistent results and doesn't fully solve the page navigation problem.

The distinction between local and external PDFs matters significantly. Local PDFs served from the same origin work correctly because they don't have complex query parameters: `viewer.html?file=/local/document.pdf#page=5` parses cleanly. But signed URLs from Supabase or S3 must include all authentication parameters in the query string to maintain valid signatures, creating an unsolvable conflict with PDF.js's parsing approach. You cannot split signature parameters across the URL without invalidating the authentication token.

## Alternative PDF viewer libraries and their capabilities

For React applications needing reliable page navigation, **@react-pdf-viewer** offers the most sophisticated navigation API through its dedicated page-navigation plugin. The library provides `jumpToPage(pageIndex)` methods, pre-built navigation components, and keyboard shortcuts out of the box. However, it hasn't been updated in two years (last release v3.12.0), raising maintenance concerns. Despite this staleness, it remains the strongest open-source option for programmatic navigation, handling signed URLs well when CORS is properly configured. The commercial license requirement also limits its appeal for some projects.

**react-pdf** from wojtekmaj dominates the ecosystem with 1.75 million weekly downloads and active maintenance, but it lacks built-in page navigation. You must manually manage page numbers through React state (`setPageNumber(5)`), essentially building your own navigation layer. Known CORS issues with S3 signed URLs (GitHub issues #399, #712) require careful configuration, though the library supports custom HTTP headers and credentials. The ~1.1 MB bundle size (including the PDF.js worker) is substantial but typical for PDF viewers. TypeScript support comes through an external @types package that occasionally falls out of sync.

**PSPDFKit** (now Nutrient Web SDK) delivers enterprise-grade capabilities with excellent programmatic navigation (`setPageIndex(pageIndex, animated)`), WebAssembly rendering for superior performance, and comprehensive features including annotations, forms, and digital signatures. The average cost of **$76,000 per year** according to Vendr data puts it out of reach for most projects, though its ability to handle 500+ MB files efficiently and robust signed URL support justify the investment for mission-critical applications. The 203 MB package size reflects its extensive feature set.

**PDF.js Express**, the "entry-level" product from Apryse (formerly PDFTron), offers a compelling middle ground with a free viewer tier that includes basic programmatic navigation via `documentViewer.setCurrentPage(pageNumber)`. The paid Plus tier at $99/month adds annotations and form filling. Performance issues with complex PDFs (15.8% of surveyed users reported crashes) and the clear positioning as an upsell vehicle limit its appeal, but the free tier provides a working solution without building everything from scratch.

## The fragment identifier solution that production systems use

Fragment identifiers solve the signed URL problem elegantly because **browsers never send them to servers**. When you append `#page=5` to a URL, that fragment exists only in the client's address bar and browser memory. A signed URL like `https://bucket.supabase.co/file.pdf?token=abc&signature=xyz#page=5` works perfectly because the server receives only `https://bucket.supabase.co/file.pdf?token=abc&signature=xyz`, preserving the signature's validity. The browser then processes `#page=5` entirely client-side, instructing the PDF viewer to jump to page 5 after the document loads.

This approach follows the ISO 32000 PDF standard's official parameters: `#page=N` for page numbers, `#zoom=scale` for zoom levels, `#nameddest=X` for named destinations. You can combine parameters with additional ampersands after the hash: `#page=5&zoom=200&view=FitH`. The critical distinction is that these ampersands appear *after* the hash symbol, so they never interfere with query string parsing or signature validation.

Browser support varies but generally works well. Chrome and Firefox handle `#page=N` reliably through their built-in PDF viewers or PDF.js. Safari offers more limited support, and not all fragment parameters from the full PDF Open Parameters specification work universally. PDF.js specifically supports `page=N`, `zoom=scale`, `pagemode=none|thumbs|bookmarks`, and `nameddest=destination`, though notably missing are `view=` and `viewrect=` parameters that Adobe Reader supports.

Dropbox's implementation demonstrates the most sophisticated production approach: the QuickPDF system renders PDFs to PNG images server-side using a modified version of PDFium (Chrome's PDF rendering engine), extracts text positioning data, and caches results. The React-based client fetches only visible pages as users scroll, overlaying transparent text layers for selection. Page navigation happens purely through the application's state management, completely divorced from URL handling. This server-side rendering pattern eliminates all signed URL complications while delivering superior performance—Dropbox reduced their 75th percentile Time to Interactive by 50% with this architecture.

## Implementing page navigation with Supabase signed URLs in React

The most practical implementation for a RAG citation system combines client-side URL management with automatic refresh logic. Start by generating signed URLs on demand from your backend or directly in the React component, then append page navigation as a prop to your PDF viewer component rather than trying to encode it in the URL itself.

```typescript
'use client';
import { useState, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { createClient } from '@supabase/supabase-js';

pdfjs.GlobalWorkerOptions.workerSrc = 
  `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  bucketName: string;
  filePath: string;
  initialPage?: number;
}

export default function PDFViewer({ 
  bucketName, 
  filePath, 
  initialPage = 1 
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(initialPage);
  const [pdfUrl, setPdfUrl] = useState<string>('');

  const supabase = useMemo(() => 
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ), 
  []);

  useEffect(() => {
    let urlRefreshInterval: NodeJS.Timeout;

    const getSignedUrl = async () => {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (data?.signedUrl) setPdfUrl(data.signedUrl);
    };

    getSignedUrl();
    // Refresh URL at 50 minutes (before 1-hour expiry)
    urlRefreshInterval = setInterval(getSignedUrl, 50 * 60 * 1000);

    return () => clearInterval(urlRefreshInterval);
  }, [supabase, bucketName, filePath]);

  return (
    <div className="pdf-viewer">
      <div className="controls">
        <button 
          onClick={() => setPageNumber(prev => Math.max(prev - 1, 1))}
          disabled={pageNumber <= 1}
        >
          Previous
        </button>
        <span>Page {pageNumber} of {numPages}</span>
        <button 
          onClick={() => setPageNumber(prev => Math.min(prev + 1, numPages))}
          disabled={pageNumber >= numPages}
        >
          Next
        </button>
      </div>
      
      <Document
        file={pdfUrl}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
      >
        <Page pageNumber={pageNumber} width={800} />
      </Document>
    </div>
  );
}
```

This implementation handles signed URL expiration gracefully by refreshing the URL every 50 minutes (10% before the 60-minute expiration), ensuring users never encounter expired URLs during long viewing sessions. Page navigation happens through React state management rather than URL parameters, avoiding all the parsing conflicts that plague direct URL-based approaches.

## Server-side proxying for maximum control and security

An API route proxy gives you complete control over authentication, caching, and access logging while eliminating all client-side CORS configuration. Create a Next.js API route that fetches PDFs from Supabase using service role credentials (which should never be exposed to clients), then streams the content with appropriate headers.

```typescript
// app/api/pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Server-only credential
);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const bucket = searchParams.get('bucket');
  const path = searchParams.get('path');

  if (!bucket || !path) {
    return NextResponse.json(
      { error: 'Missing parameters' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .download(path);

  if (error) throw error;

  return new NextResponse(data, {
    headers: {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': 'inline',
    },
  });
}
```

Your client-side PDF viewer then uses simple, clean URLs without any authentication complexity: `<Document file="/api/pdf?bucket=documents&path=file.pdf" />`. Page navigation works perfectly because the URL contains no query parameter conflicts. Add Redis or Vercel Edge Config caching to this pattern for frequently accessed documents, reducing the load on both Supabase and your API routes while improving response times dramatically.

The hybrid approach offers a middle ground: generate short-lived signed URLs (5-15 minutes) from a Next.js API route, then use those URLs directly in the client. Combine this with JWT tokens that wrap the bucket and path information, creating URLs like `/api/pdf/[token]` that redirect to fresh signed URLs. This reduces server load compared to full proxying while maintaining security through the short expiration windows and encrypted tokens.

## Building RAG citation systems with clickable PDF sources

A production-ready RAG citation system requires careful architecture to connect conversational answers with specific PDF pages. Structure your citations as typed objects that include document metadata, page numbers, text snippets, and storage paths, enabling users to verify AI-generated claims against primary sources.

```typescript
interface Citation {
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  bucket: string;
  path: string;
  snippet: string;
  confidence: number;
}

interface RAGResponse {
  answer: string;
  citations: Citation[];
}
```

Your backend RAG pipeline performs vector search to retrieve relevant chunks from Supabase's pgvector extension, generates answers using OpenAI's GPT-4 with explicit citation instructions, then maps the inline citations ([1], [2], etc.) back to the source documents with page numbers. Store page numbers during the document ingestion phase when you chunk PDFs for embedding.

```typescript
export function CitationViewer({ citation }: { citation: Citation }) {
  const [showPDF, setShowPDF] = useState(false);

  return (
    <div className="citation">
      <div className="citation-header">
        <span className="document-title">{citation.documentTitle}</span>
        <span className="page-ref">Page {citation.pageNumber}</span>
        <button onClick={() => setShowPDF(true)}>View Source</button>
      </div>
      
      <blockquote className="citation-snippet">
        {citation.snippet}
      </blockquote>

      {showPDF && (
        <div className="pdf-modal">
          <PDFViewer
            bucketName={citation.bucket}
            filePath={citation.path}
            initialPage={citation.pageNumber}
          />
          <button onClick={() => setShowPDF(false)}>Close</button>
        </div>
      )}
    </div>
  );
}
```

Semantic Scholar's approach demonstrates best practices: their AI-augmented reader shows TLDR summaries of cited papers, contextual definitions, and highlighted key claims (categorized as Goal/Method/Result) directly inline. Perplexity's implementation emphasizes immediate source access with clickable citations that preserve context. ChatGPT plugins like AskYourPDF implement chunking with vector indexing, returning structured citation objects that include source IDs, page numbers, and exact text matches.

## CORS configuration and handling credentials properly

Supabase Storage handles CORS automatically for signed URLs, but you must configure explicit CORS policies for any authenticated requests or API route proxies. Set `Access-Control-Allow-Origin` to your specific domain in production (never use wildcards for authenticated requests), include `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`, and expose `Content-Length` and `Content-Type` headers that PDF viewers need for progressive loading.

S3 requires manual CORS configuration through the bucket policy. **The critical detail most developers miss**: PDF.js makes both HEAD and GET requests to check document metadata before downloading, but AWS pre-signed URLs are typically tied to a single HTTP verb. Generate your pre-signed URLs specifically for GET requests, or configure your bucket CORS to allow both methods without authentication.

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://yourdomain.com"
    ],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

When using react-pdf with credentials, disable `withCredentials` for S3 signed URLs (set to `false`) but enable it for authenticated Supabase requests that use session cookies. This counterintuitive configuration exists because signed URLs provide authentication through query parameters rather than cookies, and enabling credentials causes CORS preflight failures.

## Performance optimization for large documents and production deployment

Progressive loading transforms user experience for large PDFs by rendering visible pages immediately while lazily loading adjacent pages in the background. Implement viewport detection to track which pages are visible, then preload the next 2-3 pages in each direction to create seamless scrolling.

Dynamic imports reduce your initial JavaScript bundle by loading PDF.js only when needed. In Next.js, use `dynamic()` with `ssr: false` to prevent server-side rendering of the PDF viewer (which will fail anyway since PDFs require browser APIs).

```typescript
import dynamic from 'next/dynamic';

const PDFViewer = dynamic(() => import('@/components/PDFViewer'), {
  ssr: false,
  loading: () => <div>Loading PDF viewer...</div>,
});
```

Configure the PDF.js worker URL carefully to avoid loading it from CDNs in production. Bundle the worker with your application using webpack configuration or Vite's worker handling, ensuring it's served from your domain to avoid CORS issues and reduce latency. The worker handles PDF parsing in a separate thread, preventing UI freezes during document loading.

Caching strategies dramatically improve performance for frequently accessed documents. Implement Redis caching in your API routes with base64-encoded PDF data, setting 24-hour TTLs for public documents and shorter TTLs for private ones. Add `Cache-Control` headers with appropriate `max-age` values, enabling CDN caching at the edge for maximum speed. Vercel's Edge Functions place this logic geographically close to users, reducing latency from hundreds of milliseconds to tens of milliseconds.

## Error handling strategies that prevent user frustration

Signed URL expiration represents the most common failure mode in production systems. Implement automatic retry logic that detects 403 errors, generates fresh signed URLs, and reloads the PDF transparently. Set retry limits (typically 3 attempts) to prevent infinite loops if the underlying issue isn't expiration.

```typescript
const handleLoadError = async (error: Error) => {
  if (error.message.includes('403') || error.message.includes('expired')) {
    if (retryCount < 3) {
      const newUrl = await fetchSignedUrl(bucket, path);
      setUrl(newUrl);
      setRetryCount(prev => prev + 1);
    } else {
      setError('Unable to load document after multiple attempts');
    }
  } else if (error.message.includes('CORS')) {
    setError('Document access blocked. Please check CORS configuration.');
  } else {
    setError('Failed to load document. Please try again.');
  }
};
```

Network timeouts need explicit handling since PDF downloads can take significant time on slow connections. Set reasonable timeout values (30-60 seconds) for initial document loading, display progress indicators, and provide cancel buttons for users who want to abandon slow loads. Implement fallback rendering that shows the first page thumbnail while the full document loads, following Dropbox's pattern of immediate visual feedback.

## Next.js and Vercel deployment considerations

Serverless function memory limits pose the biggest constraint for PDF proxying on Vercel. The default 1024 MB limit struggles with PDFs larger than ~50 MB after accounting for base64 encoding overhead and V8's memory management. Upgrade to Pro tier for 3 GB limits on Hobby accounts, or implement streaming responses that pipe data directly without buffering the entire file in memory.

Edge Functions offer superior performance for PDF URL generation by running globally on Cloudflare's network, reducing latency by 80-150 ms compared to regional serverless functions. Deploy your signed URL generation logic to the edge, but keep PDF proxying in standard serverless functions since Edge Functions have stricter memory constraints (memory limits are lower and execution time is capped).

Environment variable management requires extra care: store service role keys and AWS credentials only in server-side environment variables (not `NEXT_PUBLIC_*` prefixed), use Vercel's Environment Variables UI with production/preview/development targeting, and rotate credentials quarterly at minimum. Never commit secrets to Git, even in `.env.local` files that are gitignored—use Vercel CLI's `vercel env pull` to sync credentials locally.

## Recommended implementation approach for your RAG system

For a RAG citation system with Supabase storage and Next.js, **start with the hybrid approach**: client-side PDF viewing with react-pdf (wojtekmaj), signed URLs generated through a Next.js API route, and programmatic page navigation through React state. This balances simplicity, security, and performance while keeping infrastructure costs low.

Create a `/api/signed-url` endpoint that validates user sessions, generates short-lived Supabase signed URLs (5-15 minutes), and returns them to authenticated clients. Your React component fetches these URLs on mount and refreshes them automatically before expiration. Pass the `initialPage` prop to your PDF viewer component, letting react-pdf handle the rendering while you manage navigation through `useState`.

Implement citation objects that store bucket names, file paths, and page numbers in your vector database alongside embeddings. When users click a citation, open a modal with your PDF viewer component initialized to the relevant page. Add keyboard shortcuts (arrow keys for page navigation, Escape to close) and visual indicators showing which citation the user is currently viewing.

Monitor performance in production using Vercel Analytics or custom instrumentation: track Time to First Byte for signed URL generation, Time to Interactive for PDF loading, and user engagement metrics like average time spent viewing citations. If performance degrades or costs escalate, migrate to server-side rendering with caching before investing in expensive commercial solutions. Most RAG applications never need PSPDFKit's capabilities, but if you require annotations, form filling, or real-time collaboration, allocate budget for enterprise tools rather than building these features yourself.

The pragmatic path: start simple with react-pdf and programmatic navigation, prove the concept with real users, measure performance bottlenecks with actual data, then optimize specifically where metrics show problems. Fragment identifiers solve the URL parameter conflicts, server-side rendering solves performance issues, and commercial viewers solve feature gaps—but you won't know which problems actually matter until users interact with your system in production.