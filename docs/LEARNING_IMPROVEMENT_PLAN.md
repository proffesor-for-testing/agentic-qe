# AQE v3 Learning System Improvement Plan

## Overview

This plan ensures that AQE agents properly persist learnings and use accumulated data to improve over time.

---

## Phase 1: Fix QE Agent MCP Tool References ✅ COMPLETED

### Tasks
- [x] Update `qe-queen-coordinator.md` to use `mcp__agentic-qe__*` (hyphen)
- [x] Update `qe-integration-architect.md` to use AQE tools
- [x] Update `reasoningbank-learner.md` to use AQE tools
- [x] Copy updated agents to `v3/assets/agents/v3/`
- [x] Fix tool naming: `mcp__agentic_qe__` → `mcp__agentic-qe__` (264 occurrences)
- [x] Verify changes work with MCP server

### Files Changed
- `.claude/agents/v3/qe-queen-coordinator.md`
- `.claude/agents/v3/qe-integration-architect.md`
- `.claude/agents/v3/reasoningbank-learner.md`

### Note: Two Agent Directories
- `.claude/agents/v3/` = ALL agents (QE + claude-flow general)
- `v3/assets/agents/v3/` = QE-specific agents only (packaged with v3)

---

## Phase 2: Verify MCP Server Tools ✅ COMPLETED

### Objective
Ensure `mcp__agentic-qe__*` tools actually work and persist to `.agentic-qe/memory.db`

### Tasks
- [x] Register AQE MCP server in `.mcp.json`
- [x] Start AQE MCP server
- [x] Test `mcp__agentic-qe__memory_store` persists data ✅ VERIFIED
- [x] Test `mcp__agentic-qe__memory_retrieve` retrieves data ✅ VERIFIED
- [x] Verify data appears in SQLite database ✅ VERIFIED

### Fixes Applied (2026-02-05)

**Fix 1 - MCP Server Registration**:
The `agentic-qe` MCP server was implemented but NOT registered in `.mcp.json`.
Added server configuration to `.mcp.json`.

**Fix 2 - Tool Naming Convention**:
MCP tools use **hyphen** in server name: `mcp__agentic-qe__*` (not underscore).
Updated 264+ occurrences across all QE agent definitions.

### Verification Results
```
mcp__agentic-qe__fleet_init → ✅ Fleet initialized
mcp__agentic-qe__memory_store → ✅ Data stored
mcp__agentic-qe__memory_retrieve → ✅ Data retrieved
SQLite persistence → ✅ Data in .agentic-qe/memory.db
```

### Test Commands
```bash
# Check if MCP server is registered
claude mcp list | grep agentic

# Manual test via CLI
npx aqe memory store --key "test:123" --value "test value" --namespace "test"
sqlite3 .agentic-qe/memory.db "SELECT * FROM memory_entries WHERE key LIKE 'test:%'"
```

---

## Phase 3: Hook Integration Verification ✅ COMPLETED

### Objective
Ensure Claude Code hooks trigger AQE learning capture

### Current State
- `v3-qe-bridge.sh` exists in `.claude/hooks/`
- Uses environment variables for JSON safety
- Calls Node.js to process hook events

### Hook Configuration (`.claude/settings.json`)
```json
{
  "hooks": {
    "PostToolUse": [{ "matcher": ".*", "hooks": [{ "command": ".claude/hooks/v3-qe-bridge.sh post-tool" }] }],
    "Stop": [{ "hooks": [{ "command": ".claude/hooks/v3-qe-bridge.sh stop" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "command": ".claude/hooks/v3-qe-bridge.sh user-prompt" }] }]
  }
}
```

### Tasks
- [x] Verify v3-qe-bridge.sh is executable: `chmod +x .claude/hooks/v3-qe-bridge.sh`
- [x] Verify hook settings in `.claude/settings.json`
- [x] Test PostToolUse hook triggers learning
- [x] Test Stop hook triggers learning summary
- [x] Add debug logging to track learning events (`QE_HOOK_DEBUG=1`)
- [x] Verify data flows to `.agentic-qe/memory.db`

