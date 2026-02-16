# RVF Integration Implementation Plan (ADR-065)

> **Revised 2026-02-15** after Phase 0 validation. See `rvf-phase0-gate-report.md` for full findings.

## Architecture: SQLite + @ruvector/core Bridge

**Phase 0 Finding**: `@ruvector/rvf` (RvfDatabase) SDK is not functional — `@ruvector/rvf-node` and `@ruvector/rvf-wasm` are published stubs with no binaries. Progressive HNSW exists in Rust but is not wired into the runtime query path.

**What works today**: `@ruvector/core` (VectorDb, CollectionManager) — native in-memory vector engine, 8-4000x faster search than current SQLite BLOB approach.

**Revised Decision**: Use `@ruvector/core` VectorDb as hot in-memory search layer. SQLite keeps all persistence (KV, Q-values, GOAP, pattern metadata) plus durable vector storage for promoted patterns. When `@ruvector/rvf-node` ships with binaries, swap the backend via feature flag.

**Current State**:
- Persistence: `better-sqlite3` in `.agentic-qe/memory.db` (UnifiedMemoryManager singleton)
- Vector search: `InMemoryHNSWIndex` (~250 LOC pure JS HNSW in unified-memory.ts:841)
- HNSW (PatternStore): `@ruvector/gnn` v0.1.19 (N-API, differentiable search)
- Learning: `@ruvector/sona` v0.1.5 (pattern learning)
- Attention: `@ruvector/attention` v0.1.3 (Flash Attention)
- Pattern Store: in-memory cache + lazy HNSW, persisted to `qe_patterns` table
- Feature Flags: `RuVectorFeatureFlags` in `v3/src/integrations/ruvector/feature-flags.ts`

**Target State (Bridge)**:
- SQLite: KV store, RL Q-values, GOAP tables, hypergraph, dream cycles, feedback loops, **durable vector storage for promoted patterns**
- `@ruvector/core` VectorDb: hot in-memory search layer replacing `InMemoryHNSWIndex`
- CollectionManager: per-domain vector isolation (test-generation, defect-intelligence, etc.)
- Lazy persistence: only flush vectors to SQLite when patterns are promoted/valuable
- Feature-flagged: `useRuvectorCore` controls JS HNSW vs native VectorDb routing

**Future Target (when rvf-node ships)**:
- RVF file (`.agentic-qe/patterns.rvf`): replaces SQLite vector BLOBs with persistent native format
- Progressive HNSW, COW branching, witness chains — all deferred until SDK is functional
- Feature-flagged: `useRVFBackend` controls VectorDb vs RVF file routing

---

## Phase 0.5 -- Bridge Layer (Week 1-2)

> Replaces original Phase 1. Uses `@ruvector/core` (working today) instead of `@ruvector/rvf` (stub).

### RVF-0.5.1: VectorBackend Interface

**Description**: Define a `VectorBackend` interface that abstracts vector storage, so the underlying engine can be swapped between JS HNSW, `@ruvector/core`, and eventually `@ruvector/rvf` without changing callers.

| Field | Value |
|-------|-------|
| File | `v3/src/kernel/vector-backend.ts` |
| Agent | coder |
| Dependencies | None |
| Parallel Group | P0-A |
| Success Criteria | Interface defined with store/search/delete/clear/size/flush methods; exported from kernel |

**Interface**:
```typescript
export interface VectorBackend {
  /** Store a vector with string ID */
  store(id: string, vector: number[]): void;
  /** Store a batch of vectors */
  storeBatch(entries: Array<{ id: string; vector: number[] }>): void;
  /** Search for k nearest neighbors. Returns results sorted by descending similarity. */
  search(query: number[], k: number): Array<{ id: string; score: number }>;
  /** Remove a vector by ID */
  remove(id: string): void;
  /** Clear all vectors */
  clear(): void;
  /** Number of vectors stored */
  size(): number;
  /** Get all vector IDs (for persistence sync) */
  ids(): string[];
  /** Dispose resources */
  dispose(): void;
}
```

---

### RVF-0.5.2: Wrap InMemoryHNSWIndex as `JsHnswBackend`

**Description**: Wrap the existing `InMemoryHNSWIndex` class (unified-memory.ts:841) as a `VectorBackend` implementation. This is the zero-risk baseline — same code, new interface.

| Field | Value |
|-------|-------|
| File | `v3/src/kernel/vector-backend.ts` |
| Agent | coder |
| Dependencies | RVF-0.5.1 |
| Parallel Group | P0-A |
| Success Criteria | `JsHnswBackend` wraps existing `InMemoryHNSWIndex`; passes all existing vector tests |

---

### RVF-0.5.3: Create `RuvectorCoreBackend`

**Description**: Implement `VectorBackend` using `@ruvector/core` VectorDb. This is the native engine that provides the speed improvement.

| Field | Value |
|-------|-------|
| File | `v3/src/kernel/vector-backend.ts` |
| Agent | coder |
| Dependencies | RVF-0.5.1 |
| Parallel Group | P0-A (parallel with RVF-0.5.2) |
| Success Criteria | `RuvectorCoreBackend` wraps `@ruvector/core` VectorDb; insertBatch uses Float32Array; search uses `{ vector, k }` API; passes same tests as JsHnswBackend |

**Implementation notes**:
- `@ruvector/core` VectorDb requires `Float32Array` for vectors (not `number[]`). The backend handles conversion.
- `@ruvector/core` uses `{ id: string, vector: Float32Array }` for insertBatch. The backend converts the `number[]` interface.
- Search API is `db.search({ vector: Float32Array, k })` — returns `{ id, score }`.
- CollectionManager enables per-namespace isolation (future: per-domain collections).

---

