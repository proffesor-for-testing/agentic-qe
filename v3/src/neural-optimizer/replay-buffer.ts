/**
 * Agentic QE v3 - Prioritized Experience Replay Buffer
 * ADR-034: RL-based swarm topology optimization
 *
 * Implements prioritized experience replay for stable RL training:
 * - Priority based on TD error (higher error = more learning potential)
 * - Proportional prioritization with importance sampling
 * - Circular buffer with configurable capacity
 */

import type { Experience, IReplayBuffer } from './types';

// ============================================================================
// Sum Tree for Efficient Priority Sampling
// ============================================================================

/**
 * Sum Tree data structure for O(log n) priority sampling
 *
 * A binary tree where:
 * - Leaves store priorities
 * - Internal nodes store sum of children
 * - Total sum at root enables proportional sampling
 */
class SumTree {
  /** Total capacity (number of leaves) */
  private readonly capacity: number;

  /** Tree array: size = 2 * capacity - 1 */
  private tree: number[];

  /** Current write position */
  private writeIdx: number = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    // Tree has 2*n - 1 nodes for n leaves
    this.tree = new Array(2 * capacity - 1).fill(0);
  }

  /**
   * Get total priority sum (root value)
   */
  get total(): number {
    return this.tree[0];
  }

  /**
   * Add priority value at next position
   */
  add(priority: number): number {
    const leafIdx = this.writeIdx;
    const treeIdx = this.capacity - 1 + leafIdx;

    this.update(treeIdx, priority);

    this.writeIdx = (this.writeIdx + 1) % this.capacity;
    return leafIdx;
  }

  /**
   * Update priority at tree index
   */
  update(treeIdx: number, priority: number): void {
    const change = priority - this.tree[treeIdx];
    this.tree[treeIdx] = priority;

    // Propagate change up to root
    let idx = treeIdx;
    while (idx > 0) {
      idx = Math.floor((idx - 1) / 2);
      this.tree[idx] += change;
    }
  }

  /**
   * Update priority at leaf index
   */
  updateLeaf(leafIdx: number, priority: number): void {
    const treeIdx = this.capacity - 1 + leafIdx;
    this.update(treeIdx, priority);
  }

  /**
   * Get leaf index and priority for a value in [0, total)
   */
  get(value: number): { leafIdx: number; priority: number } {
    let idx = 0;

    while (idx < this.capacity - 1) {
      const leftChild = 2 * idx + 1;
      const rightChild = leftChild + 1;

      if (value <= this.tree[leftChild]) {
        idx = leftChild;
      } else {
        value -= this.tree[leftChild];
        idx = rightChild;
      }
    }

    const leafIdx = idx - (this.capacity - 1);
    return {
      leafIdx,
      priority: this.tree[idx],
    };
  }

  /**
   * Get priority at leaf index
   */
  getPriority(leafIdx: number): number {
    const treeIdx = this.capacity - 1 + leafIdx;
    return this.tree[treeIdx];
  }

  /**
   * Get minimum non-zero priority across all leaves
   * Used for importance sampling weight normalization
   */
  getMinPriority(count: number): number {
    let minPriority = Infinity;
    const leafStart = this.capacity - 1;

    for (let i = 0; i < count; i++) {
      const priority = this.tree[leafStart + i];
      if (priority > 0 && priority < minPriority) {
        minPriority = priority;
      }
    }

    return minPriority === Infinity ? 1e-8 : minPriority;
  }

  /**
   * Clear all priorities
   */
  clear(): void {
    this.tree.fill(0);
    this.writeIdx = 0;
  }
}

// ============================================================================
// Prioritized Replay Buffer
// ============================================================================

/**
 * Prioritized Experience Replay Buffer
 *
 * Features:
 * - Priority based on TD error magnitude
 * - Proportional prioritization with sum tree
 * - Importance sampling weights for bias correction
 */
export class PrioritizedReplayBuffer implements IReplayBuffer {
  /** Experience storage */
  private buffer: (Experience | null)[];

  /** Sum tree for priority sampling */
  private sumTree: SumTree;

  /** Buffer capacity */
  private readonly capacity: number;

  /** Current number of experiences */
  private count: number = 0;

  /** Write position */
  private writeIdx: number = 0;

  /** Priority exponent (alpha): how much to use priorities */
  private readonly alpha: number;

  /** Importance sampling exponent (beta): bias correction */
  private beta: number;

  /** Beta annealing rate */
  private readonly betaAnnealing: number;

  /** Small constant to ensure non-zero priority */
  private readonly priorityEpsilon: number = 0.01;

  /** Maximum priority seen */
  private maxPriority: number = 1.0;

  constructor(
    capacity: number,
    options: {
      alpha?: number;
      beta?: number;
      betaAnnealing?: number;
    } = {}
  ) {
    this.capacity = capacity;
    this.buffer = new Array(capacity).fill(null);
    this.sumTree = new SumTree(capacity);
    this.alpha = options.alpha ?? 0.6;
    this.beta = options.beta ?? 0.4;
    this.betaAnnealing = options.betaAnnealing ?? 0.001;
  }

  /**
   * Get buffer length
   */
  get length(): number {
    return this.count;
  }

