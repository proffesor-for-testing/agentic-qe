# ADR-046: V2 Feature Integration (Q-Values, GOAP, Dream Cycles)

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-046 |
| **Status** | Implemented |
| **Date** | 2026-01-16 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** V3 QE's complete architectural rewrite with 12 DDD bounded contexts and 9 RL algorithms,

**facing** three critical V2 capabilities not carried forward: Q-values persistence (learning lost on restart), GOAP system (no autonomous planning), and Dream cycles (no pattern discovery),

**we decided for** integrating all three V2 features into V3's pattern-centric architecture: QValueStore for persistent RL learning, GOAPPlanner with A* and 52 QE actions, and DreamEngine with ConceptGraph and InsightGenerator,

**and neglected** leaving V2 features behind (loses valuable capabilities), reimplementing from scratch (wastes proven designs), and partial integration (incomplete solution),

**to achieve** cross-session RL learning via persistent Q-values, autonomous multi-step workflow planning via GOAP with <500ms plan finding (achieved 11-140ms), and automated pattern discovery during idle time via Dream cycles,

**accepting that** this adds significant code complexity (4000+ lines), requires schema migrations, and Dream cycles need benchmarking for production readiness.

---

## Context

Analysis of V2 vs V3 persistence revealed 3 critical gaps. V2 had Q-values in SQLite enabling cumulative agent intelligence, GOAP with 4 tables and A* for autonomous planning, and Dream cycles with ConceptGraph for pattern discovery. V3's in-memory ReplayBuffer lost learning on restart, had no autonomous planning, and no pattern discovery.

V3's pattern-centric design with HNSW indexing, 12 DDD contexts, and hooks worker system provided excellent foundations for integrating these V2 features.

---

## Options Considered

### Option 1: Full V2 Feature Integration (Selected)

Integrate Q-values, GOAP, and Dreams adapted to V3's pattern-centric architecture.

**Pros:** Preserves proven V2 capabilities, enables autonomous planning, cross-session learning
**Cons:** 4000+ lines of code, schema complexity, Dream benchmarking needed

### Option 2: Leave V2 Features Behind (Rejected)

Focus on V3's new capabilities only.

**Why rejected:** Loses cross-session learning, autonomous planning, and pattern discovery.

### Option 3: Partial Integration (Q-Values Only) (Rejected)

Only port the simplest feature (Q-values persistence).

**Why rejected:** GOAP and Dreams provide critical autonomous capabilities.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Relates To | ADR-009 | AgentDB as Primary Memory Backend | Storage foundation |
| Relates To | ADR-017 | RuVector Integration | Pattern intelligence |
| Relates To | ADR-021 | QE ReasoningBank | Pattern learning |
| Part Of | MADR-001 | V3 Implementation Initiative | V2 capability preservation |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-046-A | V2 Features Implementation | Technical Spec | [specs/SPEC-046-A-v2-features-implementation.md](../specs/SPEC-046-A-v2-features-implementation.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-16 | Approved | 2026-07-16 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-16 | Initial creation |
| Implemented | 2026-01-16 | QValueStore (606 lines), GOAPPlanner (1253 lines), DreamEngine (826 lines), 57 tests |