### RVF-0.5.4: Add `useRuvectorCore` Feature Flag

**Description**: Extend `RuVectorFeatureFlags` with `useRuvectorCore: boolean`, defaulting to `false`.

| Field | Value |
|-------|-------|
| File | `v3/src/integrations/ruvector/feature-flags.ts` |
| Agent | coder |
| Dependencies | None |
| Parallel Group | P0-A (parallel) |
| Success Criteria | `getRuVectorFeatureFlags().useRuvectorCore === false` by default; `RUVECTOR_USE_CORE=true` env var toggles it |

---

### RVF-0.5.5: Wire VectorBackend into UnifiedMemoryManager

**Description**: Replace direct `InMemoryHNSWIndex` usage in `UnifiedMemoryManager` with the `VectorBackend` interface. Select backend based on feature flag.

| Field | Value |
|-------|-------|
| File | `v3/src/kernel/unified-memory.ts` |
| Agent | coder |
| Dependencies | RVF-0.5.2, RVF-0.5.3, RVF-0.5.4 |
| Parallel Group | P0-B |
| Success Criteria | `UnifiedMemoryManager.vectorIndex` replaced with `VectorBackend`; backend selected by feature flag; all existing tests pass with both backends |

**Changes to `unified-memory.ts`**:
- Replace `private vectorIndex: InMemoryHNSWIndex` with `private vectorBackend: VectorBackend`
- In constructor/init: select `JsHnswBackend` (default) or `RuvectorCoreBackend` (when flag on)
- `vectorStore()`: calls `this.vectorBackend.store()` instead of `this.vectorIndex.add()`
- `vectorSearch()`: calls `this.vectorBackend.search()` instead of `this.vectorIndex.search()`
- `vectorDelete()`: calls `this.vectorBackend.remove()` instead of `this.vectorIndex.remove()`
- `loadVectorIndex()`: calls `this.vectorBackend.storeBatch()` instead of looping `this.vectorIndex.add()`

---

### RVF-0.5.6: Lazy Persistence (persist-when-valuable)

**Description**: Make SQLite vector writes conditional — only persist vectors for patterns that are promoted or meet a value threshold. Ephemeral vectors live only in the VectorBackend and are lost on restart.

| Field | Value |
|-------|-------|
| File | `v3/src/kernel/unified-memory.ts` |
| Agent | coder |
| Dependencies | RVF-0.5.5 |
| Parallel Group | P0-B |
| Success Criteria | `vectorStore()` with `persist: false` skips SQLite write; `vectorStore()` with `persist: true` writes to both; `flush()` persists all dirty vectors; shutdown triggers flush |

**Changes**:
- `vectorStore(id, embedding, namespace, metadata, options?: { persist?: boolean })`:
  - Always writes to VectorBackend (fast, in-memory)
  - Only writes SQLite BLOB if `persist !== false`
  - Tracks unpersisted IDs in a `Set<string>` (`dirtyVectors`)
- `vectorFlush()`: persists all dirty vectors to SQLite in a single transaction
- On shutdown (`close()`): auto-flush dirty vectors
- `vectorPromote(id)`: explicitly persist a previously-ephemeral vector

**Who decides persistence?**:
- PatternStore calls `vectorStore()` with `persist: true` for promoted patterns (high confidence, frequently used)
- PatternStore calls `vectorStore()` with `persist: false` for ephemeral/exploratory patterns
- `shouldPromotePattern()` (already exists in `qe-patterns.ts`) is the decision function

---

### RVF-0.5.7: Unit Tests

**Description**: Tests for VectorBackend implementations and feature flag.

| Field | Value |
|-------|-------|
| Files | `v3/tests/unit/kernel/vector-backend.test.ts`, `v3/tests/unit/integrations/ruvector/feature-flags-core.test.ts` |
| Agent | tester |
| Dependencies | RVF-0.5.2, RVF-0.5.3, RVF-0.5.4 |
| Parallel Group | P0-C |
| Success Criteria | All tests pass; both backends pass identical test suite; lazy persistence tested |

**Test cases**:
- `store()` + `search()` round-trip returns stored vector (both backends)
- `search()` returns results sorted by descending similarity (both backends)
- `remove()` makes vector unfindable (both backends)
- `clear()` empties the store (both backends)
- `storeBatch()` is equivalent to multiple `store()` calls (both backends)
- `vectorStore(persist: false)` does NOT write to SQLite
- `vectorStore(persist: true)` DOES write to SQLite
- `vectorFlush()` persists all dirty vectors
- `vectorPromote()` persists a previously-ephemeral vector
- Feature flag toggles backend selection

---

### RVF-0.5.8: Benchmark — JS HNSW vs @ruvector/core

**Description**: Comparative benchmark of both backends integrated in UnifiedMemoryManager.

| Field | Value |
|-------|-------|
| File | `scripts/benchmark-vector-backends.ts` |
| Agent | tester |
| Dependencies | RVF-0.5.5 |
| Parallel Group | P0-C (parallel with tests) |
| Success Criteria | Benchmark report comparing both backends on insert, search, memory, cold-start |

**Scenarios** (at 100, 500, 1000, 5000 vectors, dimension 384):
1. Insert throughput (ops/s)
2. Search latency p50/p95/p99
3. Memory footprint
4. Cold-start (load from SQLite into backend)
5. Lazy persistence overhead (flush 1000 dirty vectors)

---

### Phase 0.5 Parallel Execution Strategy

```
P0-A (parallel):  RVF-0.5.1 (interface)  |  RVF-0.5.4 (feature flag)
                         |
                         v
                  RVF-0.5.2 (JS backend)  |  RVF-0.5.3 (Core backend)
                         |                        |
                         v                        v
P0-B (sequential): RVF-0.5.5 (wire into UnifiedMemory) → RVF-0.5.6 (lazy persist)
                         |
P0-C (parallel):  RVF-0.5.7 (tests)  |  RVF-0.5.8 (benchmark)
```

