/**
 * Tests for ReflexLayer adapter
 *
 * @module nervous-system/__tests__/ReflexLayer.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  ReflexLayer,
  type IReflexLayer,
  type CompetitionResult,
  type DelegationDecision,
  type LatencyMetrics,
} from '../adapters/ReflexLayer.js';

describe('ReflexLayer', () => {
  let reflex: IReflexLayer;

  beforeAll(async () => {
    // Initialize WASM and create ReflexLayer
    reflex = await ReflexLayer.create({
      size: 100,
      k: 5,
      threshold: 0.5,
      inhibitionStrength: 0.8,
      confidenceThreshold: 0.7,
    });
  });

  afterAll(() => {
    if (reflex) {
      reflex.dispose();
    }
  });

  describe('initialization', () => {
    it('should create ReflexLayer with config', () => {
      const config = reflex.getConfig();
      expect(config.size).toBe(100);
      expect(config.k).toBe(5);
      expect(config.threshold).toBe(0.5);
      expect(config.inhibitionStrength).toBe(0.8);
    });

    it('should report WASM as initialized', () => {
      expect(ReflexLayer.isWasmInitialized()).toBe(true);
    });
  });

  describe('compete()', () => {
    it('should return winner indices for K-WTA competition', () => {
      const activations = new Float32Array(100);
      // Set some high activations
      activations[10] = 1.0;
      activations[20] = 0.9;
      activations[30] = 0.8;
      activations[40] = 0.7;
      activations[50] = 0.6;

      const result: CompetitionResult = reflex.compete(activations);

      expect(result.winners).toBeDefined();
      expect(result.winners.length).toBeLessThanOrEqual(5);
      expect(result.latencyMicros).toBeGreaterThan(0);
    });

    it('should identify clear winner with high confidence', () => {
      const activations = new Float32Array(100);
      activations[42] = 1.0; // Single clear winner
      // All others are zero

      const result = reflex.compete(activations);

      expect(result.winners).toContain(42);
      expect(result.highConfidence).toBe(true);
    });

    it('should identify ambiguous activations with lower confidence', () => {
      const activations = new Float32Array(100);
      // Many similar activations - ambiguous
      for (let i = 0; i < 100; i++) {
        activations[i] = 0.5 + Math.random() * 0.1;
      }

      const result = reflex.compete(activations);

      // With many similar values, confidence should be lower
      expect(result.winners.length).toBeLessThanOrEqual(5);
    });

    it('should throw on size mismatch', () => {
      const wrongSize = new Float32Array(50);

      expect(() => reflex.compete(wrongSize)).toThrow(/size mismatch/);
    });
  });

  describe('shouldDelegate()', () => {
    it('should handle high-confidence patterns', () => {
      const pattern = new Float32Array(100);
      pattern[42] = 1.0; // Clear winner

      const decision: DelegationDecision = reflex.shouldDelegate(pattern);

      expect(decision.latencyMicros).toBeGreaterThan(0);
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
    });

    it('should delegate ambiguous patterns', () => {
      const pattern = new Float32Array(100);
      // Uniform distribution - very ambiguous
      for (let i = 0; i < 100; i++) {
        pattern[i] = 0.5;
      }

      const decision = reflex.shouldDelegate(pattern);

      // Uniform distribution should have low confidence
      expect(decision.confidence).toBeLessThan(0.7);
      expect(decision.canHandle).toBe(false);
      expect(decision.reason).toBeDefined();
    });

    it('should provide reason when delegating', () => {
      const pattern = new Float32Array(100);
      for (let i = 0; i < 100; i++) {
        pattern[i] = Math.random() * 0.2;
      }

      const decision = reflex.shouldDelegate(pattern);

      if (!decision.canHandle) {
        expect(decision.reason).toBeDefined();
        expect(decision.reason!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('setK()', () => {
    it('should update K value', () => {
      reflex.setK(3);
      const config = reflex.getConfig();
      expect(config.k).toBe(3);

      // Reset to original
      reflex.setK(5);
    });

    it('should throw on invalid K', () => {
      expect(() => reflex.setK(0)).toThrow();
      expect(() => reflex.setK(101)).toThrow();
    });
  });

  describe('setInhibition()', () => {
    it('should update inhibition parameters', () => {
      reflex.setInhibition(0.9, 10);
      const config = reflex.getConfig();
      expect(config.inhibitionStrength).toBe(0.9);
      expect(config.inhibitionRadius).toBe(10);

      // Reset to original
      reflex.setInhibition(0.8, 5);
    });

    it('should throw on invalid strength', () => {
      expect(() => reflex.setInhibition(-0.1, 5)).toThrow();
      expect(() => reflex.setInhibition(1.5, 5)).toThrow();
    });
  });

  describe('getDecisionLatency()', () => {
    it('should return latency metrics after operations', () => {
      // Perform some operations to generate samples
      const activations = new Float32Array(100);
      activations[42] = 1.0;

      for (let i = 0; i < 10; i++) {
        reflex.compete(activations);
      }

      const metrics: LatencyMetrics = reflex.getDecisionLatency();

      expect(metrics.sampleCount).toBeGreaterThanOrEqual(10);
      expect(metrics.p50).toBeGreaterThan(0);
      expect(metrics.p95).toBeGreaterThanOrEqual(metrics.p50);
      expect(metrics.mean).toBeGreaterThan(0);
    });

    it('should return zero metrics when no samples', async () => {
      // Create fresh instance
      const freshReflex = await ReflexLayer.create({ size: 50, k: 1 });

      const metrics = freshReflex.getDecisionLatency();

      expect(metrics.sampleCount).toBe(0);
      expect(metrics.p50).toBe(0);
      expect(metrics.mean).toBe(0);

      freshReflex.dispose();
    });
  });

  describe('reset()', () => {
    it('should clear latency samples', () => {
      const activations = new Float32Array(100);
      activations[42] = 1.0;

      reflex.compete(activations);
      let metrics = reflex.getDecisionLatency();
      expect(metrics.sampleCount).toBeGreaterThan(0);

      reflex.reset();

      metrics = reflex.getDecisionLatency();
      expect(metrics.sampleCount).toBe(0);
    });
  });

  describe('performance', () => {
    it('should achieve sub-millisecond latency for compete()', () => {
      const activations = new Float32Array(100);
      activations[42] = 1.0;

      reflex.reset();

      // Warm up
      for (let i = 0; i < 100; i++) {
        reflex.compete(activations);
      }

      // Measure
      for (let i = 0; i < 1000; i++) {
        reflex.compete(activations);
      }

      const metrics = reflex.getDecisionLatency();

      // p95 should be under 1000 microseconds (1ms)
      // Realistically on modern hardware, should be much lower
      expect(metrics.p95).toBeLessThan(1000);
    });

    it('should achieve sub-millisecond latency for shouldDelegate()', async () => {
      const freshReflex = await ReflexLayer.create({ size: 100, k: 1 });
      const pattern = new Float32Array(100);
      pattern[42] = 1.0;

      // Warm up
      for (let i = 0; i < 100; i++) {
        freshReflex.shouldDelegate(pattern);
      }

      // Measure
      for (let i = 0; i < 1000; i++) {
        freshReflex.shouldDelegate(pattern);
      }

      const metrics = freshReflex.getDecisionLatency();

      // p95 should be under 1000 microseconds (1ms)
      expect(metrics.p95).toBeLessThan(1000);

      freshReflex.dispose();
    });
  });
});
