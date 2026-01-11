/**
 * Agentic QE v3 - Early Exit Testing
 * ADR-033: Lambda-stability decisions with speculative execution
 *
 * This module provides intelligent test layer skipping based on quality signals.
 * When early layers show high confidence (stable lambda), deeper layers can be skipped
 * with speculative predictions for their outcomes.
 *
 * @example
 * ```typescript
 * import {
 *   EarlyExitController,
 *   DEFAULT_EXIT_CONFIG,
 *   createEarlyExitController,
 * } from '@agentic-qe/v3/early-exit';
 *
 * const controller = createEarlyExitController(4);
 *
 * const result = await controller.runWithEarlyExit(layers, async (layer) => {
 *   return await testRunner.execute(layer);
 * });
 *
 * if (result.exitedEarly) {
 *   console.log(`Early exit at layer ${result.exitLayer}`);
 *   console.log(`Saved ${result.computeSavings}ms`);
 *   console.log(`Confidence: ${result.confidence * 100}%`);
 * }
 * ```
 *
 * @module early-exit
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Test layer types
  TestLayerType,
  TestLayer,
  LayerResult,
  TestResult,
  // Quality signal types
  QualitySignal,
  // Early exit types
  ExitReason,
  EarlyExitDecision,
  EarlyExitConfig,
  // Speculative types
  PredictedOutcome,
  SpeculativeResult,
  SpeculativeBatch,
  // Result types
  TestPyramidResult,
  EarlyExitMetrics,
} from './types';

export {
  // Configuration presets
  DEFAULT_EXIT_CONFIG,
  AGGRESSIVE_EXIT_CONFIG,
  CONSERVATIVE_EXIT_CONFIG,
  // Quality flags enum
  QualityFlags,
} from './types';

// ============================================================================
// Quality Signal
// ============================================================================

export {
  calculateQualitySignal,
  calculateLambdaStability,
  calculateConfidence,
  countQualityPartitions,
  createQualitySignal,
  isStableForExit,
} from './quality-signal';

// ============================================================================
// Early Exit Decision
// ============================================================================

export {
  CoherenceEarlyExit,
  createEarlyExit,
  createAggressiveEarlyExit,
  createConservativeEarlyExit,
  createCustomEarlyExit,
} from './early-exit-decision';

// ============================================================================
// Speculative Executor
// ============================================================================

export {
  SpeculativeExecutor,
  createSpeculativeExecutor,
  type LayerHistory,
  type IPredictionModel,
} from './speculative-executor';

// ============================================================================
// Early Exit Controller
// ============================================================================

export {
  EarlyExitController,
  createEarlyExitController,
  createAggressiveController,
  createConservativeController,
  createCustomController,
  type LayerExecutor,
  type EarlyExitEvents,
} from './early-exit-controller';