**Agent assignments**:
| Task | Agent | Est. Hours |
|------|-------|-----------|
| RVF-0.5.1 | coder | 1 |
| RVF-0.5.2 | coder | 2 |
| RVF-0.5.3 | coder | 3 |
| RVF-0.5.4 | coder | 1 |
| RVF-0.5.5 | coder | 4 |
| RVF-0.5.6 | coder | 3 |
| RVF-0.5.7 | tester | 4 |
| RVF-0.5.8 | tester | 2 |
| **Phase 0.5 Total** | 2 agents | **20 hours** |

---

## Phase 1 -- Full RVF Integration (GATED: requires @ruvector/rvf-node binaries)

> **Gate condition**: `@ruvector/rvf-node` publishes prebuilt N-API binaries AND progressive HNSW is wired into rvf-runtime query path. Check weekly: `npm view @ruvector/rvf-node version` and test `RvfDatabase.create()`.
>
> Until this gate is met, Phase 0.5 bridge is the production architecture. The tasks below are preserved from the original plan for when the gate opens.

### RVF-1.1: Full RvfPatternStore Implementation

**Description**: Complete the `RvfPatternStore` with progressive HNSW support, reuse optimization (ADR-042), and token tracking.

| Field | Value |
|-------|-------|
| File | `v3/src/learning/rvf-pattern-store.ts` |
| Agent | coder |
| Dependencies | RVF-1.4 |
| Parallel Group | P2-A |
| Success Criteria | All `IPatternStore` methods implemented; `search()` uses RVF progressive HNSW (layer A for instant recall, B/C for precision); reuse optimization calculates `canReuse`, `estimatedTokenSavings`, `reuseConfidence` |

**Implementation details**:
- `store()`: Validate pattern via `validateQEPattern()`, write metadata to `qe_patterns`, write embedding to RVF, index in local caches
- `search(vector, opts)`: Query RVF for `k*2` candidates, hydrate metadata from SQLite, apply filters, calculate reuse info, return top-k
- `search(text, opts)`: Text search on SQLite `qe_patterns` table (name, description LIKE), then optionally use RVF for re-ranking if embeddings exist
- `recordUsage()`: Update SQLite metadata, update confidence/quality scores
- `promote()`: Update tier in SQLite; no RVF change needed (vectors are tier-agnostic)
- `cleanup()`: Delete low-quality patterns from both SQLite and RVF
- `getStats()`: Merge SQLite pattern counts with RVF status (totalVectors, fileSize)

---

### RVF-2.2: Migration Utility (SQLite BLOBs to RVF)

**Description**: Create a migration utility that exports existing vector embeddings from SQLite `qe_pattern_embeddings` and `vectors` tables into the RVF store.

| Field | Value |
|-------|-------|
| File | `v3/src/migrations/migrate-vectors-to-rvf.ts` |
| Agent | coder |
| Dependencies | RVF-1.3 |
| Parallel Group | P2-A (parallel with RVF-2.1) |
| Success Criteria | Migration reads all rows from `qe_pattern_embeddings` and `vectors`; batch-ingests into RVF; reports count migrated, count failed, elapsed time; idempotent (skip if already migrated via epoch check) |

**Migration steps**:
1. Open existing `memory.db` via `UnifiedMemoryManager`
2. Create/open `.agentic-qe/patterns.rvf` via `RvfBackend`
3. Read all rows from `qe_pattern_embeddings` (pattern_id, embedding BLOB, dimension)
4. Convert BLOBs to Float32Array, batch ingest into RVF with pattern_id as key
5. Read all rows from `vectors` (id, embedding BLOB, dimensions, namespace)
6. Batch ingest into RVF with `{namespace}:{id}` as key
7. Record migration metadata in `kv_store` namespace `rvf-migration` with epoch and counts
8. Log summary: `[RVF Migration] Migrated {n} pattern embeddings + {m} vectors in {t}ms`

**Safety**:
- Does NOT delete SQLite data after migration. Both stores coexist.
- Idempotent: checks `kv_store` for `rvf-migration:completed` before running.
- Can be invoked via CLI: `aqe migrate-vectors-to-rvf`

---

### RVF-2.3: Feature-Flagged Routing in PatternStore

**Description**: Modify the existing `PatternStore` class to route vector operations to either the existing SQLite/in-memory HNSW path or the new `RvfPatternStore` based on the `useRVFBackend` feature flag.

| Field | Value |
|-------|-------|
| File | `v3/src/learning/pattern-store.ts` |
| Agent | coder |
| Dependencies | RVF-2.1, RVF-1.2 |
| Parallel Group | P2-B |
| Success Criteria | When `useRVFBackend=false`, behavior identical to current; when `useRVFBackend=true`, vector operations delegate to `RvfPatternStore`; flag can be toggled at runtime without restart |

**Changes to `PatternStore`**:
- Add optional `rvfStore: RvfPatternStore` field, lazily initialized when flag is true
- `store()`: if `useRVFBackend` and pattern has embedding, delegate embedding storage to `rvfStore`
- `search()`: if `useRVFBackend` and query is vector, delegate to `rvfStore.search()`
- `ensureHNSW()`: skip HNSW init when `useRVFBackend` is true (RVF handles HNSW internally)
- `dispose()`: close `rvfStore` if active

---

### RVF-2.4: WITNESS_SEG for Pattern Provenance

**Description**: When storing patterns via RVF, generate witness chain entries that record pattern origin, agent ID, domain, and creation context for tamper-evident audit trails.

