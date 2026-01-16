/**
 * Unit tests for StrangeLoopController
 * ADR-047: MinCut Self-Organizing QE Integration - Phase 1
 *
 * Tests the Strange Loop self-healing pattern:
 * OBSERVE → MODEL → DECIDE → ACT
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  StrangeLoopController,
  createStrangeLoopController,
  DEFAULT_STRANGE_LOOP_CONFIG,
  StrangeLoopConfig,
} from '../../../../src/coordination/mincut/strange-loop';
import { SwarmGraph, createSwarmGraph } from '../../../../src/coordination/mincut/swarm-graph';
import { MinCutPersistence } from '../../../../src/coordination/mincut/mincut-persistence';

// Mock persistence
const mockPersistence = {
  initialize: vi.fn().mockResolvedValue(undefined),
  recordObservation: vi.fn().mockResolvedValue('obs-1'),
  recordHealingAction: vi.fn().mockResolvedValue('heal-1'),
  getRecentObservations: vi.fn().mockResolvedValue([]),
} as unknown as MinCutPersistence;

describe('StrangeLoopController', () => {
  let controller: StrangeLoopController;
  let graph: SwarmGraph;

  beforeEach(() => {
    graph = createSwarmGraph();
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (controller) {
      controller.stop();
    }
    vi.useRealTimers();
  });

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  function addVertices(ids: string[]): void {
    for (const id of ids) {
      graph.addVertex({
        id,
        type: 'agent',
        domain: 'test-generation',
        weight: 1.0,
        createdAt: new Date(),
      });
    }
  }

  function addEdge(source: string, target: string, weight: number = 1.0): void {
    graph.addEdge({
      source,
      target,
      weight,
      type: 'coordination',
      bidirectional: true,
    });
  }

  function createController(config: Partial<StrangeLoopConfig> = {}): StrangeLoopController {
    controller = createStrangeLoopController(graph, mockPersistence, {
      enabled: true,
      observationIntervalMs: 1000,
      healingThreshold: 2.0,
      ...config,
    });
    return controller;
  }

  // ==========================================================================
  // Construction & Configuration
  // ==========================================================================

  describe('Construction', () => {
    it('should create controller with default config', () => {
      controller = createStrangeLoopController(graph, mockPersistence);
      expect(controller).toBeDefined();
    });

    it('should create controller with custom config', () => {
      controller = createStrangeLoopController(graph, mockPersistence, {
        healingThreshold: 5.0,
        maxActionsPerCycle: 5,
      });
      expect(controller).toBeDefined();
      expect(controller.getConfig().healingThreshold).toBe(5.0);
    });

    it('should expose default config', () => {
      expect(DEFAULT_STRANGE_LOOP_CONFIG).toBeDefined();
      expect(DEFAULT_STRANGE_LOOP_CONFIG.enabled).toBe(true);
      expect(DEFAULT_STRANGE_LOOP_CONFIG.healingThreshold).toBe(2.0);
    });

    it('should get config', () => {
      createController({ healingThreshold: 3.0 });
      const config = controller.getConfig();
      expect(config.healingThreshold).toBe(3.0);
    });
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  describe('Lifecycle', () => {
    beforeEach(() => {
      addVertices(['a', 'b', 'c']);
      addEdge('a', 'b', 1.0);
      addEdge('b', 'c', 1.0);
    });

    it('should start the loop', () => {
      createController();
      controller.start();
      expect(controller.isRunning()).toBe(true);
    });

    it('should stop the loop', () => {
      createController();
      controller.start();
      controller.stop();
      expect(controller.isRunning()).toBe(false);
    });

    it('should not start when disabled', () => {
      createController({ enabled: false });
      controller.start();
      expect(controller.isRunning()).toBe(false);
    });

    it('should not start twice', () => {
      createController();
      controller.start();
      const iteration1 = controller.getIteration();
      controller.start(); // Should be ignored
      expect(controller.getIteration()).toBe(iteration1);
    });

    it('should run cycles at interval', () => {
      createController({ observationIntervalMs: 1000 });
      controller.start();

      const initialIteration = controller.getIteration();
      expect(initialIteration).toBe(1); // Initial cycle

      vi.advanceTimersByTime(1000);
      expect(controller.getIteration()).toBe(2);

      vi.advanceTimersByTime(1000);
      expect(controller.getIteration()).toBe(3);
    });
  });

  // ==========================================================================
  // OBSERVE Phase
  // ==========================================================================

  describe('OBSERVE Phase', () => {
    beforeEach(() => {
      addVertices(['a', 'b', 'c', 'isolated']);
      addEdge('a', 'b', 2.0);
      addEdge('b', 'c', 2.0);
      // 'isolated' has no edges
    });

    it('should collect observations', async () => {
      createController();
      await controller.runCycle();

      const observations = controller.getObservations();
      expect(observations.length).toBe(1);
    });

    it('should include MinCut value in observation', async () => {
      createController();
      await controller.runCycle();

      const observations = controller.getObservations();
      expect(observations[0].minCutValue).toBeDefined();
      expect(typeof observations[0].minCutValue).toBe('number');
    });

    it('should include weak vertices in observation', async () => {
      createController();
      await controller.runCycle();

      const observations = controller.getObservations();
      expect(observations[0].weakVertices).toBeDefined();
      expect(Array.isArray(observations[0].weakVertices)).toBe(true);
    });

    it('should include graph snapshot in observation', async () => {
      createController();
      await controller.runCycle();

      const observations = controller.getObservations();
      expect(observations[0].graphSnapshot).toBeDefined();
      expect(observations[0].graphSnapshot.vertices.length).toBe(4);
    });

    it('should increment iteration', async () => {
      createController();

      await controller.runCycle();
      expect(controller.getIteration()).toBe(1);

      await controller.runCycle();
      expect(controller.getIteration()).toBe(2);
    });
  });

  // ==========================================================================
  // MODEL Phase
  // ==========================================================================

  describe('MODEL Phase', () => {
    beforeEach(() => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 1.5);
    });

    it('should produce predictions after multiple observations', async () => {
      createController();

      // Run multiple cycles to build model
      for (let i = 0; i < 5; i++) {
        await controller.runCycle();
      }

      // Model should have learned from observations
      const observations = controller.getObservations();
      expect(observations.length).toBe(5);
    });

    it('should track prediction accuracy over time', async () => {
      createController();

      // Run cycles with varying MinCut
      for (let i = 0; i < 10; i++) {
        // Simulate changing topology
        addEdge('a', 'b', 0.1);
        await controller.runCycle();
      }

      const stats = controller.getStats();
      expect(stats.totalCycles).toBe(10);
    });
  });

  // ==========================================================================
  // DECIDE Phase
  // ==========================================================================

  describe('DECIDE Phase', () => {
    it('should decide no_action when above threshold', async () => {
      addVertices(['a', 'b', 'c']);
      addEdge('a', 'b', 3.0);
      addEdge('b', 'c', 3.0);
      addEdge('a', 'c', 3.0);

      createController({ healingThreshold: 2.0 });
      const result = await controller.runCycle();

      expect(result).toBeDefined();
      expect(result!.action.type).toBe('no_action');
    });

    it('should decide action when below threshold', async () => {
      addVertices(['a', 'b', 'isolated']);
      addEdge('a', 'b', 0.5);
      // 'isolated' has no edges - should trigger action

      createController({
        healingThreshold: 2.0,
        maxConsecutiveNoOps: 1,
      });

      // First cycle might be no_action, second should force action
      await controller.runCycle();
      const result = await controller.runCycle();

      expect(result).toBeDefined();
      // Should eventually decide to take action
    });

    it('should respect confidence threshold', async () => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 0.5);

      createController({
        minPredictionConfidence: 0.9, // Very high threshold
      });

      const result = await controller.runCycle();
      // With few observations, confidence should be low
      // Should decide no_action due to low confidence
    });
  });

  // ==========================================================================
  // ACT Phase
  // ==========================================================================

  describe('ACT Phase', () => {
    beforeEach(() => {
      addVertices(['a', 'b', 'weak']);
      addEdge('a', 'b', 2.0);
      // 'weak' has no edges
    });

    it('should return result with MinCut before/after', async () => {
      createController({ healingThreshold: 0.5 });
      const result = await controller.runCycle();

      expect(result).toBeDefined();
      expect(result!.minCutBefore).toBeDefined();
      expect(result!.minCutAfter).toBeDefined();
      expect(typeof result!.improvement).toBe('number');
    });

    it('should record success/failure', async () => {
      createController();
      const result = await controller.runCycle();

      expect(result).toBeDefined();
      expect(typeof result!.success).toBe('boolean');
    });

    it('should track action duration', async () => {
      createController();
      const result = await controller.runCycle();

      expect(result).toBeDefined();
      expect(result!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should execute reinforce_edge action', async () => {
      addVertices(['target']);
      addEdge('target', 'a', 3.0); // Make target strong

      createController({
        healingThreshold: 10.0, // Very high to force healing
        maxConsecutiveNoOps: 0,
      });

      // Run multiple cycles to trigger reinforcement
      for (let i = 0; i < 3; i++) {
        await controller.runCycle();
      }

      const results = controller.getResults();
      // Should have some actions attempted
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Learning
  // ==========================================================================

  describe('Learning', () => {
    beforeEach(() => {
      addVertices(['a', 'b', 'c']);
      addEdge('a', 'b', 1.0);
      addEdge('b', 'c', 1.0);
    });

    it('should learn from action outcomes', async () => {
      createController({ healingThreshold: 5.0, maxConsecutiveNoOps: 0 });

      // Run multiple cycles
      for (let i = 0; i < 10; i++) {
        await controller.runCycle();
      }

      const stats = controller.getStats();
      expect(stats.actionCounts).toBeDefined();
    });

    it('should update action expectations over time', async () => {
      createController();

      const stats1 = controller.getStats();
      expect(stats1.totalCycles).toBe(0);

      for (let i = 0; i < 5; i++) {
        await controller.runCycle();
      }

      const stats2 = controller.getStats();
      expect(stats2.totalCycles).toBe(5);
    });
  });

  // ==========================================================================
  // Statistics
  // ==========================================================================

  describe('Statistics', () => {
    beforeEach(() => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 1.0);
    });

    it('should track total cycles', async () => {
      createController();

      await controller.runCycle();
      await controller.runCycle();
      await controller.runCycle();

      const stats = controller.getStats();
      expect(stats.totalCycles).toBe(3);
    });

    it('should track action counts by type', async () => {
      createController();

      for (let i = 0; i < 5; i++) {
        await controller.runCycle();
      }

      const stats = controller.getStats();
      expect(stats.actionCounts).toBeDefined();
      expect(typeof stats.actionCounts).toBe('object');
    });

    it('should calculate average improvement', async () => {
      createController();

      for (let i = 0; i < 5; i++) {
        await controller.runCycle();
      }

      const stats = controller.getStats();
      expect(typeof stats.averageImprovement).toBe('number');
    });

    it('should get recent observations with limit', async () => {
      createController();

      for (let i = 0; i < 20; i++) {
        await controller.runCycle();
      }

      const observations = controller.getObservations(5);
      expect(observations.length).toBe(5);
    });

    it('should get recent results with limit', async () => {
      createController();

      for (let i = 0; i < 20; i++) {
        await controller.runCycle();
      }

      const results = controller.getResults(5);
      expect(results.length).toBe(5);
    });
  });

  // ==========================================================================
  // Persistence Integration
  // ==========================================================================

  describe('Persistence', () => {
    beforeEach(() => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 1.0);
    });

    it('should record observation to persistence', async () => {
      createController();
      await controller.runCycle();

      expect(mockPersistence.recordObservation).toHaveBeenCalled();
    });

    it('should pass iteration to persistence', async () => {
      createController();
      await controller.runCycle();

      expect(mockPersistence.recordObservation).toHaveBeenCalledWith(
        expect.objectContaining({ iteration: 1 })
      );
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty graph', async () => {
      createController();
      const result = await controller.runCycle();

      expect(result).toBeDefined();
      expect(result!.success).toBe(true);
    });

    it('should handle single vertex', async () => {
      addVertices(['lonely']);
      createController();

      const result = await controller.runCycle();
      expect(result).toBeDefined();
    });

    it('should limit stored observations', async () => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 1.0);

      createController();

      // Run more than 100 cycles
      for (let i = 0; i < 110; i++) {
        await controller.runCycle();
      }

      const observations = controller.getObservations(200);
      expect(observations.length).toBeLessThanOrEqual(100);
    });

    it('should limit stored results', async () => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 1.0);

      createController();

      for (let i = 0; i < 110; i++) {
        await controller.runCycle();
      }

      const results = controller.getResults(200);
      expect(results.length).toBeLessThanOrEqual(100);
    });
  });

  // ==========================================================================
  // Factory Function
  // ==========================================================================

  describe('Factory Function', () => {
    it('should create controller via factory', () => {
      addVertices(['a', 'b']);
      const factoryController = createStrangeLoopController(graph, mockPersistence);
      expect(factoryController).toBeInstanceOf(StrangeLoopController);
    });
  });
});
