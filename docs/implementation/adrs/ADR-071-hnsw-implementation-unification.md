# ADR-071: HNSW Implementation Unification and Decommission Plan

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-071 |
| **Status** | Proposed |
| **Date** | 2026-02-22 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** AQE v3 operating three separate HNSW implementations -- (1) a pure TypeScript HNSW in the QE memory system, (2) RuvectorFlatIndex wrapping @ruvector/gnn for pattern embeddings, and (3) QEGNNEmbeddingIndex used by the learning pipeline -- each with different configuration, different tuning parameters, different persistence strategies, and different recall characteristics,

**facing** tripled maintenance burden where bugs must be investigated across three codepaths, inconsistent search quality where the same embedding query returns different results depending on which index handles it, inability to share index tuning improvements across implementations, and no clear ownership of "the HNSW subsystem" as a single component,

**we decided for** consolidating all three HNSW implementations into a single RVF progressive HNSW backend (ADR-066) accessed through a unified HnswIndexProvider interface, decommissioning the TypeScript and RuvectorFlatIndex implementations over a two-phase rollout, and migrating all existing indexed data to the RVF INDEX_SEG format,

**and neglected** (a) keeping all three implementations with a facade pattern (rejected: maintains the bug surface and inconsistency, just hides it behind an interface), (b) standardizing on the TypeScript implementation (rejected: worst performance of the three, no native acceleration, no progressive layering), (c) standardizing on RuvectorFlatIndex (rejected: flat index does not scale past 50K vectors, no progressive HNSW),

**to achieve** a single HNSW codebase to maintain and tune, consistent search quality across all subsystems, progressive 3-layer HNSW for all vector workloads (not just PatternStore), and reduced dependency surface by removing the pure TypeScript HNSW code,

**accepting that** this is a breaking change for any code that directly instantiates a specific HNSW implementation (must go through HnswIndexProvider), requires migrating indexed data from all three implementations into a single RVF file, and creates a hard dependency on @ruvector/rvf for all vector search.

---

## Context

AQE v3's vector search is fragmented across three implementations that evolved independently:

### Implementation 1: TypeScript HNSW (QE Memory System)

Located in the QE unified memory subsystem (ADR-038). A pure TypeScript HNSW implementation with no native acceleration. Used for cross-domain semantic search across test suites, coverage data, defects, and quality assessments. Rebuilds the full index on startup from SQLite BLOBs. Approximate performance: 10-50ms per query at 10K vectors.

### Implementation 2: RuvectorFlatIndex (@ruvector/gnn wrapper)

Located in the pattern store. Wraps @ruvector/gnn's flat index (not HNSW) for pattern embedding search. Provides exact nearest-neighbor search (100% recall) but scales quadratically. Adequate for the current pattern count but will not scale past 50K vectors. Rebuilds on startup.

### Implementation 3: QEGNNEmbeddingIndex (Learning Pipeline)

Used by the learning pipeline for embedding similarity during pattern correlation discovery. Another wrapper around @ruvector/gnn but with different configuration (different ef_construction, different M parameter) than Implementation 2. This means the same embedding searched in the learning pipeline returns different neighbors than when searched in the pattern store.

### The Problem

Three implementations means:
- **Three bug surfaces**: A recall regression must be investigated in three places
- **Three configurations**: M=16 in one, M=32 in another, M=48 in the third
- **Three startup costs**: Each implementation rebuilds its own index independently
- **Inconsistent results**: The same 384-dimensional embedding can return different top-5 neighbors depending on which index is queried
- **No shared improvements**: Optimizing one index does not benefit the others

ADR-066 introduced RVF progressive HNSW as the future backend for PatternStore. This ADR extends that decision to mandate unification of all three implementations behind a single provider.

---

## Options Considered

### Option 1: Unified RVF Progressive HNSW via HnswIndexProvider (Selected)

Create a single HnswIndexProvider interface backed by RVF's INDEX_SEG. All subsystems use this provider instead of their current implementation. The three existing implementations are decommissioned in two phases.

**Pros:**
- Single codebase for all vector search
- Consistent recall and configuration across all subsystems
- Progressive 3-layer HNSW for all workloads (not just PatternStore)
- One startup cost instead of three
- Temperature quantization available to all subsystems
- Single tuning point for M, ef_construction, ef_search

**Cons:**
- Breaking change for direct implementation users
- Data migration required from all three current stores
- Hard dependency on @ruvector/rvf for all vector search (no pure-TS fallback)

### Option 2: Facade Pattern Over Three Implementations (Rejected)

Create a unified interface but keep all three implementations running behind it.

**Why rejected:** Maintains the triple bug surface and configuration inconsistency. The facade hides the problem from consumers but does not solve it. Still three startup costs, three index rebuilds, three places to investigate recall regressions.

### Option 3: Standardize on TypeScript HNSW (Rejected)

Remove the two @ruvector/gnn-based implementations and use the TypeScript HNSW everywhere.

**Why rejected:** Worst performance of the three. No native acceleration (pure JS is 10-100x slower than native HNSW for index construction). No progressive layering. No temperature quantization. Would be a performance regression for the learning pipeline and pattern store.

### Option 4: Standardize on RuvectorFlatIndex (Rejected)

Use @ruvector/gnn's flat index for all vector search.

**Why rejected:** Flat index is exact search with O(n) per query. Adequate at 10K vectors but unusable at 100K+. Does not provide HNSW's logarithmic query scaling. No progressive layering. Would create a scaling wall.

---

## Implementation

### HnswIndexProvider Interface