| Field | Value |
|-------|-------|
| File | `v3/src/integrations/ruvector/rvf-witness.ts` |
| Agent | coder |
| Dependencies | RVF-1.3 |
| Parallel Group | P2-A (parallel with RVF-2.1, RVF-2.2) |
| Success Criteria | Each pattern store operation generates a witness entry; witness chain is verifiable via `RvfDatabase` API; witness entries include: pattern_id, agent_id, domain, operation (create/update/delete/promote), timestamp, content_hash |

**Witness entry structure**:
```typescript
interface PatternWitnessEntry {
  patternId: string;
  agentId: string;
  domain: string;
  operation: 'create' | 'update' | 'delete' | 'promote' | 'migrate';
  timestamp: number;
  contentHash: string; // SHA-256 of pattern JSON
  previousHash: string | null; // Chain link
  metadata?: Record<string, unknown>;
}
```

---

### RVF-2.5: Integration Tests

**Description**: Integration tests verifying SQLite and RVF data consistency, migration correctness, and feature flag routing.

| Field | Value |
|-------|-------|
| Files | `v3/tests/integration/learning/rvf-pattern-store.test.ts`, `v3/tests/integration/migrations/migrate-vectors-to-rvf.test.ts` |
| Agent | tester |
| Dependencies | RVF-2.1, RVF-2.2, RVF-2.3 |
| Parallel Group | P2-C |
| Success Criteria | All integration tests pass; pattern stored via RVF is retrievable; migrated vectors produce same search results; flag toggle mid-session works correctly |

**Test scenarios**:
1. Store pattern with embedding via `RvfPatternStore`, retrieve by ID, verify metadata + embedding
2. Search with vector query, verify results ranked by similarity
3. Run migration on test DB with 100 patterns, verify all migrated to RVF
4. Toggle `useRVFBackend` from false to true mid-session, verify seamless transition
5. Store pattern with `useRVFBackend=true`, switch to `false`, verify pattern still accessible (metadata in SQLite)
6. Witness chain: store 5 patterns, verify chain integrity (each entry links to previous)
7. Regression: run existing PatternStore tests with `useRVFBackend=false`, all pass unchanged

---

### Phase 2 Parallel Execution Strategy

```
P2-A (parallel):  RVF-2.1 (full impl)  |  RVF-2.2 (migration)  |  RVF-2.4 (witness)
                         |                       |
                         v                       v
P2-B:             RVF-2.3 (flag routing) -- depends on RVF-2.1
                         |
                         v
P2-C:             RVF-2.5 (integration tests) -- depends on all P2-A + P2-B
```

**Agent assignments**:
| Task | Agent | Est. Hours |
|------|-------|-----------|
| RVF-2.1 | coder | 12 |
| RVF-2.2 | coder | 6 |
| RVF-2.3 | coder | 6 |
| RVF-2.4 | coder | 6 |
| RVF-2.5 | tester | 8 |
| **Phase 2 Total** | 3 agents | **38 hours** |

---

## Phase 2 -- Agent Memory Branching (GATED: requires Phase 1)

### RVF-3.1: COW Branching for Swarm Agent Memory Isolation

**Description**: Integrate `RvfDatabase.derive()` with the swarm coordinator so each spawned agent gets a COW branch of the shared pattern store, enabling isolated memory that can be merged back.

| Field | Value |
|-------|-------|
| File | `v3/src/integrations/ruvector/rvf-agent-memory.ts` |
| Agent | coder |
| Dependencies | RVF-2.1 |
| Parallel Group | P3-A |
| Success Criteria | `createAgentBranch(agentId)` returns a COW child `RvfBackend`; writes to child do not affect parent; parent writes after derive are not visible in child; `mergeBack(agentId)` applies child patterns to parent |

**Interface**:
```typescript
export interface RvfAgentMemoryManager {
  /** Create a COW branch for an agent */
  createBranch(agentId: string): Promise<RvfBackend>;
  /** List active branches */
  listBranches(): Array<{ agentId: string; fileId: string; depth: number; vectorCount: number }>;
  /** Merge agent's patterns back to parent (with conflict resolution) */
  mergeBranch(agentId: string, strategy?: MergeStrategy): Promise<MergeResult>;
  /** Discard an agent's branch */
  discardBranch(agentId: string): Promise<void>;
  /** Close all branches */
  closeAll(): Promise<void>;
}

type MergeStrategy = 'latest-wins' | 'highest-confidence' | 'union';

interface MergeResult {
  merged: number;
  conflicts: number;
  skipped: number;
  newPatterns: string[];
}
```

**Implementation notes**:
- Branch files stored at `.agentic-qe/branches/{agentId}.rvf`
- Branch metadata stored in SQLite `kv_store` namespace `rvf-branches`
- `mergeBranch()` reads all vectors from child, queries parent for duplicates (cosine similarity > 0.99), merges new patterns, resolves conflicts per strategy
- Cleanup: branches older than 24h without merge are auto-discarded

---

### RVF-3.2: Swarm Coordinator Integration

**Description**: Wire `RvfAgentMemoryManager` into the swarm coordinator lifecycle so branches are created on agent spawn and optionally merged on agent completion.

| Field | Value |
|-------|-------|
| Files | `v3/src/coordination/` (swarm coordinator files) |
| Agent | coder |
| Dependencies | RVF-3.1 |
| Parallel Group | P3-B |
| Success Criteria | Agent spawn creates RVF branch (when `useRVFBackend=true`); agent completion triggers merge-back; failed agents have branches discarded; branch lifecycle logged |

