/**
 * Comprehensive Tests for Experience Replay Buffer
 * Tests buffer storage, sampling, FIFO behavior, priority sampling, and memory management
 *
 * @module tests/learning/ExperienceReplayBuffer
 */

// ===========================================================================
// Mock Types and Interfaces
// ===========================================================================

interface Experience {
  id: string;
  state: string;
  action: string;
  reward: number;
  nextState: string;
  done: boolean;
  timestamp: number;
  priority?: number;
}

interface BufferConfig {
  capacity: number;
  samplingStrategy?: 'uniform' | 'priority' | 'recent';
  priorityAlpha?: number; // How much to use priority vs uniform
  replacementStrategy?: 'fifo' | 'random' | 'lowest-priority';
}

interface BufferStats {
  size: number;
  capacity: number;
  utilizationPercent: number;
  averagePriority: number;
  oldestTimestamp: number;
  newestTimestamp: number;
}

// ===========================================================================
// ExperienceReplayBuffer Implementation
// ===========================================================================

class ExperienceReplayBuffer {
  private buffer: Experience[] = [];
  private config: Required<BufferConfig>;
  private addCount: number = 0;

  constructor(config: BufferConfig) {
    this.config = {
      capacity: config.capacity,
      samplingStrategy: config.samplingStrategy ?? 'uniform',
      priorityAlpha: config.priorityAlpha ?? 0.6,
      replacementStrategy: config.replacementStrategy ?? 'fifo'
    };
  }

  /**
   * Add experience to buffer
   */
  add(experience: Experience): void {
    // Set priority if not provided
    if (experience.priority === undefined) {
      experience.priority = 1.0;
    }

    // Check if buffer is full
    if (this.buffer.length >= this.config.capacity) {
      this.removeExperience();
    }

    this.buffer.push({ ...experience });
    this.addCount++;
  }

  /**
   * Remove experience based on replacement strategy
   */
  private removeExperience(): void {
    if (this.buffer.length === 0) return;

    switch (this.config.replacementStrategy) {
      case 'fifo':
        this.buffer.shift(); // Remove oldest
        break;

      case 'random':
        const randomIndex = Math.floor(Math.random() * this.buffer.length);
        this.buffer.splice(randomIndex, 1);
        break;

      case 'lowest-priority':
        let lowestIdx = 0;
        let lowestPriority = this.buffer[0].priority!;

        for (let i = 1; i < this.buffer.length; i++) {
          if (this.buffer[i].priority! < lowestPriority) {
            lowestPriority = this.buffer[i].priority!;
            lowestIdx = i;
          }
        }

        this.buffer.splice(lowestIdx, 1);
        break;
    }
  }

  /**
   * Sample batch of experiences
   */
  sample(batchSize: number): Experience[] {
    if (this.buffer.length === 0) {
      return [];
    }

    const actualBatchSize = Math.min(batchSize, this.buffer.length);

    switch (this.config.samplingStrategy) {
      case 'uniform':
        return this.sampleUniform(actualBatchSize);

      case 'priority':
        return this.samplePriority(actualBatchSize);

      case 'recent':
        return this.sampleRecent(actualBatchSize);

      default:
        return this.sampleUniform(actualBatchSize);
    }
  }

  /**
   * Uniform random sampling
   */
  private sampleUniform(batchSize: number): Experience[] {
    const sampled: Experience[] = [];
    const indices = new Set<number>();

    while (indices.size < batchSize) {
      const idx = Math.floor(Math.random() * this.buffer.length);
      if (!indices.has(idx)) {
        indices.add(idx);
        sampled.push({ ...this.buffer[idx] });
      }
    }

    return sampled;
  }

