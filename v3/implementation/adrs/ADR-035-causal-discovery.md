# ADR-035: Causal Discovery for Root Cause Analysis

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-035 |
| **Status** | Accepted |
| **Date** | 2026-01-10 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** v3 AQE root cause analysis for test failures, flaky tests, and quality regressions across multi-layer test execution,

**facing** correlation-based analysis that conflates correlation with causation, manual investigation effort requiring human expertise, reactive analysis only after failures occur, and no automated guidance on optimal intervention points,

**we decided for** causal discovery using spike-timing correlation (STDP) to automatically learn causal relationships between test events for root cause analysis and intervention planning,

**and neglected** correlation-based analysis (conflates correlation with causation), manual root cause analysis (requires human expertise), and statistical Granger causality (requires more data, higher latency),

**to achieve** automated causal inference from event streams, root cause identification accuracy >70%, optimal intervention point suggestions, and proactive failure prediction,

**accepting that** causal learning requires sufficient observation time, STDP thresholds need tuning per project, and confidence depends on event observation volume.

---

## Context

Current v3 AQE root cause analysis is correlation-based: log pattern matching, temporal coincidence detection, and manual investigation. This approach conflates correlation with causation, requires human expertise, is purely reactive, and provides no intervention guidance.

RuVector's Causal Discovery SNN demonstrates a powerful pattern using spike-timing cross-correlation with asymmetric temporal windows that naturally encodes Granger-like causality. After learning, the weight W_AB reflects causal strength from A to B. If event A consistently precedes event B within a time window, the causal weight strengthens.

This creates automated causal inference where the system learns what causes what, enabling root cause identification and optimal intervention point discovery.

---

## Options Considered

### Option 1: STDP-Based Causal Discovery (Selected)

Uses spike-timing dependent plasticity rules to learn causal weights from event timing. Asymmetric temporal windows encode directionality: events that precede others strengthen causal weights.

**Pros:**
- No explicit training required (learns from event stream)
- Naturally handles temporal relationships
- Provides intervention point suggestions

**Cons:**
- Requires sufficient observation time
- Threshold tuning may be needed per project

### Option 2: Correlation-Based Analysis (Rejected)

Use statistical correlation between event occurrences.

**Why rejected:** Conflates correlation with causation; can't determine directionality.

### Option 3: Statistical Granger Causality (Rejected)

Use Granger causality tests on time series data.

**Why rejected:** Requires more data, higher computational cost, and longer analysis time.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Part Of | MADR-001 | V3 Implementation Initiative | Defect intelligence |
| Relates To | ADR-034 | Neural Topology Optimizer | Shared learning patterns |
| Relates To | ADR-033 | Early Exit Testing | Uses quality signals |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-035-A | Causal Weight Matrix | Technical Spec | [specs/SPEC-035-A-causal-weight-matrix.md](../specs/SPEC-035-A-causal-weight-matrix.md) |
| SPEC-035-B | Causal Graph | Technical Spec | [specs/SPEC-035-B-causal-graph.md](../specs/SPEC-035-B-causal-graph.md) |
| SPEC-035-C | Discovery Engine | Implementation Guide | [specs/SPEC-035-C-discovery-engine.md](../specs/SPEC-035-C-discovery-engine.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-10 | Accepted | 2026-07-10 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-10 | Initial creation from RuVector analysis |
| Accepted | 2026-01-10 | Approved by Architecture Team |
