/**
 * Gradient Aggregator for Federated Learning
 *
 * Implements multiple aggregation strategies for combining model updates
 * from distributed participants. Includes support for:
 * - FedAvg: Weighted averaging based on sample counts
 * - FedProx: Proximal term for heterogeneous data
 * - Secure aggregation using additive secret sharing
 * - Gradient clipping for privacy
 * - Differential privacy noise injection
 *
 * @module edge/p2p/federated/GradientAggregator
 * @version 1.0.0
 */

import type {
  ModelUpdate,
  ModelWeights,
  AggregationResult,
  AggregationMetrics,
  FLDifferentialPrivacyConfig,
  SecureAggregationConfig,
  PrivacyBudget,
  CompressionInfo,
} from './types';
import {
  AggregationStrategy,
  FederatedError,
  FederatedErrorCode,
  FL_DEFAULT_DP_CONFIG,
  DEFAULT_GRADIENT_CLIP_NORM,
} from './types';

// ============================================
// Types
// ============================================

/**
 * Aggregator configuration
 */
export interface GradientAggregatorConfig {
  /** Aggregation strategy */
  strategy: AggregationStrategy;

  /** Enable gradient clipping */
  enableClipping: boolean;

  /** Gradient clip norm */
  clipNorm: number;

  /** Differential privacy config */
  differentialPrivacy?: FLDifferentialPrivacyConfig;

  /** Secure aggregation config */
  secureAggregation?: SecureAggregationConfig;

  /** FedProx proximal term (mu) */
  proximalMu?: number;

  /** Trimmed mean trim ratio */
  trimRatio?: number;

  /** Krum parameter f (number of Byzantine participants to tolerate) */
  byzantineTolerance?: number;
}

/**
 * Secret share for secure aggregation
 */
interface SecretShare {
  /** Participant ID */
  participantId: string;

  /** Share index */
  index: number;

  /** Share value */
  value: Uint8Array;
}

/**
 * Pairwise mask for secure aggregation
 */
interface PairwiseMask {
  /** Source participant */
  source: string;

  /** Target participant */
  target: string;

  /** Mask values by layer */
  masks: Map<string, Float32Array>;
}

// ============================================
// GradientAggregator Class
// ============================================

/**
 * Gradient aggregator for federated learning
 *
 * @example
 * ```typescript
 * const aggregator = new GradientAggregator({
 *   strategy: AggregationStrategy.FED_AVG,
 *   enableClipping: true,
 *   clipNorm: 1.0,
 *   differentialPrivacy: {
 *     enabled: true,
 *     epsilon: 1.0,
 *     delta: 1e-5,
 *     mechanism: 'gaussian',
 *     sensitivity: 1.0,
 *     clipNorm: 1.0,
 *     trackBudget: true,
 *   },
 * });
 *
 * const result = await aggregator.aggregate(updates, globalModel);
 * ```
 */
export class GradientAggregator {
  private config: GradientAggregatorConfig;
  private privacyBudget: PrivacyBudget;
  private secretShares: Map<string, SecretShare[]> = new Map();
  private pairwiseMasks: Map<string, PairwiseMask[]> = new Map();

  constructor(config: Partial<GradientAggregatorConfig> = {}) {
    this.config = {
      strategy: config.strategy ?? AggregationStrategy.FED_AVG,
      enableClipping: config.enableClipping ?? true,
      clipNorm: config.clipNorm ?? DEFAULT_GRADIENT_CLIP_NORM,
      differentialPrivacy: config.differentialPrivacy,
      secureAggregation: config.secureAggregation,
      proximalMu: config.proximalMu ?? 0.01,
      trimRatio: config.trimRatio ?? 0.1,
      byzantineTolerance: config.byzantineTolerance ?? 1,
    };

    // Initialize privacy budget tracking
    const dpConfig = this.config.differentialPrivacy ?? FL_DEFAULT_DP_CONFIG;
    this.privacyBudget = {
      totalEpsilon: dpConfig.totalBudget ?? dpConfig.epsilon * 100,
      totalDelta: dpConfig.delta * 100,
      consumedEpsilon: 0,
      consumedDelta: 0,
      remainingEpsilon: dpConfig.totalBudget ?? dpConfig.epsilon * 100,
      remainingDelta: dpConfig.delta * 100,
      epsilonHistory: [],
      exhausted: false,
      estimatedRoundsRemaining: 100,
    };
  }

