/**
 * SONA Three-Loop Coordination Engine
 *
 * Implements the three-loop architecture for continuous neural adaptation:
 *
 * 1. **Instant Loop** - Per-request MicroLoRA adaptation (<100us)
 *    Applies rank-1 weight updates for real-time personalization.
 *
 * 2. **Background Loop** - Periodic consolidation (every N requests)
 *    Merges instant adaptations into base model, runs EWC++ to prevent
 *    catastrophic forgetting, and updates the Fisher Information Matrix.
 *
 * 3. **Coordination Loop** - Cross-agent state synchronization
 *    Shares learned patterns across agent instances and manages
 *    domain-specific adaptation state.
 *
 * @module integrations/ruvector/sona-three-loop
 */

import { createRequire } from 'module';
import { LoggerFactory } from '../../logging/index.js';

const logger = LoggerFactory.create('sona-three-loop');
const esmRequire = createRequire(import.meta.url);

// ============================================================================
// Optional Native Engine Types
// ============================================================================

/**
 * Minimal interface for @ruvector/sona SonaEngine (NAPI).
 * Used for optional delegation when the native engine is injected.
 */
interface INativeSonaEngine {
  applyMicroLora(features: number[]): number[];
  forceLearn(): string;
  tick(): string | null;
  beginTrajectory(stateEmbedding: number[]): number;
  addTrajectoryStep(trajectoryId: number, actionEmbedding: number[], attentionWeights: number[], reward: number): void;
  endTrajectory(trajectoryId: number, quality: number): void;
}

/**
 * Minimal interface for @ruvector/learning-wasm WasmMicroLoRA.
 * 6.4x faster than TypeScript, 71x faster than NAPI for MicroLoRA.
 */
interface IWasmMicroLoRA {
  adapt(input: Float32Array): Float32Array;
  adapt_with_reward(input: Float32Array, reward: number): Float32Array;
  delta_norm(): number;
  adapt_count(): number;
  reset(): void;
  free(): void;
}

// ============================================================================
// WASM MicroLoRA Loader
// ============================================================================

let wasmLoraModule: { WasmMicroLoRA: new (dim: number, rank: number, lr: number) => IWasmMicroLoRA } | null = null;
let wasmLoraLoadAttempted = false;

/**
 * Lazily load @ruvector/learning-wasm for WASM-accelerated MicroLoRA.
 * Returns null if the WASM module is unavailable.
 */
function loadWasmMicroLoRA(): typeof wasmLoraModule {
  if (wasmLoraLoadAttempted) return wasmLoraModule;
  wasmLoraLoadAttempted = true;

  try {
    const mod = esmRequire('@ruvector/learning-wasm');
    const fs = esmRequire('fs');
    const path = esmRequire('path');
    const wasmPath = path.join(
      path.dirname(esmRequire.resolve('@ruvector/learning-wasm')),
      'ruvector_learning_wasm_bg.wasm',
    );
    mod.initSync({ module: fs.readFileSync(wasmPath) });
    wasmLoraModule = mod;
    logger.info('WASM MicroLoRA loaded from @ruvector/learning-wasm (6.4x faster than TS)');
  } catch {
    wasmLoraModule = null;
    logger.debug('@ruvector/learning-wasm not available, using TypeScript MicroLoRA');
  }

  return wasmLoraModule;
}

/** Reset WASM loader state (for testing) */
export function resetWasmLoraLoader(): void {
  wasmLoraModule = null;
  wasmLoraLoadAttempted = false;
}

// ============================================================================
// Types
// ============================================================================

/** Result from an instant MicroLoRA adaptation */
export interface AdaptationResult {
  /** Adapted output weights */
  adaptedWeights: Float32Array;
  /** Time taken in microseconds */
  latencyUs: number;
  /** Whether the adaptation was applied (vs skipped) */
  applied: boolean;
  /** Adaptation magnitude (L2 norm of delta) */
  magnitude: number;
  /** Request counter at time of adaptation */
  requestIndex: number;
}

/** Result from a background consolidation cycle */
export interface ConsolidationResult {
  /** Whether consolidation was performed */
  consolidated: boolean;
  /** Number of instant adaptations merged */
  adaptationsMerged: number;
  /** EWC++ regularization loss before consolidation */
  ewcLossBefore: number;
  /** EWC++ regularization loss after consolidation */
  ewcLossAfter: number;
  /** Whether a new task boundary was detected */
  taskBoundaryDetected: boolean;
  /** Duration of consolidation in milliseconds */
  durationMs: number;
}

