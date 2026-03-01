# ADR-050: RuVector as Primary Neural Backbone

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-050 |
| **Status** | Implemented |
| **Date** | 2026-01-20 |
| **Author** | GOAP Specialist |
| **Review Cadence** | Monthly (active implementation) |

---

## WH(Y) Decision Statement

**In the context of** AQE v3's integration with ruvector ML capabilities including Q-Learning routing, SONA pattern recognition, and GNN-based code embeddings,

**facing** underutilized ML capabilities due to defensive fallback patterns (silent degradation), complete loss of learned patterns between sessions (no persistence), isolated code intelligence components without shared query language, and inability to measure actual ML vs fallback usage rates,

**we decided for** transforming ruvector from an optional enhancement to the primary neural backbone with mandatory observability, persistent learning state, and hypergraph-based code intelligence,

**and neglected** keeping the current fallback-first approach (hides ML failures), pure in-memory pattern storage (loses learning), and separate graph implementations per component (duplicated effort),

**to achieve** >80% ML usage rate (measured), 100% pattern retention across sessions, unified Cypher-like queries for code relationships, and explicit alerting when fallbacks occur,

**accepting that** this requires significant refactoring of the ruvector provider layer, migration of existing in-memory patterns to SQLite, and a 4-week phased implementation across 8 coordinated actions.

---

## Context

The Six Thinking Hats analysis revealed three critical gaps in v3's ruvector integration:

1. **Fallback Overuse**: The current architecture tries ML, fails silently to fallback, and users never know if ML is being used. No metrics exist to measure actual ML utilization.

2. **No Persistent Learning**: Q-values from routing decisions and SONA patterns are stored in-memory only. Every restart loses all learned optimizations.

3. **Code Intelligence Gap**: The KnowledgeGraphService, semantic analyzer, and impact analyzer operate in isolation without a shared query interface or cross-linking capability.

The GOAP plan defines 8 concrete actions to address these gaps, organized into 4 parallel-capable phases.

---

## Options Considered

### Option 1: ML-First with Observability (Selected)

Make ruvector the primary path, fallback only on error, with full metrics and alerting.

**Pros:** Maximizes ML value, provides visibility, enables optimization
**Cons:** Requires refactoring, potential instability during transition

### Option 2: Keep Fallback-First Approach (Rejected)

Maintain current defensive pattern where fallback is the safe default.

**Why rejected:** Hides ML value; users can't tell if they're getting ML benefits or basic fallback.

### Option 3: Separate ML and Non-ML Modes (Rejected)

Let users explicitly choose between ML-enabled and fallback-only modes.

**Why rejected:** Adds configuration complexity; doesn't solve the observability or persistence problems.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Part Of | MADR-001 | V3 Implementation Initiative | Neural backbone enhancement |
| Depends On | ADR-017 | RuVector Integration | Existing ruvector wrappers |
| Depends On | ADR-038 | Memory Unification | SQLite persistence layer |
| Enables | ADR-007 | Quality Gate Decision Engine | Better ML-based decisions |
| Enables | ADR-022 | Adaptive QE Agent Routing | Persistent Q-values |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-050-A | ML Observability and Persistence | Technical Spec | [specs/SPEC-050-A-ml-observability-persistence.md](../specs/SPEC-050-A-ml-observability-persistence.md) |
| SPEC-050-B | Hypergraph Code Intelligence | Technical Spec | [specs/SPEC-050-B-hypergraph-code-intelligence.md](../specs/SPEC-050-B-hypergraph-code-intelligence.md) |
| SPEC-050-C | Implementation Plan | Implementation Guide | [specs/SPEC-050-C-implementation-plan.md](../specs/SPEC-050-C-implementation-plan.md) |
| GOAP-PLAN | Full GOAP Analysis | Planning Document | [docs/plans/GOAP-V3-RUVECTOR-NEURAL-BACKBONE.md](/workspaces/agentic-qe/docs/plans/GOAP-V3-RUVECTOR-NEURAL-BACKBONE.md) |
| SIX-HATS | Six Thinking Hats Analysis | Analysis | [docs/analysis/SIX-HATS-AQE-V3-RUVECTOR-ANALYSIS.md](/workspaces/agentic-qe/docs/analysis/SIX-HATS-AQE-V3-RUVECTOR-ANALYSIS.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-20 | Approved | 2026-02-20 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-20 | GOAP plan created from Six Hats analysis |
| Approved | 2026-01-20 | Architecture review passed |
| In Progress | 2026-01-20 | Phase 1 implementation started |
| Implemented | 2026-01-20 | All 8 GOAP actions completed: observability, persistence, hypergraph |