  // ============================================
  // Main Aggregation Methods
  // ============================================

  /**
   * Aggregate model updates using configured strategy
   *
   * @param updates - Model updates from participants
   * @param globalModel - Current global model weights
   * @returns Aggregation result
   */
  async aggregate(
    updates: ModelUpdate[],
    globalModel: ModelWeights
  ): Promise<AggregationResult> {
    if (updates.length === 0) {
      throw new FederatedError(
        'No updates to aggregate',
        FederatedErrorCode.AGGREGATION_FAILED
      );
    }

    const startTime = Date.now();

    // Apply gradient clipping if enabled
    const clippedUpdates = this.config.enableClipping
      ? updates.map((u) => this.clipGradients(u))
      : updates;

    // Select aggregation strategy
    let aggregatedWeights: Map<string, Float32Array>;
    let excludedUpdates: string[] = [];

    switch (this.config.strategy) {
      case AggregationStrategy.FED_AVG:
        aggregatedWeights = this.fedAvg(clippedUpdates, globalModel);
        break;

      case AggregationStrategy.FED_PROX:
        aggregatedWeights = this.fedProx(clippedUpdates, globalModel);
        break;

      case AggregationStrategy.FED_MA:
        aggregatedWeights = this.fedMA(clippedUpdates, globalModel);
        break;

      case AggregationStrategy.WEIGHTED_MEDIAN:
        aggregatedWeights = this.weightedMedian(clippedUpdates, globalModel);
        break;

      case AggregationStrategy.TRIMMED_MEAN:
        const trimResult = this.trimmedMean(clippedUpdates, globalModel);
        aggregatedWeights = trimResult.weights;
        excludedUpdates = trimResult.excluded;
        break;

      case AggregationStrategy.KRUM:
        const krumResult = this.krum(clippedUpdates, globalModel);
        aggregatedWeights = krumResult.weights;
        excludedUpdates = krumResult.excluded;
        break;

      case AggregationStrategy.COORDINATE_MEDIAN:
        aggregatedWeights = this.coordinateMedian(clippedUpdates, globalModel);
        break;

      default:
        aggregatedWeights = this.fedAvg(clippedUpdates, globalModel);
    }

    // Apply differential privacy noise if enabled
    if (this.config.differentialPrivacy?.enabled) {
      aggregatedWeights = this.applyDifferentialPrivacy(aggregatedWeights);
    }

    // Compute checksum
    const checksum = this.computeChecksum(aggregatedWeights);

    // Calculate total bytes
    let totalBytes = 0;
    for (const weights of aggregatedWeights.values()) {
      totalBytes += weights.byteLength;
    }

    // Build result
    const aggregatedModel: ModelWeights = {
      modelId: globalModel.modelId,
      version: this.incrementVersion(globalModel.version),
      weights: aggregatedWeights,
      shapes: globalModel.shapes,
      totalBytes,
      checksum,
      timestamp: Date.now(),
    };

    const totalSamples = updates.reduce((sum, u) => sum + u.sampleCount, 0);
    const aggregationTime = Date.now() - startTime;

    const metrics: AggregationMetrics = {
      aggregationTime,
      weightNorm: this.computeWeightNorm(aggregatedWeights),
      updateVariance: this.computeUpdateVariance(clippedUpdates),
      outlierScore: excludedUpdates.length > 0
        ? excludedUpdates.length / updates.length
        : 0,
    };

    return {
      aggregatedWeights: aggregatedModel,
      updateCount: updates.length - excludedUpdates.length,
      totalSamples,
      metrics,
      excludedUpdates,
      timestamp: Date.now(),
    };
  }

  // ============================================
  // Aggregation Strategies
  // ============================================

  /**
   * FedAvg: Federated Averaging
   *
   * Weighted average of updates based on sample counts.
   * McMahan et al., "Communication-Efficient Learning of Deep Networks from Decentralized Data"
   */
  private fedAvg(
    updates: ModelUpdate[],
    globalModel: ModelWeights
  ): Map<string, Float32Array> {
    const totalSamples = updates.reduce((sum, u) => sum + u.sampleCount, 0);
    const result = new Map<string, Float32Array>();

    // Get layer names from first update
    const layerNames = Array.from(updates[0].deltas.keys());

    for (const layerName of layerNames) {
      const globalWeights = globalModel.weights.get(layerName);
      if (!globalWeights) continue;

      const aggregated = new Float32Array(globalWeights.length);

      // Start with global model
      for (let i = 0; i < globalWeights.length; i++) {
        aggregated[i] = globalWeights[i];
      }

      // Add weighted deltas
      for (const update of updates) {
        const delta = update.deltas.get(layerName);
        if (!delta) continue;

        const weight = update.sampleCount / totalSamples;

        for (let i = 0; i < aggregated.length; i++) {
          aggregated[i] += weight * delta[i];
        }
      }

      result.set(layerName, aggregated);
    }

    return result;
  }