/** Peer state for cross-agent synchronization */
export interface PeerState {
  /** Unique peer identifier */
  peerId: string;
  /** Domain the peer operates in */
  domain: string;
  /** Peer's current adaptation vector */
  adaptationVector: Float32Array;
  /** Peer's Fisher diagonal (importance weights) */
  fisherDiagonal: Float32Array;
  /** Number of requests processed by peer */
  requestCount: number;
  /** Timestamp of last update */
  lastUpdateMs: number;
}

/** EWC++ metrics for monitoring */
export interface EWCMetrics {
  /** Current EWC++ regularization loss */
  regularizationLoss: number;
  /** Number of task boundaries detected */
  taskBoundariesDetected: number;
  /** Fisher Information Matrix trace (sum of diagonal) */
  fisherTrace: number;
  /** Average Fisher diagonal value */
  avgFisherImportance: number;
  /** Maximum Fisher diagonal value */
  maxFisherImportance: number;
  /** Number of parameters protected above threshold */
  protectedParams: number;
  /** Total consolidation cycles completed */
  consolidationCycles: number;
  /** EWC lambda (regularization strength) */
  lambda: number;
}

/** Configuration for the three-loop engine */
export interface ThreeLoopConfig {
  /** Dimension of the adaptation/weight space */
  dimension: number;
  /** MicroLoRA learning rate for instant adaptations */
  microLoraLr: number;
  /** Number of requests between background consolidation cycles */
  consolidationInterval: number;
  /** EWC++ regularization strength (lambda) */
  ewcLambda: number;
  /** Z-score threshold for task boundary detection */
  taskBoundaryZScoreThreshold: number;
  /** Decay factor for blending old/new Fisher estimates */
  fisherDecay: number;
  /** Number of gradient samples for Fisher estimation */
  fisherSampleSize: number;
  /** Importance threshold below which params are not protected */
  importanceThreshold: number;
}

/** Default three-loop configuration */
export const DEFAULT_THREE_LOOP_CONFIG: ThreeLoopConfig = {
  dimension: 384,
  microLoraLr: 0.001,
  consolidationInterval: 100,
  ewcLambda: 1000.0,
  taskBoundaryZScoreThreshold: 2.5,
  fisherDecay: 0.9,
  fisherSampleSize: 200,
  importanceThreshold: 0.01,
};

// ============================================================================
// MicroLoRA (Rank-1 Adaptation)
// ============================================================================

/**
 * Micro-Linear Adaptation (element-wise) for per-request weight updates.
 *
 * Applies W' = W + alpha * features element-wise.
 * Not a true rank-1 outer product LoRA — for that, use native @ruvector/sona.
 *
 * This is intentionally lightweight for real-time use (<100us).
 */
export class MicroLoRA {
  /** Current rank-1 adaptation delta accumulated across requests */
  adaptationVector: Float32Array;
  /** Base weights (updated by background consolidation) */
  baseWeights: Float32Array;
  /** Learning rate for instant adaptation */
  private readonly lr: number;
  /** Count of adaptations applied since last consolidation */
  private adaptationCount: number = 0;

  constructor(dimension: number, lr: number = 0.001) {
    this.adaptationVector = new Float32Array(dimension);
    this.baseWeights = new Float32Array(dimension);
    this.lr = lr;
  }

  /**
   * Apply rank-1 instant adaptation to produce adapted weights.
   *
   * @param features - Input features for the current request
   * @returns Adapted weights = baseWeights + adaptationVector + lr * features
   */
  adapt(features: number[]): Float32Array {
    const dim = this.baseWeights.length;
    const result = new Float32Array(dim);
    const featureLen = Math.min(features.length, dim);

    // W' = base + accumulated_delta + lr * feature_direction
    for (let i = 0; i < dim; i++) {
      const featureVal = i < featureLen ? features[i] : 0;
      result[i] = this.baseWeights[i] + this.adaptationVector[i] + this.lr * featureVal;
    }

    // Accumulate the adaptation direction into the delta
    for (let i = 0; i < featureLen; i++) {
      this.adaptationVector[i] += this.lr * features[i];
    }

    this.adaptationCount++;
    return result;
  }

  /**
   * Merge accumulated adaptations into base weights and reset delta.
   * Called by the background loop during consolidation.
   *
   * @returns Number of adaptations that were merged
   */
  consolidate(): number {
    const merged = this.adaptationCount;
    const dim = this.baseWeights.length;

    // Merge delta into base
    for (let i = 0; i < dim; i++) {
      this.baseWeights[i] += this.adaptationVector[i];
      this.adaptationVector[i] = 0;
    }

    this.adaptationCount = 0;
    return merged;
  }