### Fixes Applied (2026-02-05)
- Fixed module path: `/v3/src/` → `/v3/dist/`
- Added `json_escape()` function for safe JSON handling
- Added `QE_HOOK_DEBUG` environment variable for debugging
- All hook handlers tested and working

### Test Plan
```bash
# Enable hook debugging
export QE_HOOK_DEBUG=1

# Run a simple task that triggers hooks
# (Use Claude Code to edit a file)

# Check if learning was captured
sqlite3 .agentic-qe/memory.db "SELECT COUNT(*) FROM learning_experiences WHERE created_at > datetime('now', '-1 hour')"
```

### v3-qe-bridge.sh Flow
```
Claude Hook → v3-qe-bridge.sh → Node.js script → AQE Learning Engine → SQLite
```

---

## Phase 4: Enable Experience-to-Pattern Pipeline ✅ COMPLETED

### Objective
Convert task experiences into reusable patterns

### Current State
- `captured_experiences` has 180 records
- `patterns` has 45+ records
- Extraction command exists: `aqe learning extract`

### Tasks
- [x] Review extraction threshold (current: 0.7 reward)
- [x] Run extraction to generate new patterns (38 patterns extracted)
- [x] Schedule periodic extraction (via learning-consolidation worker)
- [x] Monitor pattern quality scores (via metrics-tracker)

### Implementation
```bash
# Extract high-quality patterns
npx aqe learning extract --min-reward 0.7 --min-count 2

# View extracted patterns
npx aqe learning stats --detailed

# Set up periodic extraction (add to v3 workers)
# File: v3/src/workers/workers/learning-consolidation.ts
```

---

## Phase 5: Pattern Utilization in Agents ✅ COMPLETED

### Objective
Use accumulated patterns to improve agent performance

### Implementation (2026-02-05)
- Patterns are now searched during task routing
- Relevant patterns included in routing result

### Tasks
- [x] Integrate PatternStore search in task routing
- [x] Add pattern context to agent prompts
- [x] Surface similar patterns before task execution
- [x] Track pattern reuse metrics

### Files Modified
- `v3/src/learning/aqe-learning-engine.ts` - Added `searchPatternsForTask()`, `trackPatternSearch()`
- `v3/src/learning/sqlite-persistence.ts` - Pattern search integration
- `v3/src/mcp/services/task-router.ts` - Pattern-aware routing

### Implementation Points

#### 5.1 Task Routing Integration
```typescript
// In v3/src/learning/aqe-learning-engine.ts
async routeTask(task: string): Promise<QERoutingResult> {
  // Search for similar patterns
  const patterns = await this.patternStore.search({
    query: task,
    limit: 5,
    minSimilarity: 0.6
  });

  // Include patterns in routing context
  return {
    agent: bestAgent,
    patterns: patterns.results,
    confidence: similarity
  };
}
```

#### 5.2 Agent Prompt Augmentation
```typescript
// Before spawning agent, inject pattern context
const relevantPatterns = await learningEngine.getRelevantPatterns(task);
const augmentedPrompt = `
## Relevant Patterns from Experience
${relevantPatterns.map(p => `- ${p.pattern} (confidence: ${p.confidence})`).join('\n')}

## Your Task
${originalTask}
`;
```

---

## Phase 6: Learning Metrics & Dashboard ✅ COMPLETED

### Objective
Track learning improvement over time

### Tasks
- [x] Add learning metrics tracking
- [x] Create CLI dashboard command
- [x] Track key metrics:
  - Patterns created per day
  - Pattern reuse count
  - Average reward improvement
  - Domain coverage

### Files Created/Modified
- `v3/src/learning/metrics-tracker.ts` - NEW: Metrics collection and snapshot
- `v3/src/cli/commands/learning.ts` - Added `dashboard` command

