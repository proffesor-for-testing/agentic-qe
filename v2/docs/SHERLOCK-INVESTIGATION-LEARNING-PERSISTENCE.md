# Sherlock Investigation Report: Learning/Patterns/Memory Persistence Failure

**Case**: Learning patterns not persisting in `.agentic-qe/agentdb.db` and `.agentic-qe/memory.db` after `aqe init`
**Investigator**: Sherlock Review (Claude Code Agent)
**Date**: 2025-11-22
**Status**: ✅ ROOT CAUSE IDENTIFIED

---

## Executive Summary

**Claim**: "Learning/patterns work when using AQE agents"
**Evidence**: Databases exist but remain empty in user projects
**Verdict**: ❌ **CRITICAL MISSING STEPS** - System is NOT PROPERLY CONFIGURED for users

The learning system architecture exists and works IN THIS REPO, but NEW USER PROJECTS are missing:
1. `.claude/settings.json` with AgentDB hooks
2. MCP server auto-add during `aqe init`
3. User instructions for hook setup

---

## Investigation Evidence

### 1. What THIS PROJECT Has (Working)

#### ✅ Evidence A: Database Files Exist
```bash
$ ls -la /workspaces/agentic-qe-cf/.agentic-qe/
-rw-r--r--  1 vscode vscode  5644288 Nov 18 13:57 agentdb.db      # 5.6 MB - HAS DATA
-rw-r--r--  1 vscode vscode 34533376 Nov 22 10:04 memory.db       # 34 MB - HAS DATA
```

**Deduction**: Databases DO persist in this project. Why?

#### ✅ Evidence B: settings.json Has AgentDB Hooks
Location: `/workspaces/agentic-qe-cf/.claude/settings.json`

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "description": "1. Experience Replay Developer - Capture edit as RL experience",
            "command": "npx agentdb@latest store-pattern --type 'experience' --domain 'code-edits' ..."
          },
          {
            "description": "2. Verdict-Based Quality - Async verdict assignment after tests",
            "command": "npx agentdb@latest store-pattern --type 'verdict' --domain 'code-quality' ..."
          }
        ]
      },
      {
        "matcher": "Task",
        "hooks": [
          {
            "description": "4. Trajectory Storage - Record task trajectory for learning",
            "command": "npx agentdb@latest store-pattern --type 'trajectory' --domain 'task-trajectories' ..."
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "description": "3. Semantic Search Memory - Query similar successful past edits",
            "command": "npx agentdb@latest query --domain 'successful-edits' ..."
          },
          {
            "description": "5. Failure Pattern Recognition - Warn about known failure patterns",
            "command": "npx agentdb@latest query --domain 'failed-edits' ..."
          }
        ]
      }
    ]
  }
}
```

**Deduction**: Learning works because **Claude Code hooks automatically call agentdb CLI** after every edit/task!

#### ✅ Evidence C: MCP Server Initializes Databases
Location: `/workspaces/agentic-qe-cf/src/mcp/server.ts:737`

```typescript
async start(transport?: StdioServerTransport): Promise<void> {
  // Initialize database before starting server
  await this.memory.initialize();  // Creates memory.db
  // ...
}
```

Location: `/workspaces/agentic-qe-cf/src/cli/commands/init.ts:1955`

```typescript
private static async initializeLearningDatabase(): Promise<void> {
  const agentDB = new AgentDB({
    dbPath: '.agentic-qe/agentdb.db',
    // ...
  });
  await agentDB.initialize();  // Creates agentdb.db
}
```

**Deduction**: Databases are created during:
- `aqe init` command (creates empty DBs)
- MCP server startup (initializes memory.db schema)

### 2. What NEW USER PROJECTS Are Missing

#### ❌ Evidence D: README Provides Minimal MCP Setup
Location: `/workspaces/agentic-qe-cf/README.md:35`

```bash
# Add MCP server to Claude Code (optional)
claude mcp add agentic-qe npx aqe-mcp
```

**Problem**: Marked as "optional" but it's REQUIRED for:
- Memory persistence
- Learning coordination
- Pattern sharing between agents

#### ❌ Evidence E: No .claude/settings.json Generation in aqe init
Location: `/workspaces/agentic-qe-cf/src/cli/commands/init.ts`

**Evidence**: Searched entire init.ts - NO CODE that creates `.claude/settings.json`

```bash
$ grep -n "settings.json" src/cli/commands/init.ts
# NO RESULTS
```

**Deduction**: Users get empty databases because:
1. No hooks to capture learning events
2. No `npx agentdb@latest store-pattern` calls after edits
3. No `npx agentdb@latest query` calls for pattern retrieval

#### ❌ Evidence F: No Automatic MCP Server Addition
Location: `/workspaces/agentic-qe-cf/src/cli/commands/init.ts`

**Comparison with claude-flow**:

Claude Flow does this:
```typescript
// claude-flow init.ts
await execCommand('claude mcp add claude-flow npx claude-flow@alpha mcp start');
```

AQE does NOT do this - relies on manual user action.

---

## Root Cause Analysis

### The Learning Flow (How It SHOULD Work)

```
┌─────────────────────────────────────────────────────────────────┐
│  USER ACTION: Edit a file using Claude Code                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  PreToolUse Hook: npx agentdb@latest query --domain "..."      │
│  → Retrieves similar past edits for context                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  TOOL EXECUTION: Write/Edit file                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  PostToolUse Hook: npx agentdb@latest store-pattern            │
│  → Stores edit experience in agentdb.db                        │
│  → Background: Run tests, assign verdict (ACCEPT/REJECT)       │
│  → Store success/failure patterns                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  RESULT: agentdb.db grows with experience data                 │
│          Future edits benefit from past patterns                │
└─────────────────────────────────────────────────────────────────┘
```

### Why It Fails in User Projects

```
┌─────────────────────────────────────────────────────────────────┐
│  USER ACTION: npx aqe init --yes                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  ✅ Creates .agentic-qe/agentdb.db (EMPTY)                     │
│  ✅ Creates .agentic-qe/memory.db (EMPTY)                      │
│  ✅ Creates config files                                       │
│  ❌ Does NOT create .claude/settings.json with hooks           │
│  ❌ Does NOT run: claude mcp add agentic-qe npx aqe-mcp        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  USER ACTION: Use Task tool to spawn qe-test-generator agent   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  ❌ NO PreToolUse hooks (no pattern retrieval)                 │
│  ❌ NO PostToolUse hooks (no pattern storage)                  │
│  ❌ NO learning capture                                        │
│  ❌ Databases remain EMPTY                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Comparison: claude-flow vs AQE