  /** Get the number of adaptations since last consolidation */
  getAdaptationCount(): number {
    return this.adaptationCount;
  }

  /** Get the current effective weights (base + delta) */
  getEffectiveWeights(): Float32Array {
    const dim = this.baseWeights.length;
    const result = new Float32Array(dim);
    for (let i = 0; i < dim; i++) {
      result[i] = this.baseWeights[i] + this.adaptationVector[i];
    }
    return result;
  }

  /** Get the L2 norm of the adaptation delta */
  getAdaptationMagnitude(): number {
    let sumSq = 0;
    for (let i = 0; i < this.adaptationVector.length; i++) {
      sumSq += this.adaptationVector[i] * this.adaptationVector[i];
    }
    return Math.sqrt(sumSq);
  }

  /** Reset adaptation state without affecting base weights */
  resetAdaptation(): void {
    this.adaptationVector.fill(0);
    this.adaptationCount = 0;
  }
}

// ============================================================================
// EWC++ (Elastic Weight Consolidation)
// ============================================================================

/**
 * EWC++ for preventing catastrophic forgetting across task boundaries.
 *
 * Maintains a diagonal Fisher Information Matrix that captures parameter
 * importance. When a new task boundary is detected (via gradient z-score),
 * the Fisher matrix is updated using online blending:
 *   F_new = decay * F_old + (1 - decay) * F_current
 *
 * The EWC loss penalizes deviation from optimal parameters:
 *   L_EWC = (lambda/2) * sum(F_i * (theta_i - theta*_i)^2)
 */
export class EWCPlusPlus {
  /** Diagonal Fisher Information Matrix (importance weights) */
  fisherMatrix: Float32Array;
  /** Optimal parameters at last task boundary */
  optimalParams: Float32Array;
  /** Regularization strength */
  private readonly lambda: number;
  /** Decay for blending old/new Fisher estimates */
  private readonly fisherDecay: number;
  /** Z-score threshold for task boundary detection */
  private readonly zScoreThreshold: number;
  /** Importance threshold for parameter protection */
  private readonly importanceThreshold: number;
  /** Running statistics for gradient magnitudes */
  private gradientHistory: number[] = [];
  private gradientMean: number = 0;
  private gradientVariance: number = 0;
  /** Number of task boundaries detected */
  private taskBoundaryCount: number = 0;
  /** Number of consolidation cycles */
  private consolidationCount: number = 0;

  constructor(
    dimension: number,
    lambda: number = 1000.0,
    fisherDecay: number = 0.9,
    zScoreThreshold: number = 2.5,
    importanceThreshold: number = 0.01,
  ) {
    this.fisherMatrix = new Float32Array(dimension);
    this.optimalParams = new Float32Array(dimension);
    this.lambda = lambda;
    this.fisherDecay = fisherDecay;
    this.zScoreThreshold = zScoreThreshold;
    this.importanceThreshold = importanceThreshold;
  }

  /**
   * Detect whether a task boundary has occurred based on the z-score
   * of the gradient magnitude change.
   *
   * A sudden spike in gradient magnitude signals a distribution shift,
   * indicating we have moved to a new task.
   *
   * @param gradients - Current gradient vector
   * @returns true if a task boundary is detected
   */
  detectTaskBoundary(gradients: Float32Array): boolean {
    // Compute gradient magnitude (L2 norm)
    let magnitude = 0;
    for (let i = 0; i < gradients.length; i++) {
      magnitude += gradients[i] * gradients[i];
    }
    magnitude = Math.sqrt(magnitude);

    if (this.gradientHistory.length < 5) {
      // Not enough history to detect boundary -- just accumulate
      this.gradientHistory.push(magnitude);
      this.updateGradientStats();
      return false;
    }

    // Compute z-score of current magnitude against EXISTING statistics
    // (before adding the new sample to history)
    const stdDev = Math.sqrt(this.gradientVariance);
    let zScore = 0;
    const absDiff = Math.abs(magnitude - this.gradientMean);

    if (stdDev > 1e-10) {
      zScore = absDiff / stdDev;
    } else if (absDiff > 1e-10 && this.gradientMean > 1e-10) {
      // When variance is zero (all same magnitude) but new value differs,
      // treat any meaningful deviation as a boundary
      zScore = absDiff / (this.gradientMean * 0.01 + 1e-10);
    }

    // Now add the new sample to history
    this.gradientHistory.push(magnitude);

    // Keep a sliding window of gradient magnitudes
    const maxHistory = 100;
    if (this.gradientHistory.length > maxHistory) {
      this.gradientHistory.shift();
    }

    this.updateGradientStats();

    if (zScore > this.zScoreThreshold) {
      this.taskBoundaryCount++;
      return true;
    }

    return false;
  }

