# ADR-038: V3 QE Memory System Unification

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-038 |
| **Status** | Implemented |
| **Date** | 2026-01-11 |
| **Author** | Claude Code |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** V3 QE's fragmented memory systems across 6+ QE domains (test suites, coverage, defects, quality, learning, coordination),

**facing** inconsistent persistence strategies, missing SONA learning integration, no data migration path from legacy systems, suboptimal O(n) search performance, and siloed domain knowledge,

**we decided for** a unified AgentDB-backed memory system with domain-specific HNSW indexing, providing 150x-12,500x faster semantic search and cross-domain knowledge sharing,

**and neglected** keeping separate per-domain storage (fragments knowledge), using a single flat index (ignores domain-specific tuning needs), and deferring migration (loses V2 learnings),

**to achieve** unified API for all QE memory operations, O(log n) semantic search via HNSW, SONA-powered pattern learning, reduced memory footprint via quantization, and preserved V2 knowledge,

**accepting that** migration adds complexity, requires embedding generation infrastructure, and introduces a learning curve for the new unified API.

---

## Context

The existing `v3-qe-memory-system` skill provided basic AgentDB integration but lacked comprehensive unification. AQE had historically fragmented storage: test suites in one store, coverage in another, defects in a third. This prevented cross-domain learning and resulted in slow linear searches.

The V2 system contained 910 valuable patterns that needed migration to V3 without loss, while enabling the 150x-12,500x performance improvements from HNSW indexing.

---

## Options Considered

### Option 1: Unified AgentDB with Domain-Specific HNSW (Selected)

Single QEUnifiedMemory facade with 6 domain-specific indices, each tuned for its use case.

**Pros:** Fast semantic search, cross-domain queries, domain-tuned configurations
**Cons:** Migration complexity, embedding infrastructure required

### Option 2: Separate Per-Domain Storage (Rejected)

Keep existing fragmented approach with domain-specific stores.

**Why rejected:** Prevents cross-domain learning, no semantic search, duplicates code.

### Option 3: Single Flat Index (Rejected)

One HNSW index for all domains with metadata filtering.

**Why rejected:** Cannot tune M/efConstruction per domain; defects need high precision while test-suites need fast lookup.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Relates To | ADR-037 | V3 QE Agent Naming | Naming conventions for memory keys |
| Relates To | ADR-039 | V3 QE MCP Optimization | Memory tool performance |
| Part Of | MADR-001 | V3 Implementation Initiative | Learning infrastructure |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-038-A | Memory Architecture | Technical Spec | [specs/SPEC-038-A-memory-architecture.md](../specs/SPEC-038-A-memory-architecture.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-11 | Approved | 2026-07-11 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-11 | Initial creation |
| Implemented | 2026-01-12 | QEUnifiedMemory, HNSW integration, 910 patterns migrated |
