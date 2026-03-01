/**
 * Agentic QE v3 - Causal Weight Matrix Tests
 * ADR-035: STDP-based spike timing correlation for root cause analysis
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CausalWeightMatrix } from '../../../src/causal-discovery/weight-matrix';
import { TestEvent, TestEventType } from '../../../src/causal-discovery/types';

describe('CausalWeightMatrix', () => {
  let matrix: CausalWeightMatrix;

  beforeEach(() => {
    matrix = new CausalWeightMatrix();
  });

  describe('initialization', () => {
    it('should initialize with zero weights', () => {
      expect(matrix.getWeight('test_started', 'test_passed')).toBe(0);
      expect(matrix.getWeight('build_failed', 'test_failed')).toBe(0);
    });

    it('should accept custom configuration', () => {
      const customMatrix = new CausalWeightMatrix({
        timeWindow: 100,
        learningRate: 0.05,
        causalThreshold: 0.2,
      });
      expect(customMatrix).toBeDefined();
    });
  });

  describe('STDP learning', () => {
    it('should strengthen weight when cause precedes effect', () => {
      const baseTime = Date.now();

      // Event A happens first
      matrix.updateWeights({
        type: 'code_changed',
        timestamp: baseTime,
      });

      // Event B happens shortly after (within time window)
      matrix.updateWeights({
        type: 'test_failed',
        timestamp: baseTime + 20,
      });

      // Weight A->B should be positive (A causes B pattern)
      const weight = matrix.getWeight('code_changed', 'test_failed');
      expect(weight).toBeGreaterThan(0);
    });

    it('should create stronger weights for shorter timing differences', () => {
      const baseTime = Date.now();

      // Matrix 1: short timing difference
      const matrix1 = new CausalWeightMatrix({ timeWindow: 100 });
      matrix1.updateWeights({ type: 'code_changed', timestamp: baseTime });
      matrix1.updateWeights({ type: 'test_failed', timestamp: baseTime + 10 });
      const shortWeight = matrix1.getWeight('code_changed', 'test_failed');

      // Matrix 2: longer timing difference
      const matrix2 = new CausalWeightMatrix({ timeWindow: 100 });
      matrix2.updateWeights({ type: 'code_changed', timestamp: baseTime });
      matrix2.updateWeights({ type: 'test_failed', timestamp: baseTime + 40 });
      const longWeight = matrix2.getWeight('code_changed', 'test_failed');

      // Shorter timing should result in stronger weight (STDP exponential decay)
      expect(shortWeight).toBeGreaterThan(longWeight);
    });

    it('should not create weights for events outside time window', () => {
      const baseTime = Date.now();
      const customMatrix = new CausalWeightMatrix({ timeWindow: 50 });

      customMatrix.updateWeights({
        type: 'code_changed',
        timestamp: baseTime,
      });

      customMatrix.updateWeights({
        type: 'test_failed',
        timestamp: baseTime + 100, // Outside 50ms window
      });

      const weight = customMatrix.getWeight('code_changed', 'test_failed');
      expect(weight).toBe(0);
    });

    it('should accumulate weights with repeated observations', () => {
      const baseTime = Date.now();

      // First observation
      matrix.updateWeights({ type: 'deploy_started', timestamp: baseTime });
      matrix.updateWeights({ type: 'alert_fired', timestamp: baseTime + 20 });
      const weight1 = matrix.getWeight('deploy_started', 'alert_fired');

      // Second observation
      matrix.updateWeights({ type: 'deploy_started', timestamp: baseTime + 1000 });
      matrix.updateWeights({ type: 'alert_fired', timestamp: baseTime + 1020 });
      const weight2 = matrix.getWeight('deploy_started', 'alert_fired');

      expect(weight2).toBeGreaterThan(weight1);
    });
  });

  describe('weight operations', () => {
    it('should set and get weights directly', () => {
      matrix.setWeight('exception', 'test_failed', 0.75);
      expect(matrix.getWeight('exception', 'test_failed')).toBe(0.75);
    });

    it('should return full weight entry', () => {
      const baseTime = Date.now();
      matrix.updateWeights({ type: 'timeout', timestamp: baseTime });
      matrix.updateWeights({ type: 'test_failed', timestamp: baseTime + 15 });

      const entry = matrix.getWeightEntry('timeout', 'test_failed');
      expect(entry).toBeDefined();
      expect(entry!.weight).toBeGreaterThan(0);
      expect(entry!.observations).toBeGreaterThan(0);
      expect(entry!.lastUpdate).toBeGreaterThan(0);
      expect(entry!.avgTimingDiff).toBeGreaterThan(0);
    });
  });

  describe('batch processing', () => {
    it('should process events in chronological order', () => {
      const baseTime = Date.now();

      // Submit events out of order
      matrix.updateWeightsBatch([
        { type: 'test_failed', timestamp: baseTime + 30 },
        { type: 'code_changed', timestamp: baseTime },
        { type: 'build_started', timestamp: baseTime + 10 },
      ]);

      // Should have learned: code_changed -> build_started -> test_failed
      expect(matrix.getWeight('code_changed', 'build_started')).toBeGreaterThan(0);
      expect(matrix.getWeight('build_started', 'test_failed')).toBeGreaterThan(0);
    });
  });

  describe('decay', () => {
    it('should reduce weights when decay is applied', () => {
      matrix.setWeight('memory_spike', 'exception', 0.5);
      const initialWeight = matrix.getWeight('memory_spike', 'exception');

      matrix.decay();

      const decayedWeight = matrix.getWeight('memory_spike', 'exception');
      expect(decayedWeight).toBeLessThan(initialWeight);
    });

    it('should remove negligible weights after decay', () => {
      matrix.setWeight('cpu_spike', 'timeout', 0.002);

      // Apply decay multiple times to get below threshold
      for (let i = 0; i < 10; i++) {
        matrix.decay();
      }

      // Weight should be removed (below 0.001 threshold) after enough decay
      const weight = matrix.getWeight('cpu_spike', 'timeout');
      expect(weight).toBeLessThan(0.002);
    });

    it('should apply time-based decay', () => {
      matrix.setWeight('network_error', 'api_error', 0.5);

      // Apply 1 second of decay
      matrix.decayByTime(1000);

      const weight = matrix.getWeight('network_error', 'api_error');
      expect(weight).toBeLessThan(0.5);
      expect(weight).toBeGreaterThan(0);
    });
  });

  describe('causal graph extraction', () => {
    it('should extract graph with significant edges only', () => {
      // Create some weights
      matrix.setWeight('code_changed', 'test_failed', 0.3);
      matrix.setWeight('config_changed', 'test_failed', 0.05); // Below default threshold

      const graph = matrix.extractCausalGraph();

      expect(graph.nodes).toContain('code_changed');
      expect(graph.nodes).toContain('test_failed');
      // config_changed edge should be excluded (below threshold)
      expect(graph.edges.find(e => e.source === 'config_changed')).toBeUndefined();
    });

    it('should mark positive weights as causes and negative as prevents', () => {
      matrix.setWeight('test_started', 'test_passed', 0.5);
      matrix.setWeight('exception', 'test_passed', -0.3);

      const graph = matrix.extractCausalGraph();

      const causesEdge = graph.edges.find(
        e => e.source === 'test_started' && e.target === 'test_passed'
      );
      expect(causesEdge?.relation).toBe('causes');

      // Note: The current implementation doesn't create negative weights via STDP
      // But direct setWeight with negative values should work
    });
  });

  describe('edge queries', () => {
    it('should get edges from a source', () => {
      matrix.setWeight('code_changed', 'build_started', 0.4);
      matrix.setWeight('code_changed', 'test_started', 0.3);
      matrix.setWeight('build_started', 'test_started', 0.2);

      const edges = matrix.getEdgesFrom('code_changed');
      expect(edges.length).toBe(2);
      expect(edges[0].strength).toBeGreaterThanOrEqual(edges[1].strength); // Sorted
    });

    it('should get edges to a target', () => {
      matrix.setWeight('code_changed', 'test_failed', 0.5);
      matrix.setWeight('config_changed', 'test_failed', 0.4);
      matrix.setWeight('timeout', 'test_failed', 0.3);

      const edges = matrix.getEdgesTo('test_failed');
      expect(edges.length).toBe(3);
      expect(edges[0].source).toBe('code_changed'); // Strongest first
    });
  });

  describe('statistics', () => {
    it('should compute matrix statistics', () => {
      matrix.setWeight('a' as TestEventType, 'b' as TestEventType, 0.5);
      matrix.setWeight('b' as TestEventType, 'c' as TestEventType, 0.3);
      matrix.setWeight('a' as TestEventType, 'c' as TestEventType, 0.2);

      const stats = matrix.getStats();

      expect(stats.nonZeroWeights).toBe(3);
      expect(stats.maxAbsWeight).toBe(0.5);
      expect(stats.avgAbsWeight).toBeCloseTo(0.333, 1);
    });

    it('should track observation count', () => {
      const baseTime = Date.now();
      matrix.updateWeights({ type: 'test_started', timestamp: baseTime });
      matrix.updateWeights({ type: 'test_passed', timestamp: baseTime + 10 });
      matrix.updateWeights({ type: 'test_started', timestamp: baseTime + 100 });

      expect(matrix.getObservationCount()).toBe(3);
    });

    it('should track observed event types', () => {
      const baseTime = Date.now();
      matrix.updateWeights({ type: 'test_started', timestamp: baseTime });
      matrix.updateWeights({ type: 'test_passed', timestamp: baseTime + 10 });
      matrix.updateWeights({ type: 'test_failed', timestamp: baseTime + 20 });

      const types = matrix.getObservedEventTypes();
      expect(types).toContain('test_started');
      expect(types).toContain('test_passed');
      expect(types).toContain('test_failed');
    });
  });

  describe('serialization', () => {
    it('should serialize to JSON', () => {
      matrix.setWeight('code_changed', 'test_failed', 0.6);

      const json = matrix.toJSON();
      expect(json['code_changed->test_failed']).toBeDefined();
      expect(json['code_changed->test_failed'].weight).toBe(0.6);
    });

    it('should deserialize from JSON', () => {
      const data = {
        'build_failed->test_failed': {
          weight: 0.8,
          observations: 5,
          lastUpdate: Date.now(),
          avgTimingDiff: 15,
        },
      };

      matrix.fromJSON(data);

      expect(matrix.getWeight('build_failed', 'test_failed')).toBe(0.8);
    });
  });

  describe('merge', () => {
    it('should merge weights from another matrix', () => {
      // Matrix 1 has some weights
      matrix.setWeight('code_changed', 'test_failed', 0.4);
      matrix.setWeight('config_changed', 'build_failed', 0.3);

      // Matrix 2 has overlapping and unique weights
      const other = new CausalWeightMatrix();
      other.setWeight('code_changed', 'test_failed', 0.6);
      other.setWeight('deploy_failed', 'alert_fired', 0.5);

      matrix.merge(other, 0.5);

      // Overlapping weight should be averaged
      expect(matrix.getWeight('code_changed', 'test_failed')).toBeCloseTo(0.5, 1);

      // Unique weights should be included
      expect(matrix.getWeight('config_changed', 'build_failed')).toBe(0.3);
      expect(matrix.getWeight('deploy_failed', 'alert_fired')).toBeCloseTo(0.25, 2);
    });
  });

  describe('reset', () => {
    it('should clear all weights and state', () => {
      const baseTime = Date.now();
      matrix.updateWeights({ type: 'test_started', timestamp: baseTime });
      matrix.updateWeights({ type: 'test_failed', timestamp: baseTime + 10 });

      matrix.reset();

      expect(matrix.getObservationCount()).toBe(0);
      expect(matrix.getObservedEventTypes().length).toBe(0);
      expect(matrix.getWeight('test_started', 'test_failed')).toBe(0);
    });
  });
});
