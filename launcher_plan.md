# HHB RAG Assistant - Launcher Implementation Plan

## 🎯 Overview
Build a team management launcher layer that sits BEFORE the existing chat UI. Managers create teams, upload PDFs, define custom portfolios, invite members, and create team knowledge sheets. Everything gets processed into OpenAI assistants that the team can then access through the existing chat interface.

## 🏗️ Database Schema Changes

### New Tables

```sql
-- Teams (organizations/territories)
CREATE TABLE teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  general_knowledge_vector_store_id TEXT, -- OpenAI vector store for general team knowledge
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Custom portfolios per team (not hardcoded)
CREATE TABLE team_portfolios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- "Hip", "Knee Revision", etc. (manager defined)
  description TEXT,
  assistant_id TEXT, -- OpenAI assistant ID
  vector_store_id TEXT, -- OpenAI vector store ID
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, name) -- No duplicate portfolio names per team
);

-- Team membership with roles
CREATE TABLE team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('manager', 'member')),
  invited_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, user_id) -- One membership per user per team
);

-- Team-uploaded documents
CREATE TABLE team_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES team_portfolios(id) ON DELETE CASCADE,
  filename TEXT NOT NULL, -- Storage filename
  original_name TEXT NOT NULL, -- User-provided filename
  file_path TEXT NOT NULL, -- Supabase storage path
  openai_file_id TEXT, -- OpenAI file ID after upload
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Team accounts (hospitals, practices, etc.)
CREATE TABLE team_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- "Mercy Hospital", "Malvern Practice"
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, name) -- No duplicate account names per team
);

-- Account-Portfolio assignments (which portfolios are used at each account)
CREATE TABLE account_portfolios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID REFERENCES team_accounts(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES team_portfolios(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(account_id, portfolio_id) -- One assignment per account-portfolio pair
);

-- Account-Portfolio Vector Stores (knowledge specific to account+portfolio combination)
CREATE TABLE account_portfolio_stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  account_id UUID REFERENCES team_accounts(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES team_portfolios(id) ON DELETE CASCADE,
  vector_store_id TEXT NOT NULL, -- OpenAI vector store ID
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(account_id, portfolio_id) -- One store per account-portfolio combination
);

-- Team knowledge base (for account-specific and general knowledge)
CREATE TABLE team_knowledge (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  account_id UUID REFERENCES team_accounts(id) ON DELETE CASCADE, -- NULL = general knowledge
  portfolio_id UUID REFERENCES team_portfolios(id) ON DELETE SET NULL, -- NULL = general knowledge
  category TEXT NOT NULL CHECK (category IN ('inventory', 'instruments', 'access_misc', 'doctor_info', 'technical')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  images JSONB, -- Array of image objects with descriptions [{url: "", description: ""}]
  metadata JSONB, -- For quantities, line items, etc.
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Assistant configurations (cached assistants for team+account+portfolio combinations)
CREATE TABLE team_assistants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  account_id UUID REFERENCES team_accounts(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES team_portfolios(id) ON DELETE CASCADE,
  assistant_id TEXT NOT NULL, -- OpenAI assistant ID
  general_vector_store_id TEXT NOT NULL, -- Team general knowledge
  account_portfolio_vector_store_id TEXT NOT NULL, -- Account-portfolio specific knowledge
  portfolio_vector_store_id TEXT NOT NULL, -- Portfolio PDFs
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, account_id, portfolio_id) -- One assistant per configuration
);

-- RLS Policies
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_knowledge ENABLE ROW LEVEL SECURITY;

-- Users can only access teams they're members of
CREATE POLICY "Team members can access their teams" ON teams
  FOR ALL USING (
    id IN (
      SELECT team_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Similar policies for other tables...
```

### Indexes
```sql
CREATE INDEX idx_teams_created_by ON teams(created_by);
CREATE INDEX idx_team_portfolios_team_id ON team_portfolios(team_id);
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_documents_team_id ON team_documents(team_id);
CREATE INDEX idx_team_documents_portfolio_id ON team_documents(portfolio_id);
CREATE INDEX idx_team_knowledge_team_id ON team_knowledge(team_id);
CREATE INDEX idx_team_knowledge_portfolio_id ON team_knowledge(portfolio_id);
```

## 🎨 Frontend Architecture

### New Pages Structure
```
/launcher (Protected - only accessible by managers and team members)
├── /team-setup (Manager only - initial team creation)
├── /portfolios (Manager only - create/edit custom portfolios)
├── /documents (Manager only - upload PDFs per portfolio)
├── /team-members (Manager only - invite/manage members)
├── /knowledge (Manager only - create team knowledge sheets)
│   ├── /general (General team knowledge)
│   └── /[portfolio-id] (Portfolio-specific knowledge)
├── /finalize (Manager only - generate AI assistants)
└── /view (Team members - view team info, access chat)

/chat (Existing - enhanced with team context)
```

### User Flows

#### Manager Flow: Complete Team Creation & Population

**1. Admin Invitation**
- HHB admin creates team via admin panel
- Manager receives email invitation to become team owner
- Manager signs up/logs in → automatically becomes original manager