```typescript
// v3/src/vectors/hnsw-index-provider.ts
interface HnswIndexProvider {
  /** Create or open a named index within the RVF file */
  getIndex(name: string, config?: IndexConfig): Promise<HnswIndex>;

  /** List all named indexes */
  listIndexes(): Promise<IndexInfo[]>;

  /** Get progressive layer status for an index */
  getLayerStatus(name: string): Promise<LayerStatus>;
}

interface HnswIndex {
  /** Insert a vector with associated ID */
  insert(id: string, vector: Float32Array): Promise<void>;

  /** Search for k nearest neighbors */
  search(query: Float32Array, k: number): Promise<SearchResult[]>;

  /** Batch insert for migration */
  batchInsert(entries: Array<{ id: string; vector: Float32Array }>): Promise<void>;

  /** Get index statistics */
  stats(): Promise<IndexStats>;
}

interface IndexConfig {
  dimensions: number;         // Embedding dimensions (default: 384)
  m: number;                  // HNSW M parameter (default: 32)
  efConstruction: number;     // Build-time ef (default: 200)
  efSearch: number;           // Query-time ef (default: 100)
  quantizationPolicy: 'none' | 'temperature-based' | 'always-8bit';
}

interface LayerStatus {
  layerA: { ready: boolean; recall: number; latencyMs: number };
  layerB: { ready: boolean; recall: number; latencyMs: number };
  layerC: { ready: boolean; recall: number; latencyMs: number };
}
```

### Named Indexes

Rather than a single monolithic HNSW index, the unified provider supports named indexes within one RVF file, preserving the logical separation:

| Index Name | Replaces | Consumers |
|------------|----------|-----------|
| `patterns` | RuvectorFlatIndex | PatternStore, ReasoningBank |
| `qe-memory` | TypeScript HNSW | QEUnifiedMemory, cross-domain search |
| `learning` | QEGNNEmbeddingIndex | Learning pipeline, correlation discovery |

Each named index has its own INDEX_SEG within the RVF file but shares the same configuration defaults and progressive layer infrastructure.

### Decommission Plan

**Phase A: Parallel Operation (Weeks 1-4)**
1. Implement HnswIndexProvider backed by RVF INDEX_SEG
2. Wire all three subsystems to use HnswIndexProvider via feature flag
3. Run both old and new implementations in shadow mode
4. Compare search results: log divergences where top-5 neighbors differ
5. Tune unified configuration (M, ef_construction) until divergence is below 2%

**Phase B: Cutover and Removal (Weeks 5-8)**
1. Enable HnswIndexProvider as primary for all subsystems
2. Remove TypeScript HNSW implementation (files and tests)
3. Remove RuvectorFlatIndex wrapper
4. Remove QEGNNEmbeddingIndex wrapper
5. Update all imports and dependency declarations
6. Run full regression test suite

### Data Migration

```typescript
// v3/src/vectors/hnsw-migration.ts
interface HnswMigrationPlan {
  /** Migrate vectors from TypeScript HNSW SQLite BLOBs to RVF */
  migrateFromSqliteBlobs(
    source: SqliteDatabase,
    targetIndex: string
  ): Promise<MigrationResult>;

  /** Migrate vectors from RuvectorFlatIndex to RVF */
  migrateFromFlatIndex(
    source: RuvectorFlatIndex,
    targetIndex: string
  ): Promise<MigrationResult>;

  /** Migrate vectors from QEGNNEmbeddingIndex to RVF */
  migrateFromGnnIndex(
    source: QEGNNEmbeddingIndex,
    targetIndex: string
  ): Promise<MigrationResult>;

  /** Verify migration completeness (vector count and sample recall) */
  verifyMigration(
    targetIndex: string,
    expectedCount: number,
    sampleQueries: Float32Array[]
  ): Promise<VerificationResult>;
}
```

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-065 | RVF Integration Strategy -- Hybrid Architecture | RVF as vector persistence layer |
| Extends | ADR-066 | RVF-backed Pattern Store with Progressive HNSW | Extends from PatternStore-only to all HNSW consumers |
| Depends On | ADR-038 | Memory Unification | TypeScript HNSW lives in unified memory |
| Depends On | ADR-050 | RuVector Neural Backbone | GNN-based indexes are part of neural backbone |
| Relates To | ADR-067 | Agent Memory Branching | COW branches include the unified HNSW index |
| Part Of | MADR-001 | V3 Implementation Initiative | RVF integration Phase 2 |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| EXT-001 | RVF INDEX_SEG Spec | Technical Spec | @ruvector/rvf package documentation |
| INT-001 | TypeScript HNSW | Existing Code | QE unified memory HNSW implementation |
| INT-002 | RuvectorFlatIndex | Existing Code | `v3/src/learning/ruvector-flat-index.ts` |
| INT-003 | QEGNNEmbeddingIndex | Existing Code | `v3/src/learning/` |
| INT-004 | PatternStore | Existing Code | `v3/src/learning/pattern-store.ts` |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-02-22 | Proposed | 2026-08-22 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-02-22 | Initial creation. Unification of 3 fragmented HNSW implementations into a single RVF progressive HNSW backend with decommission plan. |

---

## Definition of Done Checklist

Before requesting approval, verify:

### Core (ECADR)
- [ ] **E - Evidence**: Approach validated (PoC, prior art, or expert input)
- [ ] **C - Criteria**: At least 2 options compared systematically
- [ ] **A - Agreement**: Relevant stakeholders consulted
- [ ] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Review cadence set, owner assigned

### Extended
- [ ] **Dp - Dependencies**: All relationships documented with typed relationships
- [ ] **Rf - References**: Implementation details in SPEC files, all links valid
- [ ] **M - Master**: Linked to Master ADR if part of larger initiative
