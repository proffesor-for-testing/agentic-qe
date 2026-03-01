/**
 * Agentic QE v3 - Experience Replay Buffer
 *
 * Stores and samples experiences for neural network training.
 */

import type { RLExperience } from '../interfaces';
import { secureRandom, secureRandomInt } from '../../../shared/utils/crypto-random.js';

// ============================================================================
// Replay Buffer
// ============================================================================

export interface PrioritizedExperience extends RLExperience {
  priority: number;
  index: number;
}

export class ReplayBuffer {
  private buffer: RLExperience[] = [];
  private maxSize: number;
  private priorities: Float32Array | null = null;
  private usePrioritized: boolean;
  private alpha: number = 0.6; // Priority exponent
  private beta: number = 0.4; // Importance sampling exponent
  private betaIncrement: number = 0.001;
  private epsilon: number = 1e-6; // Small constant to ensure non-zero priority

  constructor(maxSize: number, usePrioritized: boolean = false) {
    this.maxSize = maxSize;
    this.usePrioritized = usePrioritized;

    if (usePrioritized) {
      this.priorities = new Float32Array(maxSize);
      this.priorities.fill(1.0); // Initialize with max priority
    }
  }

  /**
   * Add experience to buffer
   */
  add(experience: RLExperience): void {
    if (this.buffer.length >= this.maxSize) {
      // Remove oldest experience
      this.buffer.shift();
      if (this.priorities) {
        // Shift priorities
        this.priorities.set(this.priorities.slice(1));
        this.priorities[this.maxSize - 1] = 1.0;
      }
    }

    this.buffer.push(experience);
  }

  /**
   * Add multiple experiences
   */
  addBatch(experiences: RLExperience[]): void {
    for (const exp of experiences) {
      this.add(exp);
    }
  }

  /**
   * Sample random batch from buffer
   */
  sample(batchSize: number): RLExperience[] {
    if (this.buffer.length === 0) return [];

    if (this.usePrioritized && this.priorities) {
      return this.samplePrioritized(batchSize);
    }

    // Uniform sampling
    const sampled: RLExperience[] = [];
    const indices = new Set<number>();

    while (indices.size < Math.min(batchSize, this.buffer.length)) {
      indices.add(secureRandomInt(0, this.buffer.length));
    }

    for (const index of indices) {
      sampled.push(this.buffer[index]);
    }

    return sampled;
  }

  /**
   * Sample with prioritization (PER - Proportional Prioritization)
   */
  private samplePrioritized(batchSize: number): RLExperience[] {
    const probs = this.getPriorities();
    const indices: number[] = [];
    const sampled: RLExperience[] = [];

    // Sample indices based on probabilities
    for (let i = 0; i < Math.min(batchSize, this.buffer.length); i++) {
      const rand = secureRandom() * probs.reduce((a, b) => a + b, 0);
      let cumProb = 0;

      for (let j = 0; j < probs.length; j++) {
        cumProb += probs[j];
        if (rand <= cumProb) {
          indices.push(j);
          break;
        }
      }
    }

    for (const index of indices) {
      if (index < this.buffer.length) {
        sampled.push(this.buffer[index]);
      }
    }

    // Increment beta
    this.beta = Math.min(1, this.beta + this.betaIncrement);

    return sampled;
  }

  /**
   * Get priority probabilities
   */
  private getPriorities(): number[] {
    if (!this.priorities) return [];

    const probs: number[] = [];
    const sum = this.priorities.reduce((a, b) => a + Math.pow(b, this.alpha), 0);

    for (let i = 0; i < this.buffer.length; i++) {
      probs.push(Math.pow(this.priorities[i], this.alpha) / sum);
    }

    return probs;
  }

  /**
   * Update priorities for experiences (for PER)
   */
  updatePriorities(indices: number[], tdErrors: number[]): void {
    if (!this.priorities || !this.usePrioritized) return;

    for (let i = 0; i < indices.length; i++) {
      const index = indices[i];
      const tdError = tdErrors[i];
      if (index < this.priorities.length) {
        this.priorities[index] = Math.abs(tdError) + this.epsilon;
      }
    }
  }