**2. Team Setup → Portfolio Creation & PDF Upload** `/launcher/portfolios`
```
Manager Interface:
┌─ Create Portfolios ─┐
│ Portfolio 1: [Hip_______________] │
│ PDFs: [Drag & Drop Area       ] │
│       - Hip_accolade.pdf       │
│       - Hip_insignia.pdf       │
│                                │
│ Portfolio 2: [Knee Revision____] │ 
│ PDFs: [Drag & Drop Area       ] │
│       - Knee_triathlon.pdf     │
│                                │
│ [+ Add Portfolio] [Next Step →] │
└────────────────────────────────┘
```
**Backend Action:** Click "Next" → PDFs upload to Supabase → Creates portfolio vector stores in OpenAI → Stores IDs in `team_portfolios`

**3. Account Creation & Knowledge Population** `/launcher/accounts`
```
Manager Interface:
┌─ Create Accounts & Knowledge ──────────────┐
│ Account: [Mercy Hospital_______________]   │
│ Portfolios at this account:               │
│ ☑ Hip  ☑ Knee Revision  ☐ Shoulder       │
│                                           │
│ ── Hip Portfolio Knowledge at Mercy ──    │
│ Inventory:                                │
│ • [Tray 1____] Qty: [5] Notes: [____]    │
│ • [Hip Implant A] Qty: [10] [+ Add]      │
│                                           │
│ Instruments:                              │
│ • [Hip Tray Set A________________]        │
│   Description: [Primary instruments...]   │
│   Photo: [Upload Image] (optional)        │
│                                           │
│ ── Knee Revision Knowledge at Mercy ──   │
│ [Same structure...]                       │
│                                           │
│ [+ Add Account] [Next Step →]             │
└───────────────────────────────────────────┘
```
**Backend Action:** Click "Next" → Generates text files for each account-portfolio combo → Creates vector stores → Stores in `account_portfolio_stores`

**4. General Team Knowledge** `/launcher/general`
```
Manager Interface:
┌─ General Team Knowledge ─┐
│ Doctor Information:      │
│ • [Dr. Smith Preferences_] │
│   [Prefers morning surg...] │
│                           │
│ Access & Misc:            │
│ • [Mercy Hospital Access_] │
│   [Door code 1234, lot B_] │
│                           │
│ [+ Add Entry] [Finalize]  │
└───────────────────────────┘
```
**Backend Action:** Click "Finalize" → Creates general knowledge text file → Creates general vector store → Stores in `teams` table

**5. Team Member Invites** `/launcher/team-members`
```
Manager Interface:
┌─ Invite Team Members ────┐
│ Email: [rep1@company.com] │
│ Role: [○ Manager ● Member] │
│ [Send Invite]             │
│                           │
│ Current Members:          │
│ • manager@hhb.com (Owner) │
│ • rep1@company.com (Memb) │
│ • rep2@company.com (Mgr)  │
│ [+ Invite More]           │
└───────────────────────────┘
```

#### Team Member Flow: Using the Created Team

**1. Invitation & Onboarding**
- User receives email invitation
- Clicks link → Signs up/logs in → Automatically joins team

**2. Team Selection** (if member of multiple teams)
```
User Interface:
┌─ Select Team ─────────┐
│ ● Atlanta Team        │
│ ○ Dallas Team         │
│ ○ Miami Team          │
│ [Continue →]          │
└───────────────────────┘
```
*Note: Team names are location-based as entered by manager during creation*

**3. Account Selection**
```
User Interface:
┌─ Select Account ──────────┐
│ Available Accounts:       │
│ ● Mercy Hospital          │
│ ○ Malvern Practice        │
│ ○ St. Mary's Surgery Ctr  │
│ [Continue →]              │
└───────────────────────────┘
```

**4. Portfolio Selection** 
```
User Interface:
┌─ Portfolios at Mercy Hospital ─┐
│ Available Portfolios:           │
│ ● Hip                          │
│ ○ Knee Revision               │
│ [Enter Chat →]                 │
└────────────────────────────────┘
```

**5. Chat Interface** 
```
Chat Interface:
┌─ Atlanta Team - Mercy Hospital - Hip ─┐
│ 🤖 Assistant ready with:              │
│    • Hip portfolio PDFs                │
│    • Mercy Hospital hip knowledge      │
│    • Atlanta team general knowledge    │
│                                        │
│ User: "Do we have Tray 1 at Mercy?"   │
│ Assistant: "Yes, we have 5 units of   │
│ Tray 1 at Mercy Hospital according    │
│ to our inventory records..."           │
│                                        │
│ [Type message...] [Send]               │
└────────────────────────────────────────┘
```

**Backend Magic:**
1. System checks: Does assistant exist for (Atlanta + Mercy + Hip)?
2. If yes: Load existing assistant
3. If no: Create new assistant combining:
   - General vector store: "Atlanta Team - General Knowledge"  
   - Account-portfolio store: "Mercy Hospital - Hip Knowledge"
   - Portfolio store: "Atlanta Team - Hip Portfolio PDFs"
