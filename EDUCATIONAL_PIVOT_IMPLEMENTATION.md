# Educational Pivot Implementation Plan
## Medical Distributor System → Educational Classroom System

### Overview
Transform the current medical distributor-rep-surgeon system into an educational teacher-student-classroom system with simplified document processing and maintained citation functionality.

### ⚠️ CRITICAL: This is a MASSIVE refactor affecting core system architecture
- **Account System**: Extensively used throughout codebase (chat, assistants, knowledge generation)
- **Database Schema**: Major changes to core tables and relationships
- **Chat System**: Account-based filtering and context throughout
- **Assistant Creation**: Requires account context for knowledge generation
- **Knowledge Management**: Account-specific knowledge categories and data

### 🚨 Implementation Strategy: Phased Approach Required
**DO NOT modify database schema first** - this will break the system. Must update code to work without account context before schema changes.

---

## Current System Analysis

### ✅ Keep As-Is
- **Invitation System**: Email-based team invitations with role assignment
- **Document Processing Core**: PDF → LlamaParse → Job Queue → OpenAI
- **Citation System**: Page number extraction and display in chat responses
- **Database Schema**: Core tables (`teams`, `team_portfolios`, `team_members`, `team_documents`)

### ❌ Remove Entirely
- **Account System**: Complex hospital/location context (`team_accounts`, `account_portfolios`)
- **Safe Mode**: Vector search without AI responses (`/safemode`, vectorization services)
- **Medical Management**: Surgeons, inventory, distributor-specific features

---

## Implementation Phases

### Phase 1: Role Vocabulary Updates (1 day)
**UI-only changes, no database modifications**

#### ⚠️ CRITICAL FILES TO UPDATE:
```
app/components/StandardHeader.tsx          # "Team" → "Classroom"
app/launcher/team/page.tsx                   # Role display updates
app/launcher/select/page.tsx              # Remove account selection
app/components/InviteModal.tsx            # Role labels
app/api/teams/invite/route.ts             # Role validation text
```

#### 🔍 SEARCH PATTERNS TO FIND ALL USAGES:
```bash
# Find all "team" references to update to "classroom"
grep -r "team" --include="*.tsx" --include="*.ts" app/components/
grep -r "Team" --include="*.tsx" --include="*.ts" app/

# Find all role references
grep -r "manager" --include="*.tsx" --include="*.ts" app/
grep -r "member" --include="*.tsx" --include="*.ts" app/
```

#### Files to Update:
```
app/components/StandardHeader.tsx          # "Team" → "Classroom"
app/launcher/team/page.tsx                   # Role display updates
app/launcher/select/page.tsx               # Remove account selection
app/components/InviteModal.tsx              # Role labels
app/api/teams/invite/route.ts              # Role validation text
```

#### Changes:
- `manager` → "TA" (UI display only)
- `member` → "Student" (UI display only)
- `teams` → "Classrooms" (UI labels)
- Remove account selection from portfolio selection flow

#### Role Mapping:
- **Owner** → **Teacher (Professor)** (UI only)
- **Manager** → **TA** (UI only)
- **Rep** → **Student** (UI only)
- **Admin** → **Platform Admin** (unchanged)

---

### Phase 2: Remove Account System (2 days)
**Remove account-related code and UI entirely**

#### 🚨 MASSIVE IMPACT - Account system used extensively:
- **Chat System**: `app/contexts/ChatContext.tsx` - Account filtering in chat history
- **Assistant Creation**: `app/api/assistants/create-dynamic/` - Account context required
- **Knowledge Generation**: `app/services/knowledge-md-service.ts` - Account-based knowledge
- **UI Components**: Account selection throughout navigation flow

#### Files to Delete:
```
app/edit/accounts/                         # Entire directory
app/api/teams/accounts/                    # Entire directory  
app/services/inventory-vector-service.ts
```

#### Files to Modify (CRITICAL):
```
app/launcher/select/page.tsx               # Remove account selection step
app/components/AssistantSelectModal.tsx    # Remove account selection
app/api/assistants/create-dynamic/         # Remove accountId parameter
app/launcher/team/page.tsx                 # Remove account management button
app/contexts/ChatContext.tsx               # Remove account filtering
app/services/knowledge-md-service.ts      # Remove account-based knowledge
```

#### 🔍 SEARCH PATTERNS TO FIND ALL ACCOUNT USAGES:
```bash
# Find all account_id references
grep -r "account_id" --include="*.tsx" --include="*.ts" app/
grep -r "accountId" --include="*.tsx" --include="*.ts" app/

# Find all team_accounts references
grep -r "team_accounts" --include="*.tsx" --include="*.ts" app/
grep -r "account_portfolios" --include="*.tsx" --include="*.ts" app/
```

