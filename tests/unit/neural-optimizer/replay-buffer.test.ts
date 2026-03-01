/**
 * Agentic QE v3 - Replay Buffer Tests
 * ADR-034: Neural Topology Optimizer
 *
 * Tests for PrioritizedReplayBuffer and UniformReplayBuffer implementations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PrioritizedReplayBuffer,
  UniformReplayBuffer,
  createPrioritizedReplayBuffer,
  createUniformReplayBuffer,
} from '../../../src/neural-optimizer/replay-buffer';
import type { Experience } from '../../../src/neural-optimizer/types';

function createExperience(
  reward: number,
  tdError: number = Math.abs(reward)
): Experience {
  return {
    state: [Math.random(), Math.random(), Math.random()],
    actionIdx: Math.floor(Math.random() * 5),
    reward,
    nextState: [Math.random(), Math.random(), Math.random()],
    done: false,
    tdError,
    timestamp: Date.now(),
  };
}

describe('PrioritizedReplayBuffer', () => {
  let buffer: PrioritizedReplayBuffer;

  beforeEach(() => {
    buffer = new PrioritizedReplayBuffer(100);
  });

  describe('initialization', () => {
    it('should start empty', () => {
      expect(buffer.length).toBe(0);
    });

    it('should accept custom options', () => {
      const customBuffer = new PrioritizedReplayBuffer(50, {
        alpha: 0.8,
        beta: 0.6,
        betaAnnealing: 0.002,
      });

      expect(customBuffer.length).toBe(0);
      expect(customBuffer.getBeta()).toBe(0.6);
    });
  });

  describe('push', () => {
    it('should add experiences', () => {
      buffer.push(createExperience(1.0));

      expect(buffer.length).toBe(1);
    });

    it('should increment length up to capacity', () => {
      for (let i = 0; i < 50; i++) {
        buffer.push(createExperience(Math.random()));
      }

      expect(buffer.length).toBe(50);
    });

    it('should not exceed capacity', () => {
      const smallBuffer = new PrioritizedReplayBuffer(10);

      for (let i = 0; i < 20; i++) {
        smallBuffer.push(createExperience(Math.random()));
      }

      expect(smallBuffer.length).toBe(10);
    });

    it('should overwrite old experiences when full', () => {
      const smallBuffer = new PrioritizedReplayBuffer(5);

      // Fill buffer
      for (let i = 0; i < 5; i++) {
        smallBuffer.push(createExperience(i));
      }

      // Add one more
      smallBuffer.push(createExperience(999));

      // Should still be at capacity
      expect(smallBuffer.length).toBe(5);

      // Sample should contain the new experience
      const samples = smallBuffer.sample(5);
      const hasNew = samples.some((exp) => exp.reward === 999);
      expect(hasNew).toBe(true);
    });
  });

  describe('sample', () => {
    beforeEach(() => {
      // Fill buffer with experiences
      for (let i = 0; i < 50; i++) {
        buffer.push(createExperience(Math.random(), Math.random() + 0.1));
      }
    });

    it('should return requested number of samples', () => {
      const samples = buffer.sample(10);

      expect(samples.length).toBe(10);
    });

    it('should return fewer samples if buffer is smaller', () => {
      const smallBuffer = new PrioritizedReplayBuffer(100);
      smallBuffer.push(createExperience(1.0));
      smallBuffer.push(createExperience(2.0));

      const samples = smallBuffer.sample(10);

      expect(samples.length).toBe(2);
    });

    it('should return valid experiences', () => {
      const samples = buffer.sample(10);

      for (const exp of samples) {
        expect(exp.state).toHaveLength(3);
        expect(exp.nextState).toHaveLength(3);
        expect(typeof exp.reward).toBe('number');
        expect(typeof exp.actionIdx).toBe('number');
        expect(typeof exp.done).toBe('boolean');
      }
    });

    it('should return empty array for empty buffer', () => {
      const emptyBuffer = new PrioritizedReplayBuffer(100);
      const samples = emptyBuffer.sample(10);

      expect(samples).toHaveLength(0);
    });

    it('should prioritize high TD error experiences', () => {
      const priorityBuffer = new PrioritizedReplayBuffer(100, { alpha: 1.0 });

      // Add low priority experiences
      for (let i = 0; i < 90; i++) {
        priorityBuffer.push(createExperience(0.1, 0.01));
      }

      // Add high priority experiences
      for (let i = 0; i < 10; i++) {
        priorityBuffer.push(createExperience(1.0, 10.0));
      }

      // Sample multiple times and count high priority
      let highPriorityCount = 0;
      for (let trial = 0; trial < 100; trial++) {
        const samples = priorityBuffer.sample(10);
        highPriorityCount += samples.filter((exp) => exp.reward === 1.0).length;
      }

      // High priority should appear more often than uniform would suggest
      // With alpha=1.0, they should appear much more frequently
      const avgHighPriority = highPriorityCount / 100;
      expect(avgHighPriority).toBeGreaterThan(1); // > 10% uniform rate
    });
  });

  describe('sampleWithWeights', () => {
    beforeEach(() => {
      for (let i = 0; i < 50; i++) {
        buffer.push(createExperience(Math.random(), Math.random() + 0.1));
      }
    });

    it('should return experiences with weights and indices', () => {
      const result = buffer.sampleWithWeights(10);

      expect(result.experiences.length).toBe(10);
      expect(result.weights.length).toBe(10);
      expect(result.indices.length).toBe(10);
    });

    it('should return positive weights', () => {
      const { weights } = buffer.sampleWithWeights(10);

      for (const weight of weights) {
        expect(weight).toBeGreaterThan(0);
      }
    });

    it('should return weights <= 1.0 (normalized)', () => {
      const { weights } = buffer.sampleWithWeights(10);

      for (const weight of weights) {
        expect(weight).toBeLessThanOrEqual(1.01); // Small tolerance
      }
    });

    it('should return valid indices', () => {
      const { indices } = buffer.sampleWithWeights(10);

      for (const idx of indices) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(buffer.length);
      }
    });

    it('should anneal beta over time', () => {
      const initialBeta = buffer.getBeta();

      // Sample multiple times
      for (let i = 0; i < 100; i++) {
        buffer.sampleWithWeights(5);
      }

      expect(buffer.getBeta()).toBeGreaterThan(initialBeta);
    });
  });

  describe('updatePriorities', () => {
    it('should update priorities for sampled experiences', () => {
      // Add experiences
      for (let i = 0; i < 20; i++) {
        buffer.push(createExperience(Math.random(), 0.1));
      }

      // Sample and get indices
      const { indices } = buffer.sampleWithWeights(5);

      // Update with high priorities
      const newPriorities = Array(5).fill(100.0);
      buffer.updatePriorities(indices, newPriorities);

      // Stats should reflect higher priority
      const stats = buffer.getStats();
      expect(stats.maxPriority).toBeGreaterThan(1);
    });
  });

  describe('clear', () => {
    it('should empty the buffer', () => {
      for (let i = 0; i < 20; i++) {
        buffer.push(createExperience(Math.random()));
      }

      buffer.clear();

      expect(buffer.length).toBe(0);
    });

    it('should reset priorities', () => {
      for (let i = 0; i < 20; i++) {
        buffer.push(createExperience(Math.random(), 10.0));
      }

      buffer.clear();

      const stats = buffer.getStats();
      expect(stats.totalPriority).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return valid statistics', () => {
      for (let i = 0; i < 20; i++) {
        buffer.push(createExperience(Math.random()));
      }

      const stats = buffer.getStats();

      expect(stats.count).toBe(20);
      expect(stats.capacity).toBe(100);
      expect(stats.totalPriority).toBeGreaterThan(0);
      expect(stats.maxPriority).toBeGreaterThan(0);
      expect(typeof stats.beta).toBe('number');
    });
  });

  describe('factory function', () => {
    it('createPrioritizedReplayBuffer should create buffer', () => {
      const buf = createPrioritizedReplayBuffer(50, { alpha: 0.7 });

      expect(buf.length).toBe(0);
      buf.push(createExperience(1.0));
      expect(buf.length).toBe(1);
    });
  });
});

describe('UniformReplayBuffer', () => {
  let buffer: UniformReplayBuffer;

  beforeEach(() => {
    buffer = new UniformReplayBuffer(100);
  });

  describe('initialization', () => {
    it('should start empty', () => {
      expect(buffer.length).toBe(0);
    });
  });

  describe('push', () => {
    it('should add experiences', () => {
      buffer.push(createExperience(1.0));

      expect(buffer.length).toBe(1);
    });

    it('should not exceed capacity', () => {
      const smallBuffer = new UniformReplayBuffer(10);

      for (let i = 0; i < 20; i++) {
        smallBuffer.push(createExperience(Math.random()));
      }

      expect(smallBuffer.length).toBe(10);
    });
  });

  describe('sample', () => {
    beforeEach(() => {
      for (let i = 0; i < 50; i++) {
        buffer.push(createExperience(i / 50));
      }
    });

    it('should return requested number of samples', () => {
      const samples = buffer.sample(10);

      expect(samples.length).toBe(10);
    });

    it('should return unique samples (no duplicates)', () => {
      const samples = buffer.sample(10);
      const rewards = samples.map((exp) => exp.reward);
      const uniqueRewards = new Set(rewards);

      expect(uniqueRewards.size).toBe(10);
    });

    it('should sample uniformly', () => {
      // Fill with known values
      const uniformBuffer = new UniformReplayBuffer(100);
      for (let i = 0; i < 100; i++) {
        uniformBuffer.push(createExperience(i < 50 ? 0 : 1, 1.0));
      }

      // Sample many times
      let count0 = 0;
      let count1 = 0;
      for (let trial = 0; trial < 100; trial++) {
        const samples = uniformBuffer.sample(10);
        count0 += samples.filter((exp) => exp.reward === 0).length;
        count1 += samples.filter((exp) => exp.reward === 1).length;
      }

      // Should be roughly equal (uniform sampling)
      const ratio = count0 / (count0 + count1);
      expect(ratio).toBeGreaterThan(0.35);
      expect(ratio).toBeLessThan(0.65);
    });
  });

  describe('updatePriorities', () => {
    it('should be no-op (uniform sampling)', () => {
      for (let i = 0; i < 10; i++) {
        buffer.push(createExperience(Math.random()));
      }

      // Should not throw
      buffer.updatePriorities([0, 1, 2], [100, 100, 100]);

      expect(buffer.length).toBe(10);
    });
  });

  describe('clear', () => {
    it('should empty the buffer', () => {
      for (let i = 0; i < 20; i++) {
        buffer.push(createExperience(Math.random()));
      }

      buffer.clear();

      expect(buffer.length).toBe(0);
    });
  });

  describe('factory function', () => {
    it('createUniformReplayBuffer should create buffer', () => {
      const buf = createUniformReplayBuffer(50);

      expect(buf.length).toBe(0);
      buf.push(createExperience(1.0));
      expect(buf.length).toBe(1);
    });
  });
});
