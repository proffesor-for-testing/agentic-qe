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

## Phase 3: Hook Integration Verification

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
- [ ] Verify v3-qe-bridge.sh is executable: `chmod +x .claude/hooks/v3-qe-bridge.sh`
- [ ] Verify hook settings in `.claude/settings.json`
- [ ] Test PostToolUse hook triggers learning
- [ ] Test Stop hook triggers learning summary
- [ ] Add debug logging to track learning events
- [ ] Verify data flows to `.agentic-qe/memory.db`

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

## Phase 4: Enable Experience-to-Pattern Pipeline

### Objective
Convert task experiences into reusable patterns

### Current State
- `captured_experiences` has 180 records
- `patterns` has 45 records
- Extraction command exists: `aqe learning extract`

### Tasks
- [ ] Review extraction threshold (current: 0.7 reward)
- [ ] Run extraction to generate new patterns
- [ ] Schedule periodic extraction (cron/worker)
- [ ] Monitor pattern quality scores

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

## Phase 5: Pattern Utilization in Agents

### Objective
Use accumulated patterns to improve agent performance

### Current Gap
- Patterns are stored but not actively used in routing
- Agent prompts don't include relevant patterns

### Tasks
- [ ] Integrate PatternStore search in task routing
- [ ] Add pattern context to agent prompts
- [ ] Surface similar patterns before task execution
- [ ] Track pattern reuse metrics

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

## Phase 6: Learning Metrics & Dashboard

### Objective
Track learning improvement over time

### Tasks
- [ ] Add learning metrics tracking
- [ ] Create CLI dashboard command
- [ ] Track key metrics:
  - Patterns created per day
  - Pattern reuse count
  - Average reward improvement
  - Domain coverage

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
- [ ] Enable learning-consolidation worker
- [ ] Configure pattern promotion thresholds
- [ ] Set up feedback loop for pattern quality
- [ ] Implement pattern deprecation for outdated ones

---

## Phase 7B: Integrate Existing Learning Agents

### Objective
Wire up existing QE learning agents to the learning pipeline

### Existing Agents (in v3/assets/agents/v3/)
| Agent | Purpose | Status |
|-------|---------|--------|
| `qe-pattern-learner` | ML-based pattern discovery | ⚠️ Not wired to storage |
| `qe-learning-coordinator` | Fleet-wide learning orchestration | ⚠️ Not wired to storage |

### Tasks
- [ ] Review qe-pattern-learner for AQE storage integration
- [ ] Review qe-learning-coordinator for AQE storage integration
- [ ] Connect pattern-learner output to `patterns` table
- [ ] Enable learning-coordinator to read from `learning_experiences`
- [ ] Add MCP tool calls to these agents

### Integration Points
```typescript
// qe-pattern-learner should call:
mcp__agentic_qe__memory_store({
  key: "pattern:learned:xxx",
  namespace: "patterns",
  value: { pattern, confidence, domain }
})

// qe-learning-coordinator should call:
mcp__agentic_qe__memory_query({
  pattern: "experience:*",
  namespace: "learning"
})
```

---

## Phase 8: Data Integrity & Backup

### Objective
Ensure learning data is protected and portable

### Tasks
- [ ] Add backup command to CLI
- [ ] Schedule automated backups
- [ ] Add export/import for team sharing
- [ ] Version learning data with migrations

### Commands
```bash
# Backup learning data
npx aqe learning backup --output ./backups/learning-$(date +%Y%m%d).db

# Export for sharing
npx aqe learning export --format json --output learning-patterns.json

# Import shared patterns
npx aqe learning import --file shared-patterns.json --merge
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

| Phase | Priority | Effort | Impact |
|-------|----------|--------|--------|
| 1. Fix MCP tools | ✅ Done | Low | High |
| 2. Verify MCP server | High | Low | High |
| 3. Hook integration | ✅ Verified | Medium | High |
| 4. Pattern extraction | High | Low | Medium |
| 5. Pattern utilization | Medium | High | High |
| 6. Learning dashboard | Low | Medium | Medium |
| 7. Continuous loop | Medium | High | High |
| 7B. Integrate learning agents | Medium | Medium | High |
| 8. Backup/integrity | Low | Low | Medium |

---

## Success Criteria

1. **Data Persistence**: All learning data persists across sessions
2. **Pattern Growth**: Pattern count increases with usage
3. **Improved Routing**: Task routing accuracy improves over time
4. **Measurable Learning**: Metrics show improvement trends
5. **Agent Adaptation**: Agents leverage patterns for better outputs

---

## Tracking

| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Phase 1 | ✅ Complete | - | QE agents updated, tools fixed |
| Phase 2 | ✅ Complete | - | MCP server registered - **restart Claude Code** |
| Phase 3 | ✅ Verified | - | Hook pipeline verified |
| Phase 4 | ✅ Complete | - | 38 patterns extracted |
| Phase 5 | ⏳ Pending | - | Pattern utilization in routing |
| Phase 6 | ⏳ Pending | - | Learning dashboard |
| Phase 7 | ⏳ Pending | - | Continuous loop |
| Phase 7B | ✅ Complete | - | Learning agents integrated |
| Phase 8 | ⏳ Pending | - | Backup/integrity |

---

*Plan Created: 2026-02-05*
*Version: 1.0*