4. Cache assistant in `team_assistants` table
5. Load chat with this combined assistant

### Component Architecture

```typescript
// New components needed
/launcher
├── TeamSetupForm.tsx
├── PortfolioManager.tsx
├── DocumentUploader.tsx
├── TeamMemberManager.tsx
├── KnowledgeSheetEditor.tsx
├── GeneralKnowledgeForm.tsx
├── PortfolioKnowledgeForm.tsx
├── InventoryLineItem.tsx
├── AssistantGenerator.tsx
└── TeamDashboard.tsx

// Enhanced existing components
/chat
├── ChatInterface.tsx (portfolio selection from team portfolios)
└── Sidebar.tsx (show team context)
```

## 📝 Team Knowledge Sheets Implementation

### Knowledge Sheet Categories

#### General Knowledge Sheet
```typescript
interface GeneralKnowledge {
  doctorInfo: {
    title: string;
    content: string;
  }[];
  accessMisc: {
    title: string; // "Memorial Hospital Access"
    content: string; // "Door code: 1234, Park in lot B"
  }[];
  other: {
    title: string;
    content: string;
  }[];
}
```

#### Portfolio-Specific Knowledge Sheet
```typescript
interface PortfolioKnowledge {
  inventory: {
    itemName: string; // "Tray 1"
    quantity: number; // 5
    notes?: string;
  }[];
  instruments: {
    name: string; // "Hip Tray Set A"
    description: string;
    images?: {
      url: string;
      description: string;
    }[];
  }[];
  technicalInfo: {
    title: string;
    content: string;
  }[];
}
```

### Knowledge Sheet UI

#### General Knowledge Form
```typescript
// Manager sees form like:
Doctor Information:
[+ Add Doctor Entry]
  Title: [Dr. Smith Preferences]
  Content: [Prefers morning surgeries, uses XYZ technique...]

Access & Misc:
[+ Add Access Entry]
  Title: [Memorial Hospital]
  Content: [Door code 1234, park in lot B, vendor credentialing required...]
```

#### Portfolio Knowledge Form
```typescript
// For each portfolio, manager sees:
Inventory (Line by Line):
[+ Add Inventory Item]
  Item Name: [Tray 1]
  Quantity: [5]
  Notes: [Optional notes]

Instruments:
[+ Add Instrument]
  Name: [Hip Tray Set A]
  Description: [Contains primary hip instruments...]
  Photos: [Upload images - same as notes system]

Technical Information:
[+ Add Technical Entry]
  Title: [Hip Replacement Protocol]
  Content: [Technical device information...]
```

### Text File Generation

#### Process
1. **Collect all knowledge entries** for portfolio
2. **Format as structured text**:

```text
=== ATLANTA TEAM - HIP PORTFOLIO KNOWLEDGE ===

INVENTORY:
- Tray 1: Quantity 5
- Tray 2: Quantity 3  
- Hip Implant A: Quantity 10
- Hip Implant B: Quantity 7

INSTRUMENTS:
- Hip Tray Set A: Contains primary hip instruments for standard procedures
  [IMAGE: Hip Tray Set A - /api/images/hip_tray_a.jpg]
- Hip Tray Set B: Contains revision instruments
  [IMAGE: Hip Tray Set B - /api/images/hip_tray_b.jpg]

TECHNICAL INFORMATION:
- Hip Replacement Protocol: Standard protocol involves...
- Device Specifications: Our hip devices feature...

GENERAL TEAM KNOWLEDGE:
- Dr. Smith: Prefers morning surgeries, uses XYZ technique
- Memorial Hospital Access: Door code 1234, park in lot B, vendor credentialing required
```

3. **Save as .txt file** in Supabase storage
4. **Upload to OpenAI** like any other file

## 🤖 AI Assistant & Vector Store Architecture

### Three Types of Vector Stores

1. **Portfolio Vector Stores** - PDFs for each portfolio (Hip, Knee Revision, etc.)
2. **Account-Portfolio Vector Stores** - Account-specific knowledge (Mercy Hip, Malvern Knee Revision, etc.)  
3. **Team General Vector Store** - General team knowledge (parking, credentials, etc.)

### Vector Store Creation Process & Naming

**Stage 1: Portfolio PDFs (During Portfolio Setup)**
- Manager creates portfolios and uploads PDFs
- System creates one vector store per portfolio with all assigned PDFs
- **Naming Convention:** `{TeamName} - {PortfolioName} PDFs`
- Store both `vector_store_id` (OpenAI ID) and `vector_store_name` (semantic) in team_portfolios table

**Stage 2: Account-Portfolio Knowledge (During Account Setup)**
- Manager creates accounts and assigns portfolios to accounts
- Manager populates account-specific knowledge per portfolio
- System creates vector store for each account-portfolio combination
- **Naming Convention:** `{AccountName} - {PortfolioName} Knowledge`
- Generate text files: "Mercy Hip Knowledge.txt", "Malvern Knee Revision Knowledge.txt"
- Store both `vector_store_id` (OpenAI ID) and `vector_store_name` (semantic) in account_portfolio_stores table