#### Database Strategy:
- Keep `team_accounts` table (don't drop yet)
- Remove all account-related API calls
- Update assistant creation to skip account step
- Direct portfolio → chat flow

---

### Phase 3: Remove Safe Mode (1 day)
**Remove safe mode functionality, keep core document processing**

#### Files to Delete:
```
app/api/chat/safe-mode/                    # Safe mode chat endpoint
app/safemode/                              # Safe mode UI
app/services/vectorization-service.ts      # Safe mode vectorization
```

#### Files to Modify:
```
app/api/cron/process-documents/route.ts    # Remove vectorization step
app/api/trigger-cron/route.ts              # Remove vectorization step
app/launcher/team/page.tsx                 # Remove safe mode button
```

#### Keep Intact:
- LlamaParse processing with page breaks (`\n<<{pageNumber}>>\n`)
- Page marker insertion (`--- Page N ---` every 400 tokens)
- OpenAI file upload
- Citation system in chat responses

---

### Phase 4: Remove Medical Management (1 day)
**Remove surgeon and inventory management**

#### Files to Delete:
```
app/edit/surgeons/                         # Entire directory
app/edit/inventory/                        # Entire directory
app/api/teams/inventory/                   # Entire directory
```

#### Files to Modify:
```
app/launcher/team/page.tsx                 # Remove surgeon/inventory buttons
```

---

### Phase 5: Simplify Document Processing (1 day)
**Streamline the processing pipeline**

#### Current Flow:
```
PDF Upload → LlamaParse → Job Queue → Cron → Screenshots → Page Markers → OpenAI → Vector Store
```

#### New Flow:
```
PDF Upload → LlamaParse → Job Queue → Cron → Page Markers → OpenAI
```

#### Changes:
- Remove screenshot processing from cron jobs
- Remove vectorization step from cron jobs
- Keep page marker insertion for citations
- Keep OpenAI file upload
- Maintain citation system functionality

---

### Phase 6: Update Navigation Flow (1 day)
**Simplify user experience**

#### Current Flow:
```
Home → Team Dashboard → Portfolio/Account Selection → Chat
```

#### New Flow:
```
Home → Classroom Dashboard → Portfolio Selection → Chat
```

#### Changes:
- Remove account selection step
- Update dashboard buttons (remove surgeons, inventory, accounts)
- Keep portfolio management
- Keep member management
- Direct portfolio → chat path

---

## Key Technical Details

### Citation System (Preserved)
The citation system works through:
1. **LlamaParse page separators**: `\n<<{pageNumber}>>\n`
2. **Custom page markers**: `--- Page N ---` (added every 400 tokens)
3. **OpenAI citation extraction**: Extracts page numbers from both formats
4. **SourceExtractionService**: Processes chat responses for page references

### Document Processing (Simplified)
- **Keep**: LlamaParse processing, page markers, OpenAI upload
- **Remove**: Screenshot processing, vectorization, safe mode search
- **Maintain**: Citation functionality in chat responses

### Database Strategy
**⚠️ CRITICAL: Do NOT modify database schema until Phase 5+**
**Phase 1-4**: UI-only changes, no database modifications
**Phase 5+**: Consider dropping unused tables after stable rollout

#### Tables to Keep:
- `teams` (classrooms)
- `team_portfolios` (materials)
- `team_members` (classroom members)
- `team_documents` (uploaded files)
- `processing_jobs` (document processing)

#### Tables to Consider Dropping Later:
- `team_accounts` (after account system removal)
- `account_portfolios` (after account system removal)

#### 🚨 Database Schema Changes (Phase 5+ Only):
```sql
-- REMOVE TABLES
DROP TABLE public.account_portfolios;
DROP TABLE public.team_accounts;

-- REMOVE COLUMNS
ALTER TABLE public.chat_history DROP COLUMN account_id;
ALTER TABLE public.message_ratings DROP COLUMN account_id;
ALTER TABLE public.notes DROP COLUMN account_id;
ALTER TABLE public.team_assistants DROP COLUMN account_id;
ALTER TABLE public.team_knowledge DROP COLUMN account_id;
ALTER TABLE public.team_knowledge DROP COLUMN account_name;
ALTER TABLE public.team_knowledge DROP COLUMN category;
ALTER TABLE public.team_documents DROP COLUMN document_type;
```

---

## Expected Outcomes

### Benefits:
1. **Simplified Onboarding**: Direct classroom → materials → chat flow
2. **Cleaner UI**: Remove medical terminology and complex account system
3. **Faster Processing**: Remove screenshot and vectorization overhead
4. **Maintained Citations**: Keep working page number system
5. **Educational Focus**: Teacher/TA/Student vocabulary throughout

### User Experience:
- **Teachers**: Create classrooms, upload materials, manage students
- **TAs**: Assist with classroom management, same permissions as current managers
- **Students**: Join classrooms, access materials, chat with AI
- **Simplified Flow**: No account selection, direct portfolio → chat

---

## Implementation Timeline

**Total Estimated Time**: 6-8 days (due to massive refactor scope)

1. **Day 1**: Role vocabulary updates
2. **Day 2-4**: Remove account system (MASSIVE - affects chat, assistants, knowledge)
3. **Day 5**: Remove safe mode
4. **Day 6**: Remove medical management
5. **Day 7**: Simplify document processing and update navigation
6. **Day 8**: Database schema changes (Phase 5+)

## 🚨 Critical Implementation Notes

### For New Agent Starting Fresh:
1. **Read this entire plan first** - understand the massive scope
2. **Start with Phase 1 only** - UI vocabulary changes
3. **Test each phase thoroughly** before proceeding
4. **Do NOT modify database schema until Phase 5+**
5. **Use the search patterns provided** to find all usages
6. **Account system removal is the biggest challenge** - affects core functionality

### Key Files to Understand Before Starting:
- `app/contexts/ChatContext.tsx` - Chat filtering logic
- `app/api/assistants/create-dynamic/` - Assistant creation
- `app/services/knowledge-md-service.ts` - Knowledge generation
- `app/launcher/select/page.tsx` - Navigation flow

This plan maintains core functionality while dramatically simplifying the system for educational use. The citation system remains intact, and the document processing pipeline is streamlined but still functional.