  /**
   * Add experience to buffer
   *
   * New experiences get max priority to ensure they're sampled at least once
   */
  push(experience: Experience): void {
    // Use max priority for new experiences
    const priority = this.getPriorityFromTdError(
      experience.tdError || this.maxPriority
    );

    this.buffer[this.writeIdx] = experience;
    this.sumTree.updateLeaf(this.writeIdx, priority);

    this.writeIdx = (this.writeIdx + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  /**
   * Convert TD error to priority value
   */
  private getPriorityFromTdError(tdError: number): number {
    // Priority = (|TD error| + epsilon)^alpha
    const priority = Math.pow(
      Math.abs(tdError) + this.priorityEpsilon,
      this.alpha
    );
    this.maxPriority = Math.max(this.maxPriority, priority);
    return priority;
  }

  /**
   * Sample experiences using proportional prioritization
   *
   * @param batchSize - Number of experiences to sample
   * @returns Array of experiences with importance sampling weights
   */
  sample(batchSize: number): Experience[] {
    if (this.count === 0) {
      return [];
    }

    const actualBatchSize = Math.min(batchSize, this.count);
    const experiences: Experience[] = [];
    const indices: number[] = [];

    const total = this.sumTree.total;
    const segment = total / actualBatchSize;

    // Anneal beta towards 1.0
    this.beta = Math.min(1.0, this.beta + this.betaAnnealing);

    // Sample from each segment for stratified sampling
    for (let i = 0; i < actualBatchSize; i++) {
      const low = segment * i;
      const high = segment * (i + 1);
      const value = Math.random() * (high - low) + low;

      const { leafIdx } = this.sumTree.get(value);

      // Ensure valid experience
      if (this.buffer[leafIdx] !== null) {
        experiences.push(this.buffer[leafIdx]!);
        indices.push(leafIdx);
      }
    }

    return experiences;
  }

  /**
   * Sample with importance sampling weights for bias correction
   */
  sampleWithWeights(
    batchSize: number
  ): { experiences: Experience[]; weights: number[]; indices: number[] } {
    if (this.count === 0) {
      return { experiences: [], weights: [], indices: [] };
    }

    const actualBatchSize = Math.min(batchSize, this.count);
    const experiences: Experience[] = [];
    const weights: number[] = [];
    const indices: number[] = [];

    const total = this.sumTree.total;
    const segment = total / actualBatchSize;

    // Anneal beta
    this.beta = Math.min(1.0, this.beta + this.betaAnnealing);

    // Min probability for weight normalization - use actual minimum across all experiences
    const minPriority = this.sumTree.getMinPriority(this.count);
    const minProb = minPriority / total;
    const maxWeight = Math.pow(this.count * minProb, -this.beta);

    for (let i = 0; i < actualBatchSize; i++) {
      const low = segment * i;
      const high = segment * (i + 1);
      const value = Math.random() * (high - low) + low;

      const { leafIdx, priority } = this.sumTree.get(value);

      if (this.buffer[leafIdx] !== null) {
        const prob = priority / total;
        // Importance sampling weight: (1 / (N * P(i)))^beta / max_weight
        const weight = Math.pow(this.count * prob, -this.beta) / maxWeight;

        experiences.push(this.buffer[leafIdx]!);
        weights.push(weight);
        indices.push(leafIdx);
      }
    }

    return { experiences, weights, indices };
  }

  /**
   * Update priorities for sampled experiences
   *
   * Called after computing new TD errors during training
   */
  updatePriorities(indices: number[], priorities: number[]): void {
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      const tdError = priorities[i];
      const priority = this.getPriorityFromTdError(tdError);
      this.sumTree.updateLeaf(idx, priority);
    }
  }

  /**
   * Clear all experiences
   */
  clear(): void {
    this.buffer.fill(null);
    this.sumTree.clear();
    this.count = 0;
    this.writeIdx = 0;
    this.maxPriority = 1.0;
  }

  /**
   * Get current beta value
   */
  getBeta(): number {
    return this.beta;
  }

  /**
   * Get buffer statistics
   */
  getStats(): {
    count: number;
    capacity: number;
    totalPriority: number;
    maxPriority: number;
    beta: number;
  } {
    return {
      count: this.count,
      capacity: this.capacity,
      totalPriority: this.sumTree.total,
      maxPriority: this.maxPriority,
      beta: this.beta,
    };
  }
}

// ============================================================================
// Simple Uniform Replay Buffer (Alternative)
// ============================================================================

/**
 * Simple uniform sampling replay buffer
 *
 * Use when prioritized replay is not needed
 */
export class UniformReplayBuffer implements IReplayBuffer {
  private buffer: Experience[] = [];
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get length(): number {
    return this.buffer.length;
  }

  push(experience: Experience): void {
    if (this.buffer.length >= this.capacity) {
      this.buffer.shift();
    }
    this.buffer.push(experience);
  }

  sample(batchSize: number): Experience[] {
    const actualBatchSize = Math.min(batchSize, this.buffer.length);
    const samples: Experience[] = [];
    const usedIndices = new Set<number>();

    while (samples.length < actualBatchSize) {
      const idx = Math.floor(Math.random() * this.buffer.length);
      if (!usedIndices.has(idx)) {
        usedIndices.add(idx);
        samples.push(this.buffer[idx]);
      }
    }

    return samples;
  }

  updatePriorities(_indices: number[], _priorities: number[]): void {
    // No-op for uniform sampling
  }

  clear(): void {
    this.buffer = [];
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a prioritized replay buffer
 */
export function createPrioritizedReplayBuffer(
  capacity: number,
  options?: {
    alpha?: number;
    beta?: number;
    betaAnnealing?: number;
  }
): PrioritizedReplayBuffer {
  return new PrioritizedReplayBuffer(capacity, options);
}

/**
 * Create a uniform replay buffer
 */
export function createUniformReplayBuffer(capacity: number): UniformReplayBuffer {
  return new UniformReplayBuffer(capacity);
}
