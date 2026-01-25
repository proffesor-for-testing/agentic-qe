/**
 * ReflexLayer - Sub-microsecond reflex decisions for the RuVector Nervous System
 *
 * This adapter wraps WTALayer and KWTALayer from the WASM nervous system to provide
 * fast reflex-based decision making. High-confidence patterns receive instant responses
 * while low-confidence or novel patterns are delegated to deliberate processing.
 *
 * Performance targets:
 * - p50 latency: <0.5 microseconds
 * - p95 latency: <1.0 microseconds
 * - 90% of decisions handled by reflex path
 *
 * @module nervous-system/adapters/ReflexLayer
 */

import {
  WTALayer,
  KWTALayer,
  initNervousSystem,
  isWasmInitialized,
} from '../wasm-loader.js';

/**
 * Latency metrics for reflex decisions
 */
export interface LatencyMetrics {
  /** 50th percentile latency in microseconds */
  p50: number;
  /** 95th percentile latency in microseconds */
  p95: number;
  /** 99th percentile latency in microseconds */
  p99: number;
  /** Mean latency in microseconds */
  mean: number;
  /** Total number of samples */
  sampleCount: number;
}

/**
 * Result of a competition operation
 */
export interface CompetitionResult {
  /** Indices of winning neurons */
  winners: number[];
  /** Activation values of winners (if available) */
  activations?: number[];
  /** Time taken for competition in microseconds */
  latencyMicros: number;
  /** Whether the result is high-confidence (can be handled by reflex) */
  highConfidence: boolean;
}

/**
 * Delegation decision result
 */
export interface DelegationDecision {
  /** Whether the reflex layer can handle this pattern */
  canHandle: boolean;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reason for delegation if delegating */
  reason?: string;
  /** Decision latency in microseconds */
  latencyMicros: number;
}

/**
 * Configuration for the ReflexLayer
 */
export interface ReflexLayerConfig {
  /** Number of neurons in the layer */
  size: number;
  /** Number of winners for K-WTA (default: 1) */
  k?: number;
  /** Activation threshold for WTA (default: 0.5) */
  threshold?: number;
  /** Lateral inhibition strength 0-1 (default: 0.8) */
  inhibitionStrength?: number;
  /** Inhibition radius in neurons (default: 5) */
  inhibitionRadius?: number;
  /** Confidence threshold for reflex handling (default: 0.7) */
  confidenceThreshold?: number;
  /** Maximum latency samples to keep for metrics (default: 1000) */
  maxLatencySamples?: number;
}

/**
 * Interface for the ReflexLayer
 *
 * Provides sub-microsecond reflex decisions using winner-take-all neural dynamics.
 * Implements biological-inspired lateral inhibition for competitive selection.
 */
export interface IReflexLayer {
  /**
   * Set the number of winners for K-WTA competition
   * @param k - Number of top activations to select
   */
  setK(k: number): void;

  /**
   * Configure lateral inhibition parameters
   * @param strength - Inhibition strength (0-1)
   * @param radius - Inhibition radius in neurons
   */
  setInhibition(strength: number, radius: number): void;

  /**
   * Run winner-take-all competition on activation pattern
   * @param activations - Array of activation values for each neuron
   * @returns Competition result with winner indices and latency
   */
  compete(activations: Float32Array): CompetitionResult;

  /**
   * Decide if reflex layer can handle pattern or should delegate
   *
   * High-confidence patterns receive instant reflex response.
   * Low-confidence or novel patterns are delegated to full LearningEngine.
   *
   * @param pattern - Input pattern to evaluate
   * @returns Delegation decision with confidence and reasoning
   */
  shouldDelegate(pattern: Float32Array): DelegationDecision;

  /**
   * Get current decision latency metrics
   * @returns Latency statistics (p50, p95, p99, mean)
   */
  getDecisionLatency(): LatencyMetrics;

  /**
   * Reset the layer state and metrics
   */
  reset(): void;

  /**
   * Get the current configuration
   */
  getConfig(): ReflexLayerConfig;

  /**
   * Dispose of WASM resources
   */
  dispose(): void;
}

/**
 * ReflexLayer implementation wrapping WTA and K-WTA WASM layers
 *
 * Provides sub-microsecond reflex decisions for high-confidence patterns
 * while delegating novel or ambiguous patterns to deliberate processing.
 *
 * @example
 * ```typescript
 * const reflex = await ReflexLayer.create({ size: 100, k: 5 });
 *
 * // Run competition
 * const activations = new Float32Array(100);
 * activations[42] = 1.0;
 * const result = reflex.compete(activations);
 * console.log(`Winner: ${result.winners[0]}, latency: ${result.latencyMicros}us`);
 *
 * // Check if reflex can handle or should delegate
 * const decision = reflex.shouldDelegate(pattern);
 * if (decision.canHandle) {
 *   // Fast reflex path
 * } else {
 *   // Delegate to LearningEngine
 * }
 * ```
 */
