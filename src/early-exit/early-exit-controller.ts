/**
 * Agentic QE v3 - Early Exit Controller
 * ADR-033: Lambda-stability decisions with speculative execution
 *
 * This module implements the main controller that orchestrates early exit testing,
 * combining quality signal calculation, decision making, and speculative execution.
 */

import {
  EarlyExitConfig,
  EarlyExitDecision,
  TestLayer,
  TestPyramidResult,
  LayerResult,
  SpeculativeResult,
  QualitySignal,
  EarlyExitMetrics,
  ExitReason,
  DEFAULT_EXIT_CONFIG,
} from './types';
import { calculateQualitySignal, calculateLambdaStability, calculateConfidence } from './quality-signal';
import { CoherenceEarlyExit } from './early-exit-decision';
import { SpeculativeExecutor } from './speculative-executor';
import { getUnifiedMemory, type UnifiedMemoryManager } from '../kernel/unified-memory.js';
import { toErrorMessage } from '../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Layer executor function type
 */
export type LayerExecutor = (layer: TestLayer) => Promise<LayerResult>;

/**
 * Event emitter for progress tracking
 */
export interface EarlyExitEvents {
  onLayerStart?: (layer: TestLayer) => void;
  onLayerComplete?: (layer: TestLayer, result: LayerResult, signal: QualitySignal) => void;
  onDecision?: (decision: EarlyExitDecision, layer: number) => void;
  onEarlyExit?: (exitLayer: number, decision: EarlyExitDecision) => void;
  onSpeculationComplete?: (speculations: SpeculativeResult[]) => void;
  onComplete?: (result: TestPyramidResult) => void;
}

// ============================================================================
// Early Exit Controller Class
// ============================================================================

/**
 * EarlyExitController - Main orchestrator for early exit testing
 *
 * This controller manages the complete early exit testing workflow:
 * 1. Executes test layers sequentially
 * 2. Calculates quality signals after each layer
 * 3. Makes early exit decisions based on lambda stability
 * 4. Generates speculative predictions for skipped layers
 * 5. Optionally verifies speculations
 *
 * @example
 * ```typescript
 * const controller = new EarlyExitController(config, 4);
 *
 * const result = await controller.runWithEarlyExit(layers, async (layer) => {
 *   // Execute actual tests and return result
 *   return await testRunner.run(layer);
 * });
 *
 * console.log(`Exited at layer ${result.exitLayer}, saved ${result.computeSavings}ms`);
 * ```
 */
export class EarlyExitController {
  private readonly config: EarlyExitConfig;
  private readonly totalLayers: number;
  private readonly earlyExit: CoherenceEarlyExit;
  private readonly speculator: SpeculativeExecutor;
  private layerResults: Map<number, LayerResult> = new Map();
  private qualitySignals: Map<number, QualitySignal> = new Map();
  private executionMetrics: EarlyExitMetrics;
  private events: EarlyExitEvents = {};

  // KV store persistence (Tier 2)
  private db: UnifiedMemoryManager | null = null;
  private persistCount = 0;
  private static readonly KV_NAMESPACE = 'early-exit-signals';
  private static readonly KV_KEY = 'early-exit-controller-snapshot';
  private static readonly PERSIST_INTERVAL = 5;
  private static readonly KV_TTL = 3600;

  constructor(config: Partial<EarlyExitConfig> = {}, totalLayers: number) {
    this.config = { ...DEFAULT_EXIT_CONFIG, ...config };
    this.totalLayers = totalLayers;
    this.earlyExit = new CoherenceEarlyExit(this.config, totalLayers);
    this.speculator = new SpeculativeExecutor(this.config);
    this.executionMetrics = this.initializeMetrics();
  }

  /**
   * Initialize persistence layer and load last snapshot from KV store.
   * Safe to call multiple times; will not throw on DB failure.
   */
  async initialize(): Promise<void> {
    try {
      this.db = getUnifiedMemory();
      if (!this.db.isInitialized()) await this.db.initialize();
      await this.loadFromKv();
    } catch (error) {
      console.warn(
        '[EarlyExitController] DB init failed, using memory-only:',
        toErrorMessage(error),
      );
      this.db = null;
    }
  }

