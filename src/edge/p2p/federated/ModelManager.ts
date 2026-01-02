/**
 * Model Manager for Federated Learning
 *
 * Tracks local model state, applies aggregated updates, handles model
 * checkpointing, rollback on divergence, and provides gradient computation helpers.
 *
 * @module edge/p2p/federated/ModelManager
 * @version 1.0.0
 */

import type {
  ModelWeights,
  ModelArchitecture,
  ModelLayer,
  ModelUpdate,
  ModelCheckpoint,
  LocalTrainingMetrics,
  OptimizerConfig,
  CompressionConfig,
  CompressionInfo,
  TrainingMetrics,
  ConvergenceStatus,
} from './types';
import {
  UpdateType,
  FederatedError,
  FederatedErrorCode,
  DEFAULT_LOCAL_EPOCHS,
  DEFAULT_BATCH_SIZE,
  DEFAULT_LEARNING_RATE,
  DEFAULT_CHECKPOINT_INTERVAL,
  MAX_MODEL_SIZE,
} from './types';

// ============================================
// Types
// ============================================

/**
 * Model manager configuration
 */
export interface ModelManagerConfig {
  /** Model architecture definition */
  architecture: ModelArchitecture;

  /** Optimizer configuration */
  optimizer?: OptimizerConfig;

  /** Checkpoint interval (every N rounds) */
  checkpointInterval?: number;

  /** Maximum checkpoints to keep */
  maxCheckpoints?: number;

  /** Compression configuration */
  compression?: CompressionConfig;

  /** Enable automatic rollback on divergence */
  autoRollback?: boolean;

  /** Divergence threshold (loss increase ratio) */
  divergenceThreshold?: number;
}

/**
 * Local training configuration
 */
export interface LocalTrainingOptions {
  /** Number of epochs */
  epochs: number;

  /** Batch size */
  batchSize: number;

  /** Learning rate */
  learningRate: number;

  /** Update type to generate */
  updateType: UpdateType;

  /** Sample data (for gradient computation) */
  data?: Float32Array[];

  /** Labels (for gradient computation) */
  labels?: Float32Array[];

  /** Custom gradient function */
  gradientFn?: (weights: ModelWeights, batch: Float32Array[], labels: Float32Array[]) => Map<string, Float32Array>;
}

/**
 * Optimizer state for momentum-based optimizers
 */
interface OptimizerState {
  /** First moment estimates (for Adam) */
  m: Map<string, Float32Array>;

  /** Second moment estimates (for Adam) */
  v: Map<string, Float32Array>;

  /** Training step count */
  t: number;
}

// ============================================
// ModelManager Class
// ============================================

/**
 * Manages local model state for federated learning
 *
 * @example
 * ```typescript
 * const manager = new ModelManager({
 *   architecture: modelArchitecture,
 *   optimizer: { type: 'adam', learningRate: 0.001 },
 *   checkpointInterval: 10,
 * });
 *
 * // Initialize with weights
 * manager.setWeights(globalModel);
 *
 * // Perform local training
 * const update = await manager.trainLocal({
 *   epochs: 5,
 *   batchSize: 32,
 *   learningRate: 0.01,
 *   updateType: UpdateType.GRADIENTS,
 *   data: trainingData,
 *   labels: trainingLabels,
 * });
 *
 * // Apply aggregated update
 * manager.applyUpdate(aggregatedWeights);
 *
 * // Create checkpoint
 * const checkpoint = manager.checkpoint('session-1', 10, trainingMetrics);
 * ```
 */
export class ModelManager {
  private config: ModelManagerConfig;
  private weights: ModelWeights | null = null;
  private previousWeights: ModelWeights | null = null;
  private optimizerState: OptimizerState;
  private checkpoints: Map<string, ModelCheckpoint> = new Map();
  private trainingHistory: LocalTrainingMetrics[] = [];
  private roundNumber = 0;

  constructor(config: ModelManagerConfig) {
    this.config = {
      ...config,
      checkpointInterval: config.checkpointInterval ?? DEFAULT_CHECKPOINT_INTERVAL,
      maxCheckpoints: config.maxCheckpoints ?? 5,
      autoRollback: config.autoRollback ?? true,
      divergenceThreshold: config.divergenceThreshold ?? 2.0,
    };

    // Initialize optimizer state
    this.optimizerState = {
      m: new Map(),
      v: new Map(),
      t: 0,
    };

    // Initialize optimizer state for each layer
    for (const layer of config.architecture.layers) {
      if (layer.trainable) {
        const size = layer.shape.reduce((a, b) => a * b, 1);
        this.optimizerState.m.set(layer.name, new Float32Array(size));
        this.optimizerState.v.set(layer.name, new Float32Array(size));
      }
    }
  }