**Stage 3: Team General Knowledge (Final Setup)**
- Manager populates general team information
- System creates one general knowledge vector store
- **Naming Convention:** `{TeamName} - General Knowledge`
- Generate text file: "Team General Knowledge.txt"
- Store both `general_knowledge_vector_store_id` (OpenAI ID) and `general_knowledge_vector_store_name` (semantic) in teams table

### OpenAI ID vs Semantic Name Storage

**Two-Column Approach:**
- **ID Column:** Exact OpenAI vector store ID (returned after creation) - used for API calls
- **Name Column:** Human-readable semantic description - used for UI display and debugging

**Example:**
```sql
-- Portfolio vector store
vector_store_id: "vs_abc123xyz789"
vector_store_name: "Atlanta Team - Hip Portfolio PDFs"

-- Account-portfolio vector store  
vector_store_id: "vs_def456uvw012"
vector_store_name: "Mercy Hospital - Hip Knowledge"

-- Team general knowledge
general_knowledge_vector_store_id: "vs_ghi789rst345"
general_knowledge_vector_store_name: "Atlanta Team - General Knowledge"
```

### Dynamic Assistant Creation

**User Flow:**
1. User selects team → sees accounts → selects account + portfolio
2. System collects relevant vector store IDs:
   - Team general knowledge vector store
   - Account-portfolio specific vector store  
   - Portfolio PDFs vector store
3. System checks if this configuration exists in assistants table
4. If exists: Load existing assistant
5. If new: Create assistant with combined vector stores, save configuration

### Implementation Code Flow

```typescript
// Stage 1: Create Portfolio Vector Stores (During Setup)
async function createPortfolioVectorStores(teamId: string) {
  const portfolios = await getTeamPortfolios(teamId);
  
  for (const portfolio of portfolios) {
    const pdfs = await getPortfolioPDFs(portfolio.id);
    
    const vectorStore = await client.vector_stores.create({
      name: `${teamName} - ${portfolio.name} PDFs`
    });
    
    const fileIds = pdfs.map(p => p.openai_file_id);
    await client.vector_stores.file_batches.create_and_poll(
      vectorStore.id,
      { file_ids: fileIds }
    );
    
    await updatePortfolio(portfolio.id, {
      vector_store_id: vectorStore.id
    });
  }
}

// Stage 2: Create Account-Portfolio Vector Stores
async function createAccountPortfolioVectorStores(teamId: string) {
  const accounts = await getTeamAccounts(teamId);
  
  for (const account of accounts) {
    const portfolios = await getAccountPortfolios(account.id);
    
    for (const portfolio of portfolios) {
      const knowledgeText = await generateAccountPortfolioKnowledge(account.id, portfolio.id);
      
      const knowledgeFile = await client.files.create({
        file: fs.createReadStream(knowledgeText.path),
        purpose: 'assistants'
      });
      
      const vectorStore = await client.vector_stores.create({
        name: `${account.name} - ${portfolio.name} Knowledge`
      });
      
      await client.vector_stores.file_batches.create_and_poll(
        vectorStore.id,
        { file_ids: [knowledgeFile.id] }
      );
      
      await saveAccountPortfolioStore({
        team_id: teamId,
        account_id: account.id,
        portfolio_id: portfolio.id,
        vector_store_id: vectorStore.id
      });
    }
  }
}

// Stage 3: Create General Knowledge Vector Store
async function createGeneralKnowledgeVectorStore(teamId: string) {
  const generalKnowledge = await generateGeneralKnowledgeText(teamId);
  
  const knowledgeFile = await client.files.create({
    file: fs.createReadStream(generalKnowledge.path),
    purpose: 'assistants'
  });
  
  const vectorStore = await client.vector_stores.create({
    name: `${teamName} - General Knowledge`
  });
  
  await client.vector_stores.file_batches.create_and_poll(
    vectorStore.id,
    { file_ids: [knowledgeFile.id] }
  );
  
  await updateTeam(teamId, {
    general_knowledge_vector_store_id: vectorStore.id
  });
}

// Dynamic Assistant Creation (When User Selects Configuration)
async function getOrCreateAssistant(teamId: string, accountId: string, portfolioId: string) {
  // Check if assistant already exists for this configuration
  const existingAssistant = await findAssistant(teamId, accountId, portfolioId);
  if (existingAssistant) {
    return existingAssistant.assistant_id;
  }
  
  // Gather vector store IDs
  const generalStoreId = await getTeamGeneralVectorStore(teamId);
  const accountPortfolioStoreId = await getAccountPortfolioVectorStore(accountId, portfolioId);
  const portfolioStoreId = await getPortfolioVectorStore(portfolioId);
  
  // Create new assistant with all relevant vector stores
  const assistant = await client.beta.assistants.create({
    name: `${teamName} - ${accountName} - ${portfolioName} Assistant`,
    instructions: `You are an expert assistant with access to team knowledge, account-specific information, and portfolio documentation...`,
    model: 'gpt-4o',
    tools: [{ type: 'file_search' }],
    tool_resources: {
      file_search: {
        vector_store_ids: [generalStoreId, accountPortfolioStoreId, portfolioStoreId]
      }
    }
  });
  
  // Save assistant configuration
  await saveAssistantConfiguration({
    team_id: teamId,
    account_id: accountId,
    portfolio_id: portfolioId,
    assistant_id: assistant.id,
    general_vector_store_id: generalStoreId,
    account_portfolio_vector_store_id: accountPortfolioStoreId,
    portfolio_vector_store_id: portfolioStoreId
  });
  
  return assistant.id;
}
```