  /**
   * Compute EWC++ regularization loss for current parameters.
   *
   * L_EWC = (lambda/2) * sum(F_i * (theta_i - theta*_i)^2)
   *
   * @param currentParams - Current model parameters
   * @returns Scalar regularization loss
   */
  computeLoss(currentParams: Float32Array): number {
    let loss = 0;
    const dim = Math.min(
      currentParams.length,
      this.fisherMatrix.length,
      this.optimalParams.length,
    );

    for (let i = 0; i < dim; i++) {
      const diff = currentParams[i] - this.optimalParams[i];
      loss += this.fisherMatrix[i] * diff * diff;
    }

    return (this.lambda / 2) * loss;
  }

  /**
   * Update the Fisher Information Matrix using online EWC++ blending.
   *
   * F_new = decay * F_old + (1 - decay) * F_sample
   *
   * The sample Fisher is approximated from squared gradients.
   *
   * Gradient samples should be outcome-weighted (REINFORCE-style), not raw
   * request features. Call recordOutcome() to generate proper gradient proxies.
   *
   * @param gradientSamples - Array of gradient vectors to estimate Fisher
   * @param currentParams - Current parameters to snapshot as optimal
   */
  updateFisher(
    gradientSamples: Float32Array[],
    currentParams: Float32Array,
  ): void {
    if (gradientSamples.length === 0) return;

    const dim = this.fisherMatrix.length;
    const sampleFisher = new Float32Array(dim);

    // Estimate Fisher diagonal from squared gradients: F_i = E[g_i^2]
    for (const grad of gradientSamples) {
      const gradLen = Math.min(grad.length, dim);
      for (let i = 0; i < gradLen; i++) {
        sampleFisher[i] += grad[i] * grad[i];
      }
    }

    const count = gradientSamples.length;
    for (let i = 0; i < dim; i++) {
      sampleFisher[i] /= count;
    }

    // Online EWC++ blending: F = decay * F_old + (1 - decay) * F_sample
    const alpha = this.fisherDecay;
    for (let i = 0; i < dim; i++) {
      this.fisherMatrix[i] = alpha * this.fisherMatrix[i] + (1 - alpha) * sampleFisher[i];
    }

    // Update optimal parameters
    const paramLen = Math.min(currentParams.length, dim);
    for (let i = 0; i < paramLen; i++) {
      this.optimalParams[i] = currentParams[i];
    }

    this.consolidationCount++;
  }

  /** Get metrics for monitoring */
  getMetrics(): EWCMetrics {
    const dim = this.fisherMatrix.length;
    let trace = 0;
    let maxImportance = 0;
    let protectedParams = 0;

    for (let i = 0; i < dim; i++) {
      trace += this.fisherMatrix[i];
      if (this.fisherMatrix[i] > maxImportance) {
        maxImportance = this.fisherMatrix[i];
      }
      if (this.fisherMatrix[i] > this.importanceThreshold) {
        protectedParams++;
      }
    }

    return {
      regularizationLoss: 0, // Computed on demand via computeLoss()
      taskBoundariesDetected: this.taskBoundaryCount,
      fisherTrace: trace,
      avgFisherImportance: dim > 0 ? trace / dim : 0,
      maxFisherImportance: maxImportance,
      protectedParams,
      consolidationCycles: this.consolidationCount,
      lambda: this.lambda,
    };
  }

  /** Get the number of task boundaries detected */
  getTaskBoundaryCount(): number {
    return this.taskBoundaryCount;
  }

  /** Get the Fisher diagonal as a copy */
  getFisherDiagonal(): Float32Array {
    return new Float32Array(this.fisherMatrix);
  }

  /** Get the optimal parameters as a copy */
  getOptimalParams(): Float32Array {
    return new Float32Array(this.optimalParams);
  }

  /** Load Fisher matrix from persisted data */
  loadFisher(fisher: Float32Array, optimal: Float32Array): void {
    const dim = this.fisherMatrix.length;
    const fLen = Math.min(fisher.length, dim);
    const oLen = Math.min(optimal.length, dim);

    for (let i = 0; i < fLen; i++) {
      this.fisherMatrix[i] = fisher[i];
    }
    for (let i = 0; i < oLen; i++) {
      this.optimalParams[i] = optimal[i];
    }
  }

