# AQE v3 Learning Systems Analysis

## Executive Summary

This document analyzes all learning/pattern/self-improvement systems in AQE v3 to ensure data persistence and continuous improvement.

---

## 1. Database Tables & Current State

| Table | Records | Purpose | Status |
|-------|---------|---------|--------|
| `learning_experiences` | 665 | Q-learning state/action/reward tuples | ✅ Active |
| `patterns` | 45 | Reusable QE patterns with embeddings | ✅ Active |
| `captured_experiences` | 180 | Task execution data for pattern extraction | ✅ Active |
| `q_values` | 517 | Q-learning state-action values | ✅ Active |
| `goap_actions` | 113 | Goal-Oriented Action Planning actions | ✅ Active |
| `goap_plans` | 27 | GOAP planned sequences | ✅ Active |
| `learning_history` | 0 | Historical learning records | ⚠️ Empty |
| `learning_metrics` | ? | Learning performance metrics | ⚠️ Verify |

**Database Location**: `.agentic-qe/memory.db` (SQLite)

---

## 2. Learning Systems Inventory

### 2.1 QE ReasoningBank (`v3/src/learning/qe-reasoning-bank.ts`)
**Purpose**: Pattern learning with HNSW vector search (150x faster)

**Features**:
- 8 QE domains for classification
- Pattern quality scoring
- Short-term to long-term promotion (3+ successful uses)
- Agent routing via pattern similarity

**Persistence**: ✅ Saves to `patterns` table via `PatternStore`

**Data Flow**:
```
Task Completion → Pattern Extraction → HNSW Embedding → patterns table
                                                              ↓
Task Routing ← Pattern Search ← Similarity Calculation ←──────┘
```

---

### 2.2 Experience Capture Service (`v3/src/learning/experience-capture.ts`)
**Purpose**: Captures task execution experiences for pattern learning

**Features**:
- Task execution recording
- Outcome capture with quality metrics
- Pattern extraction from successful tasks
- Cross-domain experience sharing

**Persistence**: ✅ Saves to `captured_experiences` table

**Data Flow**:
```
Task Start → Record Steps → Task End → Quality Score → captured_experiences
                                                              ↓
Pattern Extraction ← High Quality Filter ← Success Analysis ←─┘
                           ↓
                    patterns table
```

---

### 2.3 Q-Learning System (`v3/src/integrations/rl-suite/`)
**Purpose**: Reinforcement learning for agent behavior optimization

**Features**:
- State-action-reward tracking
- Q-value updates
- Experience replay

**Persistence**: ✅ Saves to `learning_experiences` and `q_values` tables

**Data Flow**:
```
Agent Action → Environment Feedback → Reward → learning_experiences
                                                      ↓
Q-Value Update ← Experience Replay ← Batch Sample ←───┘
       ↓
   q_values table
```

---

### 2.4 GOAP Planning System (`v3/src/integrations/goal-planning/`)
**Purpose**: Goal-Oriented Action Planning for complex task decomposition

**Features**:
- Action definition with preconditions/effects
- Plan generation
- Execution tracking

**Persistence**: ✅ Saves to `goap_actions`, `goap_plans`, `goap_execution_steps`

---

### 2.5 Pattern Store (`v3/src/learning/pattern-store.ts`)
**Purpose**: Persistent pattern storage with HNSW indexing

**Features**:
- HNSW vector indexing (ADR-021)
- Pattern promotion (3+ uses)
- Domain-specific storage
- Token tracking (ADR-042)

**Persistence**: ✅ Saves to `patterns` table

---

### 2.6 Claude Flow Bridge (`v3/src/adapters/claude-flow/`)
**Purpose**: Integration with claude-flow for enhanced features

**Features**:
- SONA trajectory tracking
- 3-tier model routing
- Codebase pretrain analysis

**Persistence**: ⚠️ Uses claude-flow in-memory storage (ephemeral)

**Issue**: Data stored via claude-flow MCP tools is NOT persisted!

---

## 3. Identified Issues

### Issue 1: Two Separate Storage Systems
**Problem**: Claude-flow uses in-memory sql.js (ephemeral) while AQE uses SQLite (persistent)

**Impact**:
- Agent learnings stored via `mcp__claude-flow__memory_*` are lost on restart
- QE agents using wrong tools don't persist learnings

**Fix**: Update QE agents to use `mcp__agentic_qe__memory_*` tools (✅ Started)

---

### Issue 2: Empty learning_history Table
**Problem**: The `learning_history` table has 0 records despite 665 `learning_experiences`