  // ============================================
  // Weight Management
  // ============================================

  /**
   * Set model weights
   */
  setWeights(weights: ModelWeights): void {
    this.validateWeights(weights);
    this.previousWeights = this.weights;
    this.weights = this.cloneWeights(weights);
  }

  /**
   * Get current model weights
   */
  getWeights(): ModelWeights | null {
    return this.weights ? this.cloneWeights(this.weights) : null;
  }

  /**
   * Get previous model weights
   */
  getPreviousWeights(): ModelWeights | null {
    return this.previousWeights ? this.cloneWeights(this.previousWeights) : null;
  }

  /**
   * Validate weights against architecture
   */
  private validateWeights(weights: ModelWeights): void {
    for (const layer of this.config.architecture.layers) {
      const layerWeights = weights.weights.get(layer.name);
      if (!layerWeights && layer.trainable) {
        throw new FederatedError(
          `Missing weights for layer: ${layer.name}`,
          FederatedErrorCode.INVALID_UPDATE
        );
      }

      if (layerWeights) {
        const expectedSize = layer.shape.reduce((a, b) => a * b, 1);
        if (layerWeights.length !== expectedSize) {
          throw new FederatedError(
            `Weight size mismatch for ${layer.name}: ${layerWeights.length} vs ${expectedSize}`,
            FederatedErrorCode.INVALID_UPDATE
          );
        }
      }
    }

    if (weights.totalBytes > MAX_MODEL_SIZE) {
      throw new FederatedError(
        `Model too large: ${weights.totalBytes} > ${MAX_MODEL_SIZE}`,
        FederatedErrorCode.MODEL_TOO_LARGE
      );
    }
  }

  /**
   * Clone weights object
   */
  private cloneWeights(weights: ModelWeights): ModelWeights {
    const clonedWeights = new Map<string, Float32Array>();
    for (const [name, data] of weights.weights) {
      clonedWeights.set(name, new Float32Array(data));
    }

    const clonedShapes = new Map<string, number[]>();
    for (const [name, shape] of weights.shapes) {
      clonedShapes.set(name, [...shape]);
    }

    return {
      ...weights,
      weights: clonedWeights,
      shapes: clonedShapes,
      biases: weights.biases ? this.cloneBiases(weights.biases) : undefined,
    };
  }

  /**
   * Clone biases map
   */
  private cloneBiases(biases: Map<string, Float32Array>): Map<string, Float32Array> {
    const cloned = new Map<string, Float32Array>();
    for (const [name, data] of biases) {
      cloned.set(name, new Float32Array(data));
    }
    return cloned;
  }

  // ============================================
  // Local Training
  // ============================================