### CLI Command
```bash
npx aqe learning dashboard

# Output:
# ┌─────────────────────────────────────────────────────┐
# │           AQE LEARNING DASHBOARD                      │
# ├─────────────────────────────────────────────────────┤
# │ Patterns:           45 (+3 today)                    │
# │ Experiences:       665 (+12 today)                   │
# │ Q-Values:          517                               │
# │ Avg Reward:       0.78 (↑ 0.02 from last week)      │
# │                                                      │
# │ Domain Coverage:                                     │
# │   test-generation    ████████████░░ 29 patterns     │
# │   test-execution     ████░░░░░░░░░░  4 patterns     │
# │   coverage-analysis  ███░░░░░░░░░░░  3 patterns     │
# └─────────────────────────────────────────────────────┘
```

---

## Phase 7: Continuous Learning Loop

### Objective
Establish automated continuous learning

### Architecture
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Task        │────▶│  Experience  │────▶│  Pattern     │
│  Execution   │     │  Capture     │     │  Extraction  │
└──────────────┘     └──────────────┘     └──────────────┘
       ▲                                         │
       │                                         ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Improved    │◀────│  Pattern     │◀────│  Pattern     │
│  Routing     │     │  Utilization │     │  Promotion   │
└──────────────┘     └──────────────┘     └──────────────┘
```

### Tasks
- [x] Enable learning-consolidation worker
- [x] Configure pattern promotion thresholds (0.7 reward, 2 occurrences)
- [x] Set up feedback loop for pattern quality
- [x] Implement pattern deprecation for outdated ones

### Files Created/Modified
- `v3/src/learning/pattern-lifecycle.ts` - NEW: Pattern promotion/deprecation logic
- `v3/src/workers/workers/learning-consolidation.ts` - Enhanced with lifecycle management

---

## Phase 7B: Integrate Existing Learning Agents ✅ COMPLETED

### Objective
Wire up existing QE learning agents to the learning pipeline

### Existing Agents (in v3/assets/agents/v3/)
| Agent | Purpose | Status |
|-------|---------|--------|
| `qe-pattern-learner` | ML-based pattern discovery | ⚠️ Not wired to storage |
| `qe-learning-coordinator` | Fleet-wide learning orchestration | ⚠️ Not wired to storage |

### Tasks
- [x] Review qe-pattern-learner for AQE storage integration
- [x] Review qe-learning-coordinator for AQE storage integration
- [x] Connect pattern-learner output to `patterns` table
- [x] Enable learning-coordinator to read from `learning_experiences`
- [x] Add MCP tool calls to these agents (using `mcp__agentic-qe__*`)

### Integration Points (Verified)
```typescript
// qe-pattern-learner calls:
mcp__agentic-qe__memory_store({
  key: "learning/patterns/discovered-{timestamp}",
  namespace: "patterns",
  value: { pattern, confidence, domain }
})

// qe-learning-coordinator calls:
mcp__agentic-qe__memory_query({
  pattern: "learning/*",
  namespace: "experiences"
})
```

---

## Phase 8: Data Integrity & Backup ✅ COMPLETED

### Objective
Ensure learning data is protected and portable

### Tasks
- [x] Add backup command to CLI (`aqe learning backup`)
- [x] Add restore command to CLI (`aqe learning restore`)
- [x] Add verify command to CLI (`aqe learning verify`)
- [x] Add export/import for team sharing (`export-full`, `import-merge`)
- [x] Version learning data with migrations

### Commands Available
```bash
# Backup learning data
npx aqe learning backup --output ./backups/learning-$(date +%Y%m%d).db

# Restore from backup
npx aqe learning restore --input ./backups/learning-20260205.db

# Verify database integrity
npx aqe learning verify

# Export for sharing
npx aqe learning export-full --output learning-data.json

# Import shared patterns (merge mode)
npx aqe learning import-merge --file shared-patterns.json
```

---

## Pipeline Verification (Completed)

The learning pipeline is properly wired:

```
Claude Hook Trigger
        ↓