  /** Update running gradient statistics (Welford's algorithm) */
  private updateGradientStats(): void {
    const n = this.gradientHistory.length;
    if (n === 0) return;

    let mean = 0;
    for (const v of this.gradientHistory) {
      mean += v;
    }
    mean /= n;

    let variance = 0;
    for (const v of this.gradientHistory) {
      const diff = v - mean;
      variance += diff * diff;
    }
    variance = n > 1 ? variance / (n - 1) : 0;

    this.gradientMean = mean;
    this.gradientVariance = variance;
  }
}

// ============================================================================
// SONA Three-Loop Engine
// ============================================================================

/**
 * Three-loop coordination engine for SONA neural adaptation.
 *
 * Combines MicroLoRA instant adaptation, EWC++ background consolidation,
 * and cross-agent coordination into a unified engine.
 */
export class SONAThreeLoopEngine {
  private readonly config: ThreeLoopConfig;
  private readonly microLora: MicroLoRA;
  private readonly ewc: EWCPlusPlus;
  private readonly nativeEngine: INativeSonaEngine | null;
  private wasmLora: IWasmMicroLoRA | null = null;
  private requestCount: number = 0;
  private lastConsolidationRequest: number = 0;
  private peerStates: Map<string, PeerState> = new Map();
  private gradientBuffer: Float32Array[] = [];
  private lastFeatures: number[] | null = null;

  constructor(config: Partial<ThreeLoopConfig> = {}, nativeEngine?: INativeSonaEngine | null) {
    this.config = { ...DEFAULT_THREE_LOOP_CONFIG, ...config };
    this.nativeEngine = nativeEngine ?? null;

    this.microLora = new MicroLoRA(
      this.config.dimension,
      this.config.microLoraLr,
    );

    this.ewc = new EWCPlusPlus(
      this.config.dimension,
      this.config.ewcLambda,
      this.config.fisherDecay,
      this.config.taskBoundaryZScoreThreshold,
      this.config.importanceThreshold,
    );

    // Try WASM MicroLoRA first (6.4x faster than TS, 71x faster than NAPI)
    const wasmMod = loadWasmMicroLoRA();
    if (wasmMod) {
      try {
        this.wasmLora = new wasmMod.WasmMicroLoRA(
          this.config.dimension,
          1, // rank-1
          this.config.microLoraLr,
        );
        logger.info('SONA Three-Loop using WASM MicroLoRA (0.07us/adapt)');
      } catch (err) {
        logger.debug('WASM MicroLoRA creation failed, falling back', { error: String(err) });
        this.wasmLora = null;
      }
    }

    if (!this.wasmLora && this.nativeEngine) {
      logger.info('SONA Three-Loop using native @ruvector/sona engine for MicroLoRA delegation');
    }
  }

  // ==========================================================================
  // Loop 1: Instant Adaptation
  // ==========================================================================

  /**
   * Perform instant per-request MicroLoRA adaptation.
   *
   * This is the hot path and must complete in <100us.
   * When a native @ruvector/sona engine is available, delegates to the
   * Rust implementation for true rank-1 LoRA. Otherwise falls back to
   * the TypeScript element-wise approximation.
   *
   * @param requestFeatures - Feature vector for the current request
   * @returns Adaptation result with adapted weights and timing
   */
  instantAdapt(requestFeatures: number[]): AdaptationResult {
    const startTime = performance.now();

    let adaptedWeights: Float32Array;
    if (this.wasmLora) {
      // WASM MicroLoRA: 0.07us/adapt — 6.4x faster than TS, real rank-1 LoRA
      try {
        const input = new Float32Array(requestFeatures);
        const wasmResult = this.wasmLora.adapt(input);
        if (wasmResult && wasmResult.length > 0) {
          adaptedWeights = wasmResult;
          // Still update TypeScript MicroLoRA for metric tracking / EWC compatibility
          this.microLora.adapt(requestFeatures);
        } else {
          // WASM returned empty/undefined — fall through to TS
          adaptedWeights = this.microLora.adapt(requestFeatures);
        }
      } catch {
        adaptedWeights = this.microLora.adapt(requestFeatures);
      }
    } else if (this.nativeEngine) {
      // NAPI SonaEngine: slower due to boundary crossing but full engine
      try {
        const nativeResult = this.nativeEngine.applyMicroLora(requestFeatures);
        adaptedWeights = new Float32Array(nativeResult);
        this.microLora.adapt(requestFeatures);
      } catch {
        adaptedWeights = this.microLora.adapt(requestFeatures);
      }
    } else {
      // TypeScript MicroLoRA: 0.43us/adapt — no dependencies
      adaptedWeights = this.microLora.adapt(requestFeatures);
    }
    const magnitude = this.microLora.getAdaptationMagnitude();

    this.requestCount++;

    // Store features for later use by recordOutcome() — do NOT buffer as
    // gradient proxies here. Proper gradient estimation requires an
    // outcome-weighted REINFORCE signal via recordOutcome().
    this.lastFeatures = [...requestFeatures];

    const latencyUs = (performance.now() - startTime) * 1000;

    return {
      adaptedWeights,
      latencyUs,
      applied: true,
      magnitude,
      requestIndex: this.requestCount,
    };
  }