## 🔄 Chat Interface Integration

### Simplified Chat Interface

#### No Portfolio Selection in Chat
- User already selected team → account → portfolio before entering chat
- Chat loads directly with the appropriate assistant
- No portfolio switching within chat interface

#### Assistant Resolution
```typescript
// User selects team+account+portfolio in launcher, then enters chat
const getAssistantForConfiguration = async (teamId: string, accountId: string, portfolioId: string) => {
  // Check if assistant already exists for this configuration
  const existingAssistant = await findTeamAssistant(teamId, accountId, portfolioId);
  if (existingAssistant) {
    return existingAssistant.assistant_id;
  }
  
  // Create new assistant with combined vector stores
  return await getOrCreateAssistant(teamId, accountId, portfolioId);
};
```

### Team-Scoped Notes Integration

#### Backend Notes Filtering
```typescript
// Before: Frontend filtered all user notes
const getUserNotes = async (userId: string) => {
  return await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId);
};

// After: Backend filters by team and portfolio context
const getTeamContextNotes = async (userId: string, teamId: string, portfolioId: string) => {
  return await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .and(
      or(
        `portfolio_type.eq.general`,
        `portfolio_type.eq.${portfolioId}`
      )
    )
    .eq('team_id', teamId); // New team scoping
};
```

#### Notes Context for AI
```typescript
// Only pass relevant notes to AI context
const getNotesContext = async (userId: string, teamId: string, portfolioId: string) => {
  const userNotes = await getTeamContextNotes(userId, teamId, portfolioId);
  const sharedTeamNotes = await getSharedTeamNotes(teamId, portfolioId);
  
  return formatNotesForContext([...userNotes, ...sharedTeamNotes]);
};
```

## 👨‍💼 **HHB Admin Panel**

### Admin Interface for Team Creation

```typescript
// New admin-only pages
/admin (Protected - HHB credentials only)
├── /dashboard (Overview of all teams)
├── /create-team (Create team + invite original manager)
├── /manage-teams (View/edit existing teams)
└── /analytics (Usage statistics)
```

### Admin Database Schema

```sql
-- Admin users table
CREATE TABLE admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add original_manager flag to team_members
ALTER TABLE team_members ADD COLUMN is_original_manager BOOLEAN DEFAULT FALSE;
```

### Admin Workflow

1. **HHB Admin Login** → Admin dashboard
2. **Create New Team** → Enter team details + original manager email
3. **System Actions**:
   - Creates team record
   - Creates pending team_member record with `is_original_manager = true`
   - Sends special invitation email to original manager
4. **Original Manager** → Receives email → Signs up/logs in → Automatically becomes team owner

### Admin API Endpoints

```typescript
// Admin Authentication
POST /api/admin/login
POST /api/admin/logout

// Team Management
GET /api/admin/teams (list all teams)
POST /api/admin/teams/create (create team + invite original manager)
PUT /api/admin/teams/:teamId (update team details)
DELETE /api/admin/teams/:teamId (delete team - emergency only)

// Analytics
GET /api/admin/analytics (usage stats, team counts, etc.)
```

## 🔐 Security & Permissions

### Role-Based Access

```typescript
enum TeamRole {
  MANAGER = 'manager',
  MEMBER = 'member'
}

// Middleware to check team permissions
const requireTeamRole = (requiredRole: TeamRole) => {
  return async (req, res, next) => {
    const user = await getUser(req);
    const teamId = req.params.teamId;
    
    const membership = await getTeamMembership(user.id, teamId);
    if (!membership || membership.status !== 'active') {
      return res.status(403).json({ error: 'Not a team member' });
    }
    
    if (requiredRole === TeamRole.MANAGER && membership.role !== 'manager') {
      return res.status(403).json({ error: 'Manager access required' });
    }
    
    req.teamMembership = membership;
    next();
  };
};
```

### API Endpoints

```typescript
// Team Management (Manager only - Note: Initial team creation via admin panel)
PUT /api/teams/:teamId/update
GET /api/teams/:teamId

// Portfolio Management (Manager only)  
POST /api/teams/:teamId/portfolios
PUT /api/teams/:teamId/portfolios/:portfolioId
DELETE /api/teams/:teamId/portfolios/:portfolioId

// Document Management (Manager only)
POST /api/teams/:teamId/documents/upload
DELETE /api/teams/:teamId/documents/:documentId

// Team Members (Manager only)
POST /api/teams/:teamId/members/invite
PUT /api/teams/:teamId/members/:memberId/role
DELETE /api/teams/:teamId/members/:memberId

// Knowledge Management (Manager only)
POST /api/teams/:teamId/knowledge
PUT /api/teams/:teamId/knowledge/:knowledgeId
DELETE /api/teams/:teamId/knowledge/:knowledgeId

// AI Generation (Manager only)
POST /api/teams/:teamId/generate-assistants

// Team Access (All members)
GET /api/teams/:teamId/view
GET /api/teams/:teamId/portfolios (for chat)
```