**Integration points**:
- `agentSpawn()`: if `useRVFBackend` flag is true, call `memoryManager.createBranch(agentId)`
- `agentComplete()`: call `memoryManager.mergeBranch(agentId, 'highest-confidence')`
- `agentFailed()`: call `memoryManager.discardBranch(agentId)`
- `swarmShutdown()`: call `memoryManager.closeAll()`

---

### RVF-3.3: Lineage Tracking

**Description**: Track pattern lineage across branches so merged patterns retain provenance: which agent discovered them, from which branch, at what lineage depth.

| Field | Value |
|-------|-------|
| File | `v3/src/integrations/ruvector/rvf-lineage.ts` |
| Agent | coder |
| Dependencies | RVF-3.1, RVF-2.4 (witness chain) |
| Parallel Group | P3-A (parallel with RVF-3.1) |
| Success Criteria | Merged patterns have `lineage` metadata: `{ originAgent, originBranch, branchDepth, mergedAt, mergeStrategy }`; lineage queryable via PatternStore |

**Lineage metadata added to `qe_patterns`**:
```sql
ALTER TABLE qe_patterns ADD COLUMN lineage_json TEXT;
```

**Lineage structure**:
```typescript
interface PatternLineage {
  originAgent: string;
  originBranchFileId: string;
  branchDepth: number;
  mergedAt: string; // ISO timestamp
  mergeStrategy: MergeStrategy;
  parentPatternId?: string; // If pattern was derived from existing
  witnessEntryId?: string; // Link to witness chain
}
```

---

### RVF-3.4: Concurrent Agent Memory Tests

**Description**: Stress tests for COW branching with 15 concurrent agents performing simultaneous reads, writes, and merges.

| Field | Value |
|-------|-------|
| File | `v3/tests/integration/ruvector/rvf-concurrent-agents.test.ts` |
| Agent | tester |
| Dependencies | RVF-3.1, RVF-3.2 |
| Parallel Group | P3-C |
| Success Criteria | 15 agents each write 100 patterns to their branch; all merges complete without data loss; parent store contains all merged patterns; no file corruption; total time < 30s |