  /**
   * Record the outcome of a request for REINFORCE-style gradient estimation.
   * Must be called after instantAdapt() with the reward signal.
   *
   * Computes gradient proxy: reward * last_features (REINFORCE estimator)
   * This is what gets buffered for Fisher estimation, NOT raw features.
   *
   * @param reward - Scalar reward (e.g., 1.0 for success, -1.0 for failure, 0.0 for neutral)
   * @param requestIndex - The requestIndex from the AdaptationResult (for matching)
   */
  recordOutcome(reward: number, requestIndex?: number): void {
    if (this.lastFeatures === null) {
      logger.warn('recordOutcome called without a preceding instantAdapt()');
      return;
    }

    // REINFORCE gradient proxy: g = reward * features
    const dim = this.lastFeatures.length;
    const gradientProxy = new Float32Array(dim);
    for (let i = 0; i < dim; i++) {
      gradientProxy[i] = reward * this.lastFeatures[i];
    }

    this.gradientBuffer.push(gradientProxy);

    // Keep buffer bounded
    if (this.gradientBuffer.length > this.config.fisherSampleSize) {
      this.gradientBuffer.shift();
    }

    this.lastFeatures = null; // Clear after use
  }

  // ==========================================================================
  // Loop 2: Background Consolidation
  // ==========================================================================

  /**
   * Run background consolidation cycle.
   *
   * This merges accumulated MicroLoRA adaptations into base weights,
   * checks for task boundaries, and runs EWC++ if a boundary is detected.
   * When a native @ruvector/sona engine is available, also triggers
   * native background learning via forceLearn() and tick().
   * Should be called periodically (every N requests via shouldConsolidate()).
   *
   * @returns Consolidation result with metrics
   */
  backgroundConsolidate(): ConsolidationResult {
    const startTime = performance.now();

    // Trigger native background learning if available
    if (this.nativeEngine) {
      try {
        this.nativeEngine.forceLearn();
        this.nativeEngine.tick();
      } catch (err) {
        logger.warn('Native SONA background learning failed, continuing with TypeScript', { error: String(err) });
      }
    }

    // Compute EWC loss before consolidation
    const ewcLossBefore = this.ewc.computeLoss(
      this.microLora.getEffectiveWeights(),
    );

    // Check for task boundary using buffered gradients
    let taskBoundaryDetected = false;
    if (this.gradientBuffer.length > 0) {
      const latestGradient = this.gradientBuffer[this.gradientBuffer.length - 1];
      taskBoundaryDetected = this.ewc.detectTaskBoundary(latestGradient);
    }

    // If task boundary detected, update Fisher before consolidation
    if (taskBoundaryDetected && this.gradientBuffer.length > 0) {
      this.ewc.updateFisher(
        this.gradientBuffer,
        this.microLora.getEffectiveWeights(),
      );
      logger.info('Task boundary detected, Fisher updated', {
        boundaries: this.ewc.getTaskBoundaryCount(),
        requestCount: this.requestCount,
      });
    }

    // Validate gradient quality — warn if all samples are identical
    if (this.gradientBuffer.length > 1) {
      let hasVariance = false;
      const first = this.gradientBuffer[0];
      for (let s = 1; s < this.gradientBuffer.length && !hasVariance; s++) {
        for (let i = 0; i < first.length; i++) {
          if (Math.abs(this.gradientBuffer[s][i] - first[i]) > 1e-8) {
            hasVariance = true;
            break;
          }
        }
      }
      if (!hasVariance) {
        logger.warn('All gradient samples identical — Fisher estimate may be poor. Ensure recordOutcome() is called with diverse rewards.');
      }
    }

    // Consolidate MicroLoRA adaptations into base weights
    const adaptationsMerged = this.microLora.consolidate();

    // Apply EWC++ regularization to consolidated weights
    this.applyEWCRegularization();

    // Compute EWC loss after consolidation
    const ewcLossAfter = this.ewc.computeLoss(
      this.microLora.getEffectiveWeights(),
    );

    this.lastConsolidationRequest = this.requestCount;

    // Clear gradient buffer after consolidation
    this.gradientBuffer = [];

    const durationMs = performance.now() - startTime;

    return {
      consolidated: adaptationsMerged > 0 || taskBoundaryDetected,
      adaptationsMerged,
      ewcLossBefore,
      ewcLossAfter,
      taskBoundaryDetected,
      durationMs,
    };
  }

