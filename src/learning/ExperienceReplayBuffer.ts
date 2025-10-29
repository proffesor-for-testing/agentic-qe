/**
 * ExperienceReplayBuffer - Phase 2 (Milestone 2.2)
 *
 * Implements experience replay buffer for reinforcement learning.
 * Stores transitions and enables batch sampling for training.
 */

import { TaskExperience } from './types';
import { Logger } from '../utils/Logger';

/**
 * Configuration for experience replay buffer
 */
export interface ReplayBufferConfig {
  maxSize: number; // Maximum number of experiences to store
  minSize: number; // Minimum experiences before sampling is allowed
  prioritized: boolean; // Enable prioritized experience replay
}

/**
 * Default replay buffer configuration
 */
const DEFAULT_CONFIG: ReplayBufferConfig = {
  maxSize: 10000,
  minSize: 100,
  prioritized: false
};

/**
 * Prioritized experience with importance weight
 */
interface PrioritizedExperience {
  experience: TaskExperience;
  priority: number;
  timestamp: number;
}

/**
 * ExperienceReplayBuffer - FIFO buffer with optional prioritization
 *
 * Implements experience replay for more stable and efficient learning.
 * Supports both uniform random sampling and prioritized experience replay.
 */
export class ExperienceReplayBuffer {
  private readonly logger: Logger;
  private readonly config: ReplayBufferConfig;
  private buffer: PrioritizedExperience[];
  private totalExperiences: number;

  constructor(config: Partial<ReplayBufferConfig> = {}) {
    this.logger = Logger.getInstance();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.buffer = [];
    this.totalExperiences = 0;
  }

  /**
   * Add a new experience to the buffer
   * Uses FIFO eviction when buffer is full
   */
  add(experience: TaskExperience, priority?: number): void {
    const prioritizedExp: PrioritizedExperience = {
      experience,
      priority: priority ?? this.calculateDefaultPriority(experience),
      timestamp: Date.now()
    };

    // FIFO eviction: remove oldest when full
    if (this.buffer.length >= this.config.maxSize) {
      this.buffer.shift(); // Remove oldest (first element)
    }

    this.buffer.push(prioritizedExp);
    this.totalExperiences++;
  }

  /**
   * Add multiple experiences in batch
   */
  addBatch(experiences: TaskExperience[]): void {
    for (const experience of experiences) {
      this.add(experience);
    }
    this.logger.debug(`Added batch of ${experiences.length} experiences`);
  }

  /**
   * Sample a random batch of experiences
   * Uses uniform random sampling or prioritized sampling based on config
   */
  sample(batchSize: number): TaskExperience[] {
    if (!this.canSample(batchSize)) {
      throw new Error(
        `Cannot sample: buffer has ${this.buffer.length} experiences, ` +
        `need at least ${Math.max(batchSize, this.config.minSize)}`
      );
    }

    if (this.config.prioritized) {
      return this.prioritizedSample(batchSize);
    } else {
      return this.uniformSample(batchSize);
    }
  }

  /**
   * Uniform random sampling (default)
   */
  private uniformSample(batchSize: number): TaskExperience[] {
    const sampled: TaskExperience[] = [];
    const indices = new Set<number>();

    // Sample without replacement
    while (indices.size < batchSize) {
      const randomIndex = Math.floor(Math.random() * this.buffer.length);
      if (!indices.has(randomIndex)) {
        indices.add(randomIndex);
        sampled.push(this.buffer[randomIndex].experience);
      }
    }

    return sampled;
  }

  /**
   * Prioritized experience replay sampling
   * Samples based on priority with probability proportional to priority
   */
  private prioritizedSample(batchSize: number): TaskExperience[] {
    const sampled: TaskExperience[] = [];
    const totalPriority = this.buffer.reduce((sum, exp) => sum + exp.priority, 0);

    // Sample with replacement based on priorities
    for (let i = 0; i < batchSize; i++) {
      let random = Math.random() * totalPriority;
      let cumulativePriority = 0;

      for (const exp of this.buffer) {
        cumulativePriority += exp.priority;
        if (random <= cumulativePriority) {
          sampled.push(exp.experience);
          break;
        }
      }
    }

    return sampled;
  }