  /**
   * Perform local training and generate model update
   */
  async trainLocal(options: LocalTrainingOptions): Promise<ModelUpdate> {
    if (!this.weights) {
      throw new FederatedError(
        'No model weights set',
        FederatedErrorCode.INVALID_UPDATE
      );
    }

    const startTime = Date.now();
    const lossHistory: number[] = [];
    const gradientNorms: number[] = [];

    // Clone weights for training
    const trainableWeights = this.cloneWeights(this.weights);
    let sampleCount = 0;

    // Training loop
    for (let epoch = 0; epoch < options.epochs; epoch++) {
      // Compute gradients for this epoch
      const gradients = this.computeGradients(
        trainableWeights,
        options.data,
        options.labels,
        options.gradientFn
      );

      // Track gradient norms
      const norm = this.computeGradientNorm(gradients);
      gradientNorms.push(norm);

      // Apply gradients with optimizer
      this.applyGradients(trainableWeights, gradients, options.learningRate);

      // Compute loss (simulated)
      const loss = this.computeLoss(trainableWeights, options.data, options.labels);
      lossHistory.push(loss);

      // Count samples processed
      if (options.data) {
        sampleCount += options.data.length;
      }
    }

    // Compute deltas (difference from original weights)
    const deltas = this.computeDeltas(this.weights, trainableWeights);

    // Apply compression if configured
    let compressedDeltas = deltas;
    let compressionInfo: CompressionInfo | undefined;

    if (this.config.compression?.enabled) {
      const compressed = this.compressDeltas(deltas);
      compressedDeltas = compressed.deltas;
      compressionInfo = compressed.info;
    }

    // Build training metrics
    const metrics: LocalTrainingMetrics = {
      lossHistory,
      finalLoss: lossHistory[lossHistory.length - 1] ?? 0,
      accuracy: undefined, // Would need actual validation
      trainingTime: Date.now() - startTime,
      gradientSteps: options.epochs * (options.data?.length ?? 1),
      gradientNorms,
    };

    this.trainingHistory.push(metrics);

    // Generate update
    const update: ModelUpdate = {
      updateId: `update-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      participantId: '', // Will be set by caller
      roundId: '', // Will be set by caller
      updateType: options.updateType,
      deltas: compressedDeltas,
      sampleCount: Math.max(sampleCount, 1),
      localLoss: metrics.finalLoss,
      localEpochs: options.epochs,
      metrics,
      compressed: this.config.compression?.enabled,
      compressionInfo,
      timestamp: Date.now(),
    };

    return update;
  }

  /**
   * Compute gradients
   */
  private computeGradients(
    weights: ModelWeights,
    data?: Float32Array[],
    labels?: Float32Array[],
    gradientFn?: (weights: ModelWeights, batch: Float32Array[], labels: Float32Array[]) => Map<string, Float32Array>
  ): Map<string, Float32Array> {
    // Use custom gradient function if provided
    if (gradientFn && data && labels) {
      return gradientFn(weights, data, labels);
    }

    // Otherwise, generate synthetic gradients for demonstration
    // In production, this would integrate with actual ML framework
    const gradients = new Map<string, Float32Array>();

    for (const layer of this.config.architecture.layers) {
      if (!layer.trainable) continue;

      const layerWeights = weights.weights.get(layer.name);
      if (!layerWeights) continue;

      // Generate random gradients (for demonstration)
      // Real implementation would compute actual gradients
      const grad = new Float32Array(layerWeights.length);
      for (let i = 0; i < grad.length; i++) {
        // Simulate gradient with small random values
        grad[i] = (Math.random() - 0.5) * 0.01;
      }

      gradients.set(layer.name, grad);
    }

    return gradients;
  }

  /**
   * Apply gradients to weights using configured optimizer
   */
  private applyGradients(
    weights: ModelWeights,
    gradients: Map<string, Float32Array>,
    learningRate: number
  ): void {
    const optimizer = this.config.optimizer ?? { type: 'sgd' as const, learningRate };
    this.optimizerState.t++;

    for (const [layerName, grad] of gradients) {
      const layerWeights = weights.weights.get(layerName);
      if (!layerWeights) continue;

      switch (optimizer.type) {
        case 'sgd':
          this.applySGD(layerWeights, grad, learningRate, optimizer.momentum);
          break;

        case 'adam':
        case 'adamw':
          this.applyAdam(
            layerName,
            layerWeights,
            grad,
            learningRate,
            optimizer.beta1 ?? 0.9,
            optimizer.beta2 ?? 0.999,
            optimizer.weightDecay ?? 0
          );
          break;

        case 'rmsprop':
          this.applyRMSprop(
            layerName,
            layerWeights,
            grad,
            learningRate,
            optimizer.beta1 ?? 0.9
          );
          break;
      }
    }
  }

  /**
   * Apply SGD update
   */
  private applySGD(
    weights: Float32Array,
    gradients: Float32Array,
    lr: number,
    momentum?: number
  ): void {
    for (let i = 0; i < weights.length; i++) {
      weights[i] -= lr * gradients[i];
    }
  }

  /**
   * Apply Adam update
   */
  private applyAdam(
    layerName: string,
    weights: Float32Array,
    gradients: Float32Array,
    lr: number,
    beta1: number,
    beta2: number,
    weightDecay: number
  ): void {
    const m = this.optimizerState.m.get(layerName)!;
    const v = this.optimizerState.v.get(layerName)!;
    const t = this.optimizerState.t;

    const eps = 1e-8;
    const biasCorrection1 = 1 - Math.pow(beta1, t);
    const biasCorrection2 = 1 - Math.pow(beta2, t);

    for (let i = 0; i < weights.length; i++) {
      // Update biased first moment estimate
      m[i] = beta1 * m[i] + (1 - beta1) * gradients[i];

      // Update biased second moment estimate
      v[i] = beta2 * v[i] + (1 - beta2) * gradients[i] * gradients[i];

      // Compute bias-corrected estimates
      const mHat = m[i] / biasCorrection1;
      const vHat = v[i] / biasCorrection2;

      // Update weights
      const update = lr * mHat / (Math.sqrt(vHat) + eps);
      weights[i] -= update;

      // Weight decay (for AdamW)
      if (weightDecay > 0) {
        weights[i] -= lr * weightDecay * weights[i];
      }
    }
  }

  /**
   * Apply RMSprop update
   */
  private applyRMSprop(
    layerName: string,
    weights: Float32Array,
    gradients: Float32Array,
    lr: number,
    rho: number
  ): void {
    const v = this.optimizerState.v.get(layerName)!;
    const eps = 1e-8;

    for (let i = 0; i < weights.length; i++) {
      // Update running average of squared gradients
      v[i] = rho * v[i] + (1 - rho) * gradients[i] * gradients[i];

      // Update weights
      weights[i] -= lr * gradients[i] / (Math.sqrt(v[i]) + eps);
    }
  }

  /**
   * Compute loss (placeholder implementation)
   */
  private computeLoss(
    weights: ModelWeights,
    data?: Float32Array[],
    labels?: Float32Array[]
  ): number {
    // Placeholder: compute simple L2 norm of weights as proxy for loss
    // Real implementation would compute actual loss on data
    let sum = 0;
    for (const layerWeights of weights.weights.values()) {
      for (let i = 0; i < layerWeights.length; i++) {
        sum += layerWeights[i] * layerWeights[i];
      }
    }
    return Math.sqrt(sum) / 1000; // Normalize
  }

  /**
   * Compute gradient norm
   */
  private computeGradientNorm(gradients: Map<string, Float32Array>): number {
    let sum = 0;
    for (const grad of gradients.values()) {
      for (let i = 0; i < grad.length; i++) {
        sum += grad[i] * grad[i];
      }
    }
    return Math.sqrt(sum);
  }

  /**
   * Compute deltas between old and new weights
   */
  private computeDeltas(
    oldWeights: ModelWeights,
    newWeights: ModelWeights
  ): Map<string, Float32Array> {
    const deltas = new Map<string, Float32Array>();

    for (const [layerName, newData] of newWeights.weights) {
      const oldData = oldWeights.weights.get(layerName);
      if (!oldData) continue;

      const delta = new Float32Array(newData.length);
      for (let i = 0; i < newData.length; i++) {
        delta[i] = newData[i] - oldData[i];
      }

      deltas.set(layerName, delta);
    }

    return deltas;
  }

  // ============================================
  // Update Application
  // ============================================

  /**
   * Apply aggregated model weights
   */
  applyUpdate(newWeights: ModelWeights): void {
    if (!this.weights) {
      this.setWeights(newWeights);
      return;
    }

    // Check for divergence
    if (this.config.autoRollback && this.checkDivergence(newWeights)) {
      console.warn('Model divergence detected, consider rollback');
    }

    // Save previous weights before update
    this.previousWeights = this.cloneWeights(this.weights);

    // Apply new weights
    this.weights = this.cloneWeights(newWeights);
    this.roundNumber++;

    // Auto-checkpoint if interval reached
    if (this.roundNumber % this.config.checkpointInterval! === 0) {
      // Would need session ID and metrics from caller
    }
  }

  /**
   * Apply delta update to current weights
   */
  applyDeltaUpdate(deltas: Map<string, Float32Array>): void {
    if (!this.weights) {
      throw new FederatedError(
        'No model weights set',
        FederatedErrorCode.INVALID_UPDATE
      );
    }

    this.previousWeights = this.cloneWeights(this.weights);

    for (const [layerName, delta] of deltas) {
      const layerWeights = this.weights.weights.get(layerName);
      if (!layerWeights) continue;

      for (let i = 0; i < layerWeights.length; i++) {
        layerWeights[i] += delta[i];
      }
    }

    // Update checksum and timestamp
    this.weights.checksum = this.computeChecksum(this.weights.weights);
    this.weights.timestamp = Date.now();
    this.weights.version = this.incrementVersion(this.weights.version);

    this.roundNumber++;
  }

  /**
   * Check if model is diverging
   */
  private checkDivergence(newWeights: ModelWeights): boolean {
    if (this.trainingHistory.length < 2) return false;

    const recentLosses = this.trainingHistory.slice(-5).map((m) => m.finalLoss);
    const avgRecentLoss = recentLosses.reduce((a, b) => a + b, 0) / recentLosses.length;
    const latestLoss = this.trainingHistory[this.trainingHistory.length - 1].finalLoss;

    return latestLoss > avgRecentLoss * this.config.divergenceThreshold!;
  }

  // ============================================
  // Checkpointing
  // ============================================

  /**
   * Create a checkpoint of current model state
   */
  checkpoint(
    sessionId: string,
    roundNumber: number,
    metrics: TrainingMetrics
  ): ModelCheckpoint {
    if (!this.weights) {
      throw new FederatedError(
        'No model weights to checkpoint',
        FederatedErrorCode.CHECKPOINT_ERROR
      );
    }

    const checkpointId = `checkpoint-${sessionId}-${roundNumber}`;

    const checkpoint: ModelCheckpoint = {
      checkpointId,
      sessionId,
      roundNumber,
      weights: this.cloneWeights(this.weights),
      optimizerState: this.serializeOptimizerState(),
      metrics,
      timestamp: Date.now(),
      size: this.weights.totalBytes,
    };

    // Store checkpoint
    this.checkpoints.set(checkpointId, checkpoint);

    // Prune old checkpoints
    this.pruneCheckpoints();

    return checkpoint;
  }

  /**
   * Restore from checkpoint
   */
  restoreCheckpoint(checkpointId: string): void {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      throw new FederatedError(
        `Checkpoint not found: ${checkpointId}`,
        FederatedErrorCode.CHECKPOINT_ERROR
      );
    }

    this.weights = this.cloneWeights(checkpoint.weights);
    this.previousWeights = null;

    if (checkpoint.optimizerState) {
      this.deserializeOptimizerState(checkpoint.optimizerState);
    }

    this.roundNumber = checkpoint.roundNumber;
  }

  /**
   * Rollback to previous weights
   */
  rollback(): boolean {
    if (!this.previousWeights) {
      return false;
    }

    this.weights = this.cloneWeights(this.previousWeights);
    this.previousWeights = null;
    this.roundNumber = Math.max(0, this.roundNumber - 1);

    return true;
  }

  /**
   * Get available checkpoints
   */
  getCheckpoints(): ModelCheckpoint[] {
    return Array.from(this.checkpoints.values()).sort(
      (a, b) => b.roundNumber - a.roundNumber
    );
  }

  /**
   * Delete a checkpoint
   */
  deleteCheckpoint(checkpointId: string): boolean {
    return this.checkpoints.delete(checkpointId);
  }

  /**
   * Prune old checkpoints to keep within limit
   */
  private pruneCheckpoints(): void {
    const maxCheckpoints = this.config.maxCheckpoints ?? 5;

    if (this.checkpoints.size <= maxCheckpoints) return;

    const sorted = Array.from(this.checkpoints.entries()).sort(
      (a, b) => b[1].roundNumber - a[1].roundNumber
    );

    for (let i = maxCheckpoints; i < sorted.length; i++) {
      this.checkpoints.delete(sorted[i][0]);
    }
  }

  /**
   * Serialize optimizer state for checkpointing
   */
  private serializeOptimizerState(): Record<string, Float32Array> {
    const state: Record<string, Float32Array> = {};

    for (const [name, data] of this.optimizerState.m) {
      state[`m_${name}`] = new Float32Array(data);
    }

    for (const [name, data] of this.optimizerState.v) {
      state[`v_${name}`] = new Float32Array(data);
    }

    return state;
  }

  /**
   * Deserialize optimizer state from checkpoint
   */
  private deserializeOptimizerState(state: Record<string, Float32Array>): void {
    for (const [key, data] of Object.entries(state)) {
      if (key.startsWith('m_')) {
        const name = key.slice(2);
        this.optimizerState.m.set(name, new Float32Array(data));
      } else if (key.startsWith('v_')) {
        const name = key.slice(2);
        this.optimizerState.v.set(name, new Float32Array(data));
      }
    }
  }

  // ============================================
  // Compression
  // ============================================

  /**
   * Compress deltas according to configuration
   */
  private compressDeltas(
    deltas: Map<string, Float32Array>
  ): { deltas: Map<string, Float32Array>; info: CompressionInfo } {
    const compression = this.config.compression!;
    let originalSize = 0;
    let compressedSize = 0;
    const compressedDeltas = new Map<string, Float32Array>();
    const sparseIndices = new Map<string, Uint32Array>();

    for (const [layerName, delta] of deltas) {
      originalSize += delta.byteLength;

      switch (compression.type) {
        case 'quantization':
          const quantized = this.quantize(delta, compression.quantizationBits ?? 8);
          compressedDeltas.set(layerName, quantized);
          compressedSize += quantized.byteLength;
          break;

        case 'sparsification':
          const { sparse, indices } = this.sparsify(delta, compression.sparsificationRatio ?? 0.1);
          compressedDeltas.set(layerName, sparse);
          sparseIndices.set(layerName, indices);
          compressedSize += sparse.byteLength + indices.byteLength;
          break;

        case 'low_rank':
          // Low-rank approximation would require matrix operations
          // Simplified: just pass through
          compressedDeltas.set(layerName, delta);
          compressedSize += delta.byteLength;
          break;

        default:
          compressedDeltas.set(layerName, delta);
          compressedSize += delta.byteLength;
      }
    }

    return {
      deltas: compressedDeltas,
      info: {
        originalSize,
        compressedSize,
        compressionRatio: originalSize / compressedSize,
        compressionType: compression.type,
        sparseIndices: sparseIndices.size > 0 ? sparseIndices : undefined,
      },
    };
  }

  /**
   * Quantize values to specified bit depth
   */
  private quantize(data: Float32Array, bits: number): Float32Array {
    // Find min/max for quantization
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }

    const levels = (1 << bits) - 1;
    const range = max - min || 1;
    const scale = levels / range;

    // Quantize and dequantize
    const quantized = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const q = Math.round((data[i] - min) * scale);
      quantized[i] = (q / scale) + min;
    }

    return quantized;
  }

  /**
   * Sparsify by keeping top-k values
   */
  private sparsify(
    data: Float32Array,
    ratio: number
  ): { sparse: Float32Array; indices: Uint32Array } {
    const k = Math.max(1, Math.floor(data.length * ratio));

    // Find top-k indices by absolute value
    const indexed = Array.from(data).map((v, i) => ({ value: Math.abs(v), index: i }));
    indexed.sort((a, b) => b.value - a.value);

    const topK = indexed.slice(0, k);
    const indices = new Uint32Array(k);
    const sparse = new Float32Array(k);

    for (let i = 0; i < k; i++) {
      indices[i] = topK[i].index;
      sparse[i] = data[topK[i].index];
    }

    return { sparse, indices };
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Compute checksum for weights
   */
  private computeChecksum(weights: Map<string, Float32Array>): string {
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
   * Increment version string
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.');
    if (parts.length >= 3) {
      parts[2] = String(parseInt(parts[2]) + 1);
      return parts.join('.');
    }
    return `${version}.1`;
  }

  /**
   * Get model architecture
   */
  getArchitecture(): ModelArchitecture {
    return this.config.architecture;
  }

  /**
   * Get current round number
   */
  getRoundNumber(): number {
    return this.roundNumber;
  }

  /**
   * Get training history
   */
  getTrainingHistory(): LocalTrainingMetrics[] {
    return [...this.trainingHistory];
  }

  /**
   * Reset optimizer state
   */
  resetOptimizer(): void {
    for (const m of this.optimizerState.m.values()) {
      m.fill(0);
    }
    for (const v of this.optimizerState.v.values()) {
      v.fill(0);
    }
    this.optimizerState.t = 0;
  }

  /**
   * Clear all state
   */
  reset(): void {
    this.weights = null;
    this.previousWeights = null;
    this.checkpoints.clear();
    this.trainingHistory = [];
    this.roundNumber = 0;
    this.resetOptimizer();
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new model manager
 */
export function createModelManager(config: ModelManagerConfig): ModelManager {
  return new ModelManager(config);
}

/**
 * Create a simple model architecture definition
 */
export function createModelArchitecture(
  modelId: string,
  layers: Array<{
    name: string;
    type: string;
    shape: number[];
    trainable?: boolean;
  }>
): ModelArchitecture {
  const modelLayers: ModelLayer[] = layers.map((l) => ({
    name: l.name,
    type: l.type,
    shape: l.shape,
    parameterCount: l.shape.reduce((a, b) => a * b, 1),
    dtype: 'float32' as const,
    trainable: l.trainable ?? true,
  }));

  const totalParams = modelLayers.reduce((sum, l) => sum + l.parameterCount, 0);
  const trainableParams = modelLayers
    .filter((l) => l.trainable)
    .reduce((sum, l) => sum + l.parameterCount, 0);

  return {
    modelId,
    name: modelId,
    version: '1.0.0',
    layers: modelLayers,
    totalParameters: totalParams,
    trainableParameters: trainableParams,
    inputShape: layers[0]?.shape ?? [],
    outputShape: layers[layers.length - 1]?.shape ?? [],
  };
}