  /**
   * FedProx: Federated Proximal
   *
   * Adds proximal term to handle heterogeneous data.
   * Li et al., "Federated Optimization in Heterogeneous Networks"
   */
  private fedProx(
    updates: ModelUpdate[],
    globalModel: ModelWeights
  ): Map<string, Float32Array> {
    const totalSamples = updates.reduce((sum, u) => sum + u.sampleCount, 0);
    const mu = this.config.proximalMu ?? 0.01;
    const result = new Map<string, Float32Array>();

    const layerNames = Array.from(updates[0].deltas.keys());

    for (const layerName of layerNames) {
      const globalWeights = globalModel.weights.get(layerName);
      if (!globalWeights) continue;

      const aggregated = new Float32Array(globalWeights.length);

      // Start with global model
      for (let i = 0; i < globalWeights.length; i++) {
        aggregated[i] = globalWeights[i];
      }

      // Add weighted deltas with proximal regularization
      for (const update of updates) {
        const delta = update.deltas.get(layerName);
        if (!delta) continue;

        const weight = update.sampleCount / totalSamples;

        for (let i = 0; i < aggregated.length; i++) {
          // Proximal term pulls toward global model
          const proximalTerm = mu * (globalWeights[i] - (globalWeights[i] + delta[i]));
          aggregated[i] += weight * (delta[i] - proximalTerm);
        }
      }

      result.set(layerName, aggregated);
    }

    return result;
  }

  /**
   * FedMA: Federated Matched Averaging
   *
   * Layer-wise matching before averaging.
   * Wang et al., "Federated Learning with Matched Averaging"
   */
  private fedMA(
    updates: ModelUpdate[],
    globalModel: ModelWeights
  ): Map<string, Float32Array> {
    // Simplified FedMA: permutation matching based on weight similarities
    // Full implementation would require neuron matching algorithm
    const totalSamples = updates.reduce((sum, u) => sum + u.sampleCount, 0);
    const result = new Map<string, Float32Array>();

    const layerNames = Array.from(updates[0].deltas.keys());

    for (const layerName of layerNames) {
      const globalWeights = globalModel.weights.get(layerName);
      if (!globalWeights) continue;

      const aggregated = new Float32Array(globalWeights.length);

      // Start with global model
      for (let i = 0; i < globalWeights.length; i++) {
        aggregated[i] = globalWeights[i];
      }

      // Compute matching and weighted average
      for (const update of updates) {
        const delta = update.deltas.get(layerName);
        if (!delta) continue;

        // Simple weight-based matching (full FedMA would use Hungarian algorithm)
        const matchedDelta = this.matchWeights(delta, globalWeights);
        const weight = update.sampleCount / totalSamples;

        for (let i = 0; i < aggregated.length; i++) {
          aggregated[i] += weight * matchedDelta[i];
        }
      }

      result.set(layerName, aggregated);
    }

    return result;
  }

  /**
   * Weighted Median Aggregation
   *
   * Byzantine-resilient aggregation using weighted median.
   */
  private weightedMedian(
    updates: ModelUpdate[],
    globalModel: ModelWeights
  ): Map<string, Float32Array> {
    const result = new Map<string, Float32Array>();
    const layerNames = Array.from(updates[0].deltas.keys());

    for (const layerName of layerNames) {
      const globalWeights = globalModel.weights.get(layerName);
      if (!globalWeights) continue;

      const aggregated = new Float32Array(globalWeights.length);

      // For each weight, compute weighted median
      for (let i = 0; i < globalWeights.length; i++) {
        const values: Array<{ value: number; weight: number }> = [];

        for (const update of updates) {
          const delta = update.deltas.get(layerName);
          if (!delta) continue;

          values.push({
            value: globalWeights[i] + delta[i],
            weight: update.sampleCount,
          });
        }

        aggregated[i] = this.computeWeightedMedian(values);
      }

      result.set(layerName, aggregated);
    }

    return result;
  }