  /**
   * Get importance sampling weights for sampled experiences
   */
  getImportanceWeights(indices: number[]): number[] {
    if (!this.usePrioritized || !this.priorities) {
      return new Array(indices.length).fill(1);
    }

    const weights: number[] = [];
    const probs = this.getPriorities();
    const maxWeight = this.getMaxImportanceWeight();

    for (const index of indices) {
      if (index < probs.length && probs[index] > 0) {
        const weight = Math.pow(this.buffer.length * probs[index], -this.beta);
        weights.push(weight / maxWeight);
      } else {
        weights.push(1);
      }
    }

    return weights;
  }

  /**
   * Get maximum importance sampling weight for normalization
   */
  private getMaxImportanceWeight(): number {
    if (!this.usePrioritized || !this.priorities) return 1;

    const probs = this.getPriorities();
    let maxWeight = 0;

    for (const prob of probs) {
      if (prob > 0) {
        const weight = Math.pow(this.buffer.length * prob, -this.beta);
        maxWeight = Math.max(maxWeight, weight);
      }
    }

    return maxWeight;
  }

  /**
   * Get buffer size
   */
  size(): number {
    return this.buffer.length;
  }

  /**
   * Check if buffer is ready for sampling
   */
  isReady(minSize: number): boolean {
    return this.buffer.length >= minSize;
  }

  /**
   * Clear buffer
   */
  clear(): void {
    this.buffer = [];
    if (this.priorities) {
      this.priorities.fill(1.0);
    }
  }

  /**
   * Get all experiences
   */
  getAll(): RLExperience[] {
    return [...this.buffer];
  }

  /**
   * Get buffer statistics
   */
  getStats(): { size: number; maxSize: number; utilization: number; usePrioritized: boolean } {
    return {
      size: this.buffer.length,
      maxSize: this.maxSize,
      utilization: this.buffer.length / this.maxSize,
      usePrioritized: this.usePrioritized,
    };
  }
}

// ============================================================================
// Rollout Buffer (for PPO/A2C)
// ============================================================================

export interface RolloutExperience {
  state: number[];
  action: number;
  reward: number;
  nextState: number[];
  done: boolean;
  value: number;
  logProb: number;
  advantage?: number;
  return?: number;
}

export class RolloutBuffer {
  private buffer: RolloutExperience[] = [];
  private maxSize: number;

  constructor(maxSize: number = 2048) {
    this.maxSize = maxSize;
  }

  /**
   * Add experience to rollout buffer
   */
  add(exp: RolloutExperience): void {
    this.buffer.push(exp);

    if (this.buffer.length >= this.maxSize) {
      throw new Error('Rollout buffer full - should be cleared');
    }
  }

  /**
   * Get all experiences
   */
  getAll(): RolloutExperience[] {
    return [...this.buffer];
  }

  /**
   * Compute advantages and returns using GAE
   */
  computeGAE(gamma: number, lambda: number, values: Float32Array): void {
    const advantages: number[] = [];
    const returns: number[] = [];
    let lastAdvantage = 0;
    let lastReturn = 0;

    // Compute in reverse order
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const exp = this.buffer[i];
      const nextValue = i + 1 < this.buffer.length ? values[i + 1] : 0;

      // TD error
      const delta = exp.reward + gamma * nextValue * (exp.done ? 0 : 1) - values[i];

      // GAE
      lastAdvantage = delta + gamma * lambda * (exp.done ? 0 : 1) * lastAdvantage;
      advantages.unshift(lastAdvantage);

      // Return
      lastReturn = exp.reward + gamma * lastReturn * (exp.done ? 0 : 1);
      returns.unshift(lastReturn);
    }

    // Update buffer
    for (let i = 0; i < this.buffer.length; i++) {
      this.buffer[i].advantage = advantages[i];
      this.buffer[i].return = returns[i];
    }
  }

  /**
   * Get mini-batch from buffer
   */
  getMiniBatch(batchSize: number, startIndex: number): RolloutExperience[] {
    const endIndex = Math.min(startIndex + batchSize, this.buffer.length);
    return this.buffer.slice(startIndex, endIndex);
  }

  /**
   * Clear buffer
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * Get buffer size
   */
  size(): number {
    return this.buffer.length;
  }

  /**
   * Get number of mini-batches
   */
  getNumBatches(batchSize: number): number {
    return Math.ceil(this.buffer.length / batchSize);
  }
}
