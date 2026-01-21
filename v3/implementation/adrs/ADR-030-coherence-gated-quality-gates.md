# ADR-030: Coherence-Gated Quality Gates

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-030 |
| **Status** | Accepted |
| **Date** | 2026-01-10 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** Agentic QE v3 quality gates that currently use simple threshold-based decisions (coverage > 80%, pass rate > 95%),

**facing** no coherence signal across quality dimensions, no trend awareness for detecting rapid quality drops, binary pass/fail decisions without graceful degradation, and no boundary detection for identifying sources of instability,

**we decided for** coherence-gated quality gates using lambda-coherence metrics with 4-tier response allocation (Normal, Reduced, Safe, Quarantine), based on RuVector's mincut-gated-transformer pattern, measuring minimum cut value, drop rate, boundary concentration, and partition count,

**and neglected** keeping simple threshold checks (misses coherence signals), ML-based prediction alone (interpretability concerns), and external quality gate services (adds deployment dependency),

**to achieve** unified quality state awareness across 6+ dimensions, trend detection for rapid drop prevention, graduated response with graceful degradation, boundary identification for targeted remediation, and <10ms decision latency,

**accepting that** this introduces algorithmic complexity in the gate controller, requires tuning of policy thresholds, and adds concepts (lambda, boundary edges, partitions) that need documentation.

---

## Context

Current quality gates check metrics independently: coverage > 80% pass, test pass rate > 95% pass. This approach has critical limitations: metrics checked independently don't reveal unified quality state, rapid drops aren't distinguished from stable low quality, binary decisions don't allow graceful degradation, and there's no way to identify which quality aspects cause instability.

RuVector's `ruvector-mincut-gated-transformer` crate implements coherence-gated control using lambda (minimum cut value), lambda-delta (rate of change), boundary concentration, and 4-tier compute allocation. This pattern transforms QE quality gates from threshold checks to coherence-aware decisions.

---

## Options Considered

### Option 1: Coherence-Gated Lambda Pattern (Selected)

Use minimum cut coherence with 4-tier response system from RuVector pattern.

**Pros:** Unified coherence signal, trend awareness, graduated response, boundary detection
**Cons:** Algorithmic complexity, threshold tuning required

### Option 2: Simple Threshold Checks (Rejected)

Keep current independent threshold approach.

**Why rejected:** No coherence signal, no trend awareness, binary decisions only.

### Option 3: ML-Based Quality Prediction (Rejected)

Use machine learning to predict quality state.

**Why rejected:** Interpretability concerns, training data requirements, harder to debug.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Part Of | MADR-001 | V3 Implementation Initiative | Quality infrastructure |
| Relates To | ADR-047 | MinCut Self-Organizing QE | Uses similar coherence concepts |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-030-A | Quality Lambda Calculation | Technical Spec | [specs/SPEC-030-A-lambda-calculation.md](../specs/SPEC-030-A-lambda-calculation.md) |
| SPEC-030-B | Four-Tier Response System | Technical Spec | [specs/SPEC-030-B-tier-response-system.md](../specs/SPEC-030-B-tier-response-system.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-01-10 | Approved | 2026-07-10 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-01-10 | Initial ADR from RuVector analysis |
| Accepted | 2026-01-10 | Architecture review passed |
