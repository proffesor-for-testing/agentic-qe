# ADR-033: Early Exit Testing

**Status:** Accepted
**Date:** 2026-01-10
**Decision Makers:** Architecture Team
**Source:** RuVector MinCut Analysis (early_exit.rs)

---

## Context

Current v3 AQE test execution follows a fixed pattern:
- Run all test layers (unit → integration → E2E → performance)
- No early termination based on quality signals
- Same compute for all scenarios regardless of confidence
- Full test pyramid execution even when unnecessary

This approach has limitations:
1. **Wasted compute**: Running all layers when early layers show high confidence
2. **No confidence signals**: Can't distinguish "definitely good" from "maybe good"
3. **Fixed verification depth**: Same verification regardless of risk level
4. **No speculative execution**: Can't predict likely pass/fail outcomes

RuVector's coherence-driven early exit demonstrates a powerful pattern:
> Uses λ stability instead of learned classifiers. High λ + stable λ-delta → confident exit. Low λ or volatile λ-delta → continue to deeper layers.

This enables **intelligent test layer skipping** - the system exits early when quality signals are confident.

### The Early Exit Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    EARLY EXIT TESTING                        │
│                                                              │
│   Layer 1     Layer 2     Layer 3     Layer 4               │
│   [Unit] ──► [Integ] ──► [E2E] ──► [Perf]                  │
│      │          │          │         │                      │
│      ▼          ▼          ▼         ▼                      │
│   λ=95      λ=92       λ=88      λ=85                      │
│   stable    stable     stable    stable                     │
│      │                                                       │
│      └──► EXIT! (confidence 92%)                            │
│                                                              │
│   "Unit tests are confident enough - skip deeper layers"    │
└─────────────────────────────────────────────────────────────┘
```

---

## Decision

**Implement coherence-driven early exit for test execution using λ-stability signals to skip redundant test layers.**

### Core Components

#### 1. Early Exit Configuration

```typescript
export interface EarlyExitConfig {
  /** Target exit layer (0-indexed) - exit after this layer if conditions met */
  exitLayer: number;

  /** Minimum λ value required for early exit (0-100 scale) */
  minLambdaForExit: number;

  /** Minimum λ stability required for exit (0-1 scale) */
  minLambdaStability: number;

  /** Maximum boundary concentration for early exit (0-1 scale) */
  maxBoundaryConcentration: number;

  /** Number of speculative test batches after early exit */
  speculativeTests: number;

  /** Number of verification layers for speculative results */
  verificationLayers: number;

  /** Enable adaptive exit layer based on λ stability */
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

#### 2. Quality Lambda Signal

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

#### 3. Early Exit Decision

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
    // Calculate λ stability (inverse of |λ-delta|)
    const lambdaDelta = Math.abs(signal.lambda - signal.lambdaPrev);
    const stability = signal.lambdaPrev > 0
      ? 1 - (lambdaDelta / signal.lambdaPrev)
      : 0;

