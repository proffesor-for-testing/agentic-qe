# ADR-066: RVF-backed Pattern Store with Progressive HNSW

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-066 |
| **Status** | Proposed |
| **Date** | 2026-02-15 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** AQE v3's PatternStore, which stores pattern embeddings as BLOBs in SQLite and rebuilds the full HNSW index in-memory via @ruvector/gnn on every process startup,

**facing** cold-start latency that grows linearly with pattern count (seconds for 10,000+ patterns), memory overhead from holding the complete deserialized index in RAM, and inability to apply temperature-based quantization to reduce memory for infrequently accessed patterns,

**we decided for** migrating PatternStore vector operations to @ruvector/rvf SDK, using VEC_SEG for embedding storage and INDEX_SEG for progressive 3-layer HNSW indexing (Layer A: microsecond lookups, Layer B: 10ms with 85% recall, Layer C: 50ms with 95% recall), while keeping pattern metadata queries in SQLite,

**and neglected** (a) optimizing the current SQLite BLOB + in-memory rebuild approach with lazy loading (rejected: still requires full index construction for accurate nearest-neighbor search), (b) using a separate HNSW library like hnswlib-node (rejected: does not integrate with ruvector ecosystem and lacks progressive layer architecture), (c) pre-computing and caching the serialized HNSW index in SQLite (rejected: still requires full deserialization on startup and doubles storage),

**to achieve** instant 70% recall on cold boot via Layer A without waiting for full index construction, temperature-based quantization that automatically reduces memory for cold patterns, persistent HNSW state that survives process restarts without rebuild, and a migration path controlled by feature flags with full fallback,

**accepting that** this adds @ruvector/rvf as a new dependency (v0.1.3+), requires maintaining two code paths during the feature-flagged rollout period, and introduces a new file format (.rvf) alongside the existing .db file.

---

## Context

The current PatternStore implementation stores learned pattern embeddings as Float32Array BLOBs in SQLite rows. When the process starts, it queries all embeddings from the database, deserializes them, and constructs an HNSW index in-memory using @ruvector/gnn. This index enables fast nearest-neighbor search for pattern matching during test generation, defect classification, and quality assessment.

This architecture has two scaling problems. First, cold-start latency: constructing an HNSW index from scratch requires inserting every vector and building the multi-layer graph. At 10,000 patterns with 384-dimensional embeddings, this takes multiple seconds. Second, memory pressure: the entire index must reside in memory regardless of access patterns. Patterns learned months ago that are rarely queried consume the same memory as frequently accessed hot patterns.

RVF's INDEX_SEG implements progressive 3-layer HNSW that addresses both problems. Layer A loads immediately and provides microsecond lookups with approximate recall. Layer B builds in the background to reach 85% recall at 10ms latency. Layer C completes asynchronously for 95% recall at 50ms. This progressive approach means the PatternStore is usable immediately on startup with improving accuracy over time. Additionally, RVF's temperature-based quantization allows cold patterns to be stored at lower precision (8-bit or 4-bit), reducing memory footprint without discarding them.

The migration will be controlled by a `useRVFBackend` flag in RuVectorFeatureFlags. A new RvfPatternStore adapter will wrap the @ruvector/rvf RvfDatabase class, implementing the same PatternStore interface. During rollout, the system can fall back to the current SQLite+GNN implementation by toggling the flag.

---

## Options Considered

### Option 1: RVF Progressive HNSW via RvfPatternStore Adapter (Selected)

Create an RvfPatternStore adapter that implements the PatternStore interface using @ruvector/rvf. Embeddings stored in VEC_SEG, HNSW index persisted in INDEX_SEG with 3-layer progressive construction. Pattern metadata remains in SQLite. Feature-flagged rollout.

**Pros:**
- Instant usability on cold boot (Layer A provides 70% recall immediately)
- Persistent HNSW state eliminates rebuild entirely
- Temperature quantization reduces memory for cold patterns
- Same PatternStore interface -- consumers unaffected
- Feature flag enables safe rollback

**Cons:**
- New dependency on @ruvector/rvf (v0.1.3+)
- Two code paths during rollout period
- New .rvf file to manage alongside .db file
- Progressive recall means early queries may miss results that Layer C would find