  /**
   * Priority-based sampling (experiences with higher priority more likely)
   */
  private samplePriority(batchSize: number): Experience[] {
    // Calculate cumulative priorities
    const priorities = this.buffer.map(exp => Math.pow(exp.priority!, this.config.priorityAlpha));
    const totalPriority = priorities.reduce((sum, p) => sum + p, 0);

    const sampled: Experience[] = [];
    const indices = new Set<number>();

    while (indices.size < batchSize) {
      const rand = Math.random() * totalPriority;
      let cumulative = 0;

      for (let i = 0; i < this.buffer.length; i++) {
        cumulative += priorities[i];
        if (rand <= cumulative && !indices.has(i)) {
          indices.add(i);
          sampled.push({ ...this.buffer[i] });
          break;
        }
      }

      // Fallback if no sample found (shouldn't happen but prevents infinite loop)
      if (sampled.length === indices.size - 1) {
        for (let i = 0; i < this.buffer.length; i++) {
          if (!indices.has(i)) {
            indices.add(i);
            sampled.push({ ...this.buffer[i] });
            break;
          }
        }
      }
    }

    return sampled;
  }

  /**
   * Sample recent experiences
   */
  private sampleRecent(batchSize: number): Experience[] {
    const startIdx = Math.max(0, this.buffer.length - batchSize);
    return this.buffer.slice(startIdx).map(exp => ({ ...exp }));
  }

  /**
   * Update priority of experience
   */
  updatePriority(experienceId: string, newPriority: number): boolean {
    const experience = this.buffer.find(exp => exp.id === experienceId);
    if (!experience) {
      return false;
    }

    experience.priority = Math.max(0, newPriority);
    return true;
  }

