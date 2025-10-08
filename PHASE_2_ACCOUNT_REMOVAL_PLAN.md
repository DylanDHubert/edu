# Phase 2: Account System + Medical Management Removal Plan
## Educational Pivot - Remove Account System & Medical Features

### Overview
Remove the account system (hospital/location context) AND medical management features (surgeons, inventory) to simplify the educational flow from `Team → Portfolio → Account → Chat` to `Team → Portfolio → Chat`.

### 🚨 MASSIVE SCOPE - 161 account_id references across 39 files

**DEEP ANALYSIS FINDINGS:**
- **161 account_id references** across 39 files
- **37 team_accounts/account_portfolios references** across 18 files  
- **84 account name references** across multiple files
- **246 surgeon/inventory references** across 22 files
- **Database tables with account_id columns**: 6 tables
- **Account-related API endpoints**: 3 directories
- **Account management UI**: 1 complete directory
- **Medical management UI**: 2 directories (surgeons, inventory)
- **Inventory API endpoints**: 5 endpoints

---

## Current Account System Architecture

### Database Structure
- **`team_accounts`** - Hospital/location entities
- **`account_portfolios`** - Junction table linking accounts to portfolios  
- **`chat_history`** - Has `account_id` column (CRITICAL)
- **`message_ratings`** - Has `account_id` column
- **`team_knowledge`** - Has `account_id` column
- **`team_assistants`** - Has `account_id` column
- **`notes`** - Has `account_id` column

### Current Flow
```
Team → Portfolio → Account → Chat
     ↓
  Account-Portfolio
  Relationship
```

### New Flow After Phase 2
```
Team → Portfolio → Chat
```

---

## Critical Dependencies Analysis

### 1. Knowledge Generation (MASSIVE IMPACT)
**Files:**
- `app/services/knowledge-md-service.ts` - Requires `accountId` parameter
- `app/services/knowledge-update-service.ts` - Account-based knowledge updates
- `app/services/context-generator-service.ts` - Account context generation

**Current Logic:**
- Account-specific knowledge queries
- Portfolio-account relationships for context
- Account context in vector store filenames
- Account-level knowledge categories

**Required Changes:**
- Remove `accountId` parameter from `KnowledgeMDService`
- Remove account-specific knowledge queries
- Update filename generation (remove account name)
- Simplify knowledge queries to portfolio-only

### 2. Chat System (CRITICAL)
**Files:**
- `app/contexts/ChatContext.tsx` - Account filtering in chat history
- `app/api/chat/create-team/route.ts` - Account context in chat creation
- `app/api/chat/affected-chats/route.ts` - Account-based chat queries

**Current Logic:**
- Chat history filtered by `account_id`
- Chat creation requires `accountId` parameter
- All chat operations need account context

**Required Changes:**
- Remove account filtering from `ChatContext.tsx`
- Update chat creation to skip account step
- Remove `account_id` from chat operations
- Update chat history queries to portfolio-only

### 3. Assistant Creation (CRITICAL)
**Files:**
- `app/api/assistants/create-dynamic/route.ts` - Requires `accountId` parameter
- `app/services/assistant-service.ts` - Account context for knowledge generation
- `app/services/vector-store-service.ts` - Account-specific vector stores

**Current Logic:**
- Assistant creation requires `accountId` parameter
- Account context for knowledge generation
- Account-specific vector stores
- Assistant naming includes account name

**Required Changes:**
- Remove `accountId` parameter from API
- Update `AssistantService` to skip account context
- Remove account-specific vector stores
- Update assistant naming (remove account name)

### 4. UI Navigation Flow
**Files:**
- `app/launcher/select/page.tsx` - Account selection step
- `app/components/AssistantSelectModal.tsx` - Account selection in modals
- `app/launcher/team/page.tsx` - Account management button

**Current Logic:**
- Portfolio selection → Account selection → Chat
- Account filtering in portfolio selection
- Account management in dashboard

**Required Changes:**
- Remove account selection from `launcher/select/page.tsx`
- Remove account selection from `AssistantSelectModal.tsx`
- Update navigation flow to direct portfolio → chat
- Remove account management from dashboard

---

## Implementation Plan

### Step 1: Update Knowledge Generation (Start Here - Least Risky)
**Files to Modify:**
- `app/services/knowledge-md-service.ts`
- `app/services/knowledge-update-service.ts`
- `app/services/context-generator-service.ts`
- `app/utils/knowledge-generator.ts`

**Changes:**
1. Remove `accountId` parameter from `generateKnowledgeMarkdown()`
2. Remove account-specific knowledge queries
3. Remove surgeon context from knowledge generation
4. Remove inventory context from knowledge generation
5. Update filename generation to remove account name
6. Simplify knowledge queries to portfolio-only
7. Remove medical-specific knowledge categories

### Step 2: Update Chat System (Medium Risk)
**Files to Modify:**
- `app/contexts/ChatContext.tsx`
- `app/api/chat/create-team/route.ts`
- `app/api/chat/affected-chats/route.ts`

