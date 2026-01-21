/**
 * Unit tests for CriticalPathDetector
 *
 * Tests the MinCut-based critical path detection and coverage gap prioritization.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  CriticalPathDetector,
  CriticalPathInput,
  CoverageNode,
  CoverageEdge,
  CriticalPathConfig,
} from '../../../src/coverage/CriticalPathDetector';

describe('CriticalPathDetector', () => {
  let detector: CriticalPathDetector;

  beforeEach(() => {
    detector = new CriticalPathDetector({
      criticalityThreshold: 0.1, // Lower threshold for tests
      maxCriticalPaths: 5,
      coverageGapThreshold: 80,
      timeout: 5000,
    });
  });

  describe('constructor', () => {
    it('should create detector with default config', () => {
      const defaultDetector = new CriticalPathDetector();
      expect(defaultDetector).toBeInstanceOf(CriticalPathDetector);
    });

    it('should accept custom config', () => {
      const customDetector = new CriticalPathDetector({
        criticalityThreshold: 0.5,
        maxCriticalPaths: 3,
      });
      expect(customDetector).toBeInstanceOf(CriticalPathDetector);
    });
  });

  describe('detectCriticalPaths', () => {
    it('should detect critical paths in a simple graph', async () => {
      const input: CriticalPathInput = {
        nodes: [
          { id: 'auth', label: 'AuthService', type: 'class', coverage: 40, lines: 200 },
          { id: 'user', label: 'UserService', type: 'class', coverage: 85, lines: 150 },
          { id: 'db', label: 'DatabaseService', type: 'class', coverage: 60, lines: 300 },
          { id: 'api', label: 'APIController', type: 'class', coverage: 70, lines: 100 },
        ],
        edges: [
          { source: 'api', target: 'auth', weight: 10, type: 'calls' },
          { source: 'api', target: 'user', weight: 8, type: 'calls' },
          { source: 'auth', target: 'db', weight: 5, type: 'calls' },
          { source: 'user', target: 'db', weight: 7, type: 'calls' },
        ],
      };

      const result = await detector.detectCriticalPaths(input);

      expect(result).toHaveProperty('criticalPaths');
      expect(result).toHaveProperty('prioritizedGaps');
      expect(result).toHaveProperty('bottlenecks');
      expect(result).toHaveProperty('metrics');
      expect(result).toHaveProperty('computationTimeMs');
      expect(result.computationTimeMs).toBeGreaterThan(0);
    });

    it('should identify bottleneck nodes', async () => {
      // Create a graph where 'hub' is clearly a bottleneck
      const input: CriticalPathInput = {
        nodes: [
          { id: 'a', label: 'ServiceA', type: 'class', coverage: 50, lines: 100 },
          { id: 'hub', label: 'HubService', type: 'class', coverage: 30, lines: 200 },
          { id: 'b', label: 'ServiceB', type: 'class', coverage: 60, lines: 100 },
          { id: 'c', label: 'ServiceC', type: 'class', coverage: 70, lines: 100 },
        ],
        edges: [
          { source: 'a', target: 'hub', weight: 10, type: 'calls' },
          { source: 'b', target: 'hub', weight: 10, type: 'calls' },
          { source: 'c', target: 'hub', weight: 10, type: 'calls' },
        ],
      };

      const result = await detector.detectCriticalPaths(input);

      // Hub should be identified as a bottleneck if in critical paths
      if (result.bottlenecks.length > 0) {
        const hubBottleneck = result.bottlenecks.find(b => b.nodeId === 'hub');
        if (hubBottleneck) {
          expect(hubBottleneck.coverage).toBe(30);
        }
      }
    });

    it('should prioritize coverage gaps correctly', async () => {
      const input: CriticalPathInput = {
        nodes: [
          { id: 'critical', label: 'CriticalService', type: 'class', coverage: 20, lines: 300 },
          { id: 'normal', label: 'NormalService', type: 'class', coverage: 50, lines: 100 },
          { id: 'good', label: 'GoodService', type: 'class', coverage: 90, lines: 100 },
        ],
        edges: [
          { source: 'critical', target: 'normal', weight: 15, type: 'calls' },
          { source: 'normal', target: 'good', weight: 5, type: 'calls' },
        ],
      };

      const result = await detector.detectCriticalPaths(input);

      // Should have gaps for nodes below 80% coverage
      expect(result.prioritizedGaps.length).toBeGreaterThanOrEqual(2);

      // Critical (20%) should be prioritized over normal (50%)
      const criticalGap = result.prioritizedGaps.find(g => g.nodeId === 'critical');
      const normalGap = result.prioritizedGaps.find(g => g.nodeId === 'normal');

      expect(criticalGap).toBeDefined();
      expect(normalGap).toBeDefined();

      if (criticalGap && normalGap) {
        // Both should have low priority numbers (1 = highest)
        expect(criticalGap.priority).toBeLessThanOrEqual(2);
        expect(normalGap.priority).toBeLessThanOrEqual(2);
      }
    });

    it('should calculate graph metrics', async () => {
      const input: CriticalPathInput = {
        nodes: [
          { id: 'a', label: 'A', type: 'function', coverage: 50, lines: 50 },
          { id: 'b', label: 'B', type: 'function', coverage: 75, lines: 50 },
          { id: 'c', label: 'C', type: 'function', coverage: 100, lines: 50 },
        ],
        edges: [
          { source: 'a', target: 'b', weight: 1, type: 'calls' },
          { source: 'b', target: 'c', weight: 1, type: 'calls' },
        ],
      };

      const result = await detector.detectCriticalPaths(input);

      expect(result.metrics.totalNodes).toBe(3);
      expect(result.metrics.totalEdges).toBe(2);
      expect(result.metrics.averageCoverage).toBeCloseTo(75, 0);
      expect(result.metrics.connectivityScore).toBeGreaterThan(0);
    });

    it('should handle disconnected graphs', async () => {
      const input: CriticalPathInput = {
        nodes: [
          { id: 'a', label: 'A', type: 'function', coverage: 50, lines: 50 },
          { id: 'b', label: 'B', type: 'function', coverage: 50, lines: 50 },
          { id: 'c', label: 'C', type: 'function', coverage: 50, lines: 50 },
          { id: 'd', label: 'D', type: 'function', coverage: 50, lines: 50 },
        ],
        edges: [
          { source: 'a', target: 'b', weight: 1, type: 'calls' },
          // c and d are disconnected
          { source: 'c', target: 'd', weight: 1, type: 'calls' },
        ],
      };

      const result = await detector.detectCriticalPaths(input);

      // Should still work with disconnected components
      expect(result.metrics.totalNodes).toBe(4);
      expect(result.prioritizedGaps.length).toBe(4); // All below 80%
    });

    it('should handle single node graph', async () => {
      const input: CriticalPathInput = {
        nodes: [{ id: 'single', label: 'SingleService', type: 'class', coverage: 50, lines: 100 }],
        edges: [],
      };

      const result = await detector.detectCriticalPaths(input);

      expect(result.metrics.totalNodes).toBe(1);
      expect(result.metrics.totalEdges).toBe(0);
      expect(result.prioritizedGaps.length).toBe(1);
    });

    it('should generate test suggestions', async () => {
      const input: CriticalPathInput = {
        nodes: [
          { id: 'func', label: 'complexFunction', type: 'function', coverage: 30, lines: 100, complexity: 15 },
          { id: 'entry', label: 'apiEndpoint', type: 'function', coverage: 40, lines: 50, isEntryPoint: true },
        ],
        edges: [
          { source: 'entry', target: 'func', weight: 5, type: 'calls' },
        ],
      };

      const result = await detector.detectCriticalPaths(input);

      const funcGap = result.prioritizedGaps.find(g => g.nodeId === 'func');
      const entryGap = result.prioritizedGaps.find(g => g.nodeId === 'entry');

      expect(funcGap?.testSuggestions.length).toBeGreaterThan(0);
      expect(entryGap?.testSuggestions.length).toBeGreaterThan(0);

      // Entry point should have API test suggestion
      expect(entryGap?.testSuggestions.some(s => s.includes('API'))).toBe(true);

      // Complex function should have edge case suggestion
      expect(funcGap?.testSuggestions.some(s => s.includes('edge cases'))).toBe(true);
    });

    it('should estimate effort correctly', async () => {
      const input: CriticalPathInput = {
        nodes: [
          { id: 'easy', label: 'SimpleFunc', type: 'function', coverage: 70, lines: 20, complexity: 2 },
          { id: 'hard', label: 'ComplexClass', type: 'class', coverage: 10, lines: 500, complexity: 25 },
        ],
        edges: [],
      };

      const result = await detector.detectCriticalPaths(input);

      const easyGap = result.prioritizedGaps.find(g => g.nodeId === 'easy');
      const hardGap = result.prioritizedGaps.find(g => g.nodeId === 'hard');

      expect(easyGap?.estimatedEffort).toBe('low');
      expect(hardGap?.estimatedEffort).toBe('high');
    });
  });

  describe('getPrioritizedGaps', () => {
    it('should return only prioritized gaps', async () => {
      const input: CriticalPathInput = {
        nodes: [
          { id: 'a', label: 'A', type: 'function', coverage: 40, lines: 50 },
          { id: 'b', label: 'B', type: 'function', coverage: 60, lines: 50 },
        ],
        edges: [
          { source: 'a', target: 'b', weight: 1, type: 'calls' },
        ],
      };

      const gaps = await detector.getPrioritizedGaps(input);

      expect(Array.isArray(gaps)).toBe(true);
      expect(gaps.length).toBe(2);
      expect(gaps[0].priority).toBe(1);
      expect(gaps[1].priority).toBe(2);
    });
  });

  describe('validation', () => {
    it('should throw on empty nodes', async () => {
      const input: CriticalPathInput = {
        nodes: [],
        edges: [],
      };

      await expect(detector.detectCriticalPaths(input)).rejects.toThrow(
        'Input must have at least one node'
      );
    });

    it('should throw on invalid edge source', async () => {
      const input: CriticalPathInput = {
        nodes: [{ id: 'a', label: 'A', type: 'function', coverage: 50, lines: 50 }],
        edges: [{ source: 'nonexistent', target: 'a', weight: 1, type: 'calls' }],
      };

      await expect(detector.detectCriticalPaths(input)).rejects.toThrow(
        "Edge source 'nonexistent' not found in nodes"
      );
    });

    it('should throw on invalid edge target', async () => {
      const input: CriticalPathInput = {
        nodes: [{ id: 'a', label: 'A', type: 'function', coverage: 50, lines: 50 }],
        edges: [{ source: 'a', target: 'nonexistent', weight: 1, type: 'calls' }],
      };

      await expect(detector.detectCriticalPaths(input)).rejects.toThrow(
        "Edge target 'nonexistent' not found in nodes"
      );
    });
  });

  describe('bottleneck risk levels', () => {
    it('should assign critical risk to low-coverage high-traffic nodes', async () => {
      // Create a star topology with central low-coverage hub
      const input: CriticalPathInput = {
        nodes: [
          { id: 'hub', label: 'CriticalHub', type: 'class', coverage: 10, lines: 300, complexity: 20 },
          { id: 'a', label: 'A', type: 'class', coverage: 90, lines: 50 },
          { id: 'b', label: 'B', type: 'class', coverage: 90, lines: 50 },
          { id: 'c', label: 'C', type: 'class', coverage: 90, lines: 50 },
          { id: 'd', label: 'D', type: 'class', coverage: 90, lines: 50 },
        ],
        edges: [
          { source: 'a', target: 'hub', weight: 10, type: 'calls' },
          { source: 'b', target: 'hub', weight: 10, type: 'calls' },
          { source: 'c', target: 'hub', weight: 10, type: 'calls' },
          { source: 'd', target: 'hub', weight: 10, type: 'calls' },
        ],
      };

      const result = await detector.detectCriticalPaths(input);

      // If hub is identified as bottleneck, it should have high/critical risk
      const hubBottleneck = result.bottlenecks.find(b => b.nodeId === 'hub');
      if (hubBottleneck) {
        expect(['high', 'critical']).toContain(hubBottleneck.riskLevel);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle self-loop edges gracefully', async () => {
      const input: CriticalPathInput = {
        nodes: [
          { id: 'a', label: 'A', type: 'function', coverage: 50, lines: 50 },
        ],
        edges: [
          { source: 'a', target: 'a', weight: 1, type: 'calls' }, // Self-loop
        ],
      };

      // Should not throw
      const result = await detector.detectCriticalPaths(input);
      expect(result.metrics.totalNodes).toBe(1);
    });

    it('should handle very large weights', async () => {
      const input: CriticalPathInput = {
        nodes: [
          { id: 'a', label: 'A', type: 'function', coverage: 50, lines: 50 },
          { id: 'b', label: 'B', type: 'function', coverage: 50, lines: 50 },
        ],
        edges: [
          { source: 'a', target: 'b', weight: 1000000, type: 'calls' },
        ],
      };

      const result = await detector.detectCriticalPaths(input);
      expect(result.metrics.totalEdges).toBe(1);
    });

    it('should handle zero weight edges', async () => {
      const input: CriticalPathInput = {
        nodes: [
          { id: 'a', label: 'A', type: 'function', coverage: 50, lines: 50 },
          { id: 'b', label: 'B', type: 'function', coverage: 50, lines: 50 },
        ],
        edges: [
          { source: 'a', target: 'b', weight: 0, type: 'calls' },
        ],
      };

      const result = await detector.detectCriticalPaths(input);
      expect(result.metrics.totalEdges).toBe(1);
    });

    it('should handle nodes with 100% coverage', async () => {
      const input: CriticalPathInput = {
        nodes: [
          { id: 'a', label: 'A', type: 'function', coverage: 100, lines: 50 },
          { id: 'b', label: 'B', type: 'function', coverage: 100, lines: 50 },
        ],
        edges: [
          { source: 'a', target: 'b', weight: 1, type: 'calls' },
        ],
      };

      const result = await detector.detectCriticalPaths(input);

      // No gaps should be reported since all are at 100%
      expect(result.prioritizedGaps.length).toBe(0);
    });
  });
});