  /**
   * Run test pyramid with early exit support
   *
   * @param layers - Test layers to execute
   * @param executor - Function to execute a single layer
   * @returns Complete test pyramid result with early exit information
   */
  async runWithEarlyExit(
    layers: TestLayer[],
    executor: LayerExecutor
  ): Promise<TestPyramidResult> {
    const startTime = Date.now();
    const results: LayerResult[] = [];
    let exitDecision: EarlyExitDecision | null = null;
    let previousSignal: QualitySignal | undefined;

    // Execute layers until early exit or completion
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];

      // Emit layer start event
      this.events.onLayerStart?.(layer);

      // Execute layer
      const layerResult = await this.executeLayer(layer, executor, previousSignal);
      results.push(layerResult);
      this.layerResults.set(i, layerResult);

      // Calculate quality signal
      const signal = calculateQualitySignal(layerResult, previousSignal);
      this.qualitySignals.set(i, signal);
      previousSignal = signal;

      // Periodic KV persistence after signal updates
      this.persistCount++;
      if (this.persistCount % EarlyExitController.PERSIST_INTERVAL === 0) {
        this.persistSnapshot().catch(() => {});
      }

      // Emit layer complete event
      this.events.onLayerComplete?.(layer, layerResult, signal);

      // Check for early exit
      exitDecision = this.earlyExit.shouldExit(signal, i);

      // Emit decision event
      this.events.onDecision?.(exitDecision, i);

      if (this.config.verbose) {
        this.logDecision(exitDecision, i, signal);
      }

