# SPEC-030-B: Four-Tier Response System

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-030-B |
| **Parent ADR** | [ADR-030](../adrs/ADR-030-coherence-gated-quality-gates.md) |
| **Version** | 1.0 |
| **Status** | Accepted |
| **Last Updated** | 2026-01-10 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the four-tier response system based on RuVector's TierDecision pattern, providing graduated responses to quality coherence states.

---

## Quality Tiers

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
```

---

## Gate Decision Structure

```typescript
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

---

## Tier Response Actions

### Tier 0: Normal
```typescript
{
  decision: 'allow',
  tier: QualityTier.NORMAL,
  actions: [],
  confidence: 1.0,
  explanation: 'Quality coherence is stable. Deployment allowed.'
}
```

### Tier 1: Reduced
```typescript
{
  decision: 'reduceScope',
  tier: QualityTier.REDUCED,
  actions: ['runAdditionalTests', 'notifyReviewers', 'requireApproval'],
  confidence: 0.7,
  explanation: 'Quality instability detected. Additional verification required.'
}
```

### Tier 2: Safe
```typescript
{
  decision: 'freezeWrites',
  tier: QualityTier.SAFE,
  actions: ['blockDeploy', 'alertTeam', 'scheduleReview'],
  confidence: 0.9,
  explanation: 'Quality coherence compromised. Deployment blocked pending review.'
}
```

### Tier 3: Quarantine
```typescript
{
  decision: 'quarantine',
  tier: QualityTier.QUARANTINE,
  actions: ['blockAllDeploys', 'escalateToLeads', 'rollbackIfNeeded'],
  confidence: 1.0,
  explanation: 'Critical quality failure. All deployments quarantined.'
}
```

---

## Gate Controller Policy

```typescript
export interface CoherenceGatePolicy {
  /** Minimum lambda required for deployment */
  lambdaMin: number;  // default: 60

  /** Maximum lambda drop ratio (Q15) triggering intervention */
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
```

---

## Controller Evaluation Logic

```typescript
export class CoherenceGateController {
  constructor(private policy: CoherenceGatePolicy) {}

  evaluate(lambda: QualityLambda): QualityGateDecision {
    // Priority 1: Forced flags
    if (lambda.flags & FLAG_FORCE_SAFE) {
      return this.tierSafe('forcedByFlag');
    }

    // Priority 2: Lambda minimum
    if (lambda.lambda < this.policy.lambdaMin) {
      return this.tierQuarantine('lambdaBelowMin');
    }

    // Priority 3: Lambda drop rate
    const dropRatio = this.calculateDropRatio(lambda);
    if (dropRatio > this.policy.dropRatioQ15Max) {
      return this.tierReduced('lambdaDroppedFast');
    }

    // Priority 4: Boundary conditions
    if (lambda.boundaryEdges > this.policy.boundaryEdgesMax) {
      return this.tierReduced('boundarySpike');
    }

    if (lambda.boundaryConcentrationQ15 > this.policy.boundaryConcentrationQ15Max) {
      return this.tierReduced('boundaryConcentrationSpike');
    }

    // Priority 5: Partition drift
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
}
```

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-030-B-001 | Tier must be 0-3 | Error |
| SPEC-030-B-002 | Decision must have at least one action for non-normal tiers | Warning |
| SPEC-030-B-003 | Confidence must be 0-1 | Error |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-10 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-030-coherence-gated-quality-gates.md)
- [SPEC-030-A: Lambda Calculation](./SPEC-030-A-lambda-calculation.md)