### Option 2: Lazy-Loading SQLite BLOBs with Partial Index (Rejected)

Load only recently accessed pattern embeddings into the HNSW index on startup. Lazy-load older patterns on demand.

**Why rejected:** HNSW nearest-neighbor search requires all candidate vectors to be present in the index for correct results. A partial index silently misses relevant patterns. Lazy loading individual vectors on demand defeats the purpose of the index structure, as each insertion triggers graph rebalancing.

### Option 3: Cached Serialized HNSW Index in SQLite (Rejected)

Serialize the constructed HNSW index as a single large BLOB in SQLite. On startup, deserialize the cached index instead of rebuilding.

**Why rejected:** Still requires full deserialization into memory on startup (trading CPU time for I/O time with marginal improvement). Doubles storage by keeping both individual embeddings and the serialized index. Any new pattern insertion invalidates the cache, requiring a full re-serialization.

### Option 4: External HNSW Library (Rejected)

Replace @ruvector/gnn with hnswlib-node or similar standalone HNSW implementation with persistence support.

**Why rejected:** Introduces a library outside the ruvector ecosystem, fragmenting the dependency graph. Does not integrate with @ruvector/sona learning patterns or @ruvector/attention flash attention. Lacks progressive layer architecture and temperature quantization. RVF provides these capabilities natively.

---

## Implementation

### RvfPatternStore Adapter

```typescript
// v3/src/learning/rvf-pattern-store.ts
interface RvfPatternStoreConfig {
  rvfPath: string;           // Path to .rvf file
  dimensions: number;        // Embedding dimensions (default: 384)
  layerAMaxItems: number;    // Layer A capacity for instant recall
  quantizationThreshold: number; // Days since last access before quantizing
}

class RvfPatternStore implements PatternStore {
  private rvfDb: RvfDatabase;

  async store(pattern: Pattern, embedding: Float32Array): Promise<void> {
    // Write embedding to VEC_SEG, update INDEX_SEG
  }

  async search(query: Float32Array, k: number): Promise<PatternMatch[]> {
    // Progressive search: Layer A -> B -> C based on available layers
  }

  async getLayerStatus(): Promise<LayerStatus> {
    // Report which progressive layers are ready
  }
}
```

### Feature Flag Integration

```typescript
// Addition to RuVectorFeatureFlags
interface RuVectorFeatureFlags {
  // ... existing flags
  useRVFBackend: boolean;    // Toggle RVF vs SQLite+GNN for PatternStore
  rvfFilePath: string;       // Location of .rvf file
}
```

### Migration Path

1. Add `useRVFBackend: false` to feature flags (default off)
2. Implement RvfPatternStore adapter with full PatternStore interface
3. Wire factory to select adapter based on feature flag
4. Run parallel validation: both backends process same queries, compare results
5. Enable flag for new installations, then existing installations after validation

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-065 | RVF Integration Strategy -- Hybrid Architecture | Parent decision establishing RVF as complementary persistence |
| Depends On | ADR-021 | ReasoningBank | PatternStore serves ReasoningBank's pattern storage |
| Depends On | ADR-038 | Memory Unification | HNSW is part of unified memory architecture |
| Relates To | ADR-067 | Agent Memory Branching via RVF COW | COW branches derive from the RVF file created here |
| Relates To | ADR-064 | Agent Teams Integration | Agent teams consume PatternStore for pattern matching |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| EXT-001 | RVF SDK Documentation | Technical Spec | @ruvector/rvf package documentation |
| INT-001 | PatternStore | Existing Code | `v3/src/learning/pattern-store.ts` |
| INT-002 | RuVector Feature Flags | Existing Code | `v3/src/learning/ruvector-feature-flags.ts` |
| INT-003 | GNN HNSW Implementation | Existing Code | @ruvector/gnn package |
| INT-004 | Pattern Promotion | Existing Code | `v3/src/feedback/pattern-promotion.ts` |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-02-15 | Proposed | 2026-08-15 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-02-15 | Initial creation. RVF-backed PatternStore with progressive 3-layer HNSW replacing in-memory rebuild from SQLite BLOBs. |

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
