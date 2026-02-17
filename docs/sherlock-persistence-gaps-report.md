# Sherlock Investigation: V3 Persistence Gaps Report

**Date:** 2026-02-17
**Investigator:** Sherlock Review (Evidence-Based Analysis)
**Database:** `.agentic-qe/memory.db` (schema version 8, 38 tables)
**Scope:** 13 empty tables + dream scheduler auto-run failure

---

## Executive Summary

Of 38 tables in the v3 unified memory database, **13 remain permanently empty** despite having fully defined schemas and (in most cases) complete persistence code. The root causes fall into 4 categories:

| Category | Tables Affected | Root Cause |
|---|---|---|
| **QualityFeedbackLoop never instantiated** | `test_outcomes`, `coverage_sessions`, `routing_outcomes` | Complete feedback system exists but is never wired into production runtime |
| **Persistence methods never called** | `mincut_alerts`, `mincut_weak_vertices`, `mincut_healing_actions`, `mincut_observations` | Methods exist on `MinCutPersistence` but no production code calls them |
| **Wrong storage target / in-memory only** | `vectors`, `embeddings`, `goap_execution_steps` | Code writes to in-memory maps, JSON files, or a parallel table instead |
| **Feature code not wired up** | `hypergraph_nodes`, `hypergraph_edges`, `experience_applications` | Builder/recorder methods exist but have zero production callers |

Additionally, the **dream scheduler** runs on a 1-hour timer but fails silently every cycle because `loadPatternsAsConcepts()` is never called in the automated path.

---

## Investigation Details

### 1. `vectors` table

**Verdict: NOT POPULATED - Multiple bypass paths**

| Evidence | Finding |
|---|---|
| Schema | `unified-memory-schemas.ts:45-58`, created at migration v2 |
| INSERT code | `unified-memory.ts:517-526` - `vectorStore()` method exists and is correct |
| Callers | 8+ domain services call `memory.storeVector()` through `QEUnifiedMemory` |

**Broken Links:**

1. **ONNX Embedding MCP tool** stores in-memory only
   - `v3/src/integrations/agentic-flow/onnx-embeddings/adapter.ts:156` - `this.search.store(stored)` writes to `Map<string, StoredEmbedding>`, never calls `vectorStore()`

2. **Governance shard embeddings** writes to JSON file
   - `v3/src/governance/shard-embeddings.ts:784` - `persistEmbeddings()` writes `.agentic-qe/shard-embeddings.json`, bypasses `vectors` table entirely

3. **RuVector server client** is stubbed
   - `v3/src/integrations/ruvector/server-client.ts:454-461` - `supportsVectorOperations()` hardcoded `false`; all `storeVector()` calls are no-ops

4. **Domain services** (defect-intelligence, test-generation, code-intelligence, coverage-analysis) call `memory.storeVector()` which routes through `QEUnifiedMemory` → `HybridBackend` → `UnifiedMemoryManager.vectorStore()`. This path IS wired correctly, but these domain services are only invoked during specific operations (code intelligence scans, pattern matching with `enableVectorSearch: true`). The domain coordinators may not be initializing with the right config flags.

---

### 2. `embeddings` table

**Verdict: NOT POPULATED - Async race condition**

| Evidence | Finding |
|---|---|
| Schema | `unified-memory-schemas.ts:303-317`, created at migration v4 |
| INSERT code | `EmbeddingCache.ts:333-348` - `persistToDisk()` exists and is correct |
| Guard | `EmbeddingCache.ts:217-219` - `if (this.persistent && this.db)` |

**Broken Link:** `EmbeddingCache.ts:114-129`

In the unified memory path (ADR-046 default), `this.db` is assigned **asynchronously** via `.then()` callback:

```typescript
this.unifiedMemory.initialize().then(() => {
  this.db = this.unifiedMemory!.getDatabase();  // async assignment
}).catch((error) => {
  this.db = null;  // stays null on failure
});
```

Any `set()` calls before `.then()` resolves find `this.db === null` and silently skip `persistToDisk()`. Embeddings generated during startup are permanently lost. This is a classic async initialization race.

---

### 3. `hypergraph_nodes` and `hypergraph_edges`

**Verdict: NOT POPULATED - Builder method never called in production**

