# ADR-033: Early Exit Testing

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-033 |
| **Status** | Accepted |
| **Date** | 2026-01-10 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** v3 AQE test execution across multi-layer test pyramids (unit, integration, E2E, performance),

**facing** wasted compute from running all layers when early layers show high confidence, lack of quality signals to distinguish "definitely good" from "maybe good", fixed verification depth regardless of risk level, and inability to predict likely pass/fail outcomes,

**we decided for** coherence-driven early exit using lambda-stability signals to skip redundant test layers, with speculative execution for remaining layers when confidence thresholds are met,

**and neglected** fixed-layer execution (always run all layers), ML-based classifiers for exit decisions (more complex, requires training data), and time-based exit criteria (not quality-aware),

**to achieve** 30-50% compute reduction for high-confidence runs, intelligent test layer skipping based on quality signals, speculative test prediction with >85% accuracy, and <10ms decision latency,

**accepting that** this requires careful threshold tuning, speculation may occasionally be wrong (hence verification layers), and conservative configurations may reduce savings.

---

## Context

Current v3 AQE test execution follows a fixed pattern: run all test layers (unit, integration, E2E, performance) without early termination based on quality signals. This approach wastes compute when early layers show high confidence and provides no mechanism to distinguish certain passes from uncertain ones.

RuVector's coherence-driven early exit demonstrates a powerful pattern using lambda stability instead of learned classifiers. High lambda combined with stable lambda-delta indicates confident exit conditions, while low lambda or volatile lambda-delta signals the need to continue to deeper layers.

The early exit pattern enables intelligent test layer skipping where the system exits early when quality signals are confident, reducing overall test execution time while maintaining quality assurance.

---

## Options Considered

### Option 1: Coherence-Driven Early Exit (Selected)

Uses lambda-stability signals from test quality metrics to determine when to exit early. Lambda represents the minimum of pass rate, coverage, and stability metrics. Stability is calculated from lambda-delta between layers.

**Pros:**
- No ML training required (uses quality signals directly)
- Configurable thresholds for different risk profiles
- Speculative execution provides safety net

**Cons:**
- Requires threshold tuning per project
- Speculation accuracy depends on exit confidence

### Option 2: Fixed-Layer Execution (Rejected)

Always run all test layers regardless of quality signals.

**Why rejected:** Wastes 30-50% compute on high-confidence runs; no adaptation to quality signals.

### Option 3: ML-Based Exit Classifier (Rejected)

Train a classifier to predict when to exit based on historical test data.

**Why rejected:** Requires significant training data, adds complexity, and may not generalize across projects.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Part Of | MADR-001 | V3 Implementation Initiative | Core testing optimization |
| Relates To | ADR-030 | Coherence-Gated Quality Gates | Shared lambda concepts |
| Relates To | ADR-032 | Time Crystal Scheduling | Test phase coordination |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| SPEC-033-A | Early Exit Algorithm | Technical Spec | [specs/SPEC-033-A-early-exit-algorithm.md](../specs/SPEC-033-A-early-exit-algorithm.md) |
| SPEC-033-B | Speculative Execution | Technical Spec | [specs/SPEC-033-B-speculative-execution.md](../specs/SPEC-033-B-speculative-execution.md) |
| SPEC-033-C | Controller Integration | Implementation Guide | [specs/SPEC-033-C-controller-integration.md](../specs/SPEC-033-C-controller-integration.md) |

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