### Why claude-flow Learning Works

**Evidence from claude-flow**:
1. ✅ Creates `.claude/settings.json` during `npx claude-flow init`
2. ✅ Auto-adds MCP server: `claude mcp add claude-flow npx claude-flow@alpha mcp start`
3. ✅ Hooks call `npx agentdb@latest` after every operation
4. ✅ Documented in CLAUDE.md (included in every project)

### Why AQE Learning Fails in New Projects

**Evidence from AQE**:
1. ❌ Does NOT create `.claude/settings.json` during `aqe init`
2. ❌ Does NOT auto-add MCP server (marked as "optional" in README)
3. ❌ No hooks to call `npx agentdb@latest`
4. ❌ CLAUDE.md exists but not in user projects after `aqe init`

---

## Missing Steps Identified

### Step 1: Generate .claude/settings.json During aqe init

**What's needed**:
```typescript
// In src/cli/commands/init.ts
private static async generateClaudeSettings(config: FleetConfig): Promise<void> {
  const settingsPath = path.join(process.cwd(), '.claude', 'settings.json');

  const settings = {
    env: {
      AGENTDB_LEARNING_ENABLED: "true",
      AGENTDB_REASONING_ENABLED: "true",
      AGENTDB_AUTO_TRAIN: "true"
    },
    hooks: {
      PreToolUse: [
        {
          matcher: "Write|Edit|MultiEdit",
          hooks: [
            {
              type: "command",
              description: "Semantic Search Memory - Query similar successful past edits",
              command: "npx agentdb@latest query --domain 'successful-edits' --query \"file:$FILE\" --k 5 --min-confidence 0.8"
            }
          ]
        }
      ],
      PostToolUse: [
        {
          matcher: "Write|Edit|MultiEdit",
          hooks: [
            {
              type: "command",
              description: "Experience Replay - Capture edit as RL experience",
              command: "npx agentdb@latest store-pattern --type 'experience' --domain 'code-edits' --pattern '{...}'"
            }
          ]
        }
      ]
    }
  };

  await fs.ensureDir(path.dirname(settingsPath));
  await fs.writeJson(settingsPath, settings, { spaces: 2 });
  console.log(chalk.green('  ✓ Created .claude/settings.json with learning hooks'));
}
```

### Step 2: Auto-Add MCP Server During aqe init

**What's needed**:
```typescript
// In src/cli/commands/init.ts
private static async setupMCPServer(): Promise<void> {
  console.log(chalk.cyan('  🔌 Setting up MCP server integration...'));

  try {
    // Check if Claude Code is available
    const { stdout } = await execAsync('which claude');

    if (stdout.trim()) {
      // Add MCP server
      await execAsync('claude mcp add agentic-qe npx aqe-mcp');
      console.log(chalk.green('  ✓ MCP server added to Claude Code'));
    } else {
      console.log(chalk.yellow('  ⓘ  Claude Code not found. Add MCP server manually:'));
      console.log(chalk.gray('     claude mcp add agentic-qe npx aqe-mcp'));
    }
  } catch (error) {
    console.log(chalk.yellow('  ⓘ  Please add MCP server manually:'));
    console.log(chalk.gray('     claude mcp add agentic-qe npx aqe-mcp'));
  }
}
```

