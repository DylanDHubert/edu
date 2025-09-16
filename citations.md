# Citations Persistence Implementation Plan

## Overview
Make citations persistent across chat sessions by following the exact same pattern as the message ratings system, which already works perfectly with OpenAI thread-based architecture.

## Key Insight
The message ratings system proves that using OpenAI message IDs as database keys works perfectly for persistence. Citations should follow the identical pattern.

## Database Schema

### New Table: `message_citations`
```sql
CREATE TABLE public.message_citations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  thread_id text NOT NULL,
  openai_message_id text NOT NULL,  -- OpenAI's actual message ID (like msg_abc123xyz)
  citation_number integer NOT NULL,
  file_id text NOT NULL,
  quote text,
  full_chunk_content text,
  file_name text,
  relevance_score decimal,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT message_citations_pkey PRIMARY KEY (id),
  CONSTRAINT message_citations_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.chat_history(thread_id) ON DELETE CASCADE
);
```

## Implementation Plan

### Phase 1: Database & API Layer

#### 1.1 Create Database Migration
- Add `message_citations` table to schema
- Test with sample data

#### 1.2 Create Citation API Endpoints
- `POST /api/chat/citations` - Store citation data for a message
- `GET /api/chat/citations` - Retrieve citation data for a thread

#### 1.3 Update ChatService
- Add `storeMessageCitations()` method
- Add `getMessageCitations()` method
- Follow exact pattern from `getRatings()` method

### Phase 2: Backend Integration

#### 2.1 Update OpenAI Streaming
- After streaming completes, get the real OpenAI message ID
- Store citations in database using that message ID
- Follow pattern from message ratings storage

#### 2.2 Update Message Loading
- Load citations separately from messages (like ratings)
- Create lookup object using OpenAI message IDs as keys
- Attach citations to messages during display

### Phase 3: Frontend Integration

#### 3.1 Update ChatInterface State
- Add `messageCitations` state (following `messageRatings` pattern)
- Add `loadMessageCitations()` function
- Load citations after loading messages (like ratings)

#### 3.2 Update Citation Display
- Use lookup object to check if message has citations
- Display "See Sources" button based on citation data
- Remove localStorage dependency

#### 3.3 Update Sources Page
- Fetch citation data from database instead of localStorage
- Use OpenAI message ID to retrieve citations

## File Changes Required

### Database & Schema
- `schema.sql` - Add message_citations table
- `migrations/` - Create migration file

### API Routes
- `app/api/chat/citations/route.ts` - New endpoint for citation storage/retrieval

### Services
- `app/services/chat-service.ts` - Add citation methods (follow ratings pattern)
- `app/utils/openai.ts` - Store citations after streaming completes

### Frontend Components
- `app/components/ChatInterface.tsx` - Add citation state and loading (follow ratings pattern)
- `app/view-sources/[messageId]/page.tsx` - Fetch from database instead of localStorage

### Types
- `app/types/chat.ts` - Add citation-related types

## Reference Files (For Context)

### Message Ratings System (Follow This Exact Pattern)

#### Frontend Pattern
- `app/components/ChatInterface.tsx`
  - Lines 65: `messageRatings` state
  - Lines 217-238: `loadMessageRatings()` function
  - Line 451: Loading ratings after messages
  - Lines 1077-1078, 1093-1094: Using ratings in UI

#### Backend Pattern
- `app/api/chat/ratings/route.ts` - Ratings API endpoint
- `app/services/chat-service.ts`
  - Lines 252-304: `getRatings()` method
  - Lines 280-291: Converting to lookup object

#### Database Pattern
- `schema.sql` - Lines 53-71: `message_ratings` table structure
- Uses `message_id` (OpenAI's ID) as the key

### Admin System (Proves Message IDs Work)
- `app/api/admin/analytics/feedback/route.ts`
  - Lines 173: `messages.findIndex(msg => msg.id === rating.message_id)`
  - Lines 75-77: Creating ratings map with OpenAI message IDs
  - Lines 146: Matching ratings to messages

- `app/api/admin/analytics/thread/[threadId]/route.ts`
  - Lines 75-77: Same pattern for thread view
  - Lines 146: Same message ID matching

### Current Citation System (To Replace)
- `app/utils/openai.ts`
  - Lines 34-41: Citation data structure
  - Lines 114-121: Citation data array
  - Lines 206-213: Storing citation data during streaming
  - Lines 259-289: Retrieving chunk content after streaming

- `app/components/ChatInterface.tsx`
  - Lines 31-38: Citation data interface
  - Lines 1111-1136: Current "See Sources" button (uses localStorage)
  - Lines 1114-1125: localStorage storage pattern (to be replaced)

- `app/view-sources/[messageId]/page.tsx`
  - Lines 42-63: Current localStorage retrieval (to be replaced)

## Data Flow

### Current Flow (Temporary)
```
Streaming → Citations in React state → localStorage → Lost on refresh
```

### New Flow (Persistent)
```
Streaming → Citations in React state → Store in DB with OpenAI message ID → 
Load messages → Load citations separately → Match by OpenAI message ID → Display
```

## Key Benefits

1. **True Persistence**: Citations survive chat exits and page refreshes
2. **Proven Pattern**: Uses exact same approach as working ratings system
3. **Reliable**: Uses OpenAI's stable message IDs as keys
4. **Scalable**: Can handle large numbers of citations across many chats
5. **No localStorage**: Eliminates unreliable browser storage dependency

## Migration Strategy

1. **Phase 1**: Create database schema and API endpoints
2. **Phase 2**: Update backend to store citations after streaming
3. **Phase 3**: Update frontend to load citations from database
4. **Phase 4**: Remove localStorage dependency
5. **Phase 5**: Test with existing chats (they'll have no citations until new messages)

## Testing Plan

1. **New Chats**: Test citations persist after page refresh
2. **Existing Chats**: Verify they still work (no citations until new messages)
3. **Multiple Citations**: Test messages with many citations
4. **Sources Page**: Verify it loads from database instead of localStorage
5. **Admin System**: Verify citations appear in admin analytics

## Success Criteria

- [ ] Citations persist when chat is exited and reopened
- [ ] Sources page loads citation data from database
- [ ] No localStorage dependency for citations
- [ ] Existing chats continue to work
- [ ] New messages store citations in database
- [ ] Admin system can access citation data
- [ ] Performance is acceptable with many citations
