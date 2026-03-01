# ADR-065: RVF Integration Strategy -- Hybrid Architecture

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-065 |
| **Status** | Proposed |
| **Date** | 2026-02-15 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** AQE v3's persistence layer, which currently uses better-sqlite3 for all data (KV store, Q-values, GOAP plans, hypergraph, CRDT state, pattern embeddings, HNSW indexes) alongside @ruvector/gnn for in-memory HNSW, @ruvector/sona for learning, and @ruvector/attention for flash attention,

**facing** the architectural mismatch of storing vector embeddings and HNSW indexes as BLOBs in a relational database, which causes cold-start index rebuilds, prevents memory versioning for concurrent agents, and lacks a native audit trail for pattern lineage,

**we decided for** a hybrid persistence architecture that adopts RVF (RuVector Format) as a complementary persistence layer alongside SQLite -- SQLite retains KV store, Q-values, GOAP, hypergraph, and CRDT workloads while RVF handles vectors (VEC_SEG), HNSW indexes (INDEX_SEG), SONA patterns (SKETCH_SEG), metadata (META_SEG), and audit trails (WITNESS_SEG),

**and neglected** (a) full migration to RVF for all persistence (rejected: SQLite excels at relational queries, KV lookups, and transactional CRDT operations that RVF does not optimize for), (b) keeping the current SQLite-only approach (rejected: vector workloads suffer from BLOB serialization overhead and cold-start HNSW rebuilds), (c) adopting a third-party vector database like Chroma or Qdrant (rejected: adds external service dependency and does not integrate with ruvector's learning and attention pipelines),

**to achieve** workload-optimized persistence where each engine handles what it does best, progressive HNSW that eliminates cold-start rebuilds, COW branching for agent memory versioning, and cryptographic witness chains for pattern audit trails,

**accepting that** two persistence engines increase operational complexity, data consistency across engines requires careful coordination, and the team must maintain expertise in both SQLite and RVF internals.

---

## Context

AQE v3 uses better-sqlite3 as its sole persistence backend. All data -- configuration key-value pairs, reinforcement learning Q-values, GOAP action plans, hypergraph relationships, CRDT convergence state, and pattern embeddings -- lives in a single SQLite database. This unified approach simplified initial development but has revealed pain points as the platform scaled to 50+ agents and thousands of learned patterns.

The vector workload is the most problematic. Pattern embeddings are stored as BLOBs in SQLite rows and deserialized into Float32Arrays on read. The HNSW index used by PatternStore is built entirely in-memory using @ruvector/gnn on startup, which means every process restart triggers a full index rebuild. For a knowledge base with 10,000+ patterns, this adds seconds of cold-start latency and consumes significant memory.

RVF (RuVector Format) is a new universal binary substrate from the ruvector ecosystem. A single .rvf file supports 20 segment types including VEC_SEG (dense vector storage), INDEX_SEG (progressive 3-layer HNSW), SKETCH_SEG (probabilistic pattern sketches), META_SEG (structured metadata), and WITNESS_SEG (cryptographic audit chains). Its COW (Copy-on-Write) branching enables lightweight file derivation where only changed segments are copied. These capabilities directly address the vector workload limitations while the existing SQLite infrastructure continues to serve relational and transactional workloads effectively.

---

## Options Considered

### Option 1: Hybrid Architecture -- SQLite + RVF (Selected)

Keep SQLite for KV store, Q-values, GOAP, hypergraph, and CRDT. Migrate vector embeddings, HNSW indexes, SONA patterns, metadata, and audit trails to RVF. Each engine handles workloads it is optimized for.

**Pros:**
- Each persistence engine operates on its optimal workload
- Progressive HNSW eliminates cold-start index rebuild
- COW branching enables lightweight agent memory isolation (ADR-067)
- WITNESS_SEG provides built-in cryptographic audit trail
- Incremental migration path with feature flags

**Cons:**
- Two persistence engines to maintain and monitor
- Cross-engine consistency requires explicit coordination
- Team must learn RVF internals and debugging tools

### Option 2: Full RVF Migration (Rejected)

Replace SQLite entirely with RVF for all persistence workloads.

**Why rejected:** SQLite excels at relational queries (pattern metadata joins, Q-value lookups by state-action pair), transactional CRDT operations, and general KV storage. RVF is optimized for vector and binary segment workloads, not relational queries. A full migration would force RVF into workloads where SQLite is demonstrably better, increasing complexity without benefit.

### Option 3: Status Quo -- SQLite Only (Rejected)

Continue using SQLite for all persistence including vector BLOBs and in-memory HNSW rebuilds.

**Why rejected:** Cold-start HNSW rebuild latency grows linearly with pattern count and is already a measurable bottleneck. No path to agent memory versioning without building a custom COW layer. No native audit trail capability for pattern lineage tracking.

### Option 4: Third-Party Vector Database (Rejected)

Adopt Chroma, Qdrant, or similar purpose-built vector database for embedding storage and HNSW indexing.

**Why rejected:** Introduces an external service dependency (separate process, network calls, deployment complexity). Does not integrate with the existing @ruvector/sona learning pipeline or @ruvector/attention flash attention. RVF provides the same vector capabilities as an embedded library within the ruvector ecosystem AQE already depends on.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-038 | Memory Unification | RVF extends the unified memory architecture |
| Depends On | ADR-021 | ReasoningBank | Pattern storage migrates to RVF backend |
| Relates To | ADR-066 | RVF-backed Pattern Store with Progressive HNSW | Implements vector migration portion |
| Relates To | ADR-067 | Agent Memory Branching via RVF Copy-on-Write | Implements COW branching portion |
| Relates To | ADR-064 | Agent Teams Integration | Agent teams benefit from COW memory isolation |
| Part Of | MADR-001 | V3 Implementation Initiative | RVF integration phase |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| EXT-001 | RVF Specification | Technical Spec | @ruvector/rvf package documentation |
| INT-001 | PatternStore | Existing Code | `v3/src/learning/pattern-store.ts` |
| INT-002 | Unified Memory | Existing Code | `v3/src/kernel/unified-memory.ts` |
| INT-003 | RuVector Feature Flags | Existing Code | `v3/src/learning/ruvector-feature-flags.ts` |
| INT-004 | Database Module | Existing Code | `v3/src/database/` |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-02-15 | Proposed | 2026-08-15 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-02-15 | Initial creation. Hybrid architecture for RVF integration alongside existing SQLite persistence. |

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