      if (exitDecision.canExit) {
        // Emit early exit event
        this.events.onEarlyExit?.(i, exitDecision);

        // Generate speculative predictions for remaining layers
        const skippedLayers = layers.slice(i + 1);
        let speculations: SpeculativeResult[] = [];

        if (exitDecision.enableSpeculation && skippedLayers.length > 0) {
          const batch = await this.speculator.speculate(exitDecision, skippedLayers);
          speculations = batch.predictions;

          // Optionally verify some speculations
          if (this.config.verificationLayers > 0) {
            speculations = await this.speculator.verify(
              speculations,
              skippedLayers,
              (verifyLayer) => executor(verifyLayer)
            );
          }

          // Emit speculation complete event
          this.events.onSpeculationComplete?.(speculations);
        }

        const totalDuration = Date.now() - startTime;
        const computeSavings = this.estimateComputeSavings(i, layers);

        const result = this.createPyramidResult(
          results,
          true,
          i,
          exitDecision,
          speculations,
          skippedLayers.length,
          totalDuration,
          computeSavings,
          signal
        );

        // Update metrics
        this.updateMetrics(result);

        // Emit complete event
        this.events.onComplete?.(result);

        return result;
      }
    }

    // Completed all layers without early exit
    const totalDuration = Date.now() - startTime;
    const finalSignal = previousSignal || this.createDefaultSignal();

    const result = this.createPyramidResult(
      results,
      false,
      layers.length - 1,
      exitDecision || this.createDefaultDecision(layers.length - 1),
      [],
      0,
      totalDuration,
      0,
      finalSignal
    );

    // Update metrics
    this.updateMetrics(result);

    // Emit complete event
    this.events.onComplete?.(result);

    return result;
  }

  /**
   * Execute a single test layer
   */
  private async executeLayer(
    layer: TestLayer,
    executor: LayerExecutor,
    previousSignal?: QualitySignal
  ): Promise<LayerResult> {
    if (this.config.verbose) {
      console.log(`[EarlyExit] Executing layer ${layer.index}: ${layer.name}`);
    }

    const result = await executor(layer);

    // Add previous lambda for delta calculation if available
    if (previousSignal) {
      result.previousLambda = previousSignal.lambda;
    }

    return result;
  }

  /**
   * Create pyramid result object
   */
  private createPyramidResult(
    layers: LayerResult[],
    exitedEarly: boolean,
    exitLayer: number,
    decision: EarlyExitDecision,
    speculations: SpeculativeResult[],
    skippedLayers: number,
    totalDuration: number,
    computeSavings: number,
    finalSignal: QualitySignal
  ): TestPyramidResult {
    return {
      layers,
      exitedEarly,
      exitLayer,
      exitReason: decision.reason,
      confidence: decision.confidence,
      speculations,
      skippedLayers,
      totalDuration,
      computeSavings,
      finalSignal,
      decision,
    };
  }

  /**
   * Estimate compute savings from early exit
   */
  private estimateComputeSavings(exitLayer: number, layers: TestLayer[]): number {
    let savings = 0;

    for (let i = exitLayer + 1; i < layers.length; i++) {
      // Use expected duration if available, otherwise estimate based on layer type
      const layer = layers[i];
      if (layer.expectedDuration !== undefined) {
        savings += layer.expectedDuration;
      } else {
        // Default estimates by layer type
        const estimates: Record<string, number> = {
          unit: 1000,
          integration: 5000,
          e2e: 30000,
          performance: 60000,
        };
        savings += estimates[layer.type] || 10000;
      }
    }

    return savings;
  }

  /**
   * Create default quality signal
   */
  private createDefaultSignal(): QualitySignal {
    return {
      lambda: 0,
      lambdaPrev: 0,
      boundaryEdges: 0,
      boundaryConcentration: 0,
      partitionCount: 0,
      flags: 0,
      timestamp: new Date(),
      sourceLayer: 0,
    };
  }

  /**
   * Create default decision
   */
  private createDefaultDecision(exitLayer: number): EarlyExitDecision {
    return {
      canExit: false,
      confidence: 1.0,
      exitLayer,
      reason: 'forced_continue',
      enableSpeculation: false,
      explanation: 'Completed all layers',
      timestamp: new Date(),
      lambdaStability: 1.0,
      lambdaValue: 0,
    };
  }

  /**
   * Log decision for debugging
   */
  private logDecision(decision: EarlyExitDecision, layer: number, signal: QualitySignal): void {
    const status = decision.canExit ? 'EXIT' : 'CONTINUE';
    console.log(`[EarlyExit] Layer ${layer}: ${status}`);
    console.log(`  Lambda: ${signal.lambda.toFixed(1)}, Stability: ${(decision.lambdaStability * 100).toFixed(1)}%`);
    console.log(`  Confidence: ${(decision.confidence * 100).toFixed(1)}%, Reason: ${decision.reason}`);
    console.log(`  ${decision.explanation}`);
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): EarlyExitMetrics {
    return {
      totalExecutions: 0,
      earlyExitCount: 0,
      earlyExitRate: 0,
      avgComputeSavings: 0,
      totalComputeSavings: 0,
      avgConfidence: 0,
      exitLayerDistribution: new Map(),
      exitReasonDistribution: new Map(),
      speculationAccuracy: 0,
      falsePositiveRate: 0,
      falseNegativeRate: 0,
    };
  }

  /**
   * Update metrics after execution
   */
  private updateMetrics(result: TestPyramidResult): void {
    this.executionMetrics.totalExecutions++;

    if (result.exitedEarly) {
      this.executionMetrics.earlyExitCount++;
    }

    this.executionMetrics.earlyExitRate =
      this.executionMetrics.earlyExitCount / this.executionMetrics.totalExecutions;

    // Update compute savings
    this.executionMetrics.totalComputeSavings += result.computeSavings;
    this.executionMetrics.avgComputeSavings =
      this.executionMetrics.totalComputeSavings / this.executionMetrics.totalExecutions;

    // Update confidence average
    const prevTotal = this.executionMetrics.avgConfidence * (this.executionMetrics.totalExecutions - 1);
    this.executionMetrics.avgConfidence =
      (prevTotal + result.confidence) / this.executionMetrics.totalExecutions;

    // Update distributions
    const layerCount = this.executionMetrics.exitLayerDistribution.get(result.exitLayer) || 0;
    this.executionMetrics.exitLayerDistribution.set(result.exitLayer, layerCount + 1);

    const reasonCount = this.executionMetrics.exitReasonDistribution.get(result.exitReason) || 0;
    this.executionMetrics.exitReasonDistribution.set(result.exitReason, reasonCount + 1);

    // Update speculation accuracy
    const speculatorStats = this.speculator.getAccuracyStats();
    this.executionMetrics.speculationAccuracy = speculatorStats.accuracy;
  }

  /**
   * Set event handlers
   */
  setEvents(events: EarlyExitEvents): void {
    this.events = events;
  }

  /**
   * Get current metrics
   */
  getMetrics(): EarlyExitMetrics {
    return { ...this.executionMetrics };
  }

  /**
   * Get layer result by index
   */
  getLayerResult(index: number): LayerResult | undefined {
    return this.layerResults.get(index);
  }

  /**
   * Get quality signal by layer index
   */
  getQualitySignal(index: number): QualitySignal | undefined {
    return this.qualitySignals.get(index);
  }

  /**
   * Get decision history
   */
  getDecisionHistory(): ReadonlyArray<EarlyExitDecision> {
    return this.earlyExit.getDecisionHistory();
  }

  /**
   * Get speculation statistics
   */
  getSpeculationStats() {
    return this.speculator.getAccuracyStats();
  }

  /**
   * Load last persisted snapshot from KV store into in-memory state.
   */
  private async loadFromKv(): Promise<void> {
    if (!this.db) return;
    try {
      const snapshot = await this.db.kvGet<{
        layerResults: Array<[number, LayerResult]>;
        qualitySignals: Array<[number, QualitySignal]>;
      }>(EarlyExitController.KV_KEY, EarlyExitController.KV_NAMESPACE);

      if (snapshot) {
        if (Array.isArray(snapshot.layerResults)) {
          for (const [k, v] of snapshot.layerResults) {
            this.layerResults.set(k, v);
          }
        }
        if (Array.isArray(snapshot.qualitySignals)) {
          for (const [k, v] of snapshot.qualitySignals) {
            this.qualitySignals.set(k, v);
          }
        }
      }
    } catch (error) {
      console.warn(
        '[EarlyExitController] Failed to load KV snapshot:',
        toErrorMessage(error),
      );
    }
  }

  /**
   * Persist a snapshot of layerResults and qualitySignals to KV store.
   * Serializes Maps as arrays of entries for JSON compatibility.
   */
  private async persistSnapshot(): Promise<void> {
    if (!this.db) return;
    try {
      const snapshot = {
        layerResults: Array.from(this.layerResults.entries()),
        qualitySignals: Array.from(this.qualitySignals.entries()),
      };
      await this.db.kvSet(
        EarlyExitController.KV_KEY,
        snapshot,
        EarlyExitController.KV_NAMESPACE,
        EarlyExitController.KV_TTL,
      );
    } catch (error) {
      console.warn(
        '[EarlyExitController] Failed to persist KV snapshot:',
        toErrorMessage(error),
      );
    }
  }

  /**
   * Reset controller state
   */
  reset(): void {
    this.layerResults.clear();
    this.qualitySignals.clear();
    this.earlyExit.reset();
    this.speculator.reset();
  }

  /**
   * Clear all state including metrics
   */
  clearAll(): void {
    this.reset();
    this.executionMetrics = this.initializeMetrics();
    this.speculator.clearAll();
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<EarlyExitConfig> {
    return { ...this.config };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an EarlyExitController with default configuration
 */
export function createEarlyExitController(totalLayers = 4): EarlyExitController {
  return new EarlyExitController(DEFAULT_EXIT_CONFIG, totalLayers);
}

/**
 * Create an EarlyExitController with aggressive configuration
 */
export function createAggressiveController(totalLayers = 4): EarlyExitController {
  const { AGGRESSIVE_EXIT_CONFIG } = require('./types');
  return new EarlyExitController(AGGRESSIVE_EXIT_CONFIG, totalLayers);
}

/**
 * Create an EarlyExitController with conservative configuration
 */
export function createConservativeController(totalLayers = 4): EarlyExitController {
  const { CONSERVATIVE_EXIT_CONFIG } = require('./types');
  return new EarlyExitController(CONSERVATIVE_EXIT_CONFIG, totalLayers);
}

/**
 * Create an EarlyExitController with custom configuration
 */
export function createCustomController(
  config: Partial<EarlyExitConfig>,
  totalLayers = 4
): EarlyExitController {
  return new EarlyExitController(config, totalLayers);
}
