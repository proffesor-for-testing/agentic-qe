# V3 Data Persistence Audit Report

**Date:** 2026-01-15
**Status:** CRITICAL - Data Not Persisting
**Auditor:** Claude Code Analysis

---

## Executive Summary

V3 QE agents are NOT persisting any learning data. All data is lost when processes exit because the core components use in-memory backends instead of persistent storage.

---

## Root Cause Analysis

### 1. QEKernelImpl Uses In-Memory Backend

**File:** `v3/src/kernel/kernel.ts:78`
```typescript
this._memory = new InMemoryBackend();  // ALL DATA LOST ON EXIT!
```

The kernel is hardcoded to use `InMemoryBackend()` which stores data in a JavaScript Map that is destroyed when the process exits.

### 2. MCP Tools Use Ephemeral Map Storage

**8 MCP tools affected:**
- `contract-testing/validate.ts`
- `chaos-resilience/inject.ts`
- `coverage-analysis/index.ts`
- `learning-optimization/optimize.ts`
- `code-intelligence/analyze.ts`
- `test-generation/generate.ts`
- `defect-intelligence/predict.ts`
- `visual-accessibility/index.ts`

All use `createMinimalMemoryBackend()`:
```typescript
function createMinimalMemoryBackend(): MemoryBackend {
  const store = new Map<string, { value: unknown; metadata?: unknown }>();
  // ALL DATA LOST ON EXIT!
}
```

### 3. Data Directory Chaos

Three separate data directories exist:
| Directory | Purpose | Status |
|-----------|---------|--------|
| `/workspaces/agentic-qe/.agentic-qe/` | V2 data (root) | ABANDONED Jan 11 |
| `/workspaces/agentic-qe/v3/.agentic-qe/` | V3 data | Active but barely used |
| `/workspaces/agentic-qe/v3/.aqe/` | Migration created | UNUSED duplicate |

---

## Data Inventory

### V2 Data (ABANDONED - `/workspaces/agentic-qe/.agentic-qe/memory.db`)

| Table | Records | Description | V3 Status |
|-------|---------|-------------|-----------|
| `memory_entries` | 2,060 | Agent memories, context | NOT MIGRATED |
| `learning_experiences` | 665 | RL experiences (state, action, reward) | NOT MIGRATED |
| `q_values` | 517 | Q-learning values | NOT MIGRATED |
| `patterns` | 45 | Learned patterns | Migrated to qe_patterns |
| `events` | 1,082 | System events | NOT MIGRATED |
| `concept_nodes` | 148 | Knowledge graph nodes | NOT MIGRATED |
| `concept_edges` | 3 | Knowledge graph edges | NOT MIGRATED |
| `dream_insights` | 14 | Cognitive synthesis results | NOT MIGRATED |
| `dream_cycles` | 149 | Dream processing cycles | NOT MIGRATED |
| `captured_experiences` | 180 | Captured agent experiences | NOT MIGRATED |
| `synthesized_patterns` | 19 | Auto-synthesized patterns | NOT MIGRATED |
| `goap_actions` | 61 | Goal-oriented actions | Partial (17 in V3) |
| `goap_plans` | 27 | Goal-oriented plans | NOT MIGRATED |
| `hints` | 7 | Learning hints | NOT MIGRATED |
| `agent_registry` | 29 | Registered agents | NOT MIGRATED |

**Total V2 Records:** ~5,000+
**Migrated to V3:** ~955 (patterns only)
**Data Loss:** ~80%

### V3 Data (Active but static - `/workspaces/agentic-qe/v3/.agentic-qe/`)

| Database | Table | Records | Last Entry |
|----------|-------|---------|------------|
| `qe-patterns.db` | `qe_patterns` | 910 | 2026-01-11 10:44:59 |
| `qe-patterns.db` | `qe_pattern_embeddings` | 910 | 2026-01-12 |
| `qe-patterns.db` | `qe_pattern_usage` | 0 | Never |
| `qe-patterns.db` | `qe_trajectories` | 0 | Never |
| `memory.db` | `goap_actions` | 17 | Unknown |
| `memory.db` | All other tables | 0 | Never |

**No new data written since January 12th!**

---

## Impact Assessment

### Features Not Working in V3

1. **Learning Persistence** - Agents cannot learn across sessions
2. **Experience Replay** - Q-learning experiences discarded
3. **Pattern Evolution** - Patterns frozen from migration, never updated
4. **Concept Graphs** - Knowledge graphs completely abandoned
5. **Dream Synthesis** - Cognitive features (dream cycles, insights) lost
6. **Memory Continuity** - 2,060 memory entries inaccessible
7. **Event History** - 1,082 events not available for analysis

### User Value Loss

V3 provides significantly less value than V2:
- V2: Continuous learning, knowledge accumulation, cognitive synthesis
- V3: Stateless operation, no learning, no memory

---

## Required Fixes

### Fix 1: QEKernelImpl Memory Backend
**File:** `v3/src/kernel/kernel.ts`
- [ ] Replace `new InMemoryBackend()` with `HybridMemoryBackend`
- [ ] Configure SQLite path to `.agentic-qe/memory.db`
- [ ] Add AgentDB for vector storage

### Fix 2: MCP Tools Memory Backend
**Files:** 8 MCP tool files
- [ ] `contract-testing/validate.ts`
- [ ] `chaos-resilience/inject.ts`
- [ ] `coverage-analysis/index.ts`
- [ ] `learning-optimization/optimize.ts`
- [ ] `code-intelligence/analyze.ts`
- [ ] `test-generation/generate.ts`
- [ ] `defect-intelligence/predict.ts`
- [ ] `visual-accessibility/index.ts`

Replace `createMinimalMemoryBackend()` with kernel's shared memory backend.

### Fix 3: Consolidate Data Directories
- [ ] Choose single canonical path (recommend project root `.agentic-qe/`)
- [ ] Update all path references
- [ ] Remove duplicate `.aqe/` directory
- [ ] Ensure CLI respects project root, not cwd

### Fix 4: V2 to V3 Data Migration
Map V2 tables to V3 equivalents:
- [ ] `memory_entries` → V3 memory system
- [ ] `learning_experiences` → `qe_trajectories`
- [ ] `q_values` → V3 Q-learning system
- [ ] `concept_nodes/edges` → Code intelligence domain
- [ ] `dream_insights/cycles` → Learning optimization domain
- [ ] `captured_experiences` → `qe_trajectories`
- [ ] `synthesized_patterns` → `qe_patterns`

---

## Verification Checklist

After fixes, verify:
- [ ] New patterns are persisted to database
- [ ] Patterns survive process restart
- [ ] Learning experiences are recorded
- [ ] Q-values are updated and saved
- [ ] Memory entries accumulate over time
- [ ] Single data directory used consistently
- [ ] V2 data accessible to V3 agents

---

## Timeline

- **Jan 11, 10:44** - Last V2 agent activity
- **Jan 12, 13:49** - Last migration activity
- **Jan 12-15** - V3 running stateless (all data lost)
- **Jan 15** - This audit conducted

---

## Files Referenced

- `v3/src/kernel/kernel.ts` - QEKernelImpl with InMemoryBackend
- `v3/src/kernel/hybrid-backend.ts` - HybridMemoryBackend (should use this)
- `v3/src/mcp/tools/*/` - 8 MCP tools with minimal backend
- `v3/src/domains/domain-interface.ts` - BaseDomainPlugin memory injection
- `v3/src/cli/commands/hooks.ts` - Only component using HybridMemoryBackend
