# RVF Cognitive Container Integration Plan for AQE

> **Date**: 2026-02-22
> **Status**: Proposed
> **Depends on**: ADR-065 Bridge Layer (Phase 0.5), ADR-047 (MinCut Self-Organizing)
> **Complements**: `docs/plans/rvf-integration-implementation-plan.md` (VectorBackend bridge)

---

## Executive Summary

This plan integrates RVF (RuVector Format) cognitive container capabilities into the AQE platform across three phases: Shadow Mode (validation), Progressive Integration (unification), and Native RVF (production). It targets capabilities orthogonal to the existing VectorBackend bridge plan: mincut-based routing, RVCOW dream cycle branching, witness chain quality attestation, HNSW unification, Stoer-Wagner health monitoring, and RVF container portability.

### Key Constraint: SDK Reality

Per the Phase 0 Gate Report (`docs/plans/rvf-phase0-gate-report.md`):

- **Working NOW**: `@ruvector/gnn` (HNSW, differentiable search), `@ruvector/sona` (pattern learning), `@ruvector/attention` (Flash Attention), `@ruvector/core` (VectorDb)
- **Rust-complete, npm-stub**: `@ruvector/rvf-node` (no binaries), `@ruvector/mincut-node` (unverified -- must validate before relying on it)
- **Strategy**: Phase 1 uses only verified npm packages + TypeScript implementations. Phases 2-3 gate on `@ruvector/rvf-node` and `@ruvector/mincut-node` binary availability.

### Relationship to Existing Plans

- The VectorBackend bridge plan (`rvf-integration-implementation-plan.md`) handles `VectorBackend` interface, `@ruvector/core` integration, and lazy persistence. Tasks RVF-0.5.1 through RVF-0.5.8.
- This plan handles complementary concerns: mincut routing, dream cycle branching, witness chains, HNSW unification, health monitoring, and container portability.
- No file conflicts between plans. This plan creates new files and extends (does not replace) existing ones.

---

## Workstream Architecture

Tasks are organized into 4 independent workstreams that can run in parallel within each phase. Cross-workstream dependencies are explicitly called out.

| Workstream | Focus | Lead Agent Type |
|------------|-------|----------------|
| **WS-A** | MinCut Routing | coder |
| **WS-B** | Dream Cycle + RVCOW Branching | coder |
| **WS-C** | Witness Chain + Quality Gates | coder |
| **WS-D** | HNSW Unification + Health Monitoring | coder |

---

## Phase 1: Shadow Mode (Weeks 1-4)

All Phase 1 tasks run in shadow/observability-only mode. No production behavior changes. All decisions are logged but not acted upon. This validates the new systems against real workloads before any cutover.

### Workstream A: MinCut Routing

#### Task 1.1: Validate @ruvector/mincut-node Availability

**Description**: Probe whether `@ruvector/mincut-node` has functional N-API binaries on the target platform (linux-x64-gnu). If not, the existing TypeScript `MinCutCalculator` in `v3/src/coordination/mincut/mincut-calculator.ts` becomes the reference implementation and we skip the native dependency.

| Field | Value |
|-------|-------|
| Files to modify | None (validation only) |
| Files to create | `scripts/validate-mincut-node.ts` |
| Agent | researcher |
| Dependencies | None |
| Parallel Group | Phase1-Immediate |
| Risk Level | Low |
| Est. Hours | 2 |

**Validation steps**:
1. `npm info @ruvector/mincut-node` -- check published versions and binary artifacts
2. `npm install @ruvector/mincut-node` in a temp directory -- check for prebuild download
3. Attempt `require('@ruvector/mincut-node')` and call `subpolynomialDynamic()` with test graph
4. If functional: record latency benchmarks vs TypeScript `MinCutCalculator`
5. If stub: document in gate report, proceed with TypeScript implementation only

**Test Strategy**: Script outputs a JSON gate report at `reports/mincut-node-validation.json`.

**Rollback**: No changes to codebase. Script is standalone.

---

#### Task 1.2: Create mincut-wrapper.ts

**Description**: Create a wrapper that provides a unified interface over either `@ruvector/mincut-node` (native) or the existing TypeScript `MinCutCalculator`, selected at initialization time. This follows the same pattern as `gnn-wrapper.ts` and `sona-wrapper.ts`.

| Field | Value |
|-------|-------|
| Files to create | `v3/src/integrations/ruvector/mincut-wrapper.ts` |
| Files to modify | `v3/src/integrations/ruvector/index.ts` (add export) |
| Agent | coder |
| Dependencies | Task 1.1 (gate result determines native availability) |
| Parallel Group | WS-A |
| Risk Level | Low |
| Est. Hours | 4 |

**Interface**:

```typescript
/**
 * Unified MinCut wrapper -- native or TypeScript backend
 * Follows the same pattern as gnn-wrapper.ts and sona-wrapper.ts
 */

/** MinCut algorithm selection */
export type MinCutAlgorithm =
  | 'subpolynomial-dynamic'  // Fastest: 128.7ns query (native), O(V) approx (TS)
  | 'stoer-wagner'           // Exact undirected: O(V^3)
  | 'karger'                 // Randomized: O(E), high probability
  | 'dinic';                 // Max-flow/min-cut: for attention gating

/** Graph input for mincut computation */
export interface MinCutGraph {
  readonly vertices: ReadonlyArray<{
    readonly id: string;
    readonly weight: number;
    readonly metadata?: Record<string, unknown>;
  }>;
  readonly edges: ReadonlyArray<{
    readonly source: string;
    readonly target: string;
    readonly capacity: number;
  }>;
}

/** MinCut computation result */
export interface MinCutComputeResult {
  readonly value: number;
  readonly sourceSide: readonly string[];
  readonly targetSide: readonly string[];
  readonly cutEdges: ReadonlyArray<{ source: string; target: string; capacity: number }>;
  readonly algorithm: MinCutAlgorithm;
  readonly backend: 'native' | 'typescript';
  readonly durationNs: number;
}

/** Lambda (connectivity) for a single vertex */
export interface VertexLambda {
  readonly vertexId: string;
  readonly lambda: number;
  readonly isBottleneck: boolean;
}

export interface QEMinCutWrapper {
  /** Compute minimum cut of the graph */
  computeMinCut(graph: MinCutGraph, algorithm?: MinCutAlgorithm): MinCutComputeResult;

  /** Compute vertex connectivity (lambda) for all vertices */
  computeLambdas(graph: MinCutGraph): VertexLambda[];

  /** Compute edge connectivity for a specific source-target pair */
  edgeConnectivity(graph: MinCutGraph, source: string, target: string): number;

  /** Get the backend being used */
  getBackend(): 'native' | 'typescript';

  /** Health check */
  isHealthy(): boolean;

  /** Dispose resources */
  dispose(): void;
}

/** Factory function */
export function createQEMinCutWrapper(options?: {
  preferNative?: boolean;
}): QEMinCutWrapper;
```

