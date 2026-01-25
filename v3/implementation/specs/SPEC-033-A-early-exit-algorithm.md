# SPEC-033-A: Early Exit Algorithm

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-033-A |
| **Parent ADR** | [ADR-033](../adrs/ADR-033-early-exit-testing.md) |
| **Version** | 1.0 |
| **Status** | Draft |
| **Last Updated** | 2026-01-20 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the coherence-driven early exit algorithm using lambda-stability signals to determine when test execution can safely skip redundant layers. The algorithm uses quality metrics from completed layers to predict whether deeper layers are necessary.

---

## Configuration Types

### Early Exit Configuration

```typescript
export interface EarlyExitConfig {
  /** Target exit layer (0-indexed) - exit after this layer if conditions met */
  exitLayer: number;

  /** Minimum lambda value required for early exit (0-100 scale) */
  minLambdaForExit: number;

  /** Minimum lambda stability required for exit (0-1 scale) */
  minLambdaStability: number;

  /** Maximum boundary concentration for early exit (0-1 scale) */
  maxBoundaryConcentration: number;

  /** Number of speculative test batches after early exit */
  speculativeTests: number;

  /** Number of verification layers for speculative results */
  verificationLayers: number;

  /** Enable adaptive exit layer based on lambda stability */
  adaptiveExitLayer: boolean;

  /** Minimum overall confidence threshold (0-1 scale) */
  minConfidence: number;
}

export const DEFAULT_EXIT_CONFIG: EarlyExitConfig = {
  exitLayer: 1,                     // Exit after integration tests
  minLambdaForExit: 80,
  minLambdaStability: 0.85,
  maxBoundaryConcentration: 0.5,
  speculativeTests: 4,
  verificationLayers: 2,
  adaptiveExitLayer: true,
  minConfidence: 0.80,
};

export const AGGRESSIVE_EXIT_CONFIG: EarlyExitConfig = {
  exitLayer: 0,                     // Exit after unit tests
  minLambdaForExit: 60,
  minLambdaStability: 0.75,
  maxBoundaryConcentration: 0.6,
  speculativeTests: 8,
  verificationLayers: 1,
  adaptiveExitLayer: true,
  minConfidence: 0.70,
};

export const CONSERVATIVE_EXIT_CONFIG: EarlyExitConfig = {
  exitLayer: 2,                     // Exit after E2E tests
  minLambdaForExit: 95,
  minLambdaStability: 0.92,
  maxBoundaryConcentration: 0.35,
  speculativeTests: 2,
  verificationLayers: 4,
  adaptiveExitLayer: false,
  minConfidence: 0.90,
};
```

### Quality Lambda Signal

```typescript
export interface QualitySignal {
  /** Current quality lambda (0-100) */
  lambda: number;

  /** Previous lambda for delta calculation */
  lambdaPrev: number;

  /** Number of metrics at boundary threshold */
  boundaryEdges: number;

  /** Concentration of issues (0-1) */
  boundaryConcentration: number;

  /** Number of quality partitions */
  partitionCount: number;

  /** Control flags */
  flags: number;
}

export function calculateQualitySignal(layerResult: LayerResult): QualitySignal {
  // Compute lambda from layer metrics
  const passRateLambda = layerResult.passRate * 100;
  const coverageLambda = layerResult.coverage * 100;
  const stabilityLambda = (1 - layerResult.flakyRatio) * 100;

  // Lambda is the minimum of all quality dimensions
  const lambda = Math.min(passRateLambda, coverageLambda, stabilityLambda);

  // Count metrics near threshold (70% boundary)
  const threshold = 70;
  const margin = 10;
  let boundaryEdges = 0;

  if (passRateLambda >= threshold - margin && passRateLambda <= threshold + margin) {
    boundaryEdges++;
  }
  if (coverageLambda >= threshold - margin && coverageLambda <= threshold + margin) {
    boundaryEdges++;
  }
  if (stabilityLambda >= threshold - margin && stabilityLambda <= threshold + margin) {
    boundaryEdges++;
  }

  // Calculate concentration of issues
  const issues = [
    1 - layerResult.passRate,
    1 - layerResult.coverage,
    layerResult.flakyRatio,
  ].filter(v => v > 0.1);

  const boundaryConcentration = issues.length > 0
    ? issues.reduce((a, b) => a + b, 0) / issues.length
    : 0;

  return {
    lambda,
    lambdaPrev: layerResult.previousLambda || lambda,
    boundaryEdges,
    boundaryConcentration,
    partitionCount: countQualityPartitions(layerResult),
    flags: 0,
  };
}
```

---

## Early Exit Decision Algorithm

### Exit Reasons

```typescript
export type ExitReason =
  | 'insufficient_confidence'
  | 'lambda_too_low'
  | 'lambda_unstable'
  | 'boundaries_concentrated'
  | 'confident_exit'
  | 'forced_continue';

export interface EarlyExitDecision {
  /** Whether early exit is allowed */
  canExit: boolean;

  /** Confidence in the decision (0-1) */
  confidence: number;

  /** Layer at which to exit (if canExit is true) */
  exitLayer: number;

  /** Reason for the decision */
  reason: ExitReason;

  /** Whether to enable speculative test generation */
  enableSpeculation: boolean;

  /** Explanation for logging/debugging */
  explanation: string;
}
```