  /**
   * Check if background consolidation is due.
   */
  shouldConsolidate(): boolean {
    return (
      this.requestCount - this.lastConsolidationRequest >=
      this.config.consolidationInterval
    );
  }

  // ==========================================================================
  // Loop 3: Coordination
  // ==========================================================================

  /**
   * Synchronize state with peer agents.
   *
   * Merges peer adaptation vectors using Fisher-weighted averaging:
   * For each parameter, the peer with higher Fisher importance has
   * more influence on the merged value.
   *
   * @param peerStates - Array of peer states to synchronize with
   */
  syncWithPeers(peerStates: PeerState[]): void {
    if (peerStates.length === 0) return;

    // Store peer states for reference
    for (const peer of peerStates) {
      this.peerStates.set(peer.peerId, peer);
    }

    const dim = this.config.dimension;
    const mergedAdaptation = new Float32Array(dim);
    const totalWeight = new Float32Array(dim);

    // Start with our own state (weighted by our Fisher)
    const ourFisher = this.ewc.getFisherDiagonal();
    const ourAdaptation = this.microLora.adaptationVector;

    for (let i = 0; i < dim; i++) {
      const weight = ourFisher[i] + 1e-10; // Avoid division by zero
      mergedAdaptation[i] += weight * ourAdaptation[i];
      totalWeight[i] += weight;
    }

    // Add peer contributions weighted by their Fisher
    for (const peer of peerStates) {
      const peerDim = Math.min(peer.adaptationVector.length, dim);
      for (let i = 0; i < peerDim; i++) {
        const weight = (i < peer.fisherDiagonal.length ? peer.fisherDiagonal[i] : 0) + 1e-10;
        mergedAdaptation[i] += weight * peer.adaptationVector[i];
        totalWeight[i] += weight;
      }
    }

    // Normalize by total weight
    for (let i = 0; i < dim; i++) {
      this.microLora.adaptationVector[i] = mergedAdaptation[i] / totalWeight[i];
    }

    logger.debug('Synced with peers', {
      peerCount: peerStates.length,
      peersStored: this.peerStates.size,
    });
  }

  /**
   * Get our current state for sharing with peers.
   */
  getLocalPeerState(peerId: string, domain: string): PeerState {
    return {
      peerId,
      domain,
      adaptationVector: new Float32Array(this.microLora.adaptationVector),
      fisherDiagonal: this.ewc.getFisherDiagonal(),
      requestCount: this.requestCount,
      lastUpdateMs: Date.now(),
    };
  }

  // ==========================================================================
  // EWC++ Metrics and Access
  // ==========================================================================

  /**
   * Get EWC++ metrics for monitoring and diagnostics.
   */
  getEWCMetrics(): EWCMetrics {
    const metrics = this.ewc.getMetrics();

    // Compute current regularization loss
    metrics.regularizationLoss = this.ewc.computeLoss(
      this.microLora.getEffectiveWeights(),
    );

    return metrics;
  }

  /**
   * Get the Fisher diagonal for persistence.
   */
  getFisherDiagonal(): Float32Array {
    return this.ewc.getFisherDiagonal();
  }

  /**
   * Get the optimal parameters for persistence.
   */
  getOptimalParams(): Float32Array {
    return this.ewc.getOptimalParams();
  }

  /**
   * Load persisted Fisher matrix and optimal parameters.
   */
  loadFisher(fisher: Float32Array, optimalParams: Float32Array): void {
    this.ewc.loadFisher(fisher, optimalParams);
  }

  /**
   * Get the current base weights from MicroLoRA.
   */
  getBaseWeights(): Float32Array {
    return new Float32Array(this.microLora.baseWeights);
  }

  /**
   * Set base weights (e.g., from persistence).
   */
  setBaseWeights(weights: Float32Array): void {
    const dim = Math.min(weights.length, this.microLora.baseWeights.length);
    for (let i = 0; i < dim; i++) {
      this.microLora.baseWeights[i] = weights[i];
    }
  }

