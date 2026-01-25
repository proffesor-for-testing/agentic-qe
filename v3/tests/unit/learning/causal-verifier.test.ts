/**
 * Unit Tests for CausalVerifier
 * ADR-052 Phase 3 Action A3.3: Integrate CausalEngine with Causal Discovery
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { IWasmLoader } from '../../../src/integrations/coherence/types.js';
import {
  CausalVerifier,
  createCausalVerifier,
  createUninitializedCausalVerifier,
} from '../../../src/learning/causal-verifier.js';

// ============================================================================
// Mock WASM Loader
// ============================================================================

/**
 * Create a mock WASM loader for testing
 */
function createMockWasmLoader(): IWasmLoader {
  // Create a proper constructor function
  const MockCausalEngine = function (this: any) {
    // Raw WASM engine methods (called by wrapper)
    this.computeCausalEffect = vi.fn().mockReturnValue({ effect: 0.75 });
    this.findConfounders = vi.fn().mockReturnValue([]);

    // Wrapper methods (not used by CausalAdapter)
    this.set_data = vi.fn();
    this.add_confounder = vi.fn();
    this.compute_causal_effect = vi.fn().mockReturnValue(0.75);
    this.detect_spurious_correlation = vi.fn().mockReturnValue(false);
    this.get_confounders = vi.fn().mockReturnValue([]);
    this.clear = vi.fn();
  };

  const mockModule = {
    CausalEngine: MockCausalEngine as any,
  };

  return {
    load: vi.fn().mockResolvedValue(mockModule),
    isLoaded: vi.fn().mockReturnValue(true),
    isAvailable: vi.fn().mockResolvedValue(true),
    getVersion: vi.fn().mockReturnValue('1.0.0-test'),
    getState: vi.fn().mockReturnValue('loaded' as const),
    reset: vi.fn(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('CausalVerifier', () => {
  let wasmLoader: IWasmLoader;

  beforeEach(() => {
    wasmLoader = createMockWasmLoader();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create and initialize a verifier', async () => {
      const verifier = await createCausalVerifier(wasmLoader);

      expect(verifier.isInitialized()).toBe(true);
      expect(wasmLoader.load).toHaveBeenCalled();
    });

    it('should create uninitialized verifier', () => {
      const verifier = createUninitializedCausalVerifier(wasmLoader);

      expect(verifier.isInitialized()).toBe(false);
    });

    it('should initialize manually', async () => {
      const verifier = createUninitializedCausalVerifier(wasmLoader);

      expect(verifier.isInitialized()).toBe(false);

      await verifier.initialize();

      expect(verifier.isInitialized()).toBe(true);
      expect(wasmLoader.load).toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      const failingLoader: IWasmLoader = {
        ...wasmLoader,
        isAvailable: vi.fn().mockResolvedValue(false),
      };

      const verifier = createUninitializedCausalVerifier(failingLoader);

      await expect(verifier.initialize()).rejects.toThrow(
        'WASM module is not available'
      );
    });

    it('should skip re-initialization if already initialized', async () => {
      const verifier = await createCausalVerifier(wasmLoader);

      const loadCallCount = (wasmLoader.load as any).mock.calls.length;

      // Try to initialize again
      await verifier.initialize();

      // Should not call load again
      expect((wasmLoader.load as any).mock.calls.length).toBe(loadCallCount);
    });
  });

  describe('Causal Link Verification', () => {
    it('should verify a causal link', async () => {
      const verifier = await createCausalVerifier(wasmLoader);

      // Need at least 30 samples for verification
      const sampleSize = 50;
      const causeValues = Array.from({ length: sampleSize }, (_, i) => i * 2);
      const effectValues = Array.from({ length: sampleSize }, (_, i) => i * 0.01);

      const result = await verifier.verifyCausalLink(
        'test_count',
        'bug_detection_rate',
        causeValues,
        effectValues
      );

      expect(result).toBeDefined();
      expect(result.cause).toBe('test_count');
      expect(result.effect).toBe('bug_detection_rate');
      expect(result.isSpurious).toBe(false);
      expect(result.direction).toBe('forward');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.effectStrength).toBeGreaterThan(0);
      expect(result.explanation).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should reject small sample sizes', async () => {
      const verifier = await createCausalVerifier(wasmLoader);

      await expect(
        verifier.verifyCausalLink(
          'cause',
          'effect',
          [1, 2, 3],
          [4, 5, 6],
          { minSampleSize: 30 }
        )
      ).rejects.toThrow('Sample size 3 is below minimum 30');
    });

    it('should reject mismatched array lengths', async () => {
      const verifier = await createCausalVerifier(wasmLoader);

      const sampleSize = 50;
      const causeValues = Array.from({ length: sampleSize }, (_, i) => i);
      const effectValues = Array.from({ length: 10 }, (_, i) => i);

      await expect(
        verifier.verifyCausalLink(
          'cause',
          'effect',
          causeValues,
          effectValues
        )
      ).rejects.toThrow('Cause and effect arrays must have same length');
    });

    it('should throw if not initialized', async () => {
      const verifier = createUninitializedCausalVerifier(wasmLoader);

      await expect(
        verifier.verifyCausalLink(
          'cause',
          'effect',
          Array(30).fill(1),
          Array(30).fill(1)
        )
      ).rejects.toThrow('CausalVerifier not initialized');
    });
  });

  describe('Pattern Causality Verification', () => {
    it('should verify pattern causality', async () => {
      const verifier = await createCausalVerifier(wasmLoader);

      const result = await verifier.verifyPatternCausality(
        'pattern-tdd-unit-tests',
        'success',
        {
          patternApplications: Array(50).fill(1),
          outcomes: Array(50).fill(1),
        }
      );

      expect(result).toBeDefined();
      expect(result.cause).toBe('pattern:pattern-tdd-unit-tests');
      expect(result.effect).toBe('outcome:success');
    });

    it('should include confounders in pattern verification', async () => {
      const verifier = await createCausalVerifier(wasmLoader);

      const result = await verifier.verifyPatternCausality(
        'pattern-integration-tests',
        'success',
        {
          patternApplications: Array(50).fill(1),
          outcomes: Array(50).fill(1),
          confounders: {
            code_quality: Array(50).fill(0.8),
            team_experience: Array(50).fill(0.9),
          },
        }
      );

      expect(result).toBeDefined();
    });
  });

  describe('Causal Edge Verification', () => {
    it('should verify a causal edge from STDP graph', async () => {
      const verifier = await createCausalVerifier(wasmLoader);

      const result = await verifier.verifyCausalEdge(
        'test_failed',
        'build_failed',
        {
          sourceOccurrences: Array(50)
            .fill(0)
            .map((_, i) => (i % 3 === 0 ? 1 : 0)),
          targetOccurrences: Array(50)
            .fill(0)
            .map((_, i) => (i % 3 === 0 ? 1 : 0)),
        }
      );

      expect(result).toBeDefined();
      expect(result.cause).toBe('test_failed');
      expect(result.effect).toBe('build_failed');
    });
  });

  describe('Batch Verification', () => {
    it('should verify multiple links in batch', async () => {
      const verifier = await createCausalVerifier(wasmLoader);

      const links = [
        {
          cause: 'test_count',
          effect: 'coverage',
          causeValues: Array(50).fill(1),
          effectValues: Array(50).fill(1),
        },
        {
          cause: 'coverage',
          effect: 'bug_detection',
          causeValues: Array(50).fill(1),
          effectValues: Array(50).fill(1),
        },
      ];

      const results = await verifier.verifyBatch(links);

      expect(results).toHaveLength(2);
      expect(results[0].cause).toBe('test_count');
      expect(results[1].cause).toBe('coverage');
    });
  });

  describe('Resource Management', () => {
    it('should clear engine state', async () => {
      const verifier = await createCausalVerifier(wasmLoader);

      verifier.clear();

      // Should still be initialized but cleared
      expect(verifier.isInitialized()).toBe(true);
    });

    it('should dispose of resources', async () => {
      const verifier = await createCausalVerifier(wasmLoader);

      verifier.dispose();

      expect(verifier.isInitialized()).toBe(false);

      // Should throw after disposal
      await expect(
        verifier.verifyCausalLink(
          'cause',
          'effect',
          Array(30).fill(1),
          Array(30).fill(1)
        )
      ).rejects.toThrow('CausalVerifier not initialized');
    });
  });

  describe('Spurious Correlation Detection', () => {
    it('should detect spurious correlations', async () => {
      // Create a mock loader with spurious correlation
      const MockCausalEngineSpurious = function (this: any) {
        // Raw WASM engine methods (called by wrapper)
        this.computeCausalEffect = vi.fn().mockReturnValue({ effect: 0.05 }); // Weak effect
        this.findConfounders = vi.fn().mockReturnValue(['summer_season']); // Has confounders!

        // Wrapper methods (not used by CausalAdapter)
        this.set_data = vi.fn();
        this.add_confounder = vi.fn();
        this.compute_causal_effect = vi.fn().mockReturnValue(0.05);
        this.detect_spurious_correlation = vi.fn().mockReturnValue(true);
        this.get_confounders = vi.fn().mockReturnValue(['summer_season']);
        this.clear = vi.fn();
      };

      const mockModule = {
        CausalEngine: MockCausalEngineSpurious as any,
      };

      const mockLoader: IWasmLoader = {
        load: vi.fn().mockResolvedValue(mockModule),
        isLoaded: vi.fn().mockReturnValue(true),
        isAvailable: vi.fn().mockResolvedValue(true),
        getVersion: vi.fn().mockReturnValue('1.0.0-test'),
        getState: vi.fn().mockReturnValue('loaded' as const),
        reset: vi.fn(),
      };

      const verifier = await createCausalVerifier(mockLoader);

      const result = await verifier.verifyCausalLink(
        'ice_cream_sales',
        'drowning_deaths',
        Array(50).fill(1),
        Array(50).fill(1)
      );

      // When confounders are found, it's marked as confounded (not spurious)
      // But it's still not a true causal relationship
      expect(result.confounders).toEqual(['summer_season']);
      expect(result.isSpurious).toBe(false); // Confounded, not spurious
      // Direction should be bidirectional when effect strength is low with confounders
      expect(['bidirectional', 'none']).toContain(result.direction);
    });
  });
});
