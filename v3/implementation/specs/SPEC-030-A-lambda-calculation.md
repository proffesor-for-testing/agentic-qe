# SPEC-030-A: Quality Lambda Calculation

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-030-A |
| **Parent ADR** | [ADR-030](../adrs/ADR-030-coherence-gated-quality-gates.md) |
| **Version** | 1.0 |
| **Status** | Accepted |
| **Last Updated** | 2026-01-10 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the Quality Lambda calculation algorithm, which determines the "minimum cut" coherence signal across multiple quality dimensions.

---

## Quality Lambda Structure

```typescript
export interface QualityLambda {
  /** Current lambda value (0-100 scale) */
  lambda: number;

  /** Previous lambda value for delta calculation */
  lambdaPrev: number;

  /** Number of quality dimensions at boundary (unstable) */
  boundaryEdges: number;

  /** Concentration of instability (Q15: 0-32767) */
  boundaryConcentrationQ15: number;

  /** Number of quality partitions (fragmented quality) */
  partitionCount: number;

  /** Control flags */
  flags: number;
}
```

---

## Lambda Calculation Algorithm

```typescript
export function calculateQualityLambda(metrics: QualityMetrics): QualityLambda {
  // Normalize each metric to 0-1 scale
  const normalized = {
    coverage: metrics.lineCoverage / 100,
    passRate: metrics.testPassRate / 100,
    security: 1 - Math.min(metrics.criticalVulns / 5, 1),
    performance: Math.min(metrics.p95Latency / metrics.targetLatency, 1),
    maintainability: metrics.maintainabilityIndex / 100,
    reliability: 1 - (metrics.flakyTestRatio || 0),
  };

  // Find minimum "cut" - the weakest quality dimension
  const values = Object.values(normalized);
  const lambda = Math.min(...values) * 100;

  // Count boundary edges (dimensions near threshold)
  const threshold = 0.7;
  const boundaryEdges = values.filter(
    v => v < threshold + 0.1 && v >= threshold - 0.1
  ).length;

  // Calculate concentration (Q15 fixed-point)
  const belowThreshold = values.filter(v => v < threshold);
  const concentrationQ15 = belowThreshold.length > 0
    ? Math.round((belowThreshold.reduce((a, b) => a + b, 0) / belowThreshold.length) * 32767)
    : 32767;

  // Count quality partitions (clusters of related issues)
  const partitionCount = countQualityPartitions(metrics);

  return {
    lambda,
    lambdaPrev: metrics.previousLambda || lambda,
    boundaryEdges,
    boundaryConcentrationQ15: concentrationQ15,
    partitionCount,
    flags: 0,
  };
}

function countQualityPartitions(metrics: QualityMetrics): number {
  // Group related quality issues into partitions
  let partitions = 0;

  if (metrics.lineCoverage < 70 || metrics.branchCoverage < 60) partitions++;
  if (metrics.criticalVulns > 0 || metrics.highVulns > 2) partitions++;
  if (metrics.testPassRate < 95 || metrics.flakyTestRatio > 0.05) partitions++;
  if (metrics.maintainabilityIndex < 60) partitions++;

  return partitions;
}
```

---

## Quality Dimensions

| Dimension | Source | Normalization |
|-----------|--------|---------------|
| Coverage | Line coverage % | value / 100 |
| Pass Rate | Test pass rate % | value / 100 |
| Security | Critical vulns | 1 - min(vulns/5, 1) |
| Performance | P95 latency | min(actual/target, 1) |
| Maintainability | Maintainability index | value / 100 |
| Reliability | Flaky test ratio | 1 - ratio |

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-030-A-001 | Lambda must be 0-100 scale | Error |
| SPEC-030-A-002 | At least 4 quality dimensions required | Warning |
| SPEC-030-A-003 | BoundaryConcentrationQ15 must be 0-32767 | Error |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-10 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-030-coherence-gated-quality-gates.md)
- [ruvector-mincut-gated-transformer](https://github.com/ruvnet/ruvector/blob/main/crates/ruvector-mincut-gated-transformer/src/gate.rs)
