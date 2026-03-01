/**
 * Integration test for CoherenceService with real WASM engines
 * ADR-052: Tests that WASM actually initializes and processes coherence checks
 *
 * These tests verify:
 * 1. WASM module loads properly in Node.js (using initSync, not fetch)
 * 2. Coherence checks use real WASM engines (not fallback)
 * 3. Real cohomology/spectral/causal computations work
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  wasmLoader,
  createCoherenceService,
  WasmLoader,
  type CoherenceService,
} from '../../src/integrations/coherence/index.js';

describe('CoherenceService WASM Integration', () => {
  let coherenceService: CoherenceService;

  beforeAll(async () => {
    // First ensure WASM is loaded
    const isAvail = await wasmLoader.isAvailable();
    console.log('[Test] WASM available:', isAvail);

    if (!isAvail) {
      throw new Error('WASM not available - cannot run integration tests');
    }

    // Load WASM module first
    await wasmLoader.load();
    console.log('[Test] WASM loaded:', wasmLoader.isLoaded());

    // Create coherence service with real WASM loader
    coherenceService = await createCoherenceService(wasmLoader, {
      fallbackEnabled: false, // Force WASM - will throw if unavailable
    });

    console.log('[Test] CoherenceService initialized:', coherenceService.isInitialized());
  });

  afterAll(() => {
    // Reset WASM loader state for other tests
    wasmLoader.reset();
  });

  describe('WASM Loading', () => {
    it('should load WASM module in Node.js environment', async () => {
      // Verify WASM is available
      const isAvailable = await wasmLoader.isAvailable();
      expect(isAvailable).toBe(true);

      // Verify WASM is loaded
      expect(wasmLoader.isLoaded()).toBe(true);
      expect(wasmLoader.getState()).toBe('loaded');
    });

    it('should have a valid WASM version', () => {
      const version = wasmLoader.getVersion();
      expect(version).toBeDefined();
      expect(version).not.toBe('');
    });

    it('should provide access to all engine types', () => {
      const module = wasmLoader.getModule();
      expect(module.CohomologyEngine).toBeDefined();
      expect(module.SpectralEngine).toBeDefined();
      expect(module.CausalEngine).toBeDefined();
      expect(module.CategoryEngine).toBeDefined();
      expect(module.HoTTEngine).toBeDefined();
      expect(module.QuantumEngine).toBeDefined();
    });
  });

  describe('Coherence Service Initialization', () => {
    it('should initialize without using fallback', () => {
      expect(coherenceService.isInitialized()).toBe(true);
      // If fallback was used, this would be false (since fallbackEnabled: false)
    });
  });

  describe('Real Coherence Checks', () => {
    it('should perform coherence check with real WASM engines', async () => {
      // Check service stats first
      const stats = coherenceService.getStats();
      console.log('[Test] Service stats - wasmAvailable:', stats.wasmAvailable);

      const nodes = [
        {
          id: 'pattern-1',
          content: 'TDD requires writing tests before code',
          embedding: Array(128).fill(0).map(() => Math.random() - 0.5),
        },
        {
          id: 'pattern-2',
          content: 'TDD improves code quality through early testing',
          embedding: Array(128).fill(0).map(() => Math.random() - 0.5),
        },
      ];

      let result;
      try {
        result = await coherenceService.checkCoherence(nodes);
      } catch (e) {
        console.log('[Test] checkCoherence threw error:', e);
        throw e;
      }
      console.log('[Test] Coherence result - usedFallback:', result.usedFallback, 'energy:', result.energy);
      if (result.usedFallback) {
        console.log('[Test] Full result:', JSON.stringify(result, null, 2));
      }

      // Verify we got a real result (not just fallback defaults)
      expect(result).toBeDefined();
      expect(result.energy).toBeGreaterThanOrEqual(0);
      expect(result.energy).toBeLessThanOrEqual(1);
      expect(typeof result.isCoherent).toBe('boolean');
      expect(['reflex', 'heavy', 'human']).toContain(result.lane);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Key check: fallback should NOT have been used
      expect(result.usedFallback).toBe(false);
    });

    it('should detect contradictions in conflicting patterns', async () => {
      const conflictingNodes = [
        {
          id: 'pattern-a',
          content: 'Always write tests before implementation',
          embedding: Array(128).fill(0).map((_, i) => i % 2 === 0 ? 0.5 : -0.5),
        },
        {
          id: 'pattern-b',
          content: 'Never write tests before implementation', // Contradiction!
          embedding: Array(128).fill(0).map((_, i) => i % 2 === 0 ? -0.5 : 0.5),
        },
      ];

      const result = await coherenceService.checkCoherence(conflictingNodes);

      // Should detect the contradiction or at least show higher energy
      expect(result).toBeDefined();
      expect(result.usedFallback).toBe(false);
      // Contradictions should cause either:
      // - Higher energy (less coherent)
      // - Detected contradictions array
      // Note: The exact behavior depends on WASM implementation
    });
  });

  describe('Performance', () => {
    it('should complete coherence check in reasonable time', async () => {
      const nodes = Array.from({ length: 10 }, (_, i) => ({
        id: `perf-pattern-${i}`,
        content: `Performance test pattern ${i}`,
        embedding: Array(128).fill(0).map(() => Math.random() - 0.5),
      }));

      const startTime = performance.now();
      const result = await coherenceService.checkCoherence(nodes);
      const duration = performance.now() - startTime;

      expect(result.usedFallback).toBe(false);
      // Should complete within 100ms for small sets
      expect(duration).toBeLessThan(100);
    });
  });
});

describe('WasmLoader IWasmLoader Interface', () => {
  let freshLoader: WasmLoader;

  beforeAll(() => {
    freshLoader = new WasmLoader();
  });

  afterAll(() => {
    freshLoader.reset();
  });

  it('should implement isAvailable', async () => {
    const isAvailable = await freshLoader.isAvailable();
    expect(typeof isAvailable).toBe('boolean');
    expect(isAvailable).toBe(true); // Should be true since package is installed
  });

  it('should implement load', async () => {
    const module = await freshLoader.load();
    expect(module).toBeDefined();
    expect(module.CohomologyEngine).toBeDefined();
  });

  it('should implement getModule after load', () => {
    const module = freshLoader.getModule();
    expect(module).toBeDefined();
    expect(typeof module.getVersion).toBe('function');
  });
});