**Root Cause**: Needs investigation - may be deprecated or not wired up

**Action**: Determine if this table is needed or should be removed

---

### Issue 3: QE Agent Tool Naming
**Problem**: Agent definitions used wrong MCP tool names

| Agent | Old (Wrong) | New (Correct) |
|-------|-------------|---------------|
| qe-queen-coordinator | `mcp__agentic-qe__*` (hyphen) | `mcp__agentic_qe__*` (underscore) |
| qe-integration-architect | `mcp__claude-flow__memory_*` | `mcp__agentic_qe__memory_*` |
| reasoningbank-learner | `mcp__claude-flow__memory_*` | `mcp__agentic_qe__memory_*` |

**Status**: ✅ Fixed in this session

---

### Issue 4: Hook System Not Integrated with AQE
**Problem**: Claude Code hooks trigger claude-flow commands, not AQE learning

**Current Hook Flow**:
```
Hook Trigger → npx claude-flow@v3alpha hooks intelligence → claude-flow in-memory
```

**Desired Flow**:
```
Hook Trigger → v3-qe-bridge.sh → AQE Learning Engine → .agentic-qe/memory.db
```

**Status**: ⚠️ v3-qe-bridge.sh exists but may not be fully integrated

---

## 4. Improvement Recommendations

### Phase 1: Fix QE Agent Definitions (Completed)
- [x] Update qe-queen-coordinator.md to use `mcp__agentic_qe__*`
- [x] Update qe-integration-architect.md
- [x] Update reasoningbank-learner.md

### Phase 2: Verify Hook Integration
- [ ] Test v3-qe-bridge.sh triggers AQE learning
- [ ] Add learning tracking to PostToolUse hooks
- [ ] Verify patterns saved after task completion

### Phase 3: Enable Experience Capture
- [ ] Ensure ExperienceCaptureService is initialized
- [ ] Configure experience-to-pattern promotion
- [ ] Set up periodic pattern consolidation

### Phase 4: Learning Metrics Dashboard
- [ ] Create CLI command for learning stats
- [ ] Show patterns by domain
- [ ] Show learning improvement over time

### Phase 5: Pattern Utilization
- [ ] Integrate pattern search in task routing
- [ ] Use patterns for test generation
- [ ] Surface patterns in agent prompts

---

## 5. Verification Commands

```bash
# Check current learning data
sqlite3 .agentic-qe/memory.db "SELECT COUNT(*) FROM learning_experiences"
sqlite3 .agentic-qe/memory.db "SELECT COUNT(*) FROM patterns"

# View pattern domains
sqlite3 .agentic-qe/memory.db "SELECT domain, COUNT(*) as cnt FROM patterns GROUP BY domain"

# Learning stats
npx aqe learning stats --detailed

# Extract patterns from experiences
npx aqe learning extract --min-reward 0.7

# Export learning data
npx aqe learning export --output learning-backup.json
```

---

## 6. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AQE v3 LEARNING LAYER                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐            │
│  │   Claude     │   │   QE Hooks   │   │   Agent      │            │
│  │   Code       │──▶│  (v3-qe-    │──▶│  Execution   │            │
│  │   Hooks      │   │   bridge.sh) │   │              │            │
│  └──────────────┘   └──────────────┘   └──────────────┘            │
│                            │                   │                     │
│                            ▼                   ▼                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  AQE LEARNING ENGINE                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │  │
│  │  │  Experience │  │  Pattern    │  │  Q-Learning │           │  │
│  │  │  Capture    │  │  Store      │  │  Algorithm  │           │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘           │  │
│  │         │                │                │                   │  │
│  │         └────────────────┼────────────────┘                   │  │
│  │                          ▼                                    │  │
│  │              ┌───────────────────────┐                        │  │
│  │              │   Unified Memory      │                        │  │
│  │              │   (SQLite + HNSW)     │                        │  │
│  │              └───────────────────────┘                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                            │                                        │
│                            ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              .agentic-qe/memory.db                            │  │
│  │  ┌─────────────┬─────────────┬─────────────┬─────────────┐   │  │
│  │  │ patterns    │ experiences │ q_values    │ goap_*      │   │  │
│  │  └─────────────┴─────────────┴─────────────┴─────────────┘   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Next Steps

1. **Verify AQE MCP server is running** and tools work
2. **Test pattern storage** via MCP tools
3. **Run test suite** to generate learning experiences
4. **Monitor pattern growth** over time
5. **Implement feedback loop** for continuous improvement

---

*Generated: 2026-02-05*
*Version: 3.5.2*