## 📧 Invitation System

### Email Invitations

```typescript
interface TeamInvitation {
  email: string;
  teamId: string;
  role: TeamRole;
  invitedBy: string;
  token: string; // Unique invitation token
  expiresAt: Date;
}

const sendTeamInvitation = async (invitation: TeamInvitation) => {
  const inviteLink = `${process.env.APP_URL}/invite/${invitation.token}`;
  
  await sendEmail({
    to: invitation.email,
    subject: `You've been invited to join ${teamName}`,
    html: `
      <p>You've been invited to join the ${teamName} team.</p>
      <p>Click <a href="${inviteLink}">here</a> to accept the invitation.</p>
    `
  });
};
```

### Invitation Acceptance Flow
1. User clicks email link
2. If user doesn't exist, redirect to signup with pre-filled email
3. If user exists, redirect to login
4. After auth, automatically join team and redirect to launcher

## 🎯 Clarifying Questions

### 1. Team Knowledge Sheet Structure
- **Q**: Should inventory items have categories (implants vs instruments vs trays) or just be a flat list?
- **A**: yes
- **Q**: For line-by-line inventory, do we need additional fields like location, expiration date, or just name + quantity?
- **A**: the location should be known because you are populating it by account (so each account is defined then you can under that the inventroy (implants, instruments, trays))

### 2. Image Handling in Knowledge Sheets
- **Q**: Should tray photos be uploaded per inventory item, or as separate "instrument" entries?
- **A**: Tray photos can be uploaded per inventory item but of course they are optional, they are also stored in supabase storage just like how the images uploaded in notes are. so we give them a different look in the UI but in the backend they are stored the same, but one key is that in the team knowledge sheet we populate it with the image title and image path next to the tray text information
- **Q**: Do we need multiple images per tray/instrument, or just one?
- **A**: Just one is ok

### 3. Portfolio Management
- **Q**: Can managers edit/delete portfolios after AI assistants are generated, or should this be locked once finalized?
- **A**: They can, but it should be explicitly stated that they want to add information that will rarely change
- **Q**: Should there be a limit on number of portfolios per team?
- **A**: no

### 4. Team Member Permissions
- **Q**: Can there be multiple managers per team, or just one main manager?
- **A**: The original manager (We should be able to send them an invite as HHB) can also, when inviting team members, give certain emails manager permissions
- **Q**: Should managers be able to promote members to managers, or only invite new managers?
- **A**: yes they can promote or revoke manager access but the original manager (who gets invited by us -- don't worry about this invite yet) should be immutable 

### 5. Data Migration
- **Q**: What happens to existing individual users when they join a team? Do they lose access to their personal notes/chats?
-- **A**: When we deploy this version we will have everyone create a new account
- **Q**: Should there be an option to migrate individual portfolio data to team portfolios?
- **A**: no

### 6. Knowledge Sheet Updates
- **Q**: If managers update knowledge sheets after assistants are generated, how do we handle re-generation? Manual button click or automatic?
- **A**: In the rare case that the manager updataes the knowledge sheet, we will have to delete the matching knowledge sheet stored in OpenAI and upload this new one in place with the same name. When this happens it's triggered by a finish editing button or something like that in the UI and then the manager sees a loading screen that says a message like updating documents
- **Q**: Should we version knowledge sheets or just overwrite?
- **A**: see answer above

### 7. File Storage
- **Q**: Should team documents be stored in team-specific folders in Supabase storage?
- **A**: we are storing the team knowledge sheets in open ai, can you clarify what you mean by this?
- **Q**: What's the file size limit for team document uploads?
- **A**: 512 mb per file

### 8. Assistant Limits
- **Q**: OpenAI has limits on assistants per organization. How do we handle this at scale?
- **A**: don't worry about this right now
- **Q**: Should we have expiration policies on team vector stores to manage costs?
- **A**: 

### 9. Navigation
- **Q**: How does a user know if they're in "individual mode" vs "team mode"? 
- **A**: In the launcher for an invited user, they must click on their team (if they only have been invited to one team then there is only one option) and then that loads in the chat with the team knowledge (PDFs, team knowledge sheets from vector stores, shared notes). so there is no individual mode if that makes sense
- **Q**: Should there be a way to switch between teams if a user is a member of multiple teams?
- **A**: yes they can decide which team in the launcher

### 10. Team Deletion
- **Q**: What happens when a team is deleted? Do we delete all associated OpenAI assistants and vector stores?
- **A**: Only the original manager has the power to delete the team and when they click delete, should be kinda hard to find, maybe like a team settings tab that just containts delete team button, then if that is clicked then we warn them again with something like "are you sure you want to delete this team? This will delete all data and prevent usage from all team members. This action is irreversible."
- **Q**: Should team members get notified before team deletion?
- **A**: no

One more key note is that the shared notes now are shared across the full team BUT NOT across teams, so if team 1 member 1 shares a note, all members in team 1 see that in there note, but team 2 does not see the shared note from team 1 obviously

### **11. Account Structure & Inventory**
- **Q**: Should accounts be created as part of the team setup process, or should they be managed separately in the knowledge sheets?
- **A**: All of this (portfolio upload, account creation, inventory/trays for accounts, etc.) should all be in team setup process where the manager just takes their time to manually upload information
- **Q**: Do accounts need structured fields (name, address, contact info) or just free-text entries?
- **A**: Free-text entries
- **Q**: Can the same account (e.g., "Memorial Hospital") exist across multiple teams, or are they team-specific?
- **A**: Yes, they can exists across multiple teams but one team shouldn't be able to have two of the same accounts

### **12. Team Knowledge Sheet Organization**
- **Q**: Should the knowledge sheet UI be organized like this?
  ```
  General Knowledge:
  ├── Doctor Information
  └── Access & Misc
  
  Hip Portfolio Knowledge:
  ├── Memorial Hospital (Account)
  │   ├── Inventory (Implants: Item + Qty)
  │   ├── Instruments (Trays: Item + Qty + Optional Image)
  │   └── Technical Info
  ├── St. Mary's Hospital (Account)
  │   └── [Same structure]
  └── Technical Info (Portfolio-wide)
  ```
-**A**: Yes that looks good
### **13. Launcher Navigation Flow**
- **Q**: For invited users, is the flow:
  1. Login → See list of teams they're part of → Click team → Go to chat with team portfolios?
  2. Or: Login → Auto-select team (if only one) → Go to chat?
- **A**: Option 1

### **14. File Storage Clarification**
When I mentioned "team documents in Supabase storage," I meant:
- **Manager-uploaded PDFs** - Should these be stored in team-specific folders like `/team-{id}/documents/`?
- **Tray images from knowledge sheets** - Should these be stored like `/team-{id}/images/`?
- This would help organize files by team for easier management.
-**A**: The uploaded PDFs and knowledge sheets are stored in OpenAI when we make the vector stores (see how we make the vector stores now for the hardcoded PDFs as an example). We store the images in supabase storage under (this folder is used for all images, this shouldnt be a problem since paths are unique)
### **15. Knowledge Sheet Text File Format**
Based on account-based inventory, should the generated text file look like:
```text
=== ATLANTA TEAM - HIP PORTFOLIO KNOWLEDGE ===