| Evidence | Finding |
|---|---|
| Schema | `migrations/20260120_add_hypergraph_tables.ts:24-70`, migration v6. Also created in separate `hypergraph.db` |
| Engine | `HypergraphEngine` initialized when `enableHypergraph: true` (default) |
| Write methods | `hypergraph-engine.ts:299` `addNode()`, `hypergraph-engine.ts:333` `addEdge()`, `hypergraph-engine.ts:843` `buildFromIndexResult()` |

**Broken Link:** `v3/src/coordination/protocols/code-intelligence-index.ts:452`

The `CodeIndexProtocol` calls `codeIntelligence.index()` but NOT `buildHypergraphFromIndex()`. The `index()` method itself (`coordinator.ts:499-580`) does not internally call `buildHypergraphFromIndex()` either. The `buildHypergraphFromIndex()` method at `coordinator-hypergraph.ts:184` is fully implemented but its only callers are unit tests.

---

### 4. `coverage_sessions`

**Verdict: NOT POPULATED - QualityFeedbackLoop not instantiated in production**

| Evidence | Finding |
|---|---|
| Schema | `unified-memory-schemas.ts:554-576` (`FEEDBACK_SCHEMA`), migration v8 |
| INSERT code | `coverage-learner.ts:230` - `INSERT OR REPLACE INTO coverage_sessions` |
| Method chain | `CoverageLearner.persistSession()` ← `learnFromSession()` ← `QualityFeedbackLoop.recordCoverageSession()` |

**Broken Link:** `QualityFeedbackLoop` is **never instantiated in production**

`createQualityFeedbackLoop()` and `createInitializedFeedbackLoop()` have zero production callers. The coverage-analysis coordinator does not import or use `CoverageLearner` or `QualityFeedbackLoop`. Complete system exists only as a standalone library tested in isolation.

---

### 5. `test_outcomes`

**Verdict: NOT POPULATED - Same root cause as coverage_sessions**

| Evidence | Finding |
|---|---|
| Schema | `unified-memory-schemas.ts:505-535` (`FEEDBACK_SCHEMA`), migration v8 |
| INSERT code | `test-outcome-tracker.ts:217` - `INSERT OR REPLACE INTO test_outcomes` |
| Method chain | `TestOutcomeTracker.persistOutcome()` ← `track()` ← `QualityFeedbackLoop.recordTestOutcome()` |

**Broken Link:** Same as #4 - `QualityFeedbackLoop` never instantiated in production. The test-generation coordinator does not import `TestOutcomeTracker` or `QualityFeedbackLoop`.

---

### 6. `routing_outcomes`

**Verdict: NOT POPULATED - Double dead end**

| Evidence | Finding |
|---|---|
| Schema | `unified-memory-schemas.ts:538-550` (`FEEDBACK_SCHEMA`), migration v8 |
| INSERT code | `routing-feedback.ts:165-181` - `INSERT OR REPLACE INTO routing_outcomes` |
| Guard | `routing-feedback.ts:162` - `if (!this.db) return` |

**Broken Links (two):**

1. **`RoutingFeedbackCollector.initialize()` never called** - constructed with `this.db = null` (line 99). Without `initialize()`, every `persistOutcome()` silently returns at the null guard. Only `QualityFeedbackLoop.initialize()` calls it, but `QualityFeedbackLoop` is never instantiated in production.

2. **`TaskExecutor` path is a stub** - `task-executor.ts:1286` has an explicit comment: `// Note: In a future enhancement, we could call router.recordOutcome()`. The actual feedback call was never implemented.

---

### 7. `experience_applications`

**Verdict: NOT POPULATED - Feedback recording method never called**

| Evidence | Finding |
|---|---|
| Schema | Part of experience replay tables |
| INSERT code | `experience-replay.ts:713-722` - `INSERT INTO experience_applications` |
| Method chain | `ExperienceReplay.recordApplication()` ← `QEReasoningBankEnhanced.recordExperienceApplication()` |

**Broken Link:** `recordExperienceApplication()` at `reasoning-bank/index.ts:464-476` is **never called anywhere in production**. The `getGuidance()` path retrieves experience guidance and increments a counter, but the caller is expected to explicitly call `recordExperienceApplication()` after applying guidance — no caller does this.

---

### 8. `goap_execution_steps`

**Verdict: NOT POPULATED - Schema artifact, parallel table used instead**

