# New Team-Based Notes System

## Overview

The new notes system automatically scopes notes to the exact team context (Team → Account → Portfolio) based on the user's current chat session, eliminating manual selection and ensuring perfect context relevance.

## Key Improvements

### Before (Old System)
- ❌ Manual portfolio selection required
- ❌ Manual account/team tags required  
- ❌ Notes could appear in wrong contexts
- ❌ Confusing UI with multiple dropdowns
- ❌ Cross-contamination between different teams

### After (New System)
- ✅ **Automatic context detection** from active chat
- ✅ **Simplified UI** - no dropdowns or tags
- ✅ **Perfect note scoping** - notes only appear in relevant contexts
- ✅ **Intuitive sharing** - users know exactly who sees their notes
- ✅ **Backward compatible** - old individual notes still work

## User Flow

### 1. Starting a Team Chat
```
User selects: Team Malvern → Malvern Hospital → Hip Portfolio
```

### 2. Creating a Note
- User clicks "Add Note" in sidebar
- Modal shows: **"Adding to: Team Malvern → Malvern Hospital → Hip Portfolio"**
- User only needs to fill:
  - Title
  - Content  
  - Images (optional)
  - Share toggle

### 3. Note Visibility
- **Private notes**: Only visible to the creator in this exact context
- **Shared notes**: Visible to ALL users in this exact Team + Account + Portfolio combination
- **Legacy notes**: Old individual portfolio notes still work as before

### 4. Note Context Injection
Notes automatically appear in chat context when:
- User is chatting in the **exact same** Team + Account + Portfolio
- Note was created for that specific context
- User has access (own notes + shared notes)

## Technical Architecture

### Database Schema

```sql
-- Notes table with team context
CREATE TABLE notes (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  
  -- New team context columns
  team_id UUID REFERENCES teams(id),
  account_id UUID REFERENCES team_accounts(id), 
  portfolio_id UUID REFERENCES team_portfolios(id),
  
  -- Legacy individual note support
  portfolio_type TEXT, -- 'hip', 'knee', 'ts_knee', 'general'
  
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  images JSONB DEFAULT '[]',
  is_shared BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Context Resolution Logic

```typescript
// Team-based notes (new system)
if (teamId && accountId && portfolioId) {
  notes = await getNotesForTeamContext(teamId, accountId, portfolioId, userId);
}
// Individual notes (legacy system)
else if (portfolioType) {
  notes = await getNotesForPortfolio(portfolioType, userId);
}
```

### Note Filtering Query

```sql
-- Get notes for specific team context
SELECT * FROM notes 
WHERE team_id = ?
  AND account_id = ? 
  AND portfolio_id = ?
  AND (user_id = ? OR is_shared = true)
ORDER BY created_at DESC;
```

## API Endpoints

### Creating Notes

**POST `/api/notes/create`**

**Team Context (New):**
```javascript
FormData:
- team_id: "uuid-123"
- account_id: "uuid-456" 
- portfolio_id: "uuid-789"
- title: "Note title"
- content: "Note content"
- is_shared: "true"
```

**Legacy Context (Backward Compatible):**
```javascript
FormData:
- portfolio_type: "hip"
- title: "Note title"
- content: "Note content"
- is_shared: "false"
- tags: {"account": "Wilmington", "team": "Southeast"}
```

### Chat Integration

**POST `/api/chat/send`**

```javascript
{
  "threadId": "thread-123",
  "message": "What instruments do we need?",
  "teamId": "uuid-123",      // Team context
  "accountId": "uuid-456",   // Account context  
  "portfolioId": "uuid-789", // Portfolio context
  "assistantId": "asst-xyz"
}
```

## Component Architecture

### NoteModal Updates
```typescript
interface NoteModalProps {
  teamContext?: {
    teamId: string;
    teamName: string;
    accountId: string; 
    accountName: string;
    portfolioId: string;
    portfolioName: string;
  } | null;
}

// UI shows context instead of dropdowns
{isTeamNote && teamContext ? (
  <div>Adding to: {teamContext.teamName} → {teamContext.accountName} → {teamContext.portfolioName}</div>
) : (
  <select>/* Portfolio dropdown for legacy */</select>
)}
```

### Context Flow
```
ChatInterface (activeAssistant) 
  → Sidebar (teamContext)
    → NotesSection (teamContext)  
      → NoteModal (teamContext)
```

## Sharing Logic

### Exact Context Matching
A shared note appears in context **only when**:
- User is in **same team**
- User is in **same account** 
- User is in **same portfolio**

### Example Scenarios

**✅ Note Appears:**
```
Note created in: Team Malvern → Hospital A → Hip
User chatting in: Team Malvern → Hospital A → Hip
Result: Note appears in context
```

**❌ Note Does NOT Appear:**
```
Note created in: Team Malvern → Hospital A → Hip  
User chatting in: Team Malvern → Hospital A → Knee
Result: Note does NOT appear (different portfolio)
```

```
Note created in: Team Malvern → Hospital A → Hip
User chatting in: Team Malvern → Hospital B → Hip  
Result: Note does NOT appear (different account)
```

## Migration & Backward Compatibility

### Database Migration
```sql
-- Add new columns (nullable for backward compatibility)
ALTER TABLE notes 
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES team_accounts(id),
ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES team_portfolios(id);

-- Add indexes for performance
CREATE INDEX idx_notes_team_context 
ON notes(team_id, account_id, portfolio_id);
```

### Legacy Note Support
- **Existing notes**: Continue working with `portfolio_type` and tags
- **New individual notes**: Still supported for non-team users
- **Mixed usage**: Team and individual notes can coexist

### Data Format Evolution
```typescript
// Legacy note
{
  portfolio_type: "hip",
  tags: {account: "Wilmington", team: "Southeast"}
}

// New team note  
{
  team_id: "uuid-123",
  account_id: "uuid-456", 
  portfolio_id: "uuid-789"
}
```

## Benefits Summary

### For Users
- **Simplified creation** - no manual context selection
- **Relevant notes only** - no clutter from other contexts
- **Predictable sharing** - clear understanding of who sees notes
- **Faster workflow** - less clicks, less confusion

### For System
- **Precise filtering** - exact database queries
- **Better performance** - indexed lookups  
- **Cleaner architecture** - no string-based tag matching
- **Scalable design** - supports multiple teams/accounts cleanly

### For Administrators  
- **Clear data boundaries** - team knowledge stays within team
- **Audit trail** - exact context tracking
- **Permission inheritance** - follows team/account access patterns
- **Data integrity** - foreign key constraints ensure valid references

## Future Enhancements

### Potential Additions
- **Note templates** scoped to team contexts
- **Bulk note operations** within contexts
- **Note categories** within team scopes
- **Advanced sharing controls** (manager-only notes, etc.)
- **Note analytics** by team/account/portfolio
- **Cross-context note linking** (with explicit permissions)

The new system provides a solid foundation for team-based knowledge management while maintaining full backward compatibility with existing individual notes. 