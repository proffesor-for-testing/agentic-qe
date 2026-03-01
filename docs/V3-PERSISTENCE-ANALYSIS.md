# V3 Persistence & Self-Learning System Analysis

**Date**: 2026-02-03
**Status**: Investigation Complete

## Database Tables Analysis

### V3 Core Tables (ESSENTIAL - defined in unified-memory.ts)

| Table | Purpose | Self-Learning Role |
|-------|---------|-------------------|
| `schema_version` | Migration tracking | Infrastructure |
| `kv_store` | Key-value storage (v2 compatible) | Pattern storage, metrics |
| `vectors` | Vector embeddings for HNSW search | Semantic pattern matching |
| `rl_q_values` | Reinforcement learning Q-values | Agent action learning |
| `goap_goals` | Goal-Oriented Action Planning | Planning system |
| `goap_actions` | GOAP actions | Action library |
| `goap_plans` | GOAP execution plans | Plan reuse |
| `goap_execution_steps` | GOAP step execution | Execution tracking |
| `goap_plan_signatures` | Plan similarity matching | Plan deduplication |
| `concept_nodes` | Dream engine concept graph | Pattern discovery |
| `concept_edges` | Dream engine relationships | Association learning |
| `dream_cycles` | Dream cycle records | Consolidation tracking |
| `dream_insights` | Generated insights | Novel discoveries |
| `qe_patterns` | QE patterns (ReasoningBank) | **Core learning storage** |
| `qe_pattern_embeddings` | Pattern embeddings | Semantic search |
| `qe_pattern_usage` | Pattern usage tracking | Effectiveness learning |
| `qe_trajectories` | Learning trajectories | Experience capture |
| `embeddings` | Embedding cache | Performance optimization |
| `execution_results` | Plan execution results | Success tracking |
| `executed_steps` | Step execution tracking | Granular metrics |
| `mincut_snapshots` | MinCut graph snapshots | System health |
| `mincut_history` | MinCut history | Trend analysis |
| `mincut_weak_vertices` | Bottleneck detection | Self-healing |
| `mincut_alerts` | MinCut alerts | Alerting |
| `mincut_healing_actions` | Self-healing history | Recovery learning |
| `mincut_observations` | Strange Loop observations | Self-organization |
| `sona_patterns` | Neural backbone patterns | Deep learning |
| `hypergraph_nodes` | Hypergraph storage | Complex relationships |
| `hypergraph_edges` | Hypergraph edges | Multi-way associations |

### V2 Legacy Tables (Can be migrated/archived)

| Table | Origin | Status |
|-------|--------|--------|
| `memory_entries` | V2 memory store | Superseded by `kv_store` |
| `patterns` | V2 patterns | Superseded by `qe_patterns` |
| `events` | V2 events | Superseded by `kv_store` events namespace |
| `sessions` | V2 sessions | Empty (0 records) |
| `hints` | V2 hints | Stale (Dec 2025) |
| `learning_experiences` | V2 learning | Superseded by `qe_trajectories` |
| `learning_history` | V2 learning | Empty (0 records) |
| `learning_metrics` | V2 metrics | Empty (0 records) |
| `experiences` | V2 experiences | Superseded by `captured_experiences` |
| `agent_registry` | V2 agent tracking | Superseded by fleet system |
| `performance_metrics` | V2 performance | Empty (0 records) |
| `consensus_state` | V2 consensus | Unused |
| `workflow_state` | V2 workflow | Empty (0 records) |
| `q_values` | V2 Q-learning | Superseded by `rl_q_values` |

## Background Workers for Self-Learning

### Core Workers (11 total)

| Worker | Interval | Learning Role |
|--------|----------|---------------|
| `LearningConsolidationWorker` | 30 min | **Critical**: Pattern consolidation, dream cycles |
| `TestHealthWorker` | 5 min | Test suite health metrics |
| `CoverageTrackerWorker` | 10 min | Coverage gap detection |
| `FlakyDetectorWorker` | 15 min | Flaky test pattern learning |
| `SecurityScanWorker` | 30 min | Vulnerability pattern learning |
| `QualityGateWorker` | 5 min | Quality metric learning |
| `DefectPredictorWorker` | 15 min | ML defect prediction |
| `RegressionMonitorWorker` | 10 min | Regression pattern learning |
| `PerformanceBaselineWorker` | 1 hour | Performance trend learning |
| `ComplianceCheckerWorker` | 30 min | ADR/DDD compliance learning |
| `CloudSyncWorker` | 5 min | Cross-instance sync |

### Worker Status
- **Workers directory**: Created at `.agentic-qe/workers/`
- **Registry**: Created at `.agentic-qe/workers/registry.json`
- **Daemon script**: Created at `.agentic-qe/workers/start-daemon.sh`

## MCP Server Persistence

### How It Works
1. **HybridMemoryBackend** (`v3/src/kernel/hybrid-backend.ts`) connects to `memory.db`
2. **All MCP tools** share the backend via `getSharedMemoryBackend()`
3. **Fleet handlers** use kernel memory which wraps the backend
4. **Tool base class** ensures all tools persist to the same database

### Connection Flow
```
MCP Tool → getSharedMemoryBackend() → HybridMemoryBackend → UnifiedMemoryManager → memory.db
```

## Current Issues Found

1. **Workers not running**: Directory didn't exist (now created)
2. **Dream scheduler inactive**: Last cycle Jan 2, 2026
3. **No processes calling persistence**: MCP server needs to be running
4. **47 dream cycles stuck in "running"**: Previous crashes without cleanup

## Recommendations

### Immediate Actions
1. ✅ Created workers directory and registry
2. ✅ Created daemon startup script
3. Start MCP server: `npm run mcp`
4. Run dream cycle: `qe/learning/dream { action: "dream" }`

### Init Integration
The `aqe init --auto` should:
1. Create `.agentic-qe/` directory structure
2. Initialize `memory.db` with v3 schema
3. Create workers registry
4. Configure MCP server in `.mcp.json`

### Tables to Keep (V3 Essential)
All 28 tables defined in `unified-memory.ts` are essential for v3 self-learning.

### Tables Safe to Archive
The 14 V2 legacy tables can be archived to a separate database for historical reference.
