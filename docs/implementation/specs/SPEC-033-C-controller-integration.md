# SPEC-033-C: Controller Integration

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-033-C |
| **Parent ADR** | [ADR-033](../adrs/ADR-033-early-exit-testing.md) |
| **Version** | 1.0 |
| **Status** | Draft |
| **Last Updated** | 2026-01-20 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the EarlyExitController that orchestrates test pyramid execution with early exit support, integrating the algorithm and speculative execution components.

---

## Test Pyramid Result Types

```typescript
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

## EarlyExitController Class

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
```

---

## Agent Integration

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

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-033-C-001 | layers array must not be empty | Error |
| SPEC-033-C-002 | totalLayers must match actual layers | Error |
| SPEC-033-C-003 | Layer results must be stored sequentially | Warning |

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| SPEC-033-A | Early Exit Algorithm | Core decision logic |
| SPEC-033-B | Speculative Execution | Prediction system |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-20 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-033-early-exit-testing.md)
- [LayerSkip (Elhoushi et al., 2024)](https://arxiv.org/abs/2404.16710)