    // Higher stability → can exit earlier
    if (stability >= 0.92 && signal.lambda >= this.config.minLambdaForExit) {
      // Very stable - exit very early
      return Math.max(this.config.exitLayer - 1, 0);
    } else if (stability >= 0.75) {
      // Moderately stable - exit at configured layer
      return this.config.exitLayer;
    } else {
      // Less stable - exit later
      return Math.min(this.config.exitLayer + 1, this.totalLayers - 1);
    }
  }

  private evaluateExitConditions(signal: QualitySignal, layer: number): EarlyExitDecision {
    // Check λ minimum
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

    // Check λ stability
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

#### 4. Speculative Test Execution

```typescript
export interface SpeculativeResult {
  /** Predicted outcome */
  predicted: 'pass' | 'fail' | 'flaky';

  /** Confidence in prediction (0-1) */
  confidence: number;

  /** Whether prediction was verified */
  verified: boolean;

  /** Actual outcome (if verified) */
  actual?: 'pass' | 'fail' | 'flaky';

  /** Whether speculation was correct */
  correct?: boolean;
}

export class SpeculativeExecutor {
  constructor(private config: EarlyExitConfig) {}

  /** Generate speculative predictions for skipped layers */
  async speculate(
    exitDecision: EarlyExitDecision,
    skippedLayers: TestLayer[]
  ): Promise<SpeculativeResult[]> {
    const results: SpeculativeResult[] = [];

    for (const layer of skippedLayers) {
      // Predict based on historical patterns and current quality signal
      const prediction = await this.predictLayerOutcome(layer, exitDecision);
      results.push(prediction);
    }

    return results;
  }

  /** Verify speculative predictions with actual execution */
  async verify(
    speculations: SpeculativeResult[],
    skippedLayers: TestLayer[]
  ): Promise<SpeculativeResult[]> {
    const verified: SpeculativeResult[] = [];

    for (let i = 0; i < speculations.length && i < this.config.verificationLayers; i++) {
      const layer = skippedLayers[i];
      const speculation = speculations[i];

      // Run actual tests
      const actual = await this.runLayer(layer);

      verified.push({
        ...speculation,
        verified: true,
        actual: actual.outcome,
        correct: speculation.predicted === actual.outcome,
      });
    }

    // Include unverified speculations
    for (let i = this.config.verificationLayers; i < speculations.length; i++) {
      verified.push(speculations[i]);
    }

    return verified;
  }

  private async predictLayerOutcome(
    layer: TestLayer,
    decision: EarlyExitDecision
  ): Promise<SpeculativeResult> {
    // Simple heuristic: high confidence → predict pass
    const passThreshold = 0.85;

    if (decision.confidence >= passThreshold) {
      return {
        predicted: 'pass',
        confidence: decision.confidence,
        verified: false,
      };
    } else if (decision.confidence >= 0.7) {
      return {
        predicted: 'flaky',
        confidence: decision.confidence,
        verified: false,
      };
    } else {
      return {
        predicted: 'fail',
        confidence: 1 - decision.confidence,
        verified: false,
      };
    }
  }

  private async runLayer(layer: TestLayer): Promise<{ outcome: 'pass' | 'fail' | 'flaky' }> {
    // Execute actual tests
    const executor = new TestExecutor(layer);
    const result = await executor.run();

    if (result.passRate >= 0.99) {
      return { outcome: 'pass' };
    } else if (result.flakyRatio > 0.1) {
      return { outcome: 'flaky' };
    } else {
      return { outcome: 'fail' };
    }
  }
}
```

#### 5. Early Exit Controller

```typescript
export class EarlyExitController {
  private earlyExit: CoherenceEarlyExit;
  private speculator: SpeculativeExecutor;
  private layerResults: Map<number, LayerResult> = new Map();

  constructor(config: EarlyExitConfig, totalLayers: number) {
    this.earlyExit = new CoherenceEarlyExit(config, totalLayers);
    this.speculator = new SpeculativeExecutor(config);
  }

  /** Run test pyramid with early exit support */
  async runWithEarlyExit(layers: TestLayer[]): Promise<TestPyramidResult> {
    const results: LayerResult[] = [];
    let exitDecision: EarlyExitDecision | null = null;

    for (let i = 0; i < layers.length; i++) {
      // Execute layer
      const layerResult = await this.executeLayer(layers[i], i);
      results.push(layerResult);
      this.layerResults.set(i, layerResult);

      // Calculate quality signal
      const signal = calculateQualitySignal(layerResult);

      // Check for early exit
      exitDecision = this.earlyExit.shouldExit(signal, i);

      if (exitDecision.canExit) {
        console.log(`[EarlyExit] Exiting at layer ${i}: ${exitDecision.explanation}`);

        // Speculative execution for remaining layers
        const skippedLayers = layers.slice(i + 1);

        if (exitDecision.enableSpeculation && skippedLayers.length > 0) {
          const speculations = await this.speculator.speculate(exitDecision, skippedLayers);
          const verified = await this.speculator.verify(speculations, skippedLayers);

          return {
            layers: results,
            exitedEarly: true,
            exitLayer: i,
            exitReason: exitDecision.reason,
            confidence: exitDecision.confidence,
            speculations: verified,
            skippedLayers: skippedLayers.length,
          };
        }

        return {
          layers: results,
          exitedEarly: true,
          exitLayer: i,
          exitReason: exitDecision.reason,
          confidence: exitDecision.confidence,
          speculations: [],
          skippedLayers: skippedLayers.length,
        };
      }
    }

    // Completed all layers
    return {
      layers: results,
      exitedEarly: false,
      exitLayer: layers.length - 1,
      exitReason: 'forced_continue',
      confidence: 1.0,
      speculations: [],
      skippedLayers: 0,
    };
  }

  private async executeLayer(layer: TestLayer, index: number): Promise<LayerResult> {
    console.log(`[EarlyExit] Executing layer ${index}: ${layer.name}`);

    const executor = new TestExecutor(layer);
    const result = await executor.run();

    // Add previous lambda for delta calculation
    const prevResult = this.layerResults.get(index - 1);
    if (prevResult) {
      result.previousLambda = calculateQualitySignal(prevResult).lambda;
    }

    return result;
  }
}

export interface TestPyramidResult {
  layers: LayerResult[];
  exitedEarly: boolean;
  exitLayer: number;
  exitReason: ExitReason;
  confidence: number;
  speculations: SpeculativeResult[];
  skippedLayers: number;
}
```

---

## Integration with Test Execution

```typescript
// In qe-test-executor agent
import { EarlyExitController, DEFAULT_EXIT_CONFIG } from '../early-exit';

export class TestExecutorAgent {
  private earlyExitController: EarlyExitController;

  async initialize(): Promise<void> {
    this.earlyExitController = new EarlyExitController(
      DEFAULT_EXIT_CONFIG,
      4  // unit, integration, e2e, performance
    );
  }

  async executeTestPyramid(layers: TestLayer[]): Promise<TestPyramidResult> {
    const result = await this.earlyExitController.runWithEarlyExit(layers);

    if (result.exitedEarly) {
      console.log(`[Executor] Early exit at layer ${result.exitLayer} with ${(result.confidence * 100).toFixed(1)}% confidence`);
      console.log(`[Executor] Skipped ${result.skippedLayers} layers`);

      if (result.speculations.length > 0) {
        const correct = result.speculations.filter(s => s.correct).length;
        console.log(`[Executor] Speculation accuracy: ${correct}/${result.speculations.length}`);
      }
    }

    return result;
  }
}
```

---

## Implementation Plan

### Phase 1: Core Early Exit (Days 1-2)
```
v3/src/early-exit/
├── index.ts
├── types.ts
├── quality-signal.ts        # calculateQualitySignal()
├── early-exit-decision.ts   # CoherenceEarlyExit
└── configs.ts               # DEFAULT/AGGRESSIVE/CONSERVATIVE
```

### Phase 2: Speculative Execution (Days 3-4)
```
├── speculative-executor.ts  # SpeculativeExecutor
├── prediction-model.ts      # Layer outcome prediction
└── verification.ts          # Verify speculations
```

### Phase 3: Integration (Day 5)
- Integrate with qe-test-executor agent
- Add MCP tool for early exit configuration
- Create metrics dashboard

---

## Success Metrics

- [ ] Early exit when confidence > 80%
- [ ] Speculative test prediction accuracy > 85%
- [ ] 30-50% compute reduction for high-confidence runs
- [ ] <10ms decision latency
- [ ] Integration with test-executor agent
- [ ] 50+ unit tests

---

## References

- [ruvector-mincut-gated-transformer/src/early_exit.rs](https://github.com/ruvnet/ruvector/blob/main/crates/ruvector-mincut-gated-transformer/src/early_exit.rs)
- [LayerSkip (Elhoushi et al., 2024)](https://arxiv.org/abs/2404.16710)
- [Self-Speculative Decoding](https://arxiv.org/abs/2311.08263)