**Changes:**
1. Remove account filtering from `ChatContext.tsx`
2. Update chat creation to skip account step
3. Remove `account_id` from chat operations
4. Update chat history queries to portfolio-only
5. Set `account_id` to NULL in new chat records

### Step 3: Update Assistant Creation (High Risk)
**Files to Modify:**
- `app/api/assistants/create-dynamic/route.ts`
- `app/services/assistant-service.ts`
- `app/services/vector-store-service.ts`

**Changes:**
1. Remove `accountId` parameter from API
2. Update `AssistantService` to skip account context
3. Remove account-specific vector stores
4. Update assistant naming (remove account name)
5. Update knowledge generation calls

### Step 4: Update UI Flow (Low Risk)
**Files to Modify:**
- `app/launcher/select/page.tsx`
- `app/components/AssistantSelectModal.tsx`
- `app/launcher/team/page.tsx`

**Changes:**
1. Remove account selection from portfolio selection
2. Remove account selection from assistant modal
3. Remove surgeon management button from dashboard
4. Remove inventory management button from dashboard
5. Update navigation flow to direct portfolio → chat
6. Remove account management from dashboard
7. Update button text and flow descriptions

### Step 5: Delete Medical Management Files (Low Risk)
**Files to Delete:**
- `app/edit/surgeons/` - Entire directory
- `app/edit/inventory/` - Entire directory  
- `app/api/teams/inventory/` - Entire directory
- `app/services/inventory-vector-service.ts`
- `app/utils/inventory-upload.ts`
- `app/components/InventoryProcessingSection.tsx`

**Changes:**
1. Delete surgeon management UI
2. Delete inventory management UI
3. Delete inventory API endpoints
4. Delete inventory processing services
5. Remove inventory upload utilities
6. Remove inventory processing components