### Step 3: Copy CLAUDE.md to User Projects

**What's needed**:
```typescript
// In src/cli/commands/init.ts
private static async copyClaudeMd(): Promise<void> {
  const sourceTemplate = path.join(__dirname, '../../../templates/CLAUDE.md');
  const destPath = path.join(process.cwd(), 'CLAUDE.md');

  if (!fs.existsSync(destPath)) {
    await fs.copy(sourceTemplate, destPath);
    console.log(chalk.green('  ✓ Created CLAUDE.md with usage instructions'));
  }
}
```

### Step 4: Update README - Make MCP Setup Required

**Change from**:
```bash
# Add MCP server to Claude Code (optional)
claude mcp add agentic-qe npx aqe-mcp
```

**To**:
```bash
# REQUIRED: Add MCP server to Claude Code for learning/memory persistence
claude mcp add agentic-qe npx aqe-mcp

# Verify connection
claude mcp list
```

---

## Evidence Summary

### ✅ What Works in THIS Project

| Evidence | Location | Status |
|----------|----------|--------|
| AgentDB database | `.agentic-qe/agentdb.db` (5.6 MB) | ✅ Has data |
| Memory database | `.agentic-qe/memory.db` (34 MB) | ✅ Has data |
| Claude settings | `.claude/settings.json` | ✅ Has hooks |
| MCP server | `enabledMcpjsonServers: ["agentic-qe"]` | ✅ Configured |
| Learning hooks | PreToolUse/PostToolUse | ✅ Call agentdb CLI |

### ❌ What's Missing in NEW User Projects

| Evidence | Expected | Actual | Impact |
|----------|----------|--------|--------|
| `.claude/settings.json` | Created by `aqe init` | NOT created | ❌ No hooks = no learning |
| MCP server setup | Auto-added | Manual (marked optional) | ❌ No coordination |
| CLAUDE.md copy | In user project | Only in package | ❌ No instructions |
| Hook education | Clear docs | Buried in code | ❌ Users don't know |

---

## Recommendations

### Priority 1: FIX aqe init (CRITICAL)

1. **Generate .claude/settings.json** with AgentDB hooks
2. **Auto-add MCP server** (or fail with clear instructions)
3. **Copy CLAUDE.md** template to user project
4. **Show post-install checklist** with verification steps

### Priority 2: Update Documentation

1. **README**: Change MCP from "optional" to "REQUIRED for learning"
2. **Add verification section**: How to test learning is working
3. **Troubleshooting**: What to do if DBs remain empty

### Priority 3: Add Verification Command

```bash
$ aqe doctor
✅ AgentDB database: .agentic-qe/agentdb.db (5.6 MB, 1,234 patterns)
✅ Memory database: .agentic-qe/memory.db (34 MB, initialized)
✅ Claude settings: .claude/settings.json (hooks configured)
✅ MCP server: Connected (102 tools available)
✅ Learning: WORKING (captured 15 experiences this session)
```

---

## Conclusion

**Final Verdict**: ⚠️ **SYSTEM WORKS BUT NOT CONFIGURED FOR USERS**

The learning/patterns/memory system is fully functional IN THIS REPO because:
1. `.claude/settings.json` has AgentDB hooks that call CLI after every edit
2. MCP server is properly configured in `.claude/settings.local.json`
3. Databases persist because hooks capture all learning events

But in NEW USER PROJECTS after `aqe init`:
1. ❌ No `.claude/settings.json` = no hooks = no learning capture
2. ❌ MCP marked "optional" so users skip it
3. ❌ No CLAUDE.md in their project
4. ❌ Databases created but remain empty forever

**The Fix**: Make `aqe init` do what `claude-flow init` does:
- Generate `.claude/settings.json` with hooks
- Auto-add MCP server (or fail loudly)
- Copy usage documentation
- Verify setup worked

---

**Elementary Evidence**: All evidence reproducible via:
1. `ls -la /workspaces/agentic-qe-cf/.agentic-qe/` (shows populated DBs)
2. `cat .claude/settings.json` (shows hooks)
3. `grep "settings.json" src/cli/commands/init.ts` (shows missing code)
4. Comparison with claude-flow's init command

**Investigation Date**: 2025-11-22
**Reproducible**: YES - Try `aqe init` in new directory and check for .claude/settings.json