  /**
   * Trimmed Mean Aggregation
   *
   * Outlier-resistant aggregation by trimming extreme values.
   */
  private trimmedMean(
    updates: ModelUpdate[],
    globalModel: ModelWeights
  ): { weights: Map<string, Float32Array>; excluded: string[] } {
    const trimRatio = this.config.trimRatio ?? 0.1;
    const result = new Map<string, Float32Array>();
    const excluded: string[] = [];

    // Compute distances from mean for each update
    const distances = updates.map((update) => ({
      updateId: update.updateId,
      distance: this.computeUpdateDistance(update, updates),
    }));

    // Sort by distance and trim
    distances.sort((a, b) => b.distance - a.distance);
    const trimCount = Math.floor(updates.length * trimRatio);
    const trimmedIds = new Set(distances.slice(0, trimCount).map((d) => d.updateId));

    for (const d of distances.slice(0, trimCount)) {
      excluded.push(d.updateId);
    }

    // Filter updates
    const filteredUpdates = updates.filter((u) => !trimmedIds.has(u.updateId));

    // Apply FedAvg on filtered updates
    const weights = this.fedAvg(filteredUpdates, globalModel);

    return { weights, excluded };
  }

  /**
   * Krum Aggregation
   *
   * Byzantine-resilient aggregation by selecting updates closest to others.
   * Blanchard et al., "Machine Learning with Adversaries: Byzantine Tolerant Gradient Descent"
   */
  private krum(
    updates: ModelUpdate[],
    globalModel: ModelWeights
  ): { weights: Map<string, Float32Array>; excluded: string[] } {
    const f = this.config.byzantineTolerance ?? 1;
    const n = updates.length;
    const m = n - f - 2;

    if (m < 1) {
      // Fall back to FedAvg if not enough participants
      return { weights: this.fedAvg(updates, globalModel), excluded: [] };
    }

    // Compute pairwise distances
    const distances: number[][] = [];
    for (let i = 0; i < n; i++) {
      distances[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          distances[i][j] = 0;
        } else {
          distances[i][j] = this.computePairwiseDistance(updates[i], updates[j]);
        }
      }
    }

    // For each update, compute sum of m closest distances
    const scores: Array<{ index: number; score: number }> = [];
    for (let i = 0; i < n; i++) {
      const sortedDistances = [...distances[i]].sort((a, b) => a - b);
      const score = sortedDistances.slice(1, m + 1).reduce((a, b) => a + b, 0);
      scores.push({ index: i, score });
    }

    // Select update with minimum score
    scores.sort((a, b) => a.score - b.score);
    const selectedIndex = scores[0].index;
    const excluded = scores.slice(1).map((s) => updates[s.index].updateId);

    // Return the selected update applied to global model
    const result = new Map<string, Float32Array>();
    const selectedUpdate = updates[selectedIndex];

    for (const [layerName, delta] of selectedUpdate.deltas) {
      const globalWeights = globalModel.weights.get(layerName);
      if (!globalWeights) continue;

      const updated = new Float32Array(globalWeights.length);
      for (let i = 0; i < globalWeights.length; i++) {
        updated[i] = globalWeights[i] + delta[i];
      }
      result.set(layerName, updated);
    }