### Step 6: Update Database Operations (Deferred to Phase 5+)
**Strategy:**
- Keep `account_id` columns (don't drop yet)
- Set `account_id` to NULL in new records
- Update queries to ignore account context
- Maintain backward compatibility

---

## Files to Delete (6 directories + 1 file)
```
app/edit/accounts/                    # Account management UI (1 file)
app/edit/surgeons/                    # Surgeon management UI (1 file)
app/edit/inventory/                   # Inventory management UI (1 file)
app/api/teams/accounts/              # Account CRUD APIs (3 files)
  - create/route.ts
  - list/route.ts  
  - update/route.ts
app/api/teams/inventory/              # Inventory APIs (5 files)
  - delete/route.ts
  - list/route.ts
  - status/route.ts
  - upload-url/route.ts
  - upload-with-llamaparse/route.ts
app/services/inventory-vector-service.ts
app/utils/inventory-upload.ts
app/components/InventoryProcessingSection.tsx
```

## Files to Modify (20+ critical files)

### **CRITICAL FILES (Must Modify):**
```
app/launcher/select/page.tsx          # Remove account selection
app/components/AssistantSelectModal.tsx # Remove account selection  
app/api/assistants/create-dynamic/    # Remove accountId parameter
app/launcher/team/page.tsx            # Remove account management
app/contexts/ChatContext.tsx          # Remove account filtering
app/services/knowledge-md-service.ts  # Remove account-based knowledge
```

### **ADDITIONAL FILES (Account References Found):**
```
app/components/NoteModal.tsx          # Remove account context
app/components/ChatInterface.tsx      # Remove account context
app/components/Sidebar.tsx            # Remove account context
app/components/NotesSection.tsx       # Remove account context
app/components/StandardHeader.tsx     # Remove account display
app/services/notes-service.ts         # Remove account context
app/services/chat-service.ts          # Remove account context
app/services/assistant-service.ts     # Remove account context
app/services/context-generator-service.ts # Remove account context
app/services/knowledge-update-service.ts # Remove account context
app/utils/notes-server.ts             # Remove account context
app/utils/knowledge-generator.ts      # Remove account context
app/api/chat/create-team/route.ts     # Remove account context
app/api/chat/affected-chats/route.ts  # Remove account context
app/api/chat/send/route.ts            # Remove account context
app/api/chat/rate/route.ts            # Remove account context
app/api/notes/create/route.ts         # Remove account context
app/api/notes/update/route.ts         # Remove account context
app/setup/team/page.tsx               # Remove account references
```

### **MEDICAL MANAGEMENT FILES (Surgeon/Inventory References):**
```
app/launcher/team/page.tsx            # Remove surgeon/inventory buttons
app/services/team-deletion-service.ts # Remove surgeon references
app/services/knowledge-md-service.ts  # Remove inventory/surgeon knowledge
app/services/context-generator-service.ts # Remove surgeon context
app/services/assistant-service.ts     # Remove surgeon context
app/utils/knowledge-generator.ts      # Remove surgeon/inventory generation
app/api/teams/general/create/route.ts # Remove surgeon/inventory creation
app/api/teams/general/update/route.ts # Remove surgeon/inventory updates
app/api/teams/accounts/create/route.ts # Remove inventory creation
app/api/teams/accounts/update/route.ts # Remove inventory updates
```

---

## Detailed Change Requirements

### **Database Schema Changes (Phase 5+ Only)**
**Tables with account_id columns:**
- `chat_history` - Set to NULL for new records
- `message_ratings` - Set to NULL for new records  
- `team_knowledge` - Set to NULL for new records
- `team_assistants` - Set to NULL for new records
- `notes` - Set to NULL for new records

**Tables to drop (Phase 5+):**
- `team_accounts` - Drop entire table
- `account_portfolios` - Drop entire table

### **Type Definitions to Update**
**Files with account-related types:**
- `app/types/notes.ts` - Remove account_id fields
- `app/types/chat.ts` - Remove accountId fields
- `app/types/assistant.ts` - Remove accountId fields
- `app/types/api.ts` - Remove account_id fields

### **Component Props to Update**
**Components with account props:**
- `NoteModal.tsx` - Remove accountId, accountName props
- `ChatInterface.tsx` - Remove accountName prop
- `Sidebar.tsx` - Remove accountId, accountName props
- `NotesSection.tsx` - Remove accountId, accountName props
- `StandardHeader.tsx` - Remove accountName prop
- `AssistantSelectModal.tsx` - Remove accountId, accountName props

### **Service Method Signatures to Update**
**Services requiring accountId parameter:**
- `KnowledgeMDService.generateKnowledgeMarkdown()` - Remove accountId
- `KnowledgeUpdateService.updateKnowledgeIfStale()` - Remove accountId
- `ContextGeneratorService.generateAccountContext()` - Remove method
- `AssistantService.createDynamicAssistant()` - Remove accountId
- `ChatService.buildMessageContext()` - Remove accountId
- `NotesService.createNote()` - Remove accountId
- `NotesService.updateNote()` - Remove accountId

### **API Endpoint Changes**
**Endpoints requiring accountId:**
- `POST /api/assistants/create-dynamic` - Remove accountId parameter
- `POST /api/chat/create-team` - Remove accountId parameter
- `POST /api/chat/send` - Remove accountId parameter
- `POST /api/chat/rate` - Remove accountId parameter
- `POST /api/notes/create` - Remove accountId parameter
- `POST /api/notes/update` - Remove accountId parameter

### **UI Flow Changes**
**Navigation flow updates:**
- Remove account selection from portfolio selection
- Remove account management from dashboard
- Remove surgeon management from dashboard
- Remove inventory management from dashboard
- Update button text and descriptions
- Remove account context from headers
- Update note sharing options

### **Medical Management Removal**
**Features to remove:**
- Surgeon management UI and APIs
- Inventory management UI and APIs
- Surgeon context in knowledge generation
- Inventory context in knowledge generation
- Medical-specific knowledge categories
- Surgeon filtering in portfolio context
- Inventory processing and vectorization

---

## Risk Assessment

### HIGH RISK Areas:
- **Knowledge Generation** - Account system deeply integrated
- **Chat System** - Account filtering throughout
- **Assistant Creation** - Account context required
- **Database Operations** - Account references everywhere

### MEDIUM RISK Areas:
- **UI Navigation** - Account selection steps
- **Modal Components** - Account selection logic

### LOW RISK Areas:
- **Dashboard Updates** - Remove account management buttons
- **Button Text** - Update flow descriptions

---

## Testing Strategy

### After Each Step:
1. **Test knowledge generation** - Verify portfolio-only knowledge
2. **Test chat creation** - Verify direct portfolio → chat flow
3. **Test assistant creation** - Verify no account context needed
4. **Test UI navigation** - Verify account selection removed

### Final Testing:
1. **End-to-end flow** - Team → Portfolio → Chat
2. **Chat functionality** - Send messages, get responses
3. **Assistant functionality** - Knowledge-based responses
4. **UI navigation** - All flows work without accounts

---

## Success Criteria

### Phase 2 Complete When:
- ✅ Account selection removed from UI
- ✅ Chat creation works without account context
- ✅ Assistant creation works without account context
- ✅ Knowledge generation works without account context
- ✅ All account-related APIs removed
- ✅ Account management UI removed
- ✅ Surgeon management UI removed
- ✅ Inventory management UI removed
- ✅ Medical-specific knowledge removed
- ✅ Direct portfolio → chat flow working

### Database Strategy:
- **Keep tables** (don't drop yet) - Phase 5+ only
- **Remove API calls** to account system
- **Direct portfolio → chat flow** (skip account step)
- **Update assistant creation** to skip account context

---

## Next Steps

1. **Review this plan** in detail
2. **Identify any missing dependencies**
3. **Refine implementation order**
4. **Create detailed task breakdown**
5. **Begin implementation with Step 1**

**Phase 2 is the most complex phase** - requires careful coordination to maintain functionality while removing account dependencies.