  /**
   * Get the effective weights (base + adaptation delta).
   */
  getEffectiveWeights(): Float32Array {
    return this.microLora.getEffectiveWeights();
  }

  /** Get the total number of requests processed */
  getRequestCount(): number {
    return this.requestCount;
  }

  /** Get the engine configuration */
  getConfig(): ThreeLoopConfig {
    return { ...this.config };
  }

  /** Get the connected peer states */
  getPeerStates(): Map<string, PeerState> {
    return new Map(this.peerStates);
  }

  /** Get direct access to internal MicroLoRA (for testing) */
  getMicroLoRA(): MicroLoRA {
    return this.microLora;
  }

  /** Get direct access to internal EWC++ (for testing) */
  getEWC(): EWCPlusPlus {
    return this.ewc;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Apply EWC++ regularization to pull weights toward optimal.
   *
   * For parameters with high Fisher importance, nudge the current
   * weights back toward the optimal values to prevent forgetting.
   */
  private applyEWCRegularization(): void {
    const dim = this.config.dimension;
    const fisher = this.ewc.fisherMatrix;
    const optimal = this.ewc.optimalParams;
    const weights = this.microLora.baseWeights;

    // Regularization step: theta -= alpha * F_i * (theta_i - theta*_i)
    // Use a small step size so we don't overshoot
    const regStepSize = 0.01;

    for (let i = 0; i < dim; i++) {
      if (fisher[i] > this.config.importanceThreshold) {
        const diff = weights[i] - optimal[i];
        weights[i] -= regStepSize * fisher[i] * diff;
      }
    }
  }

  // ==========================================================================
  // SQLite Persistence (Task 2.2: EWC++ Fisher Matrix Persistence)
  // ==========================================================================

  /**
   * Persist Fisher matrix, optimal parameters, and base weights to SQLite
   * via PersistentSONAEngine.saveFisherMatrix().
   *
   * Call this after backgroundConsolidate() to ensure EWC++ state survives
   * across sessions. Typically called at session end or after N consolidations.
   *
   * @param persistFn - Callback that receives data and writes to SQLite.
   *   Typically `(domain, fisher, optimal, base, meta) => persistentEngine.saveFisherMatrix(...)`.
   * @param domain - Domain identifier for the Fisher state
   */
  persistFisher(
    persistFn: (
      domain: string,
      fisherDiagonal: Float32Array,
      optimalParams: Float32Array,
      baseWeights: Float32Array,
      metadata: {
        taskBoundaries: number;
        consolidationCycles: number;
        requestCount: number;
        ewcLambda: number;
      },
    ) => void,
    domain: string,
  ): void {
    const ewcMetrics = this.ewc.getMetrics();
    persistFn(
      domain,
      this.ewc.getFisherDiagonal(),
      this.ewc.getOptimalParams(),
      this.getBaseWeights(),
      {
        taskBoundaries: ewcMetrics.taskBoundariesDetected,
        consolidationCycles: ewcMetrics.consolidationCycles,
        requestCount: this.requestCount,
        ewcLambda: ewcMetrics.lambda,
      },
    );
    logger.info('Fisher matrix persisted to SQLite', {
      domain,
      requestCount: this.requestCount,
      taskBoundaries: ewcMetrics.taskBoundariesDetected,
    });
  }

  /**
   * Restore Fisher matrix, optimal parameters, and base weights from SQLite.
   *
   * Call this on engine startup to restore EWC++ state from a previous session.
   *
   * @param data - Persisted data from PersistentSONAEngine.loadFisherMatrix()
   */
  restoreFisher(data: {
    fisherDiagonal: Float32Array;
    optimalParams: Float32Array;
    baseWeights: Float32Array | null;
    requestCount: number;
  }): void {
    this.ewc.loadFisher(data.fisherDiagonal, data.optimalParams);
    if (data.baseWeights) {
      this.setBaseWeights(data.baseWeights);
    }
    this.requestCount = data.requestCount;
    logger.info('Fisher matrix restored from SQLite', {
      requestCount: data.requestCount,
      dimension: data.fisherDiagonal.length,
    });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a SONA Three-Loop Engine with the given configuration.
 *
 * @param config - Optional three-loop configuration overrides
 * @param nativeEngine - Optional @ruvector/sona SonaEngine for native delegation
 */
export function createSONAThreeLoopEngine(
  config?: Partial<ThreeLoopConfig>,
  nativeEngine?: INativeSonaEngine | null,
): SONAThreeLoopEngine {
  return new SONAThreeLoopEngine(config, nativeEngine);
}