**Implementation notes**:
- Try `require('@ruvector/mincut-node')` at module load time (same pattern as `unified-memory-hnsw.ts` lines 16-28)
- If native unavailable, wrap `MinCutCalculator` from `v3/src/coordination/mincut/mincut-calculator.ts`
- The existing `MinCutCalculator` already implements `approxMinCut` (weighted degree), `stoerWagnerMinCut`, and `kargersMinCut`
- For `dinic` algorithm: implement in TypeScript (Dinic's max-flow is ~100 LOC) or defer to native
- `durationNs` measured via `process.hrtime.bigint()`

**Test Strategy**: Unit tests with mocked native module. Integration tests with real graph from `SwarmGraph`.

**Rollback**: Remove export from `index.ts`. No production code depends on this wrapper yet.

---

#### Task 1.3: MinCutRoutingService -- Lambda-Based Task Complexity

**Description**: Implement a service that models the AQE task routing problem as a graph and uses mincut lambda (vertex connectivity) to determine task complexity for the 3-tier model router. This runs in shadow mode alongside the existing `TaskRouter` in `v3/src/mcp/services/task-router.ts`.

| Field | Value |
|-------|-------|
| Files to create | `v3/src/mcp/services/mincut-routing-service.ts` |
| Files to modify | None (shadow mode -- no wiring yet) |
| Agent | coder |
| Dependencies | Task 1.2 |
| Parallel Group | WS-A |
| Risk Level | Low (shadow only) |
| Est. Hours | 6 |

**Interface**:

```typescript
import type { RoutingInput, RoutingDecision, ModelTier } from '../../integrations/agentic-flow';

/** MinCut routing context -- models task as graph problem */
export interface MinCutRoutingContext {
  /** Task description */
  readonly task: string;
  /** Domain context */
  readonly domain?: string;
  /** File paths involved */
  readonly filePaths?: readonly string[];
  /** Code complexity metrics (if available) */
  readonly codeContext?: string;
  /** Whether task is critical */
  readonly isCritical?: boolean;
}

/** Shadow routing result -- for comparison with production router */
export interface ShadowRoutingResult {
  /** MinCut-derived tier recommendation */
  readonly mincutTier: ModelTier;
  /** Lambda (connectivity) score used for the decision */
  readonly lambda: number;
  /** Production router's actual decision (for A/B comparison) */
  readonly productionTier: ModelTier;
  /** Whether mincut and production agree */
  readonly agrees: boolean;
  /** Graph structure used for the computation */
  readonly graphStats: {
    readonly vertices: number;
    readonly edges: number;
    readonly mincutValue: number;
  };
  /** Computation time */
  readonly durationMs: number;
  /** Timestamp */
  readonly timestamp: string;
}

export interface MinCutRoutingService {
  /** Compute shadow routing decision (does NOT affect production) */
  shadowRoute(context: MinCutRoutingContext): ShadowRoutingResult;

  /** Get accumulated shadow comparison metrics */
  getMetrics(): {
    readonly totalDecisions: number;
    readonly agreementRate: number;
    readonly mincutFasterTier: number;
    readonly mincutSlowerTier: number;
    readonly avgLambda: number;
    readonly avgDurationMs: number;
  };

  /** Reset metrics */
  resetMetrics(): void;

  /** Dispose resources */
  dispose(): void;
}
```

**Complexity-to-tier mapping**:

The service models the task as a dependency graph:
- Vertices: code modules mentioned in `filePaths`, domain agents, test suites
- Edges: import relationships, agent communication channels, test coverage links
- Lambda: minimum vertex connectivity of the task subgraph

Mapping lambda to ModelTier:
- `lambda >= 5.0` (highly connected, complex): Tier 3 (Sonnet/Opus)
- `lambda >= 2.0` (moderate connectivity): Tier 2 (Haiku)
- `lambda >= 1.0` (simple, isolated): Tier 1 (Booster)
- `lambda < 1.0` (disconnected): Tier 0 (Booster, trivial)

Thresholds are configurable and will be tuned based on shadow comparison data.

**Test Strategy**: Unit tests with synthetic graphs at known lambda values. Verify tier mapping. Mock the mincut wrapper.

**Rollback**: Delete file. No production wiring.

---

#### Task 1.4: A/B Shadow Comparison Framework

**Description**: Create a lightweight A/B comparison framework that logs every routing decision from both the production 3-tier router and the shadow MinCut router, enabling data-driven evaluation.

| Field | Value |
|-------|-------|
| Files to create | `v3/src/mcp/services/routing-ab-comparator.ts` |
| Files to modify | `v3/src/mcp/services/task-router.ts` (add shadow hook, ~10 LOC) |
| Agent | coder |
| Dependencies | Task 1.3 |
| Parallel Group | WS-A |
| Risk Level | Low (logging only) |
| Est. Hours | 4 |

**Interface**:

```typescript
export interface RoutingComparison {
  readonly taskId: string;
  readonly timestamp: string;
  readonly productionTier: number;
  readonly mincutTier: number;
  readonly productionLatencyMs: number;
  readonly mincutLatencyMs: number;
  readonly agrees: boolean;
  readonly lambda: number;
  readonly taskDescription: string;
}

export interface ABComparator {
  /** Record a routing comparison */
  record(comparison: RoutingComparison): void;

  /** Get summary statistics */
  getSummary(): {
    readonly total: number;
    readonly agreementRate: number;
    readonly mincutWouldUpgrade: number;
    readonly mincutWouldDowngrade: number;
    readonly avgLambda: number;
    readonly tierDistribution: Record<number, number>;
  };

  /** Export all comparisons (for offline analysis) */
  export(): readonly RoutingComparison[];

  /** Persist to SQLite kv_store namespace 'routing-ab' */
  flush(): void;
}
```

**Modification to `task-router.ts`**:
Add an optional shadow hook that is called after every routing decision. The hook is injected via constructor or `setABComparator()`. When absent, zero overhead.

```typescript
// In TaskRouterService.routeTask():
if (this.abComparator) {
  const shadowResult = this.mincutService.shadowRoute(context);
  this.abComparator.record({
    taskId,
    timestamp: new Date().toISOString(),
    productionTier: decision.tier,
    mincutTier: shadowResult.mincutTier,
    productionLatencyMs: decision.latencyMs,
    mincutLatencyMs: shadowResult.durationMs,
    agrees: shadowResult.agrees,
    lambda: shadowResult.lambda,
    taskDescription: input.task,
  });
}
```

**Test Strategy**: Unit tests verify recording, summary computation, and persistence. Integration test with real `TaskRouterService`.

**Rollback**: Remove the optional hook from `task-router.ts` (revert ~10 LOC). Delete new files.

---

### Workstream B: Dream Cycle + RVCOW Branching

#### Task 1.5: RVCOW Branching Adapter for Dream Cycles

**Description**: Create an adapter that provides copy-on-write branching semantics for dream cycle experimentation. Since `@ruvector/rvf-node` COW is not yet available, implement branching over SQLite using transaction savepoints and in-memory overlays.

| Field | Value |
|-------|-------|
| Files to create | `v3/src/learning/dream/dream-branch-manager.ts` |
| Files to modify | `v3/src/learning/dream/dream-engine.ts` (optional injection point, ~15 LOC) |
| Agent | coder |
| Dependencies | None (uses existing SQLite) |
| Parallel Group | WS-B |
| Risk Level | Medium (touches dream engine) |
| Est. Hours | 8 |

**Interface**:

```typescript
/**
 * Copy-on-Write branching for dream cycle experimentation.
 *
 * Allows the DreamEngine to create isolated "branches" where speculative
 * pattern associations can be tested without affecting the main pattern store.
 * Successful branches are merged; failed branches are discarded.
 *
 * Implementation: SQLite savepoints + in-memory overlay (now).
 * Future: @ruvector/rvf-node RVCOW derive() when binaries ship.
 */

export interface DreamBranch {
  readonly branchId: string;
  readonly parentId: string | null;
  readonly createdAt: string;
  readonly status: 'active' | 'merged' | 'discarded';
  readonly insightCount: number;
}

export interface DreamBranchManager {
  /** Create a new branch for a dream cycle */
  createBranch(dreamCycleId: string): DreamBranch;

  /** Write a speculative insight to the branch */
  writeInsight(branchId: string, insight: DreamInsightData): void;

  /** Read all insights from a branch */
  readInsights(branchId: string): DreamInsightData[];

  /** Merge successful branch insights into the main store */
  mergeBranch(branchId: string, filter?: (insight: DreamInsightData) => boolean): MergeResult;

  /** Discard a branch (no side effects on main store) */
  discardBranch(branchId: string): void;

  /** List active branches */
  listBranches(): DreamBranch[];

  /** Dispose resources */
  dispose(): void;
}

export interface DreamInsightData {
  readonly insightId: string;
  readonly type: string;
  readonly confidence: number;
  readonly sourcePatterns: readonly string[];
  readonly description: string;
  readonly metadata?: Record<string, unknown>;
}

export interface MergeResult {
  readonly merged: number;
  readonly filtered: number;
  readonly conflicts: number;
}
```

**Implementation approach (SQLite savepoints)**:
1. `createBranch()`: Records branch metadata in `kv_store` namespace `dream-branches`. Creates an in-memory map for branch-local writes.
2. `writeInsight()`: Stores insight in the in-memory overlay keyed by `branchId`.
3. `mergeBranch()`: Writes surviving insights to `dream_insights` table inside a single SQLite transaction. If the DreamEngine later supports RVF COW, this delegates to `RvfDatabase.derive()` and `RvfDatabase.merge()`.
4. `discardBranch()`: Drops the in-memory overlay. Zero SQLite cost.

**Modification to `dream-engine.ts`**:
Add optional `branchManager?: DreamBranchManager` to `DreamConfig`. When present, each dream cycle:
1. Creates a branch before spreading activation
2. Writes speculative insights to the branch
3. Merges insights that pass confidence threshold
4. Discards the rest

When absent, behavior is identical to current (direct writes).

**Test Strategy**: Unit tests with in-memory SQLite. Test branch isolation (writes in branch A invisible in branch B). Test merge/discard lifecycle. Test that dream engine works identically with and without branch manager.

**Rollback**: Remove injection point from `DreamConfig` (~15 LOC revert). Delete `dream-branch-manager.ts`.

---

### Workstream C: Witness Chain + Quality Gates

#### Task 1.6: Shadow Witness Chain Logger

**Description**: Create a witness chain logger that records cryptographic hashes of quality gate decisions (test pass/fail, coverage thresholds, pattern promotions) in an append-only SQLite table. This shadows the production quality gate flow without affecting it.

| Field | Value |
|-------|-------|
| Files to create | `v3/src/domains/quality-assessment/services/witness-chain-logger.ts` |
| Files to modify | None (shadow mode) |
| Agent | coder |
| Dependencies | None |
| Parallel Group | WS-C |
| Risk Level | Low |
| Est. Hours | 5 |

**Interface**:

```typescript
/**
 * Shadow Witness Chain Logger
 *
 * Records an append-only, hash-chained log of quality gate decisions.
 * Each entry links to its predecessor via SHA-256 hash, forming a
 * tamper-evident audit trail.
 *
 * Phase 1: SQLite table `witness_chain` in memory.db
 * Future: WITNESS_SEG in RVF container when rvf-node ships
 */

export interface WitnessEntry {
  readonly entryId: string;
  readonly previousHash: string | null;
  readonly contentHash: string;
  readonly timestamp: string;
  readonly eventType: WitnessEventType;
  readonly agentId?: string;
  readonly domain?: string;
  readonly payload: Record<string, unknown>;
}

export type WitnessEventType =
  | 'quality-gate-pass'
  | 'quality-gate-fail'
  | 'coverage-threshold'
  | 'pattern-promotion'
  | 'pattern-demotion'
  | 'test-suite-complete'
  | 'dream-cycle-merge'
  | 'routing-decision';

export interface WitnessChainLogger {
  /** Append a new entry to the witness chain */
  append(event: Omit<WitnessEntry, 'entryId' | 'previousHash' | 'contentHash' | 'timestamp'>): WitnessEntry;

  /** Verify the integrity of the entire chain */
  verifyChain(): { valid: boolean; brokenAt?: string; chainLength: number };

  /** Get the chain from a specific entry to the tip */
  getChainFrom(entryId: string): WitnessEntry[];

  /** Get the latest N entries */
  getRecent(n: number): WitnessEntry[];

  /** Get chain statistics */
  getStats(): {
    readonly chainLength: number;
    readonly firstEntry: string;
    readonly lastEntry: string;
    readonly eventTypeCounts: Record<WitnessEventType, number>;
  };

  /** Export chain for RVF WITNESS_SEG (future) */
  exportForRVF(): Buffer;

  /** Dispose */
  dispose(): void;
}

export function createWitnessChainLogger(db: DatabaseType): WitnessChainLogger;
```

**SQLite Schema** (new table in memory.db, additive only):

```sql
CREATE TABLE IF NOT EXISTS witness_chain (
  entry_id TEXT PRIMARY KEY,
  previous_hash TEXT,
  content_hash TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  event_type TEXT NOT NULL,
  agent_id TEXT,
  domain TEXT,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (previous_hash) REFERENCES witness_chain(content_hash)
);

CREATE INDEX IF NOT EXISTS idx_witness_chain_timestamp ON witness_chain(timestamp);
CREATE INDEX IF NOT EXISTS idx_witness_chain_event_type ON witness_chain(event_type);
```

**Hashing**: SHA-256 via Node.js `crypto.createHash('sha256')`. Content hash = SHA-256 of `JSON.stringify({ eventType, agentId, domain, payload, timestamp })`. Chain link = `previousHash` references the `contentHash` of the prior entry.

**Test Strategy**: Unit tests verify chain integrity, tamper detection (modify one entry, verify chain breaks), empty chain handling, and concurrent appends.

**Rollback**: Drop table `witness_chain` (or leave it -- it is harmless). Delete file.

---

### Workstream D: HNSW Audit (Phase 1 Preparation)

#### Task 1.7: HNSW Implementation Audit and Unification Proposal

**Description**: Audit all 5 HNSW-like implementations in the codebase, document their interfaces, usage patterns, dimensions, and performance characteristics. Produce a unification proposal for Phase 2.

| Field | Value |
|-------|-------|
| Files to create | `docs/analysis/hnsw-unification-audit.md` |
| Files to modify | None |
| Agent | researcher |
| Dependencies | None |
| Parallel Group | WS-D |
| Risk Level | None (documentation only) |
| Est. Hours | 4 |

**Known HNSW implementations** (from codebase grep):

| # | Class | Location | Type |
|---|-------|----------|------|
| 1 | `InMemoryHNSWIndex` | `v3/src/kernel/unified-memory-hnsw.ts:123` | Pure TypeScript HNSW |
| 2 | `RuvectorFlatIndex` | `v3/src/kernel/unified-memory-hnsw.ts:539` | Rust brute-force via `@ruvector/gnn` |
| 3 | `QEGNNEmbeddingIndex` | `v3/src/integrations/ruvector/gnn-wrapper.ts:110` | Rust differentiable search |
| 4 | `HNSWIndex` | `v3/src/domains/coverage-analysis/services/hnsw-index.ts:224` | Domain-specific HNSW |
| 5 | `HNSWEmbeddingIndex` | `v3/src/integrations/embeddings/index/HNSWIndex.ts:28` | Embedding-specific HNSW |

**Audit deliverables**:
- Interface comparison table (methods, parameters, return types)
- Dimension usage per implementation (384? 768? variable?)
- Caller analysis: who uses which implementation and why
- Performance comparison at common workload (1K vectors, 384-dim, top-10 search)
- Unification feasibility: can all 5 be replaced by `VectorBackend` + backend selection?
- Risks of unification: domain-specific tuning that would be lost

**Test Strategy**: N/A (documentation). Audit verified by code review agent.

**Rollback**: N/A.

---

### Phase 1 Parallel Execution Strategy

```
Phase1-Immediate (parallel):
  Task 1.1 (validate mincut-node)  |  Task 1.7 (HNSW audit)

WS-A (sequential after 1.1):
  Task 1.1 -> Task 1.2 -> Task 1.3 -> Task 1.4

WS-B (independent):
  Task 1.5 (dream branch manager)

WS-C (independent):
  Task 1.6 (witness chain logger)

WS-D (independent):
  Task 1.7 (HNSW audit)
```

**All of WS-B, WS-C, and WS-D can run in parallel with each other and with WS-A.**

| Task | Workstream | Agent Type | Est. Hours | Depends On |
|------|------------|-----------|------------|------------|
| 1.1 | WS-A | researcher | 2 | -- |
| 1.2 | WS-A | coder | 4 | 1.1 |
| 1.3 | WS-A | coder | 6 | 1.2 |
| 1.4 | WS-A | coder | 4 | 1.3 |
| 1.5 | WS-B | coder | 8 | -- |
| 1.6 | WS-C | coder | 5 | -- |
| 1.7 | WS-D | researcher | 4 | -- |
| **Phase 1 Total** | | **4 agents** | **33 hours** | |

**Wall-clock with 4 agents**: ~16 hours (WS-A is the critical path at 16h sequential).

### Phase 1 Tests

| Task | Test File | Test Type | Key Assertions |
|------|-----------|-----------|----------------|
| 1.2 | `v3/tests/unit/integrations/ruvector/mincut-wrapper.test.ts` | Unit (London School) | Factory creates TS backend when native unavailable; `computeMinCut` returns valid partitions; `computeLambdas` returns per-vertex connectivity; backend selection matches availability |
| 1.3 | `v3/tests/unit/mcp/services/mincut-routing-service.test.ts` | Unit (London School) | Shadow route returns tier based on lambda thresholds; metrics accumulate correctly; high-lambda tasks get Tier 3; isolated tasks get Tier 0 |
| 1.4 | `v3/tests/unit/mcp/services/routing-ab-comparator.test.ts` | Unit | Comparisons recorded and summarized; agreement rate computed; flush persists to kv_store |
| 1.5 | `v3/tests/unit/learning/dream/dream-branch-manager.test.ts` | Unit | Branch isolation (writes invisible cross-branch); merge applies insights; discard removes overlay; DreamEngine works with and without branch manager |
| 1.6 | `v3/tests/unit/domains/quality-assessment/witness-chain-logger.test.ts` | Unit | Chain integrity verified; tamper detected; concurrent appends preserve ordering; export produces valid buffer |

---

## Phase 2: Progressive Integration (Weeks 5-10)

Phase 2 promotes shadow systems to production-optional (feature-flagged) and begins unifying the fragmented HNSW landscape.

### Workstream D (continued): HNSW Unification

#### Task 2.1: Unified Progressive HNSW Index

**Description**: Implement a progressive HNSW index that replaces the 3+ in-kernel implementations with a single `VectorBackend`-compatible implementation. Uses the `VectorBackend` interface from the bridge plan (RVF-0.5.1) so it plugs into `UnifiedMemoryManager`.

| Field | Value |
|-------|-------|
| Files to create | `v3/src/kernel/progressive-hnsw-backend.ts` |
| Files to modify | `v3/src/kernel/unified-memory-hnsw.ts` (deprecation markers), `v3/src/integrations/ruvector/feature-flags.ts` (add flag) |
| Agent | coder |
| Dependencies | Bridge plan RVF-0.5.1 (VectorBackend interface), Task 1.7 (audit results) |
| Parallel Group | WS-D |
| Risk Level | Medium |
| Est. Hours | 12 |

**Interface** (extends VectorBackend from bridge plan):

```typescript
import type { VectorBackend } from './vector-backend';

/**
 * Progressive HNSW with 3-layer recall:
 * - Layer A: 70% recall, <1ms latency (coarse graph, few connections)
 * - Layer B: 85% recall, ~2ms latency (medium graph)
 * - Layer C: 95%+ recall, ~5ms latency (full HNSW)
 *
 * Queries can specify desired recall tier for latency/accuracy tradeoff.
 */
export interface ProgressiveHNSWBackend extends VectorBackend {
  /** Search with progressive recall control */
  searchProgressive(
    query: number[],
    k: number,
    options?: {
      /** Minimum recall tier: 'A' (fast), 'B' (balanced), 'C' (precise) */
      recallTier?: 'A' | 'B' | 'C';
      /** Timeout in ms -- falls back to best available results */
      timeoutMs?: number;
    }
  ): Array<{ id: string; score: number; recallTier: 'A' | 'B' | 'C' }>;

  /** Get build status of each layer */
  getLayerStats(): {
    layerA: { built: boolean; nodeCount: number; avgConnections: number };
    layerB: { built: boolean; nodeCount: number; avgConnections: number };
    layerC: { built: boolean; nodeCount: number; avgConnections: number };
  };

  /** Trigger async build of higher layers (non-blocking) */
  buildLayersAsync(): Promise<void>;
}
```

**Implementation approach**:
- Layer A: efConstruction=40, M=8 (fast build, coarse)
- Layer B: efConstruction=100, M=16 (standard HNSW)
- Layer C: efConstruction=200, M=32 (high-recall)
- All three share the same node data; only connection graphs differ
- Layer A is always built synchronously on insert
- Layers B and C are built asynchronously in background
- Search starts at the requested layer (default A), optionally refines with B/C if timeout allows

**Feature flag**: `useProgressiveHNSW: boolean` in `RuVectorFeatureFlags`, default `false`.

**Test Strategy**: Unit tests verify progressive recall (Layer A < Layer C recall). Benchmark at 1K/5K/10K vectors.

**Rollback**: Set `useProgressiveHNSW=false`. Falls back to existing `InMemoryHNSWIndex` or `RuvectorCoreBackend`.

---

#### Task 2.2: RVF Container Shadow Export from memory.db

**Description**: Create a read-only export utility that snapshots the current learning state (patterns, Q-values, dream insights) into a portable format. Since `@ruvector/rvf-node` is not yet available, export as a structured JSON+binary bundle that is forward-compatible with RVF when it ships.

| Field | Value |
|-------|-------|
| Files to create | `v3/src/integrations/ruvector/rvf-container-export.ts` |
| Agent | coder |
| Dependencies | None |
| Parallel Group | WS-B |
| Risk Level | Low (read-only) |
| Est. Hours | 6 |

**Interface**:

```typescript
/**
 * Export QE brain state as a portable container.
 *
 * Phase 2: Exports as JSON manifest + binary vector blobs (.aqe-brain)
 * Phase 3: Exports as .rvf file when rvf-node ships
 */

export interface BrainExportManifest {
  readonly version: '1.0';
  readonly exportedAt: string;
  readonly sourceDb: string;
  readonly stats: {
    readonly patternCount: number;
    readonly vectorCount: number;
    readonly qValueCount: number;
    readonly dreamInsightCount: number;
    readonly witnessChainLength: number;
  };
  readonly domains: readonly string[];
  readonly checksum: string;
}

export interface BrainExportOptions {
  /** Which domains to include (default: all) */
  readonly domains?: readonly string[];
  /** Include vector embeddings (large) */
  readonly includeVectors?: boolean;
  /** Include Q-values */
  readonly includeQValues?: boolean;
  /** Include dream insights */
  readonly includeDreamInsights?: boolean;
  /** Include witness chain */
  readonly includeWitnessChain?: boolean;
  /** Output path */
  readonly outputPath: string;
}

export interface ContainerExporter {
  /** Export brain state to a portable container */
  export(options: BrainExportOptions): Promise<BrainExportManifest>;

  /** Get estimated export size (bytes) without exporting */
  estimateSize(options: Omit<BrainExportOptions, 'outputPath'>): Promise<number>;
}

export function createContainerExporter(dbPath: string): ContainerExporter;
```

**Export format** (`.aqe-brain` directory):
```
brain-export-2026-02-22/
  manifest.json          # BrainExportManifest
  patterns.jsonl         # One QE pattern per line
  vectors.bin            # Float32Array binary blob (id-indexed)
  vector-index.json      # Map<id, byte-offset> into vectors.bin
  q-values.jsonl         # Q-learning state-action values
  dream-insights.jsonl   # Dream cycle discoveries
  witness-chain.jsonl    # Witness chain entries
```

**Safety**: Read-only operation on memory.db. Uses `PRAGMA journal_mode=wal` read connection. Does NOT acquire write lock. Does NOT modify any data.

**Test Strategy**: Unit test with test database. Verify manifest checksums match content. Verify round-trip (export then re-import counts match).

**Rollback**: Delete file. No production wiring.

---

#### Task 2.3: MinCut-Based Test Suite Optimization

**Description**: Use mincut analysis to identify the minimum set of tests that, if they pass, provide maximum coverage assurance. Models the test suite as a graph (tests as vertices, shared code coverage as edges) and computes the minimum cut to find the critical test boundary.

| Field | Value |
|-------|-------|
| Files to create | `v3/src/domains/test-execution/services/mincut-test-optimizer.ts` |
| Files to modify | None (opt-in service) |
| Agent | coder |
| Dependencies | Task 1.2 (mincut-wrapper) |
| Parallel Group | WS-A |
| Risk Level | Low (advisory only) |
| Est. Hours | 8 |

**Interface**:

```typescript
/**
 * MinCut-based test suite optimization.
 *
 * Given a test suite and coverage data, identifies:
 * 1. The critical test boundary (minimum tests for maximum coverage assurance)
 * 2. Redundant tests (removable without reducing coverage)
 * 3. Isolated tests (no shared coverage with other tests)
 * 4. Optimal test execution order (based on coverage graph topology)
 */

export interface TestNode {
  readonly testId: string;
  readonly testFile: string;
  readonly coveredFiles: readonly string[];
  readonly estimatedDurationMs: number;
}

export interface TestOptimizationResult {
  /** Critical tests -- must run for coverage assurance */
  readonly criticalTests: readonly string[];
  /** Tests that can be skipped without reducing coverage below threshold */
  readonly skippableTests: readonly string[];
  /** Optimal execution order (critical first, then diminishing returns) */
  readonly executionOrder: readonly string[];
  /** Estimated time savings if skippable tests are skipped */
  readonly estimatedTimeSavingsMs: number;
  /** Coverage graph statistics */
  readonly graphStats: {
    readonly testCount: number;
    readonly coverageEdges: number;
    readonly mincutValue: number;
    readonly connectedComponents: number;
  };
}

export interface MinCutTestOptimizer {
  /** Analyze test suite and produce optimization recommendations */
  optimize(tests: readonly TestNode[], coverageThreshold?: number): TestOptimizationResult;

  /** Get the coverage graph for visualization */
  getCoverageGraph(tests: readonly TestNode[]): MinCutGraph;
}

export function createMinCutTestOptimizer(wrapper: QEMinCutWrapper): MinCutTestOptimizer;
```

**Test Strategy**: Unit tests with synthetic test suites. Verify critical tests cover all files. Verify skippable tests are truly redundant.

**Rollback**: Delete file. Advisory service with no production wiring.

---

#### Task 2.4: Stoer-Wagner Integrity Monitoring

**Description**: Implement a health monitoring service that periodically computes the Stoer-Wagner exact mincut of the active agent swarm graph and the codebase dependency graph. Reports health as a "connectivity score" and alerts when the mincut drops below a threshold (indicating fragile topology).

| Field | Value |
|-------|-------|
| Files to create | `v3/src/coordination/mincut/stoer-wagner-monitor.ts` |
| Files to modify | `v3/src/coordination/mincut/index.ts` (add export) |
| Agent | coder |
| Dependencies | Task 1.2 (mincut-wrapper) |
| Parallel Group | WS-D |
| Risk Level | Low |
| Est. Hours | 6 |

**Interface**:

```typescript
/**
 * Stoer-Wagner integrity monitor for swarm and codebase health.
 *
 * Periodically computes the exact minimum cut of:
 * 1. The active agent communication graph (from SwarmGraph)
 * 2. The codebase module dependency graph (from HypergraphEngine)
 *
 * Reports health as a normalized "connectivity score" and alerts when
 * topology becomes fragile (low mincut = easy to partition).
 */

export interface IntegritySnapshot {
  readonly timestamp: string;
  readonly swarmHealth: {
    readonly mincutValue: number;
    readonly vertexCount: number;
    readonly edgeCount: number;
    readonly weakVertices: ReadonlyArray<{ id: string; lambda: number }>;
    readonly score: number; // 0-1, higher = healthier
  };
  readonly codebaseHealth: {
    readonly mincutValue: number;
    readonly moduleCount: number;
    readonly dependencyCount: number;
    readonly fragileModules: ReadonlyArray<{ module: string; lambda: number }>;
    readonly score: number;
  };
  readonly overallScore: number;
  readonly alerts: readonly string[];
}

export interface StoerWagnerMonitorConfig {
  /** Polling interval in ms (default: 60000 = 1 minute) */
  readonly intervalMs?: number;
  /** Alert threshold for swarm mincut (default: 2.0) */
  readonly swarmAlertThreshold?: number;
  /** Alert threshold for codebase mincut (default: 1.0) */
  readonly codebaseAlertThreshold?: number;
  /** Callback for alerts */
  readonly onAlert?: (snapshot: IntegritySnapshot) => void;
}

export interface StoerWagnerMonitor {
  /** Start periodic monitoring */
  start(): void;

  /** Stop monitoring */
  stop(): void;

  /** Take a single snapshot now */
  snapshot(): IntegritySnapshot;

  /** Get historical snapshots */
  getHistory(limit?: number): IntegritySnapshot[];

  /** Dispose */
  dispose(): void;
}

export function createStoerWagnerMonitor(
  config: StoerWagnerMonitorConfig,
  swarmGraph: SwarmGraph,
  mincutWrapper: QEMinCutWrapper
): StoerWagnerMonitor;
```

**Test Strategy**: Unit tests with known graph topologies. Verify alert triggers at threshold. Verify scores are normalized 0-1.

**Rollback**: Delete file. Remove export from `index.ts`.

---

#### Task 2.5: QE Brain Export as Portable Container (CLI)

**Description**: Wire the container exporter (Task 2.2) into the AQE CLI as `aqe brain export` and `aqe brain import` commands.

| Field | Value |
|-------|-------|
| Files to create | `v3/src/cli/commands/brain.ts` |
| Files to modify | `v3/src/cli/index.ts` (register command) |
| Agent | coder |
| Dependencies | Task 2.2 |
| Parallel Group | WS-B |
| Risk Level | Low |
| Est. Hours | 4 |

**CLI interface**:

```
aqe brain export [--output <path>] [--domains <list>] [--include-vectors] [--include-q-values]
aqe brain import <path> [--dry-run] [--merge-strategy <latest|highest-confidence|union>]
aqe brain info <path>
```

**Test Strategy**: Integration tests calling CLI commands against test database.

**Rollback**: Remove command registration. Delete file.

---

### Phase 2 Parallel Execution Strategy

```
WS-A:  Task 2.3 (test optimizer)          -- depends on 1.2
WS-B:  Task 2.2 (container export) -> Task 2.5 (CLI)
WS-C:  (no Phase 2 tasks -- witness chain continues running from Phase 1)
WS-D:  Task 2.1 (progressive HNSW) | Task 2.4 (Stoer-Wagner monitor)
```

**All workstreams run in parallel.**

| Task | Workstream | Agent Type | Est. Hours | Depends On |
|------|------------|-----------|------------|------------|
| 2.1 | WS-D | coder | 12 | Bridge RVF-0.5.1, Task 1.7 |
| 2.2 | WS-B | coder | 6 | -- |
| 2.3 | WS-A | coder | 8 | Task 1.2 |
| 2.4 | WS-D | coder | 6 | Task 1.2 |
| 2.5 | WS-B | coder | 4 | Task 2.2 |
| **Phase 2 Total** | | **4 agents** | **36 hours** | |

**Wall-clock with 4 agents**: ~16 hours (WS-D at 12+6=18h is critical path, but 2.1 and 2.4 are parallel so ~12h).

### Phase 2 Tests

| Task | Test File | Test Type | Key Assertions |
|------|-----------|-----------|----------------|
| 2.1 | `v3/tests/unit/kernel/progressive-hnsw-backend.test.ts` | Unit + Benchmark | Layer A recall < Layer C recall; progressive search returns tier labels; all VectorBackend methods work; benchmark at 1K/5K/10K |
| 2.2 | `v3/tests/unit/integrations/ruvector/rvf-container-export.test.ts` | Unit | Export produces valid manifest; checksums match; counts match source DB; read-only (no DB modifications) |
| 2.3 | `v3/tests/unit/domains/test-execution/mincut-test-optimizer.test.ts` | Unit | Critical tests cover all files; skippable tests are redundant; execution order starts with critical |
| 2.4 | `v3/tests/unit/coordination/mincut/stoer-wagner-monitor.test.ts` | Unit | Alerts fire at threshold; scores normalized; history recorded |
| 2.5 | `v3/tests/integration/cli/brain-command.test.ts` | Integration | CLI export/import round-trip preserves data; --dry-run makes no changes |

---

## Phase 3: Native RVF (Weeks 11-16)

**GATE**: Phase 3 requires `@ruvector/rvf-node` to publish functional N-API binaries. Check weekly:
```bash
npm view @ruvector/rvf-node version
node -e "const rvf = require('@ruvector/rvf-node'); console.log(rvf.RvfDatabase.create('/tmp/test.rvf'))"
```

If the gate does not pass by Week 11, Phase 3 defers indefinitely. The Phase 1-2 implementations are production-viable without native RVF.

### Task 3.1: Dual-Write -- Learning to Both SQLite and RVF

**Description**: When `useRVFBackend=true`, all learning writes (pattern store, Q-values, dream insights) go to both SQLite and the RVF container. SQLite remains the source of truth; RVF is validated against it.

| Field | Value |
|-------|-------|
| Files to create | `v3/src/integrations/ruvector/rvf-dual-writer.ts` |
| Files to modify | `v3/src/learning/pattern-store.ts` (add dual-write hook), `v3/src/integrations/ruvector/feature-flags.ts` (add `useRVFDualWrite` flag) |
| Agent | coder |
| Dependencies | Bridge plan RVF-1.1+, Phase 2 complete |
| Parallel Group | WS-B |
| Risk Level | Medium |
| Est. Hours | 10 |

**Interface**:

```typescript
/**
 * Dual-writer that sends learning data to both SQLite and RVF.
 * SQLite is source of truth. RVF is validated against it.
 */

export interface DualWriteResult {
  readonly sqliteSuccess: boolean;
  readonly rvfSuccess: boolean;
  readonly divergence?: string;
}

export interface RVFDualWriter {
  /** Write a pattern to both stores */
  writePattern(pattern: QEPattern, embedding?: number[]): Promise<DualWriteResult>;

  /** Write a Q-value update to both stores */
  writeQValue(state: string, action: string, value: number): Promise<DualWriteResult>;

  /** Write a dream insight to both stores */
  writeDreamInsight(insight: DreamInsightData): Promise<DualWriteResult>;

  /** Get divergence report (RVF reads that differ from SQLite) */
  getDivergenceReport(): Promise<{
    readonly totalChecked: number;
    readonly divergences: number;
    readonly details: ReadonlyArray<{
      readonly key: string;
      readonly sqliteValue: unknown;
      readonly rvfValue: unknown;
    }>;
  }>;

  /** Dispose */
  dispose(): void;
}
```

**Feature flag**: `useRVFDualWrite: boolean` in `RuVectorFeatureFlags`, default `false`.

**Test Strategy**: Unit tests with mocked RVF backend. Verify both stores receive writes. Verify divergence detection.

**Rollback**: Set `useRVFDualWrite=false`. SQLite continues as sole destination.

---

### Task 3.2: RVF Read Validation (100% Record Comparison)

**Description**: A validation service that reads every record from both SQLite and RVF and compares them. Runs as a background task and reports divergences. Must pass 100% agreement before RVF can be promoted to primary.

| Field | Value |
|-------|-------|
| Files to create | `v3/src/integrations/ruvector/rvf-validation-service.ts` |
| Agent | coder |
| Dependencies | Task 3.1 |
| Parallel Group | WS-B |
| Risk Level | Low (read-only comparison) |
| Est. Hours | 6 |

**Interface**:

```typescript
export interface ValidationResult {
  readonly timestamp: string;
  readonly totalRecords: number;
  readonly matched: number;
  readonly diverged: number;
  readonly missingInRVF: number;
  readonly missingInSQLite: number;
  readonly validationDurationMs: number;
  readonly passRate: number; // 0-1
  readonly details: ReadonlyArray<{
    readonly recordId: string;
    readonly type: 'pattern' | 'q-value' | 'insight';
    readonly issue: 'diverged' | 'missing-rvf' | 'missing-sqlite';
    readonly sqliteValue?: string;
    readonly rvfValue?: string;
  }>;
}

export interface RVFValidationService {
  /** Run full validation */
  validate(): Promise<ValidationResult>;

  /** Run incremental validation (only records changed since last run) */
  validateIncremental(): Promise<ValidationResult>;

  /** Get last validation result */
  getLastResult(): ValidationResult | null;

  /** Check if promotion is safe (100% pass rate) */
  isPromotionSafe(): boolean;
}
```

**Test Strategy**: Unit tests with intentionally diverged test data. Verify all divergence types detected.

**Rollback**: Delete file. Read-only service.

---

### Task 3.3: Promote RVF to Primary, SQLite to Backup

**Description**: When validation passes at 100%, add a feature flag to make RVF the primary read path and SQLite the backup. Writes continue to both (dual-write). Reads prefer RVF with SQLite fallback.

| Field | Value |
|-------|-------|
| Files to modify | `v3/src/integrations/ruvector/feature-flags.ts` (add `rvfPrimary` flag), `v3/src/learning/pattern-store.ts` (read path routing) |
| Agent | coder |
| Dependencies | Task 3.2 (must pass 100% validation) |
| Parallel Group | WS-B |
| Risk Level | High |
| Est. Hours | 8 |

**Feature flag**: `rvfPrimary: boolean` in `RuVectorFeatureFlags`, default `false`.

**Promotion criteria** (enforced in code):
1. `RVFValidationService.isPromotionSafe() === true`
2. `useRVFDualWrite` has been `true` for at least 24 hours
3. No divergences in last 3 validation runs

**Read path change**:
```typescript
// In PatternStore.search():
if (flags.rvfPrimary) {
  try {
    return await this.rvfStore.search(query, opts);
  } catch (error) {
    logger.warn('RVF read failed, falling back to SQLite', { error });
    return await this.sqliteSearch(query, opts);
  }
} else {
  return await this.sqliteSearch(query, opts);
}
```

**Test Strategy**: Integration tests verifying read path routing, fallback on RVF failure, promotion criteria enforcement.

**Rollback**: Set `rvfPrimary=false`. Reads revert to SQLite immediately. No data loss (dual-write ensures both stores are current).

---

### Task 3.4: RVF Container Marketplace (Import/Export Domain Brains)

**Description**: Extend the brain export/import (Tasks 2.2, 2.5) to support domain-specific brain sharing. An AQE instance can export its "test-generation" brain and another instance can import it.

| Field | Value |
|-------|-------|
| Files to create | `v3/src/integrations/ruvector/rvf-marketplace.ts` |
| Files to modify | `v3/src/cli/commands/brain.ts` (add marketplace subcommands) |
| Agent | coder |
| Dependencies | Task 2.5, Task 3.1 |
| Parallel Group | WS-B |
| Risk Level | Medium |
| Est. Hours | 8 |

**Interface**:

```typescript
/**
 * RVF Container Marketplace -- share domain-specific brains between AQE instances.
 *
 * Export: Extract a single domain's patterns, Q-values, and insights into a
 *         portable .aqe-brain container.
 * Import: Merge a foreign domain brain into the local instance with conflict
 *         resolution and provenance tracking.
 */

export interface MarketplaceListing {
  readonly brainId: string;
  readonly domain: string;
  readonly version: string;
  readonly exportedAt: string;
  readonly patternCount: number;
  readonly vectorCount: number;
  readonly sourceInstance: string;
  readonly checksum: string;
  readonly description?: string;
}

export interface ImportOptions {
  /** Merge strategy for conflicting patterns */
  readonly mergeStrategy: 'latest-wins' | 'highest-confidence' | 'union' | 'skip-conflicts';
  /** Dry run (report what would change without changing) */
  readonly dryRun?: boolean;
  /** Namespace prefix for imported patterns (to avoid ID collisions) */
  readonly namespacePrefix?: string;
  /** Trust level for imported patterns (affects initial confidence) */
  readonly trustLevel?: 'full' | 'verified' | 'untrusted';
}

export interface ImportResult {
  readonly imported: number;
  readonly skipped: number;
  readonly conflicts: number;
  readonly conflictResolutions: ReadonlyArray<{
    readonly patternId: string;
    readonly resolution: string;
  }>;
}

export interface RVFMarketplace {
  /** Export a domain brain */
  exportDomain(domain: string, outputPath: string, description?: string): Promise<MarketplaceListing>;

  /** Import a domain brain */
  importDomain(containerPath: string, options: ImportOptions): Promise<ImportResult>;

  /** List available local brain exports */
  listLocal(): Promise<MarketplaceListing[]>;

  /** Validate a container before import */
  validate(containerPath: string): Promise<{ valid: boolean; errors: string[] }>;
}
```

**CLI commands**:
```
aqe brain marketplace export <domain> [--output <path>] [--description <text>]
aqe brain marketplace import <path> [--strategy <strategy>] [--dry-run] [--trust <level>]
aqe brain marketplace list
aqe brain marketplace validate <path>
```

**Test Strategy**: Integration tests with two test databases. Export from one, import to other. Verify pattern counts, conflict handling, provenance tracking.

**Rollback**: Remove marketplace commands. Delete file. Existing brain export/import unaffected.

---

### Phase 3 Parallel Execution Strategy

```
WS-B (sequential):
  Task 3.1 (dual-write) -> Task 3.2 (validation) -> Task 3.3 (promotion)
  Task 3.4 (marketplace) -- parallel with 3.1/3.2, depends on 2.5 and 3.1
```

| Task | Workstream | Agent Type | Est. Hours | Depends On |
|------|------------|-----------|------------|------------|
| 3.1 | WS-B | coder | 10 | Bridge RVF-1.1+, Phase 2 |
| 3.2 | WS-B | coder | 6 | 3.1 |
| 3.3 | WS-B | coder | 8 | 3.2 |
| 3.4 | WS-B | coder | 8 | 2.5, 3.1 |
| **Phase 3 Total** | | **2 agents** | **32 hours** | |

**Wall-clock with 2 agents**: ~24 hours (3.1 -> 3.2 -> 3.3 is the critical path at 24h; 3.4 runs parallel with 3.2+3.3).

### Phase 3 Tests

| Task | Test File | Test Type | Key Assertions |
|------|-----------|-----------|----------------|
| 3.1 | `v3/tests/unit/integrations/ruvector/rvf-dual-writer.test.ts` | Unit | Both stores receive writes; divergence detected when stores differ; feature flag controls dual-write |
| 3.2 | `v3/tests/unit/integrations/ruvector/rvf-validation-service.test.ts` | Unit | 100% match detected; divergences reported; missing records detected; promotion safety check |
| 3.3 | `v3/tests/integration/learning/rvf-promotion.test.ts` | Integration | RVF reads used when promoted; fallback to SQLite on RVF failure; promotion criteria enforced |
| 3.4 | `v3/tests/integration/ruvector/rvf-marketplace.test.ts` | Integration | Export/import round-trip; conflict resolution; dry-run; provenance tracking; validation |

---

## Complete File Inventory

### New Files (22 files)

| File | Phase | Workstream | Purpose |
|------|-------|------------|---------|
| `scripts/validate-mincut-node.ts` | 1 | WS-A | Validate @ruvector/mincut-node availability |
| `v3/src/integrations/ruvector/mincut-wrapper.ts` | 1 | WS-A | Unified MinCut interface |
| `v3/src/mcp/services/mincut-routing-service.ts` | 1 | WS-A | Lambda-based shadow routing |
| `v3/src/mcp/services/routing-ab-comparator.ts` | 1 | WS-A | A/B shadow comparison |
| `v3/src/learning/dream/dream-branch-manager.ts` | 1 | WS-B | RVCOW branching for dreams |
| `v3/src/domains/quality-assessment/services/witness-chain-logger.ts` | 1 | WS-C | Append-only witness chain |
| `docs/analysis/hnsw-unification-audit.md` | 1 | WS-D | HNSW audit document |
| `v3/src/kernel/progressive-hnsw-backend.ts` | 2 | WS-D | Progressive 3-layer HNSW |
| `v3/src/integrations/ruvector/rvf-container-export.ts` | 2 | WS-B | Brain state export |
| `v3/src/domains/test-execution/services/mincut-test-optimizer.ts` | 2 | WS-A | Test suite optimization |
| `v3/src/coordination/mincut/stoer-wagner-monitor.ts` | 2 | WS-D | Health monitoring |
| `v3/src/cli/commands/brain.ts` | 2 | WS-B | CLI brain commands |
| `v3/src/integrations/ruvector/rvf-dual-writer.ts` | 3 | WS-B | Dual-write to SQLite+RVF |
| `v3/src/integrations/ruvector/rvf-validation-service.ts` | 3 | WS-B | RVF vs SQLite validation |
| `v3/src/integrations/ruvector/rvf-marketplace.ts` | 3 | WS-B | Container marketplace |
| `v3/tests/unit/integrations/ruvector/mincut-wrapper.test.ts` | 1 | WS-A | MinCut wrapper tests |
| `v3/tests/unit/mcp/services/mincut-routing-service.test.ts` | 1 | WS-A | Routing service tests |
| `v3/tests/unit/mcp/services/routing-ab-comparator.test.ts` | 1 | WS-A | A/B comparator tests |
| `v3/tests/unit/learning/dream/dream-branch-manager.test.ts` | 1 | WS-B | Dream branch tests |
| `v3/tests/unit/domains/quality-assessment/witness-chain-logger.test.ts` | 1 | WS-C | Witness chain tests |
| `v3/tests/unit/kernel/progressive-hnsw-backend.test.ts` | 2 | WS-D | Progressive HNSW tests |
| `v3/tests/unit/coordination/mincut/stoer-wagner-monitor.test.ts` | 2 | WS-D | Monitor tests |

### Modified Files (7 files, minimal changes)

| File | Phase | Change | LOC Delta |
|------|-------|--------|-----------|
| `v3/src/integrations/ruvector/index.ts` | 1 | Add mincut-wrapper export | ~3 |
| `v3/src/mcp/services/task-router.ts` | 1 | Add optional shadow hook | ~10 |
| `v3/src/learning/dream/dream-engine.ts` | 1 | Add optional branchManager to DreamConfig | ~15 |
| `v3/src/integrations/ruvector/feature-flags.ts` | 2 | Add `useProgressiveHNSW`, `useRVFDualWrite`, `rvfPrimary` flags | ~20 |
| `v3/src/kernel/unified-memory-hnsw.ts` | 2 | Add deprecation markers on old classes | ~5 |
| `v3/src/coordination/mincut/index.ts` | 2 | Add Stoer-Wagner monitor export | ~3 |
| `v3/src/learning/pattern-store.ts` | 3 | Add dual-write hook and RVF read path | ~30 |

---

## Agent Roster and Swarm Configuration

### Recommended Swarm Init

```bash
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical \
  --max-agents 8 \
  --strategy specialized
```

### Agent Assignments

| Agent ID | Type | Workstream | Phase 1 Tasks | Phase 2 Tasks | Phase 3 Tasks |
|----------|------|------------|---------------|---------------|---------------|
| `rvf-researcher-1` | researcher | WS-A, WS-D | 1.1, 1.7 | -- | -- |
| `rvf-coder-a` | coder | WS-A | 1.2, 1.3, 1.4 | 2.3 | -- |
| `rvf-coder-b` | coder | WS-B | 1.5 | 2.2, 2.5 | 3.1, 3.2, 3.3, 3.4 |
| `rvf-coder-c` | coder | WS-C | 1.6 | -- | -- |
| `rvf-coder-d` | coder | WS-D | -- | 2.1, 2.4 | -- |
| `rvf-tester-1` | tester | All | Phase 1 tests | Phase 2 tests | Phase 3 tests |
| `rvf-reviewer-1` | reviewer | All | Code review | Code review | Code review |

**Phase 1**: 5 agents active (researcher + 3 coders + tester)
**Phase 2**: 4 agents active (3 coders + tester)
**Phase 3**: 3 agents active (1 coder + tester + reviewer)

---

## Critical Path

```
Task 1.1 -> 1.2 -> 1.3 -> 1.4 -> [Phase 1 complete]
                                        |
                                        v
                                   Task 2.3 (test optimizer)
                                   Task 2.1 (progressive HNSW)  -- parallel
                                   Task 2.2 -> 2.5 (brain export + CLI)  -- parallel
                                   Task 2.4 (Stoer-Wagner)  -- parallel
                                        |
                                   [Phase 2 complete]
                                        |
                                        v
                              [GATE: rvf-node binaries ship]
                                        |
                                        v
                                   Task 3.1 -> 3.2 -> 3.3
                                   Task 3.4 (marketplace)  -- parallel
                                        |
                                   [Phase 3 complete]
```

**Critical path duration**: 1.1 (2h) + 1.2 (4h) + 1.3 (6h) + 1.4 (4h) + 2.1 (12h) + 3.1 (10h) + 3.2 (6h) + 3.3 (8h) = **52 hours sequential**

**With parallelism**: ~32 hours of wall-clock time across 4 agents for Phases 1-2. Phase 3 adds ~24 hours.

---

## Risk Register

| Risk | Phase | Likelihood | Impact | Mitigation | Rollback |
|------|-------|-----------|--------|------------|----------|
| `@ruvector/mincut-node` is a stub | 1 | High | Low | TypeScript MinCutCalculator is the proven fallback | Use existing TS implementation |
| MinCut lambda thresholds poorly calibrated | 1 | Medium | Low | Shadow mode collects real data; thresholds tuned in Phase 2 | Shadow mode has zero production impact |
| Dream branch manager corrupts insights | 1 | Low | Medium | In-memory overlay only; no SQLite writes until merge | Remove injection from DreamConfig |
| Witness chain grows unbounded | 1-3 | Medium | Low | Add TTL-based pruning; index on timestamp | Drop table (append-only, no dependencies) |
| Progressive HNSW slower than InMemoryHNSWIndex at small scale | 2 | Medium | Low | Feature-flagged; both paths available | Set `useProgressiveHNSW=false` |
| Dual-write introduces latency | 3 | Medium | Medium | Async RVF write (fire-and-forget with retry) | Set `useRVFDualWrite=false` |
| RVF promotion causes read errors | 3 | Low | High | Fallback to SQLite on any RVF read error; 3 validation passes required | Set `rvfPrimary=false` (instant revert) |
| memory.db modified during export | 2 | Low | Low | WAL read connection; no write lock acquired | Export is read-only |
| Marketplace import introduces bad patterns | 3 | Medium | Medium | Trust levels; imported patterns start at reduced confidence; dry-run | Delete imported patterns by namespace prefix |

---

## Success Metrics

### Phase 1 Exit Criteria
- [ ] MinCut wrapper passes all unit tests with TypeScript backend
- [ ] Shadow routing service produces tier recommendations for 100+ real routing decisions
- [ ] A/B comparator has logged agreement rate data
- [ ] Dream branch manager passes isolation tests
- [ ] Witness chain logger produces valid hash chains
- [ ] HNSW audit document reviewed and approved

### Phase 2 Exit Criteria
- [ ] Progressive HNSW passes recall benchmarks (Layer A=70%, B=85%, C=95%+)
- [ ] Brain export produces valid containers from real memory.db
- [ ] MinCut test optimizer identifies critical/skippable tests on real test suite
- [ ] Stoer-Wagner monitor detects artificially weakened topologies
- [ ] CLI `aqe brain export/import` round-trip works

### Phase 3 Exit Criteria
- [ ] Dual-write to SQLite and RVF for 24+ hours with zero divergences
- [ ] Validation service reports 100% match on 3 consecutive runs
- [ ] RVF promoted to primary; 100 reads complete without fallback
- [ ] Marketplace export/import between two test instances
- [ ] All existing tests pass with both `rvfPrimary=false` and `rvfPrimary=true`

---

## Summary

| Phase | Duration | Tasks | New Files | Agent Hours | Key Deliverable |
|-------|----------|-------|-----------|-------------|-----------------|
| **1: Shadow** | Weeks 1-4 | 7 | 7 | 33 | Shadow mincut routing, dream branching, witness chain |
| **2: Progressive** | Weeks 5-10 | 5 | 5 | 36 | Progressive HNSW, brain export, test optimization, health monitoring |
| **3: Native RVF** | Weeks 11-16 | 4 | 3 | 32 | Dual-write, validation, promotion, marketplace |
| **Total** | 16 weeks | **16** | **15 src + 7 test** | **101 hours** | Production RVF integration with full rollback safety |

All phases are feature-flagged with instant rollback. Phase 3 is gated on external dependency availability. Phases 1-2 deliver standalone value regardless of Phase 3 outcome.