  /**
   * Update priority for a specific experience
   * Used in prioritized experience replay to adjust importance weights
   */
  updatePriority(experienceId: string, newPriority: number): boolean {
    const index = this.buffer.findIndex(
      exp => exp.experience.taskId === experienceId
    );

    if (index === -1) {
      return false;
    }

    this.buffer[index].priority = newPriority;
    return true;
  }

  /**
   * Calculate default priority based on TD-error magnitude
   * Higher absolute rewards get higher priority
   */
  private calculateDefaultPriority(experience: TaskExperience): number {
    // Priority based on absolute reward (experiences with higher impact are prioritized)
    const basePriority = Math.abs(experience.reward) + 0.01; // Add small constant to avoid zero priority

    // Recent experiences get slight boost
    const recencyBoost = 1.0;

    return basePriority * recencyBoost;
  }

  /**
   * Check if buffer has enough experiences to sample
   */
  canSample(batchSize: number): boolean {
    return this.buffer.length >= Math.max(batchSize, this.config.minSize);
  }

  /**
   * Get recent experiences (for temporal coherence)
   */
  getRecent(count: number): TaskExperience[] {
    const actualCount = Math.min(count, this.buffer.length);
    return this.buffer
      .slice(-actualCount)
      .map(exp => exp.experience);
  }

  /**
   * Get oldest experiences
   */
  getOldest(count: number): TaskExperience[] {
    const actualCount = Math.min(count, this.buffer.length);
    return this.buffer
      .slice(0, actualCount)
      .map(exp => exp.experience);
  }

  /**
   * Get all experiences matching a filter
   */
  filter(predicate: (exp: TaskExperience) => boolean): TaskExperience[] {
    return this.buffer
      .filter(exp => predicate(exp.experience))
      .map(exp => exp.experience);
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = [];
    this.logger.info('Experience replay buffer cleared');
  }

  /**
   * Get current buffer size
   */
  size(): number {
    return this.buffer.length;
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  /**
   * Check if buffer is full
   */
  isFull(): boolean {
    return this.buffer.length >= this.config.maxSize;
  }

  /**
   * Get total number of experiences ever added (including evicted)
   */
  getTotalExperiences(): number {
    return this.totalExperiences;
  }

  /**
   * Get buffer statistics
   */
  getStatistics(): {
    size: number;
    maxSize: number;
    utilization: number;
    totalAdded: number;
    avgPriority: number;
    avgReward: number;
  } {
    const avgPriority = this.buffer.length > 0
      ? this.buffer.reduce((sum, exp) => sum + exp.priority, 0) / this.buffer.length
      : 0;

    const avgReward = this.buffer.length > 0
      ? this.buffer.reduce((sum, exp) => sum + exp.experience.reward, 0) / this.buffer.length
      : 0;

    return {
      size: this.buffer.length,
      maxSize: this.config.maxSize,
      utilization: this.buffer.length / this.config.maxSize,
      totalAdded: this.totalExperiences,
      avgPriority,
      avgReward
    };
  }

  /**
   * Export buffer state for persistence
   */
  export(): {
    buffer: PrioritizedExperience[];
    config: ReplayBufferConfig;
    totalExperiences: number;
  } {
    return {
      buffer: [...this.buffer],
      config: { ...this.config },
      totalExperiences: this.totalExperiences
    };
  }

  /**
   * Import buffer state from persistence
   */
  import(state: {
    buffer: PrioritizedExperience[];
    config: ReplayBufferConfig;
    totalExperiences: number;
  }): void {
    this.buffer = [...state.buffer];
    this.totalExperiences = state.totalExperiences;
    this.logger.info(`Imported replay buffer with ${this.buffer.length} experiences`);
  }

  /**
   * Prune old experiences beyond retention limit
   * Keeps most recent experiences
   */
  prune(retentionCount: number): number {
    if (this.buffer.length <= retentionCount) {
      return 0;
    }

    const removeCount = this.buffer.length - retentionCount;
    this.buffer = this.buffer.slice(-retentionCount);

    this.logger.info(`Pruned ${removeCount} old experiences from buffer`);
    return removeCount;
  }

  /**
   * Get memory usage estimate in bytes
   */
  getMemoryUsage(): number {
    return JSON.stringify(this.buffer).length;
  }
}