    return { weights: result, excluded };
  }

  /**
   * Coordinate-wise Median Aggregation
   *
   * Simple Byzantine-resilient aggregation using element-wise median.
   */
  private coordinateMedian(
    updates: ModelUpdate[],
    globalModel: ModelWeights
  ): Map<string, Float32Array> {
    const result = new Map<string, Float32Array>();
    const layerNames = Array.from(updates[0].deltas.keys());

    for (const layerName of layerNames) {
      const globalWeights = globalModel.weights.get(layerName);
      if (!globalWeights) continue;

      const aggregated = new Float32Array(globalWeights.length);

      // For each weight, compute median of all deltas
      for (let i = 0; i < globalWeights.length; i++) {
        const values: number[] = [];

        for (const update of updates) {
          const delta = update.deltas.get(layerName);
          if (!delta) continue;
          values.push(globalWeights[i] + delta[i]);
        }

        values.sort((a, b) => a - b);
        const mid = Math.floor(values.length / 2);
        aggregated[i] = values.length % 2 === 0
          ? (values[mid - 1] + values[mid]) / 2
          : values[mid];
      }

      result.set(layerName, aggregated);
    }

    return result;
  }

  // ============================================
  // Gradient Clipping
  // ============================================

  /**
   * Clip gradients to specified norm
   */
  clipGradients(update: ModelUpdate): ModelUpdate {
    const clipNorm = this.config.clipNorm;
    let totalNorm = 0;

    // Compute total L2 norm
    for (const delta of update.deltas.values()) {
      for (let i = 0; i < delta.length; i++) {
        totalNorm += delta[i] * delta[i];
      }
    }
    totalNorm = Math.sqrt(totalNorm);

    // If norm exceeds clip value, scale down
    if (totalNorm > clipNorm) {
      const scale = clipNorm / totalNorm;
      const clippedDeltas = new Map<string, Float32Array>();

      for (const [layerName, delta] of update.deltas) {
        const clipped = new Float32Array(delta.length);
        for (let i = 0; i < delta.length; i++) {
          clipped[i] = delta[i] * scale;
        }
        clippedDeltas.set(layerName, clipped);
      }

      return {
        ...update,
        deltas: clippedDeltas,
      };
    }

    return update;
  }

  /**
   * Compute gradient norm for an update
   */
  computeGradientNorm(update: ModelUpdate): number {
    let norm = 0;
    for (const delta of update.deltas.values()) {
      for (let i = 0; i < delta.length; i++) {
        norm += delta[i] * delta[i];
      }
    }
    return Math.sqrt(norm);
  }

  // ============================================
  // Differential Privacy
  // ============================================

  /**
   * Apply differential privacy noise to aggregated weights
   */
  private applyDifferentialPrivacy(
    weights: Map<string, Float32Array>
  ): Map<string, Float32Array> {
    const dpConfig = this.config.differentialPrivacy!;
    const result = new Map<string, Float32Array>();

    // Calculate noise scale based on mechanism
    const noiseScale = this.computeNoiseScale(dpConfig);

    for (const [layerName, layerWeights] of weights) {
      const noisedWeights = new Float32Array(layerWeights.length);

      for (let i = 0; i < layerWeights.length; i++) {
        const noise = dpConfig.mechanism === 'laplace'
          ? this.sampleLaplace(noiseScale)
          : this.sampleGaussian(noiseScale);
        noisedWeights[i] = layerWeights[i] + noise;
      }

      result.set(layerName, noisedWeights);
    }

    // Update privacy budget
    this.updatePrivacyBudget(dpConfig);

    return result;
  }

  /**
   * Compute noise scale for differential privacy
   */
  private computeNoiseScale(dpConfig: FLDifferentialPrivacyConfig): number {
    const sensitivity = dpConfig.sensitivity;
    const epsilon = dpConfig.perRoundBudget ?? dpConfig.epsilon;

    if (dpConfig.mechanism === 'laplace') {
      // Laplace mechanism: scale = sensitivity / epsilon
      return sensitivity / epsilon;
    } else {
      // Gaussian mechanism: scale = sensitivity * sqrt(2 * ln(1.25/delta)) / epsilon
      const delta = dpConfig.delta;
      return sensitivity * Math.sqrt(2 * Math.log(1.25 / delta)) / epsilon;
    }
  }

  /**
   * Sample from Laplace distribution
   */
  private sampleLaplace(scale: number): number {
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  /**
   * Sample from Gaussian distribution (Box-Muller transform)
   */
  private sampleGaussian(stddev: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z * stddev;
  }

  /**
   * Update privacy budget tracking
   */
  private updatePrivacyBudget(dpConfig: FLDifferentialPrivacyConfig): void {
    const epsilonConsumed = dpConfig.perRoundBudget ?? dpConfig.epsilon;
    const deltaConsumed = dpConfig.delta;

    this.privacyBudget.consumedEpsilon += epsilonConsumed;
    this.privacyBudget.consumedDelta += deltaConsumed;
    this.privacyBudget.remainingEpsilon =
      this.privacyBudget.totalEpsilon - this.privacyBudget.consumedEpsilon;
    this.privacyBudget.remainingDelta =
      this.privacyBudget.totalDelta - this.privacyBudget.consumedDelta;
    this.privacyBudget.epsilonHistory.push(epsilonConsumed);
    this.privacyBudget.exhausted = this.privacyBudget.remainingEpsilon <= 0;
    this.privacyBudget.estimatedRoundsRemaining = Math.floor(
      this.privacyBudget.remainingEpsilon / epsilonConsumed
    );
  }

  /**
   * Get current privacy budget status
   */
  getPrivacyBudget(): PrivacyBudget {
    return { ...this.privacyBudget };
  }

  /**
   * Check if privacy budget is exhausted
   */
  isPrivacyBudgetExhausted(): boolean {
    return this.privacyBudget.exhausted;
  }

  // ============================================
  // Secure Aggregation
  // ============================================

  /**
   * Initialize secure aggregation for a set of participants
   */
  async initSecureAggregation(participantIds: string[]): Promise<Map<string, Uint8Array>> {
    const saConfig = this.config.secureAggregation;
    if (!saConfig?.enabled) {
      throw new FederatedError(
        'Secure aggregation not enabled',
        FederatedErrorCode.SECURE_AGGREGATION_ERROR
      );
    }

    // Generate secret shares for each participant
    const shares = new Map<string, Uint8Array>();

    for (const participantId of participantIds) {
      const share = this.generateSecretShare(participantId, saConfig.totalShares);
      shares.set(participantId, share);
      this.secretShares.set(participantId, [{
        participantId,
        index: 0,
        value: share,
      }]);
    }

    // Generate pairwise masks if enabled
    if (saConfig.pairwiseMasking) {
      await this.generatePairwiseMasks(participantIds);
    }

    return shares;
  }

  /**
   * Generate secret share for a participant
   */
  private generateSecretShare(participantId: string, totalShares: number): Uint8Array {
    // Simplified secret sharing - real implementation would use Shamir's
    const share = new Uint8Array(32);
    crypto.getRandomValues(share);
    return share;
  }

  /**
   * Generate pairwise masks for secure aggregation
   */
  private async generatePairwiseMasks(participantIds: string[]): Promise<void> {
    for (let i = 0; i < participantIds.length; i++) {
      const masks: PairwiseMask[] = [];
      for (let j = i + 1; j < participantIds.length; j++) {
        // Generate random mask (simplified - real implementation would use DH key exchange)
        const mask: PairwiseMask = {
          source: participantIds[i],
          target: participantIds[j],
          masks: new Map(),
        };
        masks.push(mask);
      }
      this.pairwiseMasks.set(participantIds[i], masks);
    }
  }

  /**
   * Apply secure aggregation masks to an update
   */
  applySecureMasks(
    update: ModelUpdate,
    participantMasks: Map<string, Float32Array>
  ): ModelUpdate {
    const maskedDeltas = new Map<string, Float32Array>();

    for (const [layerName, delta] of update.deltas) {
      const mask = participantMasks.get(layerName);
      const masked = new Float32Array(delta.length);

      for (let i = 0; i < delta.length; i++) {
        masked[i] = delta[i] + (mask ? mask[i] : 0);
      }

      maskedDeltas.set(layerName, masked);
    }

    return {
      ...update,
      deltas: maskedDeltas,
    };
  }

  /**
   * Remove secure aggregation masks after aggregation
   */
  removeSecureMasks(
    aggregatedWeights: Map<string, Float32Array>,
    allMasks: Map<string, Float32Array>[]
  ): Map<string, Float32Array> {
    const result = new Map<string, Float32Array>();

    for (const [layerName, weights] of aggregatedWeights) {
      const unmasked = new Float32Array(weights.length);

      // Sum of all masks should cancel out
      for (let i = 0; i < weights.length; i++) {
        let maskSum = 0;
        for (const masks of allMasks) {
          const mask = masks.get(layerName);
          if (mask) {
            maskSum += mask[i];
          }
        }
        unmasked[i] = weights[i] - maskSum;
      }

      result.set(layerName, unmasked);
    }

    return result;
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Match weights for FedMA (simplified version)
   */
  private matchWeights(delta: Float32Array, global: Float32Array): Float32Array {
    // Simplified matching - just return delta as-is
    // Full implementation would use Hungarian algorithm for neuron matching
    return delta;
  }

  /**
   * Compute weighted median
   */
  private computeWeightedMedian(values: Array<{ value: number; weight: number }>): number {
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0].value;

    // Sort by value
    values.sort((a, b) => a.value - b.value);

    // Compute total weight
    const totalWeight = values.reduce((sum, v) => sum + v.weight, 0);
    const halfWeight = totalWeight / 2;

    // Find weighted median
    let cumWeight = 0;
    for (let i = 0; i < values.length; i++) {
      cumWeight += values[i].weight;
      if (cumWeight >= halfWeight) {
        return values[i].value;
      }
    }

    return values[values.length - 1].value;
  }

  /**
   * Compute distance of an update from mean of all updates
   */
  private computeUpdateDistance(update: ModelUpdate, allUpdates: ModelUpdate[]): number {
    // Compute mean delta
    const meanDeltas = new Map<string, Float32Array>();

    for (const layerName of update.deltas.keys()) {
      const deltas: Float32Array[] = [];
      for (const u of allUpdates) {
        const d = u.deltas.get(layerName);
        if (d) deltas.push(d);
      }

      if (deltas.length > 0) {
        const mean = new Float32Array(deltas[0].length);
        for (const d of deltas) {
          for (let i = 0; i < d.length; i++) {
            mean[i] += d[i] / deltas.length;
          }
        }
        meanDeltas.set(layerName, mean);
      }
    }

    // Compute L2 distance from mean
    let distance = 0;
    for (const [layerName, delta] of update.deltas) {
      const mean = meanDeltas.get(layerName);
      if (!mean) continue;

      for (let i = 0; i < delta.length; i++) {
        const diff = delta[i] - mean[i];
        distance += diff * diff;
      }
    }

    return Math.sqrt(distance);
  }

  /**
   * Compute pairwise distance between two updates
   */
  private computePairwiseDistance(u1: ModelUpdate, u2: ModelUpdate): number {
    let distance = 0;

    for (const [layerName, delta1] of u1.deltas) {
      const delta2 = u2.deltas.get(layerName);
      if (!delta2) continue;

      for (let i = 0; i < delta1.length; i++) {
        const diff = delta1[i] - delta2[i];
        distance += diff * diff;
      }
    }

    return Math.sqrt(distance);
  }

  /**
   * Compute weight norm for aggregated model
   */
  private computeWeightNorm(weights: Map<string, Float32Array>): number {
    let norm = 0;
    for (const layerWeights of weights.values()) {
      for (let i = 0; i < layerWeights.length; i++) {
        norm += layerWeights[i] * layerWeights[i];
      }
    }
    return Math.sqrt(norm);
  }

  /**
   * Compute variance of updates
   */
  private computeUpdateVariance(updates: ModelUpdate[]): number {
    if (updates.length < 2) return 0;

    // Compute mean gradient norm
    const norms = updates.map((u) => this.computeGradientNorm(u));
    const meanNorm = norms.reduce((a, b) => a + b, 0) / norms.length;

    // Compute variance
    const variance = norms.reduce((sum, n) => sum + (n - meanNorm) ** 2, 0) / norms.length;

    return variance;
  }

  /**
   * Compute checksum for weights
   */
  private computeChecksum(weights: Map<string, Float32Array>): string {
    // Simple checksum based on sum and count
    let sum = 0;
    let count = 0;

    for (const layerWeights of weights.values()) {
      for (let i = 0; i < layerWeights.length; i++) {
        sum += layerWeights[i];
        count++;
      }
    }

    return `${count}:${sum.toFixed(6)}`;
  }

  /**
   * Increment model version string
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.');
    if (parts.length >= 3) {
      parts[2] = String(parseInt(parts[2]) + 1);
      return parts.join('.');
    }
    return `${version}.1`;
  }

  // ============================================
  // Configuration
  // ============================================

  /**
   * Update aggregator configuration
   */
  updateConfig(config: Partial<GradientAggregatorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): GradientAggregatorConfig {
    return { ...this.config };
  }

  /**
   * Reset aggregator state
   */
  reset(): void {
    this.secretShares.clear();
    this.pairwiseMasks.clear();

    const dpConfig = this.config.differentialPrivacy ?? FL_DEFAULT_DP_CONFIG;
    this.privacyBudget = {
      totalEpsilon: dpConfig.totalBudget ?? dpConfig.epsilon * 100,
      totalDelta: dpConfig.delta * 100,
      consumedEpsilon: 0,
      consumedDelta: 0,
      remainingEpsilon: dpConfig.totalBudget ?? dpConfig.epsilon * 100,
      remainingDelta: dpConfig.delta * 100,
      epsilonHistory: [],
      exhausted: false,
      estimatedRoundsRemaining: 100,
    };
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new gradient aggregator
 */
export function createGradientAggregator(
  config?: Partial<GradientAggregatorConfig>
): GradientAggregator {
  return new GradientAggregator(config);
}
