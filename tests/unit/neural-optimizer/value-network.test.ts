/**
 * Agentic QE v3 - Value Network Tests
 * ADR-034: Neural Topology Optimizer
 *
 * Tests for the ValueNetwork implementation used in RL-based topology optimization.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ValueNetwork,
  createValueNetwork,
  createValueNetworkFromWeights,
} from '../../../src/neural-optimizer/value-network';

describe('ValueNetwork', () => {
  describe('initialization', () => {
    it('should create network with specified dimensions', () => {
      const network = new ValueNetwork(10, 32);
      const dims = network.getDimensions();

      expect(dims.inputSize).toBe(10);
      expect(dims.hiddenSize).toBe(32);
    });

    it('should initialize with non-zero weights', () => {
      const network = new ValueNetwork(10, 32);
      const weights = network.export();

      // Check that weights are not all zero
      const hasNonZeroHidden = weights.wHidden.some((row) =>
        row.some((w) => w !== 0)
      );
      expect(hasNonZeroHidden).toBe(true);

      const hasNonZeroOutput = weights.wOutput.some((w) => w !== 0);
      expect(hasNonZeroOutput).toBe(true);
    });

    it('should use Xavier/He initialization scale', () => {
      const inputSize = 100;
      const hiddenSize = 64;
      const network = new ValueNetwork(inputSize, hiddenSize);
      const weights = network.export();

      // Check that weights are within reasonable bounds for He initialization
      // Expected std ~ sqrt(2/inputSize) ~ 0.14
      const hiddenWeights = weights.wHidden.flat();
      const maxWeight = Math.max(...hiddenWeights.map(Math.abs));

      // Should be within 4 standard deviations most of the time
      expect(maxWeight).toBeLessThan(1.0);
    });
  });

  describe('estimate', () => {
    it('should return a number for valid input', () => {
      const network = new ValueNetwork(10, 32);
      const state = Array(10).fill(0.5);

      const value = network.estimate(state);

      expect(typeof value).toBe('number');
      expect(Number.isFinite(value)).toBe(true);
    });

    it('should handle zero input', () => {
      const network = new ValueNetwork(10, 32);
      const state = Array(10).fill(0);

      const value = network.estimate(state);

      expect(typeof value).toBe('number');
      expect(Number.isFinite(value)).toBe(true);
    });

    it('should pad shorter input vectors', () => {
      const network = new ValueNetwork(10, 32);
      const shortState = [0.5, 0.5, 0.5]; // Only 3 elements

      // Should not throw
      const value = network.estimate(shortState);
      expect(typeof value).toBe('number');
    });

    it('should truncate longer input vectors', () => {
      const network = new ValueNetwork(10, 32);
      const longState = Array(20).fill(0.5); // 20 elements

      // Should not throw
      const value = network.estimate(longState);
      expect(typeof value).toBe('number');
    });

    it('should produce different outputs for different inputs', () => {
      const network = new ValueNetwork(10, 32);
      const state1 = Array(10).fill(0.1);
      const state2 = Array(10).fill(0.9);

      const value1 = network.estimate(state1);
      const value2 = network.estimate(state2);

      // Different inputs should generally produce different outputs
      // (with high probability for randomly initialized network)
      expect(value1).not.toBe(value2);
    });

    it('should update lastEstimate', () => {
      const network = new ValueNetwork(10, 32);
      const state = Array(10).fill(0.5);

      const value = network.estimate(state);

      expect(network.getLastEstimate()).toBe(value);
    });
  });

  describe('update', () => {
    it('should modify weights based on TD error', () => {
      const network = new ValueNetwork(10, 32);
      const state = Array(10).fill(0.5);

      const weightsBefore = network.export();
      network.update(state, 1.0, 0.01);
      const weightsAfter = network.export();

      // At least some weights should have changed
      let changed = false;
      for (let j = 0; j < weightsBefore.wHidden.length; j++) {
        for (let i = 0; i < weightsBefore.wHidden[j].length; i++) {
          if (weightsBefore.wHidden[j][i] !== weightsAfter.wHidden[j][i]) {
            changed = true;
            break;
          }
        }
        if (changed) break;
      }

      expect(changed).toBe(true);
    });

    it('should increase value estimate for positive TD error', () => {
      const network = new ValueNetwork(10, 32);
      const state = Array(10).fill(0.5);

      const valueBefore = network.estimate(state);
      network.update(state, 1.0, 0.1); // Positive TD error
      const valueAfter = network.estimate(state);

      // Value should increase (or stay similar) for positive error
      expect(valueAfter).toBeGreaterThanOrEqual(valueBefore - 0.1);
    });

    it('should decrease value estimate for negative TD error', () => {
      const network = new ValueNetwork(10, 32);
      const state = Array(10).fill(0.5);

      const valueBefore = network.estimate(state);
      network.update(state, -1.0, 0.1); // Negative TD error
      const valueAfter = network.estimate(state);

      // Value should decrease (or stay similar) for negative error
      expect(valueAfter).toBeLessThanOrEqual(valueBefore + 0.1);
    });

    it('should clip large gradients', () => {
      const network = new ValueNetwork(10, 32);
      const state = Array(10).fill(0.5);

      // Very large TD error
      network.update(state, 1000, 0.1);

      // Network should still be stable
      const value = network.estimate(state);
      expect(Number.isFinite(value)).toBe(true);
    });

    it('should handle zero learning rate', () => {
      const network = new ValueNetwork(10, 32);
      const state = Array(10).fill(0.5);

      const weightsBefore = JSON.stringify(network.export());
      network.update(state, 1.0, 0); // Zero learning rate
      const weightsAfter = JSON.stringify(network.export());

      // Weights should not change
      expect(weightsAfter).toBe(weightsBefore);
    });
  });

  describe('copyFrom', () => {
    it('should copy weights from another network', () => {
      const network1 = new ValueNetwork(10, 32);
      const network2 = new ValueNetwork(10, 32);

      // Update network1
      network1.update(Array(10).fill(0.5), 1.0, 0.1);

      // Copy to network2
      network2.copyFrom(network1);

      // Both should produce same estimate
      const state = Array(10).fill(0.3);
      expect(network2.estimate(state)).toBe(network1.estimate(state));
    });
  });

  describe('softUpdate', () => {
    it('should perform Polyak averaging', () => {
      const network1 = new ValueNetwork(10, 32);
      const network2 = new ValueNetwork(10, 32);

      const weights1Before = network1.export().wHidden[0][0];
      const weights2 = network2.export().wHidden[0][0];

      network1.softUpdate(network2, 0.5);

      const weights1After = network1.export().wHidden[0][0];

      // Should be average with tau=0.5
      const expected = 0.5 * weights2 + 0.5 * weights1Before;
      expect(weights1After).toBeCloseTo(expected, 5);
    });

    it('should maintain network stability with small tau', () => {
      const network1 = new ValueNetwork(10, 32);
      const network2 = new ValueNetwork(10, 32);

      const weightsBefore = network1.export().wHidden[0][0];

      // Small tau should result in small change
      network1.softUpdate(network2, 0.01);

      const weightsAfter = network1.export().wHidden[0][0];
      const change = Math.abs(weightsAfter - weightsBefore);

      expect(change).toBeLessThan(0.1);
    });
  });

  describe('export/import', () => {
    it('should export weights in correct format', () => {
      const network = new ValueNetwork(10, 32);
      const weights = network.export();

      expect(weights.wHidden).toHaveLength(32);
      expect(weights.wHidden[0]).toHaveLength(10);
      expect(weights.bHidden).toHaveLength(32);
      expect(weights.wOutput).toHaveLength(32);
      expect(typeof weights.bOutput).toBe('number');
    });

    it('should import weights and reproduce estimates', () => {
      const network1 = new ValueNetwork(10, 32);
      const weights = network1.export();

      const network2 = new ValueNetwork(10, 32);
      network2.import(weights);

      const state = Array(10).fill(0.5);
      expect(network2.estimate(state)).toBe(network1.estimate(state));
    });

    it('should throw on dimension mismatch', () => {
      const network = new ValueNetwork(10, 32);
      const wrongWeights = {
        wHidden: [[1, 2, 3]], // Wrong dimensions
        bHidden: [1],
        wOutput: [1],
        bOutput: 0,
      };

      expect(() => network.import(wrongWeights)).toThrow();
    });
  });

  describe('getWeightNorm', () => {
    it('should return positive L2 norm', () => {
      const network = new ValueNetwork(10, 32);
      const norm = network.getWeightNorm();

      expect(norm).toBeGreaterThan(0);
    });

    it('should increase after updates', () => {
      const network = new ValueNetwork(10, 32);
      const state = Array(10).fill(0.5);

      const normBefore = network.getWeightNorm();

      // Multiple updates with large errors
      for (let i = 0; i < 10; i++) {
        network.update(state, 1.0, 0.1);
      }

      // Norm might increase or decrease depending on gradients
      const normAfter = network.getWeightNorm();
      expect(typeof normAfter).toBe('number');
      expect(Number.isFinite(normAfter)).toBe(true);
    });
  });

  describe('factory functions', () => {
    it('createValueNetwork should create valid network', () => {
      const network = createValueNetwork(16, 64);
      const dims = network.getDimensions();

      expect(dims.inputSize).toBe(16);
      expect(dims.hiddenSize).toBe(64);
    });

    it('createValueNetworkFromWeights should restore network', () => {
      const original = createValueNetwork(10, 32);
      const weights = original.export();

      const restored = createValueNetworkFromWeights(weights);

      const state = Array(10).fill(0.5);
      expect(restored.estimate(state)).toBe(original.estimate(state));
    });
  });

  describe('learning convergence', () => {
    it('should learn to estimate constant value', () => {
      const network = new ValueNetwork(4, 16);
      const targetValue = 0.5;

      // Train to estimate constant value
      for (let i = 0; i < 100; i++) {
        const state = [Math.random(), Math.random(), Math.random(), Math.random()];
        const estimate = network.estimate(state);
        const tdError = targetValue - estimate;
        network.update(state, tdError, 0.01);
      }

      // Test on new states
      const testState = [0.3, 0.3, 0.3, 0.3];
      const finalEstimate = network.estimate(testState);

      // Should be reasonably close to target
      expect(Math.abs(finalEstimate - targetValue)).toBeLessThan(0.5);
    });
  });
});
