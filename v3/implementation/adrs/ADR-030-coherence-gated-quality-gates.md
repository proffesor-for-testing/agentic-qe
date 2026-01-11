# ADR-030: Coherence-Gated Quality Gates

**Status:** Accepted
**Date:** 2026-01-10
**Decision Makers:** Architecture Team
**Source:** RuVector MinCut Analysis (ruvector-mincut-gated-transformer)

---

## Context

Current v3 AQE quality gates use simple threshold-based decisions:
- Coverage > 80% → Pass
- Test pass rate > 95% → Pass
- Security vulnerabilities = 0 → Pass

This approach has critical limitations:
1. **No coherence signal**: Metrics are checked independently, not as a unified quality state
2. **No trend awareness**: Rapid drops in quality aren't detected differently from stable low quality
3. **Binary decisions**: Pass/fail with no intermediate tiers for graceful degradation
4. **No boundary detection**: Can't identify which quality aspects are causing instability

RuVector's `ruvector-mincut-gated-transformer` crate implements **coherence-gated control** using:
- **λ (lambda)**: Minimum cut value as a coherence signal
- **λ-delta**: Rate of change for stability detection
- **Boundary concentration**: Where instability is concentrated
- **4-tier compute allocation**: Normal → Reduced → Safe → Skip

This pattern can transform QE quality gates from threshold checks to coherence-aware decisions.

---

## Decision

**Implement coherence-gated quality gates using λ-coherence metrics with 4-tier response allocation.**

### Core Concepts

#### 1. Quality Lambda (λ)

λ represents the "minimum cut" between acceptable and unacceptable quality states:

```typescript
export interface QualityLambda {
  /** Current λ value (0-100 scale) */
  lambda: number;

  /** Previous λ value for delta calculation */
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

#### 2. Lambda Calculation

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
  const boundaryEdges = values.filter(v => v < threshold + 0.1 && v >= threshold - 0.1).length;

  // Calculate concentration
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
```

#### 3. Four-Tier Response System

Based on ruvector-mincut-gated-transformer's `TierDecision`:

```typescript
export enum QualityTier {
  /** Tier 0: Normal operation - all checks pass */
  NORMAL = 0,

  /** Tier 1: Reduced scope - non-critical issues detected */
  REDUCED = 1,

  /** Tier 2: Safe mode - freeze risky operations */
  SAFE = 2,

  /** Tier 3: Skip/Quarantine - critical issues, block deployment */
  QUARANTINE = 3,
}

export interface QualityGateDecision {
  /** Overall decision */
  decision: 'allow' | 'reduceScope' | 'freezeWrites' | 'quarantine';

  /** Reason for decision */
  reason: QualityGateReason;

  /** Tier level (0-3) */
  tier: QualityTier;

  /** Specific actions to take */
  actions: QualityAction[];

  /** Confidence in decision (0-1) */
  confidence: number;

  /** Human-readable explanation */
  explanation: string;
}

export type QualityGateReason =
  | 'none'
  | 'lambdaBelowMin'
  | 'lambdaDroppedFast'
  | 'boundarySpike'
  | 'boundaryConcentrationSpike'
  | 'partitionDrift'
  | 'forcedByFlag';
```

#### 4. Coherence Gate Controller