.claude/hooks/v3-qe-bridge.sh
        ↓
RealQEReasoningBank (real-qe-reasoning-bank.ts)
        ↓
SQLitePatternStore (sqlite-persistence.ts)
        ↓
UnifiedMemoryManager (unified-memory.ts)
        ↓
.agentic-qe/memory.db ✅
```

**Key Files in Pipeline:**
- `.claude/settings.json` - Hook configuration (✅ configured)
- `.claude/hooks/v3-qe-bridge.sh` - Hook bridge (✅ executable)
- `v3/src/learning/real-qe-reasoning-bank.ts` - Learning engine
- `v3/src/learning/sqlite-persistence.ts` - SQLite storage
- `v3/src/kernel/unified-memory.ts` - Unified memory manager

---

## Priority Order

| Phase | Priority | Effort | Impact | Status |
|-------|----------|--------|--------|--------|
| 1. Fix MCP tools | High | Low | High | ✅ Done |
| 2. Verify MCP server | High | Low | High | ✅ Done |
| 3. Hook integration | High | Medium | High | ✅ Done |
| 4. Pattern extraction | High | Low | Medium | ✅ Done |
| 5. Pattern utilization | Medium | High | High | ✅ Done |
| 6. Learning dashboard | Low | Medium | Medium | ✅ Done |
| 7. Continuous loop | Medium | High | High | ✅ Done |
| 7B. Integrate learning agents | Medium | Medium | High | ✅ Done |
| 8. Backup/integrity | Low | Low | Medium | ✅ Done |

---

## Success Criteria

1. **Data Persistence**: ✅ All learning data persists across sessions
2. **Pattern Growth**: ✅ Pattern count increases with usage (45+ patterns)
3. **Improved Routing**: ✅ Task routing now includes pattern search
4. **Measurable Learning**: ✅ Metrics tracker + dashboard command
5. **Agent Adaptation**: ✅ Agents leverage patterns via MCP tools

---

## Tracking

| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Phase 1 | ✅ Complete | - | QE agents updated, 264+ tool refs fixed |
| Phase 2 | ✅ Complete | - | MCP server registered in `.mcp.json` |
| Phase 3 | ✅ Complete | - | Hook bridge fixed (path + JSON escaping) |
| Phase 4 | ✅ Complete | - | 38+ patterns extracted, worker scheduled |
| Phase 5 | ✅ Complete | - | Pattern search in routing, reuse tracking |
| Phase 6 | ✅ Complete | - | Dashboard + metrics-tracker.ts |
| Phase 7 | ✅ Complete | - | pattern-lifecycle.ts + consolidation worker |
| Phase 7B | ✅ Complete | - | Agents use `mcp__agentic-qe__*` tools |
| Phase 8 | ✅ Complete | - | backup/restore/verify commands |

---

## Files Created During Implementation

| File | Phase | Purpose |
|------|-------|---------|
| `v3/src/learning/metrics-tracker.ts` | 6 | Metrics collection and snapshots |
| `v3/src/learning/pattern-lifecycle.ts` | 7 | Pattern promotion/deprecation |

## Files Modified During Implementation

| File | Phases | Changes |
|------|--------|---------|
| `v3/src/learning/aqe-learning-engine.ts` | 5 | Pattern search in routing |
| `v3/src/cli/commands/learning.ts` | 6, 8 | dashboard, backup, restore, verify |
| `v3/src/workers/workers/learning-consolidation.ts` | 7 | Lifecycle integration |
| `.claude/hooks/v3-qe-bridge.sh` | 3 | Fixed path + JSON escaping |
| `v3/assets/agents/v3/qe-pattern-learner.md` | 7B | Correct MCP tool names |
| `v3/assets/agents/v3/qe-learning-coordinator.md` | 7B | Correct MCP tool names |

---

*Plan Created: 2026-02-05*
*Last Updated: 2026-02-05*
*Version: 2.0 - ALL PHASES COMPLETE* 🎉