export class ReflexLayer implements IReflexLayer {
  private wtaLayer: WTALayer;
  private kwtaLayer: KWTALayer;
  private config: Required<ReflexLayerConfig>;
  private latencySamples: number[] = [];
  private initialized = false;

  /**
   * Private constructor - use ReflexLayer.create() for async initialization
   */
  private constructor(config: ReflexLayerConfig) {
    this.config = {
      size: config.size,
      k: config.k ?? 1,
      threshold: config.threshold ?? 0.5,
      inhibitionStrength: config.inhibitionStrength ?? 0.8,
      inhibitionRadius: config.inhibitionRadius ?? 5,
      confidenceThreshold: config.confidenceThreshold ?? 0.7,
      maxLatencySamples: config.maxLatencySamples ?? 1000,
    };

    // Initialize WASM layers
    this.wtaLayer = new WTALayer(
      this.config.size,
      this.config.threshold,
      this.config.inhibitionStrength
    );

    this.kwtaLayer = new KWTALayer(this.config.size, this.config.k);

    this.initialized = true;
  }

  /**
   * Create a new ReflexLayer with async WASM initialization
   *
   * @param config - Layer configuration
   * @returns Initialized ReflexLayer instance
   */
  static async create(config: ReflexLayerConfig): Promise<ReflexLayer> {
    await ReflexLayer.initializeWasm();
    return new ReflexLayer(config);
  }

  /**
   * Create a ReflexLayer synchronously (WASM must already be initialized)
   *
   * @param config - Layer configuration
   * @returns ReflexLayer instance
   * @throws Error if WASM is not initialized
   */
  static createSync(config: ReflexLayerConfig): ReflexLayer {
    return new ReflexLayer(config);
  }

  /**
   * Initialize WASM module (uses shared wasm-loader)
   */
  static async initializeWasm(): Promise<void> {
    await initNervousSystem();
  }

  /**
   * Check if WASM is initialized
   */
  static isWasmInitialized(): boolean {
    return isWasmInitialized();
  }

  /**
   * Set the number of winners for K-WTA competition
   */
  setK(k: number): void {
    if (k < 1 || k > this.config.size) {
      throw new Error(`k must be between 1 and ${this.config.size}, got ${k}`);
    }
    this.config.k = k;
    // Recreate K-WTA layer with new k value
    this.kwtaLayer.free();
    this.kwtaLayer = new KWTALayer(this.config.size, k);
  }

  /**
   * Configure lateral inhibition parameters
   */
  setInhibition(strength: number, radius: number): void {
    if (strength < 0 || strength > 1) {
      throw new Error(`Inhibition strength must be between 0 and 1, got ${strength}`);
    }
    if (radius < 0 || radius > this.config.size) {
      throw new Error(`Inhibition radius must be between 0 and ${this.config.size}, got ${radius}`);
    }

    this.config.inhibitionStrength = strength;
    this.config.inhibitionRadius = radius;

    // Recreate WTA layer with new inhibition settings
    this.wtaLayer.free();
    this.wtaLayer = new WTALayer(this.config.size, this.config.threshold, strength);
  }

  /**
   * Run winner-take-all competition on activation pattern
   */
  compete(activations: Float32Array): CompetitionResult {
    if (activations.length !== this.config.size) {
      throw new Error(
        `Activation size mismatch: expected ${this.config.size}, got ${activations.length}`
      );
    }

    const startTime = performance.now();

    let winners: number[];
    let winnerActivations: number[] | undefined;

    if (this.config.k === 1) {
      // Use single-winner WTA for k=1
      const winner = this.wtaLayer.compete(activations);
      winners = winner >= 0 ? [winner] : [];
      if (winner >= 0) {
        winnerActivations = [activations[winner]];
      }
    } else {
      // Use K-WTA for k>1
      const winnerIndices = this.kwtaLayer.select(activations);
      winners = Array.from(winnerIndices);
      winnerActivations = winners.map((idx) => activations[idx]);
    }

    const endTime = performance.now();
    const latencyMicros = (endTime - startTime) * 1000; // Convert ms to microseconds

    // Record latency sample
    this.recordLatency(latencyMicros);

    // Calculate confidence based on activation spread
    const highConfidence = this.calculateConfidence(activations, winners) >= this.config.confidenceThreshold;

    return {
      winners,
      activations: winnerActivations,
      latencyMicros,
      highConfidence,
    };
  }