```typescript
export interface CoherenceGatePolicy {
  /** Minimum λ required for deployment */
  lambdaMin: number;  // default: 60

  /** Maximum λ drop ratio (Q15) triggering intervention */
  dropRatioQ15Max: number;  // default: 8192 (25%)

  /** Maximum boundary edges before reducing scope */
  boundaryEdgesMax: number;  // default: 3

  /** Maximum boundary concentration (Q15) */
  boundaryConcentrationQ15Max: number;  // default: 16384 (50%)

  /** Maximum partition count before concern */
  partitionsMax: number;  // default: 4

  /** Allow deployment with warnings when unstable */
  allowDeployWhenUnstable: boolean;  // default: false
}

export class CoherenceGateController {
  constructor(private policy: CoherenceGatePolicy) {}

  evaluate(lambda: QualityLambda): QualityGateDecision {
    // Check for forced flags first
    if (lambda.flags & FLAG_FORCE_SAFE) {
      return this.tierSafe('forcedByFlag');
    }

    // Check λ minimum
    if (lambda.lambda < this.policy.lambdaMin) {
      return this.tierQuarantine('lambdaBelowMin');
    }

    // Check λ drop rate
    const dropRatio = this.calculateDropRatio(lambda);
    if (dropRatio > this.policy.dropRatioQ15Max) {
      return this.tierReduced('lambdaDroppedFast');
    }

    // Check boundary conditions
    if (lambda.boundaryEdges > this.policy.boundaryEdgesMax) {
      return this.tierReduced('boundarySpike');
    }

    if (lambda.boundaryConcentrationQ15 > this.policy.boundaryConcentrationQ15Max) {
      return this.tierReduced('boundaryConcentrationSpike');
    }

    // Check partition drift
    if (lambda.partitionCount > this.policy.partitionsMax) {
      return this.tierReduced('partitionDrift');
    }

    // All checks passed
    return this.tierNormal();
  }

  private calculateDropRatio(lambda: QualityLambda): number {
    if (lambda.lambdaPrev === 0) return 0;
    const drop = lambda.lambdaPrev - lambda.lambda;
    return Math.round((drop / lambda.lambdaPrev) * 32767);
  }

  private tierNormal(): QualityGateDecision {
    return {
      decision: 'allow',
      reason: 'none',
      tier: QualityTier.NORMAL,
      actions: [],
      confidence: 1.0,
      explanation: 'Quality coherence is stable. Deployment allowed.',
    };
  }

  private tierReduced(reason: QualityGateReason): QualityGateDecision {
    return {
      decision: 'reduceScope',
      reason,
      tier: QualityTier.REDUCED,
      actions: ['runAdditionalTests', 'notifyReviewers', 'requireApproval'],
      confidence: 0.7,
      explanation: `Quality instability detected: ${reason}. Additional verification required.`,
    };
  }

  private tierSafe(reason: QualityGateReason): QualityGateDecision {
    return {
      decision: 'freezeWrites',
      reason,
      tier: QualityTier.SAFE,
      actions: ['blockDeploy', 'alertTeam', 'scheduleReview'],
      confidence: 0.9,
      explanation: `Quality coherence compromised: ${reason}. Deployment blocked pending review.`,
    };
  }

  private tierQuarantine(reason: QualityGateReason): QualityGateDecision {
    return {
      decision: 'quarantine',
      reason,
      tier: QualityTier.QUARANTINE,
      actions: ['blockAllDeploys', 'escalateToLeads', 'rollbackIfNeeded'],
      confidence: 1.0,
      explanation: `Critical quality failure: ${reason}. All deployments quarantined.`,
    };
  }
}
```

---

## Implementation Plan

### Phase 1: Core Lambda Module (Days 1-2)
```
v3/src/quality-gates/
├── coherence/
│   ├── index.ts
│   ├── types.ts                 # QualityLambda, QualityGateDecision, etc.
│   ├── lambda-calculator.ts     # calculateQualityLambda()
│   ├── gate-controller.ts       # CoherenceGateController
│   └── partition-detector.ts    # Quality partition analysis
```

### Phase 2: Integration (Days 3-4)
- Integrate with `qe-deployment-readiness` agent
- Add to quality-assessment domain MCP tool
- Create coherence metrics collector

### Phase 3: Visualization (Day 5)
- Lambda trend dashboard
- Boundary edge visualization
- Tier decision history

---

## Success Metrics

- [ ] λ calculation covers 6+ quality dimensions
- [ ] 4-tier response system operational
- [ ] Drop detection prevents rushed deployments
- [ ] <10ms decision latency
- [ ] Integration with deployment-readiness agent
- [ ] 50+ unit tests

---

## References

- [ruvector-mincut-gated-transformer/src/gate.rs](https://github.com/ruvnet/ruvector/blob/main/crates/ruvector-mincut-gated-transformer/src/gate.rs)
- [ruvector-mincut-gated-transformer/src/packets.rs](https://github.com/ruvnet/ruvector/blob/main/crates/ruvector-mincut-gated-transformer/src/packets.rs)
- Energy-Based Transformers (Gladstone et al., 2025)
- Mixture-of-Depths (Raposo et al., 2024)