**Test scenarios**:
1. **Parallel writes**: 15 branches created, each writes 100 vectors. Verify no cross-branch contamination.
2. **Concurrent merge**: 15 branches merge simultaneously. Verify all patterns present in parent.
3. **Read-during-write**: Parent queried while branches are writing. Verify parent reads are consistent.
4. **Branch-after-branch**: Agent A derives, writes, merges. Agent B derives (sees A's patterns), writes, merges. Verify lineage chain.
5. **Discard + re-branch**: Agent creates branch, writes patterns, branch discarded. Agent re-branches. Verify clean state.
6. **Memory pressure**: 15 branches with 1000 vectors each. Verify RSS stays under 500MB.

---

### Phase 3 Parallel Execution Strategy

```
P3-A (parallel):  RVF-3.1 (COW branching)  |  RVF-3.3 (lineage tracking)
                         |
                         v
P3-B:             RVF-3.2 (swarm integration) -- depends on RVF-3.1
                         |
                         v
P3-C:             RVF-3.4 (concurrent tests) -- depends on RVF-3.1, RVF-3.2
```

**Agent assignments**:
| Task | Agent | Est. Hours |
|------|-------|-----------|
| RVF-3.1 | coder | 10 |
| RVF-3.2 | coder | 8 |
| RVF-3.3 | coder | 6 |
| RVF-3.4 | tester | 8 |
| **Phase 3 Total** | 3 agents | **32 hours** |

---

## Phase 3 -- Quality Attestation and Polish (GATED: requires Phase 2)

### RVF-4.1: Signed Quality Report Generation

**Description**: Generate quality assessment reports as `.rvf` files containing coverage metrics, test results, and pattern confidence scores, with witness chains for tamper-evident attestation.

| Field | Value |
|-------|-------|
| File | `v3/src/domains/quality-assessment/services/rvf-quality-report.ts` |
| Agent | coder |
| Dependencies | RVF-2.4 (witness chain) |
| Parallel Group | P4-A |
| Success Criteria | `generateQualityReport()` produces a `.rvf` file with embedded metrics; witness chain verifiable; report includes coverage, test pass rate, pattern confidence distribution, agent performance |

**Report structure** (stored as RVF metadata segments):
- `QUALITY_METRICS_SEG`: coverage percentages, test counts, pass rates
- `PATTERN_SUMMARY_SEG`: pattern count by domain/tier, average confidence
- `AGENT_PERFORMANCE_SEG`: per-agent success rates, latencies
- `WITNESS_SEG`: chain of all quality events leading to this report
- `VEC_SEG`: embedding vectors of high-confidence patterns (for cross-project transfer)

---

### RVF-4.2: MCP Server Integration

**Description**: Wire `@ruvector/rvf-mcp-server` into the AQE MCP server so agents can natively access RVF operations (query, derive, witness verify) through MCP tools.

| Field | Value |
|-------|-------|
| Files | `v3/src/mcp/tools/rvf-tools.ts`, MCP server registration |
| Agent | coder |
| Dependencies | RVF-1.1, RVF-2.1 |
| Parallel Group | P4-A (parallel with RVF-4.1) |
| Success Criteria | MCP tools registered: `rvf_query`, `rvf_store`, `rvf_derive`, `rvf_status`, `rvf_witness_verify`; tools callable from agent prompts |

**MCP tools**:
| Tool | Description |
|------|-------------|
| `rvf_query` | Search RVF store by vector similarity |
| `rvf_store` | Store a vector with metadata |
| `rvf_derive` | Create a COW branch for an agent |
| `rvf_status` | Get RVF store status (vector count, file size, epoch) |
| `rvf_witness_verify` | Verify witness chain integrity |
| `rvf_quality_report` | Generate quality attestation report |

---

### RVF-4.3: Performance Optimization

**Description**: Optimize RVF integration for production workloads based on Phase 1 benchmark results.

| Field | Value |
|-------|-------|
| Files | `v3/src/integrations/ruvector/rvf-backend.ts`, `v3/src/learning/rvf-pattern-store.ts` |
| Agent | coder |
| Dependencies | RVF-1.5 (benchmark results), RVF-2.1 |
| Parallel Group | P4-B |
| Success Criteria | Cold-start < 200ms for 50K vectors; query latency p99 < 5ms; batch ingest > 10K vectors/sec; memory < 200MB for 50K vectors |

**Optimization areas**:
1. **Batch operations**: Group pattern stores into batches of 100 before calling `ingestBatch()`
2. **ID mapping cache**: LRU cache for string-to-numeric ID mapping (avoid SQLite lookup on every query)
3. **Lazy compaction**: Schedule `compact()` during idle periods (post-cleanup timer in PatternStore)
4. **Progressive HNSW tuning**: Tune A/B/C layer parameters based on benchmark data
5. **Memory-mapped I/O**: Ensure RVF file is memory-mapped for read-heavy workloads

---

### RVF-4.4: Monitoring and Observability

**Description**: Extend `RuVectorObservability` to track RVF-specific metrics: store size, query latency, branch count, witness chain length.

| Field | Value |
|-------|-------|
| File | `v3/src/integrations/ruvector/observability.ts` (extend existing) |
| Agent | coder |
| Dependencies | RVF-2.1 |
| Parallel Group | P4-A |
| Success Criteria | `getObservabilityReport()` includes RVF section with: vectorCount, fileSize, queryLatencyP50/P95/P99, activeBranches, witnessChainLength, lastCompactionTime |

---

### RVF-4.5: Documentation

**Description**: Create ADR-065 document and update existing docs to reflect hybrid architecture.

| Field | Value |
|-------|-------|
| Files | `docs/adr/ADR-065-rvf-hybrid-architecture.md`, `docs/plans/rvf-integration-implementation-plan.md` (this file, marked complete) |
| Agent | reviewer |
| Dependencies | All Phase 4 tasks |
| Parallel Group | P4-C |
| Success Criteria | ADR explains decision rationale, architecture diagram, rollback plan; CLAUDE.md updated with RVF references; README mentions RVF capability |

---

### RVF-4.6: Final Regression and Acceptance Tests

**Description**: Full regression suite ensuring existing SQLite path works unchanged and new RVF path meets acceptance criteria.

| Field | Value |
|-------|-------|
| Files | `v3/tests/integration/ruvector/rvf-acceptance.test.ts` |
| Agent | tester |
| Dependencies | All Phase 4 implementation tasks |
| Parallel Group | P4-C |
| Success Criteria | All existing tests pass with `useRVFBackend=false`; acceptance tests pass with `useRVFBackend=true`; benchmark targets met |

**Acceptance test matrix**:
| Scenario | useRVFBackend=false | useRVFBackend=true |
|----------|--------------------|--------------------|
| Pattern CRUD | PASS (existing) | PASS (new) |
| Vector search recall@10 > 90% | PASS | PASS |
| Pattern migration round-trip | N/A | PASS |
| COW branch create/merge | N/A | PASS |
| Witness chain verify | N/A | PASS |
| Quality report generation | N/A | PASS |
| MCP tool invocation | N/A | PASS |
| Cold-start < 500ms | PASS | PASS |
| 15 concurrent agents | N/A | PASS |

---

### Phase 4 Parallel Execution Strategy

```
P4-A (parallel):  RVF-4.1 (quality reports)  |  RVF-4.2 (MCP)  |  RVF-4.4 (observability)
                         |                           |
                         v                           v
P4-B:             RVF-4.3 (performance optimization)
                         |
                         v
P4-C (parallel):  RVF-4.5 (documentation)  |  RVF-4.6 (acceptance tests)
```

**Agent assignments**:
| Task | Agent | Est. Hours |
|------|-------|-----------|
| RVF-4.1 | coder | 8 |
| RVF-4.2 | coder | 6 |
| RVF-4.3 | coder | 8 |
| RVF-4.4 | coder | 4 |
| RVF-4.5 | reviewer | 4 |
| RVF-4.6 | tester | 8 |
| **Phase 4 Total** | 4 agents | **38 hours** |

---

## Integration Plan

### Phase 0.5 Bridge Architecture

```
.agentic-qe/
  memory.db          <-- SQLite (KV, Q-values, GOAP, hypergraph, pattern metadata,
                         durable vector BLOBs for promoted patterns)

In-memory (not persisted to disk):
  @ruvector/core VectorDb  <-- Hot search layer (all vectors, including ephemeral)
```

**Data flow**:
1. `vectorStore(id, embedding, namespace, metadata, { persist })`:
   - ALWAYS writes to `VectorBackend` (in-memory, fast)
   - If `persist: true`: also writes BLOB to SQLite `vectors` table
   - If `persist: false`: vector is ephemeral, lost on restart
2. `vectorSearch(query, k)`: queries `VectorBackend` directly, no SQLite involved
3. `vectorFlush()`: batch-persists all dirty (unpersisted) vectors to SQLite
4. Cold start: `loadVectorIndex()` reads promoted vectors from SQLite into `VectorBackend`

**Invariant**: Pattern metadata is ALWAYS in SQLite. Vector embeddings are always in VectorBackend for search. SQLite BLOBs are the durable backup for vectors worth keeping.

### Backend Selection

```typescript
// In UnifiedMemoryManager constructor
private vectorBackend: VectorBackend = isRuvectorCoreEnabled()
  ? new RuvectorCoreBackend({ dimensions: 384, metric: 'cosine' })
  : new JsHnswBackend();

// vectorStore — same code regardless of backend
async vectorStore(id, embedding, namespace, metadata, opts?: { persist?: boolean }) {
  this.vectorBackend.store(id, embedding);           // always fast
  if (opts?.persist !== false) {
    this.db.prepare('INSERT OR REPLACE INTO vectors ...').run(...);  // durable
  } else {
    this.dirtyVectors.add(id);  // track for potential later flush
  }
}

// vectorSearch — delegates to backend, enriches with SQLite metadata
async vectorSearch(query, k, namespace?) {
  const results = this.vectorBackend.search(query, k * 2);
  // batch-fetch metadata from SQLite for result IDs
  // filter by namespace, return top-k
}
```

### Feature Flag Rollout Strategy

| Stage | Flag | Description |
|-------|------|-------------|
| **Stage 0** | `useRuvectorCore=false` | JS HNSW backend (current behavior). Zero risk. |
| **Stage 1** | `useRuvectorCore=true` in dev | Enable `@ruvector/core` VectorDb. Run full test suite. |
| **Stage 2** | `useRuvectorCore=true` in prod | Enable in production. Monitor search latency improvement. |
| **Stage 3** | Add lazy persistence | Enable `persist: false` for ephemeral patterns. |
| **Rollback** | `useRuvectorCore=false` | Flip flag back. JS HNSW rebuilds from SQLite BLOBs. |

### Future: Full RVF (when rvf-node ships)

| Stage | Flag | Description |
|-------|------|-------------|
| **Stage 4** | `useRVFBackend=true` | Swap VectorBackend to RVF file backend. |
| **Stage 5** | Enable COW branching | Agent memory isolation via RVF derive(). |
| **Stage 6** | Enable witness chains | Tamper-evident audit trails. |

### Dependency Management

```json
{
  "dependencies": {
    "@ruvector/core": "^0.1.29",
    "@ruvector/gnn": "^0.1.19",
    "@ruvector/sona": "^0.1.5",
    "@ruvector/attention": "^0.1.3"
  },
  "optionalDependencies": {
    "@ruvector/rvf": "^0.1.4"
  }
}
```

**Compatibility notes**:
- `@ruvector/core` VectorDb replaces `InMemoryHNSWIndex` in `unified-memory.ts` for vector search when enabled
- `@ruvector/gnn` continues for PatternStore HNSW (separate concern, different dimension/usage)
- `@ruvector/rvf` moved to optionalDependencies until backend binaries ship
- No conflicts between core/gnn/sona/attention — they serve different purposes

---

## Verification Plan

### Unit Tests (London School TDD)

All new modules get mock-first unit tests:

| Module | Test File | Mock Dependencies | Key Assertions |
|--------|-----------|-------------------|----------------|
| `rvf-backend.ts` | `rvf-backend.test.ts` | `RvfDatabase` (mocked) | create/open/store/query/derive/close lifecycle |
| `rvf-pattern-store.ts` | `rvf-pattern-store.test.ts` | `RvfBackend` (mocked), `MemoryBackend` (mocked) | IPatternStore contract fulfilled |
| `rvf-witness.ts` | `rvf-witness.test.ts` | `RvfBackend` (mocked) | Witness entries chained correctly |
| `rvf-agent-memory.ts` | `rvf-agent-memory.test.ts` | `RvfBackend` (mocked) | Branch create/merge/discard lifecycle |
| `rvf-lineage.ts` | `rvf-lineage.test.ts` | SQLite (in-memory) | Lineage metadata persisted and queryable |
| `feature-flags.ts` | `feature-flags-rvf.test.ts` | None | New flag behavior |
| `migrate-vectors-to-rvf.ts` | `migrate-vectors.test.ts` | SQLite (in-memory), `RvfBackend` (mocked) | Migration counts correct |

### Integration Tests

| Test Suite | Description | Duration Target |
|-----------|-------------|-----------------|
| SQLite-RVF consistency | Store via RVF, read metadata from SQLite, verify match | < 5s |
| Migration round-trip | Migrate, then search: results match pre-migration | < 10s |
| Feature flag toggle | Toggle mid-session, verify no data loss | < 5s |
| Branch create/merge | Create branch, write, merge, verify parent updated | < 10s |
| Witness chain verification | Store 10 patterns, verify chain integrity | < 5s |
| MCP tool invocation | Call each RVF MCP tool, verify response | < 10s |

### Benchmark Suite

| Benchmark | Metric | Target | Method |
|-----------|--------|--------|--------|
| Cold start (10K vectors) | Time to first query | < 500ms | Time from `initialize()` to first `query()` |
| Cold start (50K vectors) | Time to first query | < 2s | Same |
| Recall@10 (10K vectors) | Recall vs brute-force | > 90% | 1000 random queries, compare to exact NN |
| Query latency (10K) | p99 | < 5ms | 10K queries, measure per-query time |
| Insert throughput | vectors/sec | > 10K/sec | Batch insert 50K vectors, measure elapsed |
| Memory (10K vectors) | Peak RSS delta | < 50MB | `process.memoryUsage()` before/after |
| Memory (50K vectors) | Peak RSS delta | < 200MB | Same |
| COW branch create | Time to derive | < 10ms | Time `derive()` call |
| COW merge (1K patterns) | Time to merge | < 1s | Time `mergeBranch()` with 1000 new patterns |

### Regression Tests

- **All existing test suites run with `useRVFBackend=false`**: Zero regressions expected.
- **Critical path**: `pattern-store.test.ts`, `hnsw-index.test.ts`, `unified-memory.test.ts` must pass unchanged.
- **CI integration**: Add `RUVECTOR_USE_RVF_BACKEND=true` matrix entry to CI pipeline.

### COW Branching Stress Tests

| Scenario | Agents | Vectors/Agent | Duration Target |
|----------|--------|---------------|-----------------|
| Parallel writes | 15 | 100 | < 10s |
| Concurrent merge | 15 | 100 | < 15s |
| Sequential merge chain | 15 (sequential) | 100 | < 30s |
| Memory pressure | 15 | 1000 | < 60s, RSS < 500MB |

### Witness Chain Verification Tests

| Test | Description |
|------|-------------|
| Chain integrity | Hash chain from root to tip is valid |
| Tamper detection | Modify one entry, verify chain breaks |
| Cross-branch witness | Merged pattern's witness links to both branch and parent chains |
| Empty chain | New store has empty but valid witness chain |

---

## Parallel Execution Strategy (All Phases)

### Agent Roster

| Agent ID | Type | Specialization |
|----------|------|---------------|
| `rvf-coder-1` | coder | RVF backend, pattern store, migration |
| `rvf-coder-2` | coder | Feature flags, swarm integration, MCP |
| `rvf-tester-1` | tester | Unit tests, benchmarks |
| `rvf-tester-2` | tester | Integration tests, stress tests |
| `rvf-reviewer-1` | reviewer | Code review, documentation |

### Phase-by-Phase Agent Allocation

#### Phase 1 (3 agents active)
```
rvf-coder-1:  RVF-1.1 -> RVF-1.3 -> RVF-1.4
rvf-coder-2:  RVF-1.2
rvf-tester-1: (wait for RVF-1.3) -> RVF-1.5, RVF-1.6
```

#### Phase 2 (3 agents active)
```
rvf-coder-1:  RVF-2.1 -> RVF-2.3
rvf-coder-2:  RVF-2.2, RVF-2.4
rvf-tester-1: (wait for P2-B) -> RVF-2.5
```

#### Phase 3 (3 agents active)
```
rvf-coder-1:  RVF-3.1 -> RVF-3.2
rvf-coder-2:  RVF-3.3
rvf-tester-2: (wait for RVF-3.2) -> RVF-3.4
```

#### Phase 4 (4 agents active)
```
rvf-coder-1:  RVF-4.1 -> RVF-4.3
rvf-coder-2:  RVF-4.2, RVF-4.4
rvf-tester-2: RVF-4.6
rvf-reviewer-1: RVF-4.5
```

### Critical Path

```
RVF-1.1 -> RVF-1.3 -> RVF-1.4 -> RVF-2.1 -> RVF-2.3 -> RVF-3.1 -> RVF-3.2 -> RVF-4.3 -> RVF-4.6
```

Total critical path estimated duration: **~60 hours of sequential work** spread across 8 weeks with parallelism reducing wall-clock time to **~4-5 weeks** with 3-4 agents.

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `@ruvector/core` VectorDb API breaks between versions | Low | Medium | Pin to `^0.1.29`; VectorBackend interface isolates callers |
| @ruvector/core missing on platform (e.g., ARM64) | Low | Low | Feature flag defaults to JS HNSW; graceful fallback |
| In-memory vectors lost on crash (lazy persistence) | Medium | Medium | Promoted patterns always in SQLite; only ephemeral patterns lost |
| `@ruvector/rvf-node` never ships binaries | Medium | Low | Phase 0.5 bridge is production-viable indefinitely |
| Performance regression vs JS HNSW at small scale | Low | Low | At <100 vectors both are sub-millisecond; no user impact |
| Feature flag toggle mid-request | Low | Low | Flag checked at operation start, not mid-operation |

---

## Rollback Plan

### Phase 0.5 Rollback
1. Set `RUVECTOR_USE_CORE=false` in environment
2. All operations revert to JS HNSW path (InMemoryHNSWIndex)
3. SQLite vector BLOBs unchanged (always the source of truth for promoted patterns)
4. No data loss: in-memory VectorDb is rebuilt from SQLite on next cold start

### Future Phase 1+ Rollback
1. Set `RUVECTOR_USE_RVF_BACKEND=false`
2. Falls back to Phase 0.5 bridge (VectorDb or JS HNSW)
3. `.rvf` files can be left in place or deleted
4. SQLite metadata always intact

---

## Summary

| Phase | Status | Duration | Tasks | Key Deliverable |
|-------|--------|----------|-------|----------------|
| **0: Validate** | **DONE** | 1 day | 2 | Phase 0 gate report, AQE baseline benchmark |
| **0.5: Bridge** | **READY** | Week 1-2 | 8 | VectorBackend interface, @ruvector/core integration, lazy persistence |
| 1: Full RVF | GATED | Week 3-4 | 5 | RvfDatabase integration, migration, witness chains |
| 2: Branching | GATED | Week 5-6 | 4 | COW agent memory, swarm integration |
| 3: Polish | GATED | Week 7-8 | 6 | Quality reports, MCP tools, optimization |

**Phase 0.5 effort**: 20 hours across 8 tasks with 2 agents. Delivers immediate value.
**Full plan effort** (if all gates pass): 134 hours across 29 tasks.

### What Phase 0.5 Delivers NOW
- Native vector search via `@ruvector/core` (8-4000x faster than JS HNSW)
- Clean `VectorBackend` interface for future RVF swap
- Lazy persistence (only persist valuable patterns to SQLite)
- Per-domain collection isolation via CollectionManager
- Zero risk: feature-flagged, falls back to existing JS HNSW

### What Phases 1-3 Deliver LATER (when rvf-node ships)
- Persistent `.rvf` file format (no cold-start rebuild)
- Progressive 3-layer HNSW (instant partial results)
- COW branching for agent memory isolation
- Witness chains for tamper-evident audit trails
- Quality attestation as signed `.rvf` files