MEMORIAL HOSPITAL:
Inventory:
- Hip Implant A: Quantity 10
- Tray 1: Quantity 5 [IMAGE: Tray 1 - /api/images/tray1.jpg]

Instruments:
- Hip Tray Set A: Contains primary instruments
  [IMAGE: Hip Tray Set A - /api/images/hip_tray_a.jpg]

ST. MARY'S HOSPITAL:
Inventory:
- Hip Implant B: Quantity 7
- Tray 2: Quantity 3

TECHNICAL INFORMATION (PORTFOLIO-WIDE):
- Hip Replacement Protocol: Standard protocol involves...

GENERAL TEAM KNOWLEDGE:
- Dr. Smith: Prefers morning surgeries...
```
-**A**: Formatting like that works

### **16. Team Notes Integration**
- **Q**: When a user creates a note in the chat, should it automatically be tagged with their current team context?
- **A**: No notes work like how they do now, don't change that.
- **Q**: Should team members see ALL team notes in their notes section, or just their own + shared ones?
- **A**: Just their own + shared. exactly how it is now. you don't need to touch the sharing besides the fact that it will need an additional team id or something in supabase to tie with shared notes since we want shared notes to be shared within the team the member is in not all users on the software.

### **17. Original Manager Setup**
- **Q**: How will the "original manager" account be identified in the system? A special flag in the database?
- **A**: Yes, a special flag
- **Q**: When HHB invites the original manager, should this be a special invitation flow, or just a regular team creation process?
- **A**: Option A - Admin Panel Approach: Create a simple admin interface for HHB to create teams and set original manager emails. System sends special "team creation" invitation.

### **18. Knowledge Sheet Updates & OpenAI Management**
- **Q**: When updating knowledge sheets, should we:
  1. Delete the old OpenAI file and upload a new one with the same name?
  2. Or update the vector store by removing old file and adding new one?
- **A**: Isn't this the same thing? keep the same name though. in general just note that obviously we will give these names that tag either portfolio name or general or something like that so then we can figure out what to point to when the user selects a portfolio in the UI
- **Q**: Should there be a "Save Draft" vs "Finalize" concept for knowledge sheets, or just immediate updates?
- **A**: Just a finalize button that uploads it

### **19. Multiple Team Membership**
- **Q**: If a user is part of multiple teams, when they access notes, do they see:
  1. All notes from all their teams mixed together?
  2. Only notes from the currently selected team?
  3. A way to filter/switch between team notes?
- **A**: Only notes from the currently selected team

### **20. Portfolio Assignment Logic**
- **Q**: When a user selects a team in the launcher, do they then see ALL portfolios for that team, or do we need user-specific portfolio access within teams?
- **A**: The non managers will go directly to the chat interface upon selecting the team, the managers though will go to a page between team selection and chat that shows them the portfolios, the knowledge sheets, invite new users, etc. then they can click another button that will take them to the chat interface
## 🚀 Implementation Phases

### Phase 1: Core Infrastructure & Admin Panel (Week 1-2)
**Database & Security Foundation**
- Complete database schema implementation (teams, team_portfolios, team_members, team_documents, team_knowledge, admin_users)
- RLS policies for team-scoped data access
- Admin authentication system
- Admin panel UI (dashboard, create team, manage teams)
- Admin API endpoints for team creation
- Original manager invitation system

**Deliverables:**
- HHB can create teams and invite original managers
- Original managers can accept invitations and become team owners

### Phase 2: Portfolio Setup & PDF Vector Stores (Week 2-3)
**Portfolio Creation & Document Upload**
- Team setup wizard UI for managers
- Custom portfolio creation (text fields, not hardcoded)
- Drag & drop PDF upload per portfolio
- PDF storage in Supabase team-documents bucket
- Stage 1 vector store creation: Portfolio PDF vector stores
- Store vector_store_id in team_portfolios table

**Deliverables:**
- Managers can create custom portfolios and upload PDFs
- Each portfolio gets its own OpenAI vector store with PDFs
- Foundation for account-portfolio combinations

### Phase 3: Account Setup & Account-Portfolio Vector Stores (Week 3-4)
**Account Creation & Knowledge Management**
- Account creation UI (free-text account names)
- Portfolio assignment to accounts (checkbox selection)
- Account-portfolio knowledge forms:
  - Inventory (implants, instruments, trays with quantities)
  - Instrument descriptions with optional tray photos
  - Technical information
- Stage 2 vector store creation: Account-portfolio knowledge vector stores
- Text file generation for each account-portfolio combination

**Deliverables:**
- Managers can create accounts and assign portfolios
- Account-specific knowledge entry with image support
- Vector store for each account-portfolio combination (e.g., "Mercy Hip", "Malvern Knee Revision")

### Phase 4: General Knowledge & Dynamic Assistant Creation (Week 4-5)
**Team General Knowledge & Assistant System**
- General team knowledge form (parking, credentials, doctor info)
- Stage 3 vector store creation: Team general knowledge vector store
- Dynamic assistant creation system (combines 3 vector store types)
- Assistant caching in team_assistants table
- Knowledge sheet update system (replace OpenAI files when edited)

**Deliverables:**
- Complete vector store architecture (3 types working together)
- Dynamic assistant creation for any team+account+portfolio configuration
- Assistant reuse system to prevent redundant API calls

### Phase 5: Chat Integration & Team-Scoped Features (Week 4-5 - Parallel with Phase 4)
**Enhanced Chat Experience**
- Dynamic portfolio selection from team's custom portfolios
- Assistant ID resolution based on team membership
- Team-scoped notes sharing (add team_id context)
- Navigation flow: Login → Team Selection → Role-based redirect
- Team member vs manager dashboard differentiation

**Deliverables:**
- Team members access chat with their team's custom portfolios
- Notes are shared within teams only
- Different experiences for managers vs members

### Phase 6: User Experience & Polish (Week 5-6)
**Complete User Flows**
- Manager dashboard (access all team management + chat)
- Team member view (read-only team info + direct chat access)
- Multiple team membership handling (team selection screen)
- Email invitation system with proper onboarding
- Team deletion system (original manager only, hard to find)
- Loading states for AI generation ("Updating documents...")

**Deliverables:**
- Complete end-to-end user experience
- All user roles work as specified
- Professional email invitations

### Phase 7: Testing & Production Readiness (Week 6-7)
**Quality Assurance**
- End-to-end testing of all user flows
- OpenAI integration error handling
- File upload failure recovery
- Performance optimization for team data loading
- Mobile responsiveness for all launcher pages
- Security audit of admin panel and team access
- Analytics integration for admin dashboard

**Deliverables:**
- Production-ready launcher system
- Comprehensive error handling
- Performance monitoring
- HHB can manage teams effectively

## 📋 **Critical Path Dependencies**

```
Phase 1 (Admin Panel) → Phase 2 (Team Setup) → Phase 3 (Knowledge) → Phase 4 (AI Generation)
                                                                     ↗ 
                                              Phase 5 (Chat Integration) ↗
                                                                     ↗
                                              Phase 6 (UX Polish) → Phase 7 (Testing)
```

**Note:** Phases 4 and 5 can run in parallel since they work on different parts of the system.

## 🔧 Technical Considerations

### Performance
- Lazy loading of team data
- Efficient file uploads with progress
- Caching of team portfolios for chat

### Error Handling
- OpenAI API failures
- File upload failures
- Invalid knowledge sheet data
- Network timeouts

### User Experience
- Clear progress indicators during AI generation
- Helpful validation messages
- Mobile-responsive design
- Intuitive navigation between launcher and chat

### Monitoring
- Track assistant generation success/failure
- Monitor file upload performance
- Log team activity for debugging 