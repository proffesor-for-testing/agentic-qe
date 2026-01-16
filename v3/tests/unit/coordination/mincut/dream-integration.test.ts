/**
 * Dream x MinCut Integration Tests
 * ADR-047: MinCut Self-Organizing QE Integration - Phase 6
 *
 * Tests for the dream meta-learning integration with MinCut.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DreamMinCutBridge,
  MetaLearningTracker,
  StrangeLoopDreamIntegration,
  DreamMinCutController,
  createDreamMinCutBridge,
  createMetaLearningTracker,
  createStrangeLoopDreamIntegration,
  createDreamMinCutController,
  DEFAULT_DREAM_INTEGRATION_CONFIG,
} from '../../../../src/coordination/mincut/dream-integration';
import {
  createStrangeLoopController,
  createSwarmGraph,
  createMinCutPersistence,
} from '../../../../src/coordination/mincut';
import type { SwarmObservation, ReorganizationResult } from '../../../../src/coordination/mincut/interfaces';

// ============================================================================
// Mocks
// ============================================================================

// Mock the unified memory
vi.mock('../../../../src/kernel/unified-memory', () => ({
  getUnifiedMemory: () => ({
    isInitialized: () => true,
    initialize: vi.fn(),
    getDatabase: () => ({
      prepare: () => ({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn(() => []),
      }),
    }),
  }),
  UnifiedMemoryManager: class MockMemoryManager {
    isInitialized() { return true; }
    initialize() { return Promise.resolve(); }
    getDatabase() {
      return {
        prepare: () => ({
          run: vi.fn(),
          get: vi.fn(),
          all: vi.fn(() => []),
        }),
      };
    }
  },
}));

// ============================================================================
// Test Helpers
// ============================================================================

function createMockObservation(iteration: number, minCutValue: number): SwarmObservation {
  return {
    id: `obs-${iteration}`,
    timestamp: new Date(),
    minCutValue,
    weakVertices: [
      {
        vertexId: `agent-${iteration % 3}`,
        vertex: {
          id: `agent-${iteration % 3}`,
          type: 'agent' as const,
          domain: 'test-generation' as any,
          weight: 1,
          createdAt: new Date(),
        },
        weightedDegree: 0.3,
        riskScore: 0.7,
        reason: 'Low connectivity',
        suggestions: [],
      },
    ],
    graphSnapshot: {
      timestamp: new Date(),
      vertices: [],
      edges: [],
      stats: {
        vertexCount: 5,
        edgeCount: 8,
        totalWeight: 10,
        averageDegree: 3.2,
        density: 0.8,
        isConnected: true,
        componentCount: 1,
      },
    },
    iteration,
  };
}

function createMockResult(success: boolean, improvement: number): ReorganizationResult {
  return {
    action: { type: 'reinforce_edge', source: 'a', target: 'b', weightIncrease: 0.5 },
    success,
    minCutBefore: 2.0,
    minCutAfter: 2.0 + improvement,
    improvement,
    durationMs: 10,
  };
}

// ============================================================================
// DreamMinCutBridge Tests
// ============================================================================

describe('DreamMinCutBridge', () => {
  let bridge: DreamMinCutBridge;

  beforeEach(() => {
    bridge = createDreamMinCutBridge();
  });

  describe('bufferObservation', () => {
    it('should buffer observations', () => {
      const obs = createMockObservation(1, 2.5);
      bridge.bufferObservation(obs);
      expect(bridge.getObservationCount()).toBe(1);
    });

    it('should keep buffer size manageable', () => {
      for (let i = 0; i < 1100; i++) {
        bridge.bufferObservation(createMockObservation(i, 2.5));
      }
      expect(bridge.getObservationCount()).toBeLessThanOrEqual(1000);
    });
  });

  describe('hasEnoughObservations', () => {
    it('should return false when not enough observations', () => {
      expect(bridge.hasEnoughObservations()).toBe(false);
    });

    it('should return true when enough observations', () => {
      const minRequired = DEFAULT_DREAM_INTEGRATION_CONFIG.minObservationsForDream;
      for (let i = 0; i < minRequired; i++) {
        bridge.bufferObservation(createMockObservation(i, 2.5));
      }
      expect(bridge.hasEnoughObservations()).toBe(true);
    });
  });

  describe('convertObservationsToDreamPatterns', () => {
    it('should return empty array when no observations', () => {
      const patterns = bridge.convertObservationsToDreamPatterns();
      expect(patterns).toEqual([]);
    });

    it('should convert observations to patterns', () => {
      // Add observations with repeated weak vertices
      for (let i = 0; i < 30; i++) {
        bridge.bufferObservation(createMockObservation(i, 2.5 + (i % 5) * 0.1));
      }

      const patterns = bridge.convertObservationsToDreamPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      // Should have weak vertex patterns
      const weakVertexPatterns = patterns.filter((p) => p.patternType === 'weakness');
      expect(weakVertexPatterns.length).toBeGreaterThan(0);

      // Should have trend pattern
      const trendPattern = patterns.find((p) => p.patternType === 'trend');
      expect(trendPattern).toBeDefined();
    });
  });

  describe('clearBuffer', () => {
    it('should clear all buffered observations', () => {
      for (let i = 0; i < 10; i++) {
        bridge.bufferObservation(createMockObservation(i, 2.5));
      }
      expect(bridge.getObservationCount()).toBe(10);

      bridge.clearBuffer();
      expect(bridge.getObservationCount()).toBe(0);
    });
  });
});

// ============================================================================
// MetaLearningTracker Tests
// ============================================================================

describe('MetaLearningTracker', () => {
  let tracker: MetaLearningTracker;

  beforeEach(() => {
    tracker = createMetaLearningTracker();
  });

  describe('updateStrategyEffectiveness', () => {
    it('should track new strategy', () => {
      tracker.updateStrategyEffectiveness('reinforce_edge', true, 0.5);

      const strategy = tracker.getStrategyEffectiveness('reinforce_edge');
      expect(strategy).toBeDefined();
      expect(strategy!.usageCount).toBe(1);
      expect(strategy!.successRate).toBe(1);
      expect(strategy!.avgImprovement).toBe(0.5);
    });

    it('should update existing strategy with EMA', () => {
      tracker.updateStrategyEffectiveness('reinforce_edge', true, 1.0);
      tracker.updateStrategyEffectiveness('reinforce_edge', true, 0.5);
      tracker.updateStrategyEffectiveness('reinforce_edge', false, -0.2);

      const strategy = tracker.getStrategyEffectiveness('reinforce_edge');
      expect(strategy!.usageCount).toBe(3);
      expect(strategy!.successRate).toBeLessThan(1);
      expect(strategy!.successRate).toBeGreaterThan(0);
    });
  });

  describe('getRecommendedStrategy', () => {
    it('should return null when no strategies', () => {
      expect(tracker.getRecommendedStrategy()).toBeNull();
    });

    it('should return null when not enough usage', () => {
      tracker.updateStrategyEffectiveness('reinforce_edge', true, 0.5);
      expect(tracker.getRecommendedStrategy()).toBeNull();
    });

    it('should recommend best strategy', () => {
      // Add enough usage to build confidence (need at least 3 with confidence > 0.4)
      // Each update builds confidence by 0.01, starting at 0.3
      // We need confidence > 0.4, so at least 10 updates
      for (let i = 0; i < 15; i++) {
        tracker.updateStrategyEffectiveness('reinforce_edge', true, 0.5);
        tracker.updateStrategyEffectiveness('spawn_agent', false, -0.1);
      }

      const recommended = tracker.getRecommendedStrategy();
      expect(recommended).toBe('reinforce_edge');
    });
  });

  describe('updatePatternConfidence', () => {
    it('should track new pattern', () => {
      tracker.updatePatternConfidence('pattern-1', true, 'dream');

      const confidence = tracker.getPatternConfidence('pattern-1');
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should update existing pattern', () => {
      tracker.updatePatternConfidence('pattern-1', true, 'observation');
      tracker.updatePatternConfidence('pattern-1', false, 'observation');

      const confidence = tracker.getPatternConfidence('pattern-1');
      expect(confidence).toBeLessThan(0.6);
    });
  });

  describe('recordAdaptation', () => {
    it('should record adaptation', () => {
      tracker.recordAdaptation({
        timestamp: new Date(),
        type: 'topology_change',
        trigger: 'observation',
        stateBefore: { minCutValue: 2.0, weakVertexCount: 3 },
        stateAfter: { minCutValue: 2.5, weakVertexCount: 1 },
        improvement: 0.5,
      });

      const recent = tracker.getRecentAdaptations();
      expect(recent).toHaveLength(1);
      expect(recent[0].improvement).toBe(0.5);
    });

    it('should update meta-confidence on positive adaptations', () => {
      const initialConfidence = tracker.getMetaConfidence();

      for (let i = 0; i < 10; i++) {
        tracker.recordAdaptation({
          timestamp: new Date(),
          type: 'topology_change',
          trigger: 'observation',
          stateBefore: { minCutValue: 2.0, weakVertexCount: 3 },
          stateAfter: { minCutValue: 2.5, weakVertexCount: 1 },
          improvement: 0.5,
        });
      }

      expect(tracker.getMetaConfidence()).toBeGreaterThan(initialConfidence);
    });
  });

  describe('getAdaptationStats', () => {
    it('should compute statistics', () => {
      tracker.recordAdaptation({
        timestamp: new Date(),
        type: 'topology_change',
        trigger: 'observation',
        stateBefore: { minCutValue: 2.0, weakVertexCount: 3 },
        stateAfter: { minCutValue: 2.5, weakVertexCount: 1 },
        improvement: 0.5,
      });

      tracker.recordAdaptation({
        timestamp: new Date(),
        type: 'pattern_learned',
        trigger: 'dream_insight',
        stateBefore: { minCutValue: 2.5, weakVertexCount: 1 },
        stateAfter: { minCutValue: 2.5, weakVertexCount: 1 },
        improvement: 0,
      });

      const stats = tracker.getAdaptationStats();
      expect(stats.total).toBe(2);
      expect(stats.byType['topology_change']).toBe(1);
      expect(stats.byType['pattern_learned']).toBe(1);
      expect(stats.avgImprovement).toBe(0.25);
      expect(stats.positiveRate).toBe(0.5);
    });
  });

  describe('getHighConfidencePatterns', () => {
    it('should filter by threshold', () => {
      tracker.updatePatternConfidence('high-conf', true, 'dream');
      tracker.updatePatternConfidence('high-conf', true, 'dream');
      tracker.updatePatternConfidence('high-conf', true, 'dream');

      tracker.updatePatternConfidence('low-conf', false, 'observation');
      tracker.updatePatternConfidence('low-conf', false, 'observation');

      const highConf = tracker.getHighConfidencePatterns(0.6);
      expect(highConf.length).toBe(1);
      expect(highConf[0].patternId).toBe('high-conf');
    });
  });
});

// ============================================================================
// StrangeLoopDreamIntegration Tests
// ============================================================================

describe('StrangeLoopDreamIntegration', () => {
  let integration: StrangeLoopDreamIntegration;

  beforeEach(() => {
    const graph = createSwarmGraph();
    const persistence = createMinCutPersistence();
    const strangeLoop = createStrangeLoopController(graph, persistence);
    integration = createStrangeLoopDreamIntegration(strangeLoop);
  });

  describe('processObservation', () => {
    it('should buffer observation and track patterns', () => {
      const obs = createMockObservation(1, 2.5);
      integration.processObservation(obs);

      expect(integration.getObservationCount()).toBe(1);
    });
  });

  describe('processResult', () => {
    it('should update strategy effectiveness', () => {
      const result = createMockResult(true, 0.5);
      integration.processResult(result);

      const tracker = integration.getMetaTracker();
      const strategy = tracker.getStrategyEffectiveness('reinforce_edge');
      expect(strategy).toBeDefined();
    });
  });

  describe('shouldTriggerDream', () => {
    it('should return false when not enough observations', () => {
      expect(integration.shouldTriggerDream()).toBe(false);
    });

    it('should return true when enough observations', () => {
      const minRequired = DEFAULT_DREAM_INTEGRATION_CONFIG.minObservationsForDream;
      for (let i = 0; i < minRequired; i++) {
        integration.processObservation(createMockObservation(i, 2.5));
      }
      expect(integration.shouldTriggerDream()).toBe(true);
    });
  });

  describe('completeDreamCycle', () => {
    it('should update meta-learning state', () => {
      const insights = [
        {
          id: 'insight-1',
          cycleId: 'cycle-1',
          type: 'optimization' as const,
          sourceConcepts: ['concept-1'],
          description: 'Test insight',
          noveltyScore: 0.7,
          confidenceScore: 0.8,
          actionable: true,
          applied: false,
          createdAt: new Date(),
        },
      ];

      integration.completeDreamCycle(insights);

      const tracker = integration.getMetaTracker();
      const state = tracker.getState();
      expect(state.totalCycles).toBe(1);
      expect(state.lastDreamCycle).not.toBeNull();
    });
  });
});

// ============================================================================
// DreamMinCutController Tests
// ============================================================================

describe('DreamMinCutController', () => {
  let controller: DreamMinCutController;

  beforeEach(() => {
    const graph = createSwarmGraph();
    const persistence = createMinCutPersistence();
    controller = createDreamMinCutController(graph, persistence);
  });

  describe('lifecycle', () => {
    it('should start and stop', async () => {
      await controller.start();
      expect(controller.isRunning()).toBe(true);

      controller.stop();
      expect(controller.isRunning()).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return status', () => {
      const status = controller.getStatus();

      expect(status.running).toBe(false);
      expect(status.observationCount).toBe(0);
      expect(status.metaConfidence).toBe(0.5);
      expect(status.recommendedStrategy).toBeNull();
    });
  });

  describe('recall', () => {
    it('should return empty array when no patterns', () => {
      const patterns = controller.recall('test topology');
      expect(patterns).toEqual([]);
    });

    it('should return relevant patterns', () => {
      // Add some pattern confidence
      const tracker = controller.getIntegration().getMetaTracker();
      tracker.updatePatternConfidence('weak:agent-test', true, 'observation');
      tracker.updatePatternConfidence('weak:agent-test', true, 'observation');
      tracker.updatePatternConfidence('weak:agent-test', true, 'observation');

      const patterns = controller.recall('test agent');
      expect(patterns.length).toBeGreaterThan(0);
    });
  });

  describe('getConfig', () => {
    it('should return configuration', () => {
      const config = controller.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.minObservationsForDream).toBe(20);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('Factory Functions', () => {
  it('createDreamMinCutBridge should create bridge', () => {
    const bridge = createDreamMinCutBridge();
    expect(bridge).toBeInstanceOf(DreamMinCutBridge);
  });

  it('createMetaLearningTracker should create tracker', () => {
    const tracker = createMetaLearningTracker();
    expect(tracker).toBeInstanceOf(MetaLearningTracker);
  });

  it('createDreamMinCutController should create controller', () => {
    const graph = createSwarmGraph();
    const persistence = createMinCutPersistence();
    const controller = createDreamMinCutController(graph, persistence);
    expect(controller).toBeInstanceOf(DreamMinCutController);
  });
});
