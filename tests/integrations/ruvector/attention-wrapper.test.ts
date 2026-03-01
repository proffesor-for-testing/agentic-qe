/**
 * @ruvector/attention Wrapper Integration Tests
 *
 * Real integration tests for QEFlashAttention wrapper that delegates to @ruvector/attention.
 * These tests require native ARM64 binaries to be built and available.
 *
 * Prerequisites:
 * - Rust toolchain installed
 * - ARM64 binaries built from ruvector source
 * - See: src/integrations/ruvector/TESTING_LIMITATIONS.md
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  QEFlashAttention,
  createQEFlashAttention,
  getQEFlashAttentionConfig,
  getWorkloadTypes,
  batchComputeAttention,
  checkRuvectorPackagesAvailable,
  toFloat32Array,
} from '../../../src/integrations/ruvector/wrappers';

// Skip tests if packages aren't available
const canTest = checkRuvectorPackagesAvailable();

// Skip tests if packages not available - see TESTING_LIMITATIONS.md for build instructions
describe.runIf(canTest.attention)('@ruvector/attention Wrapper - Real Integration', () => {
  describe('Package Availability', () => {
    it('should verify attention package is available', () => {
      expect(canTest.attention).toBe(true);
    });
  });

  describe('QEFlashAttention - Real Operations', () => {
    let fa: QEFlashAttention;

    beforeAll(async () => {
      fa = await createQEFlashAttention('test-similarity', {
        strategy: 'flash',
        dim: 384,
        blockSize: 64,
      });
      await fa.initialize();
    });

    it('should create instance with workload', () => {
      expect(fa).toBeDefined();
      expect(fa.getWorkload()).toBe('test-similarity');
    });

    it('should get configuration', () => {
      const config = fa.getConfig();
      expect(config).toBeDefined();
      expect(config.strategy).toBe('flash');
      expect(config.dim).toBe(384);
      expect(config.blockSize).toBe(64);
    });

    it('should compute Flash Attention', async () => {
      const seqLen = 10;
      const dim = 384;
      const Q = new Float32Array(seqLen * dim).fill(0.1);
      const K = new Float32Array(seqLen * dim).fill(0.2);
      const V = new Float32Array(seqLen * dim).fill(0.3);

      const result = await fa.computeFlashAttention(Q, K, V, seqLen, dim);

      expect(result).toBeDefined();
      expect(result).toBeInstanceOf(Float32Array);
      // @ruvector/attention returns a single vector (dim), not full matrix (seqLen * dim)
      expect(result.length).toBe(dim);
    });

    it('should compute Baseline Attention', async () => {
      const seqLen = 10;
      const dim = 384;
      const Q = new Float32Array(seqLen * dim).fill(0.1);
      const K = new Float32Array(seqLen * dim).fill(0.2);
      const V = new Float32Array(seqLen * dim).fill(0.3);

      const result = await fa.computeBaselineAttention(Q, K, V, seqLen, dim);

      expect(result).toBeDefined();
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(seqLen * dim);
    });

    it('should change attention strategy', () => {
      fa.changeStrategy('dot-product');
      expect(fa.getConfig().strategy).toBe('dot-product');

      fa.changeStrategy('multi-head');
      expect(fa.getConfig().strategy).toBe('multi-head');

      fa.changeStrategy('flash');
      expect(fa.getConfig().strategy).toBe('flash');
    });

    it('should get metrics', () => {
      const metrics = fa.getMetrics();
      expect(metrics).toBeDefined();
      expect(Array.isArray(metrics)).toBe(true);
    });

    it('should get average speedup', () => {
      const avgSpeedup = fa.getAverageSpeedup();
      expect(avgSpeedup).toBeGreaterThanOrEqual(0);
    });

    it('should dispose properly', () => {
      expect(() => fa.dispose()).not.toThrow();
    });
  });

  describe('Attention Strategies', () => {
    // Strategies that don't require special parameters
    const simpleStrategies = [
      'flash',
      'dot-product',
      'multi-head',
      'linear',
      'moe',
    ] as const;

    it.each(simpleStrategies)('should support %s strategy', async (strategy) => {
      const fa = await createQEFlashAttention('test-similarity', {
        strategy,
        dim: 256,
      });
      await fa.initialize();

      expect(fa.getConfig().strategy).toBe(strategy);

      // Verify it can compute attention
      const seqLen = 5;
      const dim = 256;
      const Q = new Float32Array(seqLen * dim).fill(0.1);
      const K = new Float32Array(seqLen * dim).fill(0.2);
      const V = new Float32Array(seqLen * dim).fill(0.3);

      const result = await fa.computeFlashAttention(Q, K, V, seqLen, dim);
      expect(result).toBeInstanceOf(Float32Array);
    });

    it('should support hyperbolic strategy with curvature', async () => {
      const fa = await createQEFlashAttention('test-similarity', {
        strategy: 'hyperbolic',
        dim: 256,
        curvature: 0.5, // Required for hyperbolic attention
      });
      await fa.initialize();

      expect(fa.getConfig().strategy).toBe('hyperbolic');
      expect(fa.getConfig().curvature).toBe(0.5);

      // Verify it can compute attention
      const seqLen = 5;
      const dim = 256;
      const Q = new Float32Array(seqLen * dim).fill(0.1);
      const K = new Float32Array(seqLen * dim).fill(0.2);
      const V = new Float32Array(seqLen * dim).fill(0.3);

      const result = await fa.computeFlashAttention(Q, K, V, seqLen, dim);
      expect(result).toBeInstanceOf(Float32Array);
    });
  });

  describe('QE Workload Types', () => {
    it('should get all workload types', () => {
      const workloadTypes = getWorkloadTypes();

      expect(workloadTypes).toContain('test-similarity');
      expect(workloadTypes).toContain('code-embedding');
      expect(workloadTypes).toContain('defect-matching');
      expect(workloadTypes).toContain('coverage-analysis');
      expect(workloadTypes).toContain('pattern-adaptation');
    });

    it.each([
      'test-similarity',
      'code-embedding',
      'defect-matching',
      'coverage-analysis',
      'pattern-adaptation',
    ] as const)('should create for workload %s', async (workload) => {
      const fa = await createQEFlashAttention(workload);
      await fa.initialize();

      expect(fa.getWorkload()).toBe(workload);
    });
  });

  describe('Configuration', () => {
    it('should get config for workload', () => {
      const config = getQEFlashAttentionConfig('defect-matching');

      expect(config).toBeDefined();
      expect(config.strategy).toBeDefined();
      expect(config.dim).toBeGreaterThan(0);
    });

    it('should create with custom config', async () => {
      const fa = await createQEFlashAttention('test-similarity', {
        strategy: 'moe',
        dim: 512,
        blockSize: 128,
      });

      expect(fa.getConfig().strategy).toBe('moe');
      expect(fa.getConfig().dim).toBe(512);
      expect(fa.getConfig().blockSize).toBe(128);
    });
  });

  describe('Batch Operations', () => {
    it('should batch compute attention', async () => {
      // Note: batchComputeAttention uses default config for workload
      // 'test-similarity' has dim: 384, so vectors must be 384-dimensional
      const dim = 384;
      const queries = [
        new Float32Array(dim).fill(0.1),
        new Float32Array(dim).fill(0.5),
      ];
      const keys = [
        new Float32Array(dim).fill(0.2),
        new Float32Array(dim).fill(0.6),
      ];
      const values = [
        new Float32Array(dim).fill(0.3),
        new Float32Array(dim).fill(0.7),
      ];

      const results = await batchComputeAttention(
        'test-similarity',
        queries,
        keys,
        values
      );

      expect(results).toBeDefined();
      expect(results).toHaveLength(2);
      expect(results[0]).toBeInstanceOf(Float32Array);
      // batchComputeAttention returns single vectors (dim size)
      expect(results[0].length).toBe(dim);
    });
  });

  describe('Utility Functions', () => {
    it('should convert to Float32Array', () => {
      const input = [0.1, 0.2, 0.3, 0.4];
      const result = toFloat32Array(input);

      expect(result).toBeInstanceOf(Float32Array);
      // Use approximate comparison since Float32 has limited precision
      expect(Array.from(result)).toHaveLength(4);
      expect(result[0]).toBeCloseTo(0.1, 6);
      expect(result[1]).toBeCloseTo(0.2, 6);
      expect(result[2]).toBeCloseTo(0.3, 6);
      expect(result[3]).toBeCloseTo(0.4, 6);
    });

    it('should handle empty array conversion', () => {
      const input: number[] = [];
      const result = toFloat32Array(input);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(0);
    });

    it('should handle large arrays', () => {
      const input = Array.from({ length: 10000 }, (_, i) => i * 0.001);
      const result = toFloat32Array(input);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(10000);
    });
  });

  describe('Real Attention Computation', () => {
    let fa: QEFlashAttention;

    beforeAll(async () => {
      fa = await createQEFlashAttention('test-similarity', {
        strategy: 'flash',
        dim: 128,
      });
      await fa.initialize();
    });

    it('should compute attention with real data', async () => {
      const seqLen = 4;
      const dim = 128; // Must match the initialized dimension

      // Create realistic query, key, value matrices
      const Q = new Float32Array(seqLen * dim);
      const K = new Float32Array(seqLen * dim);
      const V = new Float32Array(seqLen * dim);

      for (let i = 0; i < seqLen * dim; i++) {
        Q[i] = Math.sin(i * 0.1) * 0.5;
        K[i] = Math.cos(i * 0.1) * 0.5;
        V[i] = Math.tan(i * 0.01) * 0.3;
      }

      const result = await fa.computeFlashAttention(Q, K, V, seqLen, dim);

      expect(result).toBeDefined();
      expect(result).toBeInstanceOf(Float32Array);
      // @ruvector/attention returns single vector (dim), not full matrix
      expect(result.length).toBe(dim);

      // Verify output contains reasonable values (not NaN or Infinity)
      for (let i = 0; i < result.length; i++) {
        expect(Number.isFinite(result[i])).toBe(true);
      }
    });

    it('should handle different sequence lengths', async () => {
      const dim = 128; // Must match the initialized dimension

      for (const seqLen of [1, 5, 10, 20]) {
        const Q = new Float32Array(seqLen * dim).fill(0.1);
        const K = new Float32Array(seqLen * dim).fill(0.2);
        const V = new Float32Array(seqLen * dim).fill(0.3);

        const result = await fa.computeFlashAttention(Q, K, V, seqLen, dim);

        // @ruvector/attention returns single vector (dim)
        expect(result.length).toBe(dim);
      }
    });

    it('should produce different outputs for different inputs', async () => {
      const seqLen = 5;
      const dim = 128; // Must match the initialized dimension

      const Q1 = new Float32Array(seqLen * dim).fill(0.1);
      const K1 = new Float32Array(seqLen * dim).fill(0.2);
      const V1 = new Float32Array(seqLen * dim).fill(0.3);

      const Q2 = new Float32Array(seqLen * dim).fill(0.5);
      const K2 = new Float32Array(seqLen * dim).fill(0.6);
      const V2 = new Float32Array(seqLen * dim).fill(0.7);

      const result1 = await fa.computeFlashAttention(Q1, K1, V1, seqLen, dim);
      const result2 = await fa.computeFlashAttention(Q2, K2, V2, seqLen, dim);

      // Results should be different for different inputs
      expect(result1[0]).not.toBe(result2[0]);
    });
  });
});

describe.runIf(canTest.all)('@ruvector Attention Wrapper - Cross Package', () => {
  it('should verify all @ruvector packages are available', () => {
    expect(checkRuvectorPackagesAvailable().all).toBe(true);
  });
});