| Evidence | Finding |
|---|---|
| Schema | `unified-memory-schemas.ts:132-146`, `planning/schema/goap-tables.sql:130-186` |
| INSERT code | **NONE** - zero `INSERT INTO goap_execution_steps` in entire codebase |

**Root Cause:** `PlanExecutor` was implemented with its own parallel table `executed_steps` (which has 425 rows). The `goap_execution_steps` table was designed in the GOAP planning schema but never received persistence code. `PlanExecutor` creates and writes to `executed_steps` at `plan-executor.ts:292-310` (CREATE) and `plan-executor.ts:783-808` (INSERT). The `goap_execution_steps` table is dead schema.

---

### 9-12. MinCut Tables (`mincut_alerts`, `mincut_weak_vertices`, `mincut_healing_actions`, `mincut_observations`)

**Verdict: NOT POPULATED - Persistence methods exist but are never called from production**

Note: `mincut_snapshots` (386 rows) and `mincut_history` (33 rows) ARE populated via `QueenMinCutBridge`.

| Table | Method | Defined At | Production Callers |
|---|---|---|---|
| `mincut_alerts` | `saveAlert()` | `mincut-persistence.ts:491` | **Zero** - `MinCutHealthMonitor` stores alerts in-memory `Map` only (line 483), never calls `persistence.saveAlert()` |
| `mincut_weak_vertices` | `saveWeakVertices()` | `mincut-persistence.ts:395` | **Zero** - weak vertices computed and returned in health checks but never persisted |
| `mincut_healing_actions` | `recordHealingAction()` | `mincut-persistence.ts:573` | **Zero** - `StrangeLoopController.runCycle()` does not call it after executing healing |
| `mincut_observations` | `recordObservation()` | `mincut-persistence.ts:693` | Called at `strange-loop.ts:544` BUT `StrangeLoopController` is **never started** in production |

**Root cause for observations:** `StrangeLoopController` is only started by `DreamMinCutController` (`dream-integration.ts:1091`), which is exported from `coordination/index.ts:270` but never instantiated by `queen-coordinator.ts`, `plugin.ts`, or the kernel.

**Root cause for alerts/weak_vertices/healing_actions:** Even if `StrangeLoopController` were running, the code paths that call `saveAlert()`, `saveWeakVertices()`, and `recordHealingAction()` simply don't exist. The in-memory computation happens, but the persistence step was never wired.

---

### 13. Dream Scheduler Auto-Run

**Verdict: CONFIGURED BUT SILENTLY FAILING**

| Evidence | Finding |
|---|---|
| Config | `learning-optimization/coordinator.ts:140-142` - `enableDreamScheduler: true`, `dreamCycleIntervalMs: 3600000` (1 hour) |
| Start | `coordinator.ts:255-256` - `dreamScheduler.initialize()` then `dreamScheduler.start()` called during coordinator init |
| Timer | `dream-scheduler.ts:538-558` - `setTimeout` fires every hour, calls `executeDream()` |

**Broken Link:** `dream-engine.ts:421-427`

```typescript
if (allNodes.length < this.config.minConceptsRequired) {  // default: 10
  throw new Error('Insufficient concepts: ...');
}
```

The `DreamEngine.dream()` method requires at least 10 concept nodes already loaded in the concept graph. The automated scheduler path (`dream-scheduler.ts:479`) calls `dreamEngine.dream()` directly WITHOUT first calling `loadPatternsAsConcepts()`.

The concept loading step is only performed in CLI commands:
- `v3/src/cli/commands/hooks.ts:356`
- `v3/src/cli/commands/learning.ts:1083`

When the scheduler timer fires, `dream()` throws `Insufficient concepts`, the error is caught in `scheduleNextDream()` at line 549 which logs `'Scheduled dream failed'` and reschedules. The cycle repeats every hour, failing silently forever.

**Fix:** Add `await this.dreamEngine.loadPatternsAsConcepts()` before the `dream()` call in `dream-scheduler.ts:executeDream()` (around line 478).

---

## Consolidated Root Cause Analysis

### Pattern 1: QualityFeedbackLoop Island (3 tables)

**Tables:** `test_outcomes`, `coverage_sessions`, `routing_outcomes`

The entire `v3/src/feedback/` subsystem is a complete, tested, self-contained feedback loop that was **never integrated into the running application**. The factory functions `createQualityFeedbackLoop()` and `createInitializedFeedbackLoop()` are exported but never imported by any coordinator, kernel, or MCP handler.

