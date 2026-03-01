# SPEC-046-A: V2 Feature Implementation Details

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-046-A |
| **Parent ADR** | [ADR-046](../adrs/ADR-046-v2-feature-integration.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-16 |
| **Author** | Claude Code |

---

## Overview

This specification details the implementation of three V2 features integrated into V3: Q-Values Persistence, GOAP Planning, and Dream Cycles.

---

## 1. Q-Values Persistence

### Schema
```sql
CREATE TABLE IF NOT EXISTS rl_q_values (
  id TEXT PRIMARY KEY,
  algorithm TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  q_value REAL NOT NULL DEFAULT 0.0,
  visits INTEGER NOT NULL DEFAULT 0,
  last_reward REAL,
  domain TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(algorithm, agent_id, state_key, action_key)
);
```

### Implementation
- **File:** `v3/src/integrations/rl-suite/persistence/q-value-store.ts` (606 lines)
- **Integration:** BaseRLAlgorithm methods: `saveToStore`, `loadFromStore`, `enablePersistence`

### Performance
- Q-value lookup: 0.004ms avg, 0.011ms max (target: <10ms)

---

## 2. GOAP System

### Schema (4 tables)
- `goap_goals`: Goal definitions with priority and preconditions
- `goap_actions`: 52 QE actions across 7 categories
- `goap_plans`: Cached execution plans
- `goap_execution_steps`: Step-by-step execution history

### Implementation Files
```
v3/src/planning/
  types.ts                   # GOAP type definitions
  goap-planner.ts            # A* planning algorithm (1253 lines)
  plan-executor.ts           # Plan execution with agent spawning
  actions/qe-action-library.ts  # 52 QE actions
  schema/goap-tables.sql     # Database schema
```

### QE Action Categories (52 actions)
| Category | Count | Examples |
|----------|-------|----------|
| Test Generation | 8 | generate-unit-tests, generate-e2e-tests |
| Coverage Analysis | 6 | analyze-coverage, detect-gaps |
| Quality Assessment | 7 | run-quality-gate, assess-complexity |
| Security | 6 | run-sast-scan, audit-dependencies |
| Contract Testing | 5 | validate-api-contract, check-schema |
| Performance | 5 | run-load-test, profile-memory |
| Coordination | 15 | spawn-agent, delegate-task |

### MCP Tools
- `goap-plan`: Create execution plan for a goal
- `goap-execute`: Execute a cached plan
- `goap-status`: Check plan execution status

### Performance
- Plan finding: 11-140ms typical (target: <500ms)
- Cache hit rate: 25% measured

---

## 3. Dream Cycles

### Schema (4 tables)
- `concept_nodes`: Knowledge graph nodes
- `concept_edges`: Relationships between concepts
- `dream_cycles`: Dream session metadata
- `dream_insights`: Generated insights

### Implementation Files
```
v3/src/learning/dream/
  concept-graph.ts           # Knowledge graph (23KB)
  spreading-activation.ts    # Activation propagation (19KB)
  insight-generator.ts       # Novel pattern synthesis (30KB)
  dream-engine.ts            # Dream cycle orchestrator (826 lines)
  schema/dream-tables.sql    # Database schema
```

### Integration
- Worker trigger: `DreamConsolidatorWorker` via hooks system
- Trigger type: `consolidate`

---

## Test Coverage

| Component | Tests | Status |
|-----------|-------|--------|
| Q-Values Persistence | 12 | Passing |
| GOAP Planner | 18 | Passing |
| Plan Executor | 9 | Passing |
| Dream Engine | 18 | Passing |
| **Total** | **57** | **All passing** |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-16 | Claude Code | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-046-v2-feature-integration.md)
- [V2 GOAPPlanner](../../../src/planning/GOAPPlanner.ts)
- [V2 DreamEngine](../../../src/learning/dream/DreamEngine.ts)