  /**
   * Get experience by ID
   */
  get(experienceId: string): Experience | undefined {
    const experience = this.buffer.find(exp => exp.id === experienceId);
    return experience ? { ...experience } : undefined;
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
   * Check if buffer is full
   */
  isFull(): boolean {
    return this.buffer.length >= this.config.capacity;
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  /**
   * Get buffer statistics
   */
  getStats(): BufferStats {
    if (this.buffer.length === 0) {
      return {
        size: 0,
        capacity: this.config.capacity,
        utilizationPercent: 0,
        averagePriority: 0,
        oldestTimestamp: 0,
        newestTimestamp: 0
      };
    }

    const priorities = this.buffer.map(exp => exp.priority!);
    const timestamps = this.buffer.map(exp => exp.timestamp);

    return {
      size: this.buffer.length,
      capacity: this.config.capacity,
      utilizationPercent: (this.buffer.length / this.config.capacity) * 100,
      averagePriority: priorities.reduce((sum, p) => sum + p, 0) / priorities.length,
      oldestTimestamp: Math.min(...timestamps),
      newestTimestamp: Math.max(...timestamps)
    };
  }

  /**
   * Get all experiences (for testing/inspection)
   */
  getAll(): Experience[] {
    return this.buffer.map(exp => ({ ...exp }));
  }

  /**
   * Get capacity
   */
  getCapacity(): number {
    return this.config.capacity;
  }

  /**
   * Get total number of experiences added (including removed ones)
   */
  getTotalAdded(): number {
    return this.addCount;
  }

  /**
   * Compact buffer (remove duplicates by ID, keep latest)
   */
  compact(): number {
    const seen = new Map<string, number>();
    const toRemove: number[] = [];

    // Find duplicates (keeping track of latest)
    for (let i = 0; i < this.buffer.length; i++) {
      const exp = this.buffer[i];
      if (seen.has(exp.id)) {
        const prevIdx = seen.get(exp.id)!;
        // Keep the one with higher priority or more recent
        if (exp.priority! > this.buffer[prevIdx].priority! ||
            exp.timestamp > this.buffer[prevIdx].timestamp) {
          toRemove.push(prevIdx);
          seen.set(exp.id, i);
        } else {
          toRemove.push(i);
        }
      } else {
        seen.set(exp.id, i);
      }
    }

    // Remove duplicates (in reverse order to maintain indices)
    toRemove.sort((a, b) => b - a);
    for (const idx of toRemove) {
      this.buffer.splice(idx, 1);
    }

    return toRemove.length;
  }
}

// ===========================================================================
// Unit Tests
// ===========================================================================

describe('ExperienceReplayBuffer', () => {
  let buffer: ExperienceReplayBuffer;

  const createExperience = (id: string, reward: number = 1.0, priority: number = 1.0): Experience => ({
    id,
    state: `state-${id}`,
    action: 'test-action',
    reward,
    nextState: `next-${id}`,
    done: false,
    timestamp: Date.now(),
    priority
  });

  beforeEach(() => {
    buffer = new ExperienceReplayBuffer({ capacity: 10 });
  });

  // -------------------------------------------------------------------------
  // Buffer Storage Tests
  // -------------------------------------------------------------------------

  describe('Buffer Storage', () => {
    it('should add experience to buffer', () => {
      const exp = createExperience('exp-1');
      buffer.add(exp);

      expect(buffer.size()).toBe(1);
      expect(buffer.isEmpty()).toBe(false);
    });

    it('should store multiple experiences', () => {
      for (let i = 0; i < 5; i++) {
        buffer.add(createExperience(`exp-${i}`));
      }

      expect(buffer.size()).toBe(5);
    });

    it('should respect capacity limit', () => {
      for (let i = 0; i < 15; i++) {
        buffer.add(createExperience(`exp-${i}`));
      }

      expect(buffer.size()).toBe(10); // Capacity is 10
      expect(buffer.isFull()).toBe(true);
    });

    it('should retrieve experience by ID', () => {
      const exp = createExperience('exp-test', 5.0);
      buffer.add(exp);

      const retrieved = buffer.get('exp-test');
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('exp-test');
      expect(retrieved!.reward).toBe(5.0);
    });

    it('should return undefined for non-existent ID', () => {
      const retrieved = buffer.get('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('should set default priority if not provided', () => {
      const exp = {
        id: 'exp-1',
        state: 'state-1',
        action: 'action',
        reward: 1.0,
        nextState: 'state-2',
        done: false,
        timestamp: Date.now()
      };

      buffer.add(exp as Experience);

      const retrieved = buffer.get('exp-1');
      expect(retrieved!.priority).toBe(1.0);
    });
  });

  // -------------------------------------------------------------------------
  // FIFO Behavior Tests
  // -------------------------------------------------------------------------

  describe('FIFO Behavior', () => {
    it('should remove oldest experience when full', () => {
      // Fill buffer
      for (let i = 0; i < 10; i++) {
        buffer.add(createExperience(`exp-${i}`));
      }

      // Add one more (should remove first)
      buffer.add(createExperience('exp-10'));

      expect(buffer.size()).toBe(10);
      expect(buffer.get('exp-0')).toBeUndefined(); // First one removed
      expect(buffer.get('exp-10')).toBeDefined(); // Last one exists
    });

    it('should maintain FIFO order for multiple additions', () => {
      // Fill buffer
      for (let i = 0; i < 10; i++) {
        buffer.add(createExperience(`exp-${i}`));
      }

      // Add 5 more experiences
      for (let i = 10; i < 15; i++) {
        buffer.add(createExperience(`exp-${i}`));
      }

      // First 5 should be removed
      for (let i = 0; i < 5; i++) {
        expect(buffer.get(`exp-${i}`)).toBeUndefined();
      }

      // Last 10 should exist
      for (let i = 5; i < 15; i++) {
        expect(buffer.get(`exp-${i}`)).toBeDefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Sampling Tests
  // -------------------------------------------------------------------------

  describe('Uniform Sampling', () => {
    beforeEach(() => {
      for (let i = 0; i < 10; i++) {
        buffer.add(createExperience(`exp-${i}`));
      }
    });

    it('should sample requested batch size', () => {
      const sampled = buffer.sample(5);
      expect(sampled.length).toBe(5);
    });

    it('should sample without replacement', () => {
      const sampled = buffer.sample(10);
      const ids = sampled.map(exp => exp.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(10); // No duplicates
    });

    it('should sample all experiences if batch size exceeds buffer size', () => {
      const smallBuffer = new ExperienceReplayBuffer({ capacity: 5 });
      smallBuffer.add(createExperience('exp-1'));
      smallBuffer.add(createExperience('exp-2'));

      const sampled = smallBuffer.sample(10);
      expect(sampled.length).toBe(2);
    });

    it('should return empty array for empty buffer', () => {
      const emptyBuffer = new ExperienceReplayBuffer({ capacity: 10 });
      const sampled = emptyBuffer.sample(5);

      expect(sampled).toEqual([]);
    });

    it('should provide reasonable distribution in uniform sampling', () => {
      const sampleCounts = new Map<string, number>();

      // Sample many times
      for (let i = 0; i < 1000; i++) {
        const sampled = buffer.sample(1);
        const id = sampled[0].id;
        sampleCounts.set(id, (sampleCounts.get(id) || 0) + 1);
      }

      // Each experience should be sampled roughly equally (within 50% tolerance)
      const avgCount = 1000 / 10; // 100 per experience
      for (const count of sampleCounts.values()) {
        expect(count).toBeGreaterThan(avgCount * 0.5);
        expect(count).toBeLessThan(avgCount * 1.5);
      }
    });
  });

  describe('Priority Sampling', () => {
    it('should favor high-priority experiences', () => {
      const priorityBuffer = new ExperienceReplayBuffer({
        capacity: 10,
        samplingStrategy: 'priority'
      });

      // Add experiences with varying priorities
      priorityBuffer.add(createExperience('low-1', 1.0, 0.1));
      priorityBuffer.add(createExperience('low-2', 1.0, 0.1));
      priorityBuffer.add(createExperience('high-1', 1.0, 10.0));
      priorityBuffer.add(createExperience('high-2', 1.0, 10.0));

      const sampleCounts = new Map<string, number>();

      // Sample many times
      for (let i = 0; i < 1000; i++) {
        const sampled = priorityBuffer.sample(1);
        const id = sampled[0].id;
        sampleCounts.set(id, (sampleCounts.get(id) || 0) + 1);
      }

      const highCount = (sampleCounts.get('high-1') || 0) + (sampleCounts.get('high-2') || 0);
      const lowCount = (sampleCounts.get('low-1') || 0) + (sampleCounts.get('low-2') || 0);

      // High priority should be sampled much more often
      expect(highCount).toBeGreaterThan(lowCount * 2);
    });
  });

  describe('Recent Sampling', () => {
    it('should sample most recent experiences', () => {
      const recentBuffer = new ExperienceReplayBuffer({
        capacity: 10,
        samplingStrategy: 'recent'
      });

      // Add experiences with delay to ensure timestamp differences
      for (let i = 0; i < 10; i++) {
        const exp = createExperience(`exp-${i}`);
        exp.timestamp = Date.now() + i * 1000; // 1 second apart
        recentBuffer.add(exp);
      }

      const sampled = recentBuffer.sample(3);

      // Should get last 3 experiences
      expect(sampled.map(e => e.id)).toEqual(['exp-7', 'exp-8', 'exp-9']);
    });
  });

  // -------------------------------------------------------------------------
  // Priority Management Tests
  // -------------------------------------------------------------------------

  describe('Priority Management', () => {
    it('should update experience priority', () => {
      buffer.add(createExperience('exp-1', 1.0, 1.0));

      const updated = buffer.updatePriority('exp-1', 5.0);
      expect(updated).toBe(true);

      const retrieved = buffer.get('exp-1');
      expect(retrieved!.priority).toBe(5.0);
    });

    it('should return false when updating non-existent experience', () => {
      const updated = buffer.updatePriority('non-existent', 5.0);
      expect(updated).toBe(false);
    });

    it('should clamp negative priorities to zero', () => {
      buffer.add(createExperience('exp-1'));

      buffer.updatePriority('exp-1', -5.0);

      const retrieved = buffer.get('exp-1');
      expect(retrieved!.priority).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Replacement Strategy Tests
  // -------------------------------------------------------------------------

  describe('Replacement Strategies', () => {
    it('should use FIFO replacement by default', () => {
      for (let i = 0; i < 11; i++) {
        buffer.add(createExperience(`exp-${i}`));
      }

      expect(buffer.get('exp-0')).toBeUndefined(); // First removed
      expect(buffer.get('exp-10')).toBeDefined(); // Last exists
    });

    it('should use lowest-priority replacement', () => {
      const priorityBuffer = new ExperienceReplayBuffer({
        capacity: 3,
        replacementStrategy: 'lowest-priority'
      });

      priorityBuffer.add(createExperience('high', 1.0, 10.0));
      priorityBuffer.add(createExperience('medium', 1.0, 5.0));
      priorityBuffer.add(createExperience('low', 1.0, 1.0));

      // Add new experience (should remove 'low')
      priorityBuffer.add(createExperience('new', 1.0, 7.0));

      expect(priorityBuffer.get('low')).toBeUndefined();
      expect(priorityBuffer.get('high')).toBeDefined();
      expect(priorityBuffer.get('medium')).toBeDefined();
      expect(priorityBuffer.get('new')).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Statistics Tests
  // -------------------------------------------------------------------------

  describe('Statistics', () => {
    it('should report buffer statistics', () => {
      for (let i = 0; i < 7; i++) {
        buffer.add(createExperience(`exp-${i}`, 1.0, i + 1));
      }

      const stats = buffer.getStats();

      expect(stats.size).toBe(7);
      expect(stats.capacity).toBe(10);
      expect(stats.utilizationPercent).toBeCloseTo(70, 1);
      expect(stats.averagePriority).toBeCloseTo(4, 1); // (1+2+3+4+5+6+7)/7
    });

    it('should report zero stats for empty buffer', () => {
      const stats = buffer.getStats();

      expect(stats.size).toBe(0);
      expect(stats.utilizationPercent).toBe(0);
      expect(stats.averagePriority).toBe(0);
    });

    it('should track total experiences added', () => {
      for (let i = 0; i < 15; i++) {
        buffer.add(createExperience(`exp-${i}`));
      }

      expect(buffer.getTotalAdded()).toBe(15);
      expect(buffer.size()).toBe(10); // Only 10 retained
    });
  });

  // -------------------------------------------------------------------------
  // Utility Functions Tests
  // -------------------------------------------------------------------------

  describe('Utility Functions', () => {
    it('should clear buffer', () => {
      for (let i = 0; i < 5; i++) {
        buffer.add(createExperience(`exp-${i}`));
      }

      buffer.clear();

      expect(buffer.isEmpty()).toBe(true);
      expect(buffer.size()).toBe(0);
    });

    it('should get all experiences', () => {
      for (let i = 0; i < 5; i++) {
        buffer.add(createExperience(`exp-${i}`));
      }

      const all = buffer.getAll();

      expect(all.length).toBe(5);
      expect(all.map(e => e.id)).toEqual(['exp-0', 'exp-1', 'exp-2', 'exp-3', 'exp-4']);
    });

    it('should compact buffer by removing duplicates', () => {
      buffer.add(createExperience('exp-1', 1.0, 1.0));
      buffer.add(createExperience('exp-2', 1.0, 1.0));
      buffer.add(createExperience('exp-1', 2.0, 2.0)); // Duplicate with higher priority

      const removed = buffer.compact();

      expect(removed).toBe(1);
      expect(buffer.size()).toBe(2);

      const exp1 = buffer.get('exp-1');
      expect(exp1!.priority).toBe(2.0); // Kept higher priority version
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle capacity of 1', () => {
      const tinyBuffer = new ExperienceReplayBuffer({ capacity: 1 });

      tinyBuffer.add(createExperience('exp-1'));
      tinyBuffer.add(createExperience('exp-2'));

      expect(tinyBuffer.size()).toBe(1);
      expect(tinyBuffer.get('exp-2')).toBeDefined();
    });

    it('should handle very large capacity', () => {
      const largeBuffer = new ExperienceReplayBuffer({ capacity: 100000 });

      for (let i = 0; i < 1000; i++) {
        largeBuffer.add(createExperience(`exp-${i}`));
      }

      expect(largeBuffer.size()).toBe(1000);
      expect(largeBuffer.isFull()).toBe(false);
    });

    it('should handle sampling larger batch than buffer size', () => {
      buffer.add(createExperience('exp-1'));
      buffer.add(createExperience('exp-2'));

      const sampled = buffer.sample(10);
      expect(sampled.length).toBe(2);
    });

    it('should handle concurrent additions', () => {
      // Simulate concurrent adds (though not truly async)
      const experiences = Array.from({ length: 50 }, (_, i) =>
        createExperience(`exp-${i}`)
      );

      experiences.forEach(exp => buffer.add(exp));

      expect(buffer.size()).toBe(10); // Capacity limit
      expect(buffer.getTotalAdded()).toBe(50);
    });

    it('should handle experience with zero priority', () => {
      buffer.add(createExperience('exp-1', 1.0, 0));

      const retrieved = buffer.get('exp-1');
      expect(retrieved!.priority).toBe(0);
    });
  });
});