**Fix:** Instantiate `QualityFeedbackLoop` in the kernel or queen coordinator and wire `recordTestOutcome()` / `recordCoverageSession()` / `recordRoutingOutcome()` calls into the respective domain coordinators (test-generation, coverage-analysis, routing).

### Pattern 2: Persistence Method Exists But No Caller (4 tables)

**Tables:** `mincut_alerts`, `mincut_weak_vertices`, `mincut_healing_actions`, `mincut_observations`

The `MinCutPersistence` class has full CRUD for all 6 mincut tables, but `QueenMinCutBridge` (the only production consumer) only calls `saveSnapshot()` and `recordHistory()`. The other 4 persistence methods have zero production callers.

**Fix:** Wire `saveAlert()`, `saveWeakVertices()` calls into `MinCutHealthMonitor.checkHealth()`. Wire `recordHealingAction()` and `recordObservation()` into `StrangeLoopController.runCycle()`. Start `DreamMinCutController` from the queen coordinator or kernel.

### Pattern 3: In-Memory / Wrong Target (3 tables)

**Tables:** `vectors`, `embeddings`, `goap_execution_steps`

- `vectors`: Multiple code paths bypass the DB and store in in-memory Maps or JSON files
- `embeddings`: Async init race condition causes `this.db` to be null when writes happen
- `goap_execution_steps`: Dead schema — `PlanExecutor` uses its own `executed_steps` table

**Fix:**
- `vectors`: Wire `onnx-embeddings/adapter.ts` and `shard-embeddings.ts` to use `UnifiedMemoryManager.vectorStore()`
- `embeddings`: Fix async init in `EmbeddingCache.ts` — either `await` the initialization or queue writes until `this.db` is ready
- `goap_execution_steps`: **Delete this table** — it's a duplicate of `executed_steps` with a slightly different schema

### Pattern 4: Builder/Recorder Never Triggered (2 tables)

**Tables:** `hypergraph_nodes`, `hypergraph_edges`

The `HypergraphEngine` is initialized and connected to the DB, but `buildHypergraphFromIndex()` is never called. The `CodeIndexProtocol` calls `index()` which does not chain to the hypergraph builder.

**Fix:** Add `await coordinator.buildHypergraphFromIndex(indexResult)` after `codeIntelligence.index()` in `code-intelligence-index.ts:452`.

### Pattern 5: Dream Scheduler Silent Failure

The scheduler runs but `dream()` always throws because concepts aren't pre-loaded in the automated path.

**Fix:** Add `await this.dreamEngine.loadPatternsAsConcepts()` in `dream-scheduler.ts:executeDream()` before the `dream()` call.

---

## Recommended Actions

### Safe to DELETE (no production use, duplicate, or dead)

| Table | Reason |
|---|---|
| `goap_execution_steps` | Dead schema artifact; `executed_steps` is the real table used by `PlanExecutor` |

### Need Wiring (persistence code exists, just not connected)

| Priority | Tables | Effort | Impact |
|---|---|---|---|
| **P0** | Dream scheduler fix | 1 line | Restores automatic dream consolidation |
| **P1** | `test_outcomes`, `coverage_sessions`, `routing_outcomes` | Wire `QualityFeedbackLoop` into kernel | Enables learning feedback loop |
| **P1** | `experience_applications` | Add `recordExperienceApplication()` call after `getGuidance()` | Enables experience replay tracking |
| **P2** | `mincut_alerts`, `mincut_weak_vertices` | Wire calls in `MinCutHealthMonitor` | Enables alert persistence |
| **P2** | `mincut_healing_actions`, `mincut_observations` | Start `StrangeLoopController` + wire calls | Enables self-healing persistence |
| **P2** | `hypergraph_nodes`, `hypergraph_edges` | Add `buildHypergraphFromIndex()` call in protocol | Enables code structure graph |
| **P3** | `vectors` | Wire ONNX adapter + shard embeddings to `vectorStore()` | Unified vector storage |
| **P3** | `embeddings` | Fix async init race in `EmbeddingCache` | Embedding cache persistence |

---

*Investigation conducted using evidence-based Sherlock methodology. All file:line references verified against codebase at commit c0ae3fa8.*