  /**
   * Decide if reflex layer can handle pattern or should delegate
   */
  shouldDelegate(pattern: Float32Array): DelegationDecision {
    if (pattern.length !== this.config.size) {
      throw new Error(
        `Pattern size mismatch: expected ${this.config.size}, got ${pattern.length}`
      );
    }

    const startTime = performance.now();

    // Run soft competition to get activation distribution
    const softActivations = this.wtaLayer.compete_soft(pattern);
    const confidence = this.calculatePatternConfidence(softActivations);

    const endTime = performance.now();
    const latencyMicros = (endTime - startTime) * 1000;

    this.recordLatency(latencyMicros);

    const canHandle = confidence >= this.config.confidenceThreshold;

    let reason: string | undefined;
    if (!canHandle) {
      if (confidence < 0.3) {
        reason = 'Novel pattern with no clear winner';
      } else if (confidence < 0.5) {
        reason = 'Ambiguous pattern with multiple competing activations';
      } else {
        reason = 'Pattern confidence below threshold';
      }
    }

    return {
      canHandle,
      confidence,
      reason,
      latencyMicros,
    };
  }

  /**
   * Get current decision latency metrics
   */
  getDecisionLatency(): LatencyMetrics {
    if (this.latencySamples.length === 0) {
      return {
        p50: 0,
        p95: 0,
        p99: 0,
        mean: 0,
        sampleCount: 0,
      };
    }

    // Sort samples for percentile calculation
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const n = sorted.length;

    const p50Index = Math.floor(n * 0.5);
    const p95Index = Math.floor(n * 0.95);
    const p99Index = Math.floor(n * 0.99);

    const sum = sorted.reduce((acc, val) => acc + val, 0);

    return {
      p50: sorted[p50Index] ?? 0,
      p95: sorted[p95Index] ?? sorted[n - 1] ?? 0,
      p99: sorted[p99Index] ?? sorted[n - 1] ?? 0,
      mean: sum / n,
      sampleCount: n,
    };
  }

  /**
   * Reset the layer state and metrics
   */
  reset(): void {
    this.wtaLayer.reset();
    this.latencySamples = [];
  }

  /**
   * Get the current configuration
   */
  getConfig(): ReflexLayerConfig {
    return { ...this.config };
  }

  /**
   * Dispose of WASM resources
   */
  dispose(): void {
    if (this.initialized) {
      this.wtaLayer.free();
      this.kwtaLayer.free();
      this.initialized = false;
    }
  }

  /**
   * Record a latency sample, maintaining max sample size
   */
  private recordLatency(latencyMicros: number): void {
    this.latencySamples.push(latencyMicros);
    if (this.latencySamples.length > this.config.maxLatencySamples) {
      this.latencySamples.shift();
    }
  }

  /**
   * Calculate confidence based on winner activation vs others
   */
  private calculateConfidence(activations: Float32Array, winners: number[]): number {
    if (winners.length === 0) {
      return 0;
    }

    // Find max activation among winners
    const maxWinnerActivation = Math.max(...winners.map((idx) => activations[idx]));

    // Find max activation among non-winners
    let maxOtherActivation = 0;
    for (let i = 0; i < activations.length; i++) {
      if (!winners.includes(i) && activations[i] > maxOtherActivation) {
        maxOtherActivation = activations[i];
      }
    }

    // Confidence based on separation between winner and runner-up
    if (maxWinnerActivation === 0) {
      return 0;
    }

    const separation = (maxWinnerActivation - maxOtherActivation) / maxWinnerActivation;
    return Math.max(0, Math.min(1, separation + 0.5)); // Shift to 0.5-1 range for clear winners
  }

  /**
   * Calculate pattern confidence from soft competition output
   */
  private calculatePatternConfidence(softActivations: Float32Array): number {
    // Calculate entropy-based confidence
    // Low entropy = high confidence (one clear winner)
    // High entropy = low confidence (many competing activations)

    let sum = 0;
    let entropy = 0;

    for (let i = 0; i < softActivations.length; i++) {
      sum += softActivations[i];
    }

    if (sum === 0) {
      return 0;
    }

    for (let i = 0; i < softActivations.length; i++) {
      const p = softActivations[i] / sum;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    // Normalize entropy to 0-1 range
    const maxEntropy = Math.log2(softActivations.length);
    const normalizedEntropy = entropy / maxEntropy;

    // Invert: low entropy = high confidence
    return 1 - normalizedEntropy;
  }
}

export default ReflexLayer;