### CoherenceEarlyExit Class

```typescript
export class CoherenceEarlyExit {
  constructor(
    private config: EarlyExitConfig,
    private totalLayers: number
  ) {}

  /** Evaluate whether to exit early at the given layer */
  shouldExit(signal: QualitySignal, layer: number): EarlyExitDecision {
    // Determine target exit layer (adaptive or fixed)
    const targetExitLayer = this.config.adaptiveExitLayer
      ? this.calculateAdaptiveExitLayer(signal)
      : this.config.exitLayer;

    // Not at target layer yet
    if (layer < targetExitLayer) {
      return {
        canExit: false,
        confidence: 0,
        exitLayer: targetExitLayer,
        reason: 'forced_continue',
        enableSpeculation: false,
        explanation: `Layer ${layer} < target ${targetExitLayer}, continuing`,
      };
    }

    // At or past target layer - evaluate conditions
    return this.evaluateExitConditions(signal, layer);
  }

  private calculateAdaptiveExitLayer(signal: QualitySignal): number {
    // Calculate lambda stability (inverse of |lambda-delta|)
    const lambdaDelta = Math.abs(signal.lambda - signal.lambdaPrev);
    const stability = signal.lambdaPrev > 0
      ? 1 - (lambdaDelta / signal.lambdaPrev)
      : 0;

    // Higher stability allows earlier exit
    if (stability >= 0.92 && signal.lambda >= this.config.minLambdaForExit) {
      return Math.max(this.config.exitLayer - 1, 0);
    } else if (stability >= 0.75) {
      return this.config.exitLayer;
    } else {
      return Math.min(this.config.exitLayer + 1, this.totalLayers - 1);
    }
  }

  private evaluateExitConditions(signal: QualitySignal, layer: number): EarlyExitDecision {
    // Check lambda minimum
    if (signal.lambda < this.config.minLambdaForExit) {
      return {
        canExit: false,
        confidence: signal.lambda / 100,
        exitLayer: layer,
        reason: 'lambda_too_low',
        enableSpeculation: false,
        explanation: `Lambda ${signal.lambda} < minimum ${this.config.minLambdaForExit}`,
      };
    }

    // Check lambda stability
    const lambdaDelta = Math.abs(signal.lambda - signal.lambdaPrev);
    const stability = signal.lambdaPrev > 0
      ? 1 - (lambdaDelta / signal.lambdaPrev)
      : 0;

    if (stability < this.config.minLambdaStability) {
      return {
        canExit: false,
        confidence: stability,
        exitLayer: layer,
        reason: 'lambda_unstable',
        enableSpeculation: false,
        explanation: `Stability ${(stability * 100).toFixed(1)}% < minimum ${(this.config.minLambdaStability * 100).toFixed(1)}%`,
      };
    }

    // Check boundary concentration
    if (signal.boundaryConcentration > this.config.maxBoundaryConcentration) {
      return {
        canExit: false,
        confidence: 1 - signal.boundaryConcentration,
        exitLayer: layer,
        reason: 'boundaries_concentrated',
        enableSpeculation: false,
        explanation: `Boundary concentration ${(signal.boundaryConcentration * 100).toFixed(1)}% > max ${(this.config.maxBoundaryConcentration * 100).toFixed(1)}%`,
      };
    }

    // Calculate combined confidence
    const lambdaStrength = signal.lambda / 100;
    const boundaryDispersion = 1 - signal.boundaryConcentration;
    const confidence = (lambdaStrength * 0.4 + stability * 0.4 + boundaryDispersion * 0.2);

    // Check against minimum confidence
    if (confidence < this.config.minConfidence) {
      return {
        canExit: false,
        confidence,
        exitLayer: layer,
        reason: 'insufficient_confidence',
        enableSpeculation: false,
        explanation: `Confidence ${(confidence * 100).toFixed(1)}% < minimum ${(this.config.minConfidence * 100).toFixed(1)}%`,
      };
    }

    // All conditions met - allow early exit
    return {
      canExit: true,
      confidence,
      exitLayer: layer,
      reason: 'confident_exit',
      enableSpeculation: this.config.speculativeTests > 0,
      explanation: `All conditions met with ${(confidence * 100).toFixed(1)}% confidence`,
    };
  }
}
```

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-033-A-001 | Lambda must be 0-100 scale | Error |
| SPEC-033-A-002 | Stability must be 0-1 scale | Error |
| SPEC-033-A-003 | exitLayer must be < totalLayers | Error |
| SPEC-033-A-004 | minConfidence must be 0-1 | Warning |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-033-B | Speculative Execution | Uses exit decisions |
| SPEC-033-C | Controller Integration | Orchestrates algorithm |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-20 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-033-early-exit-testing.md)
- [ruvector-mincut-gated-transformer/src/early_exit.rs](https://github.com/ruvnet/ruvector/blob/main/crates/ruvector-mincut-gated-transformer/src/early_exit.rs)
