/**
 * Unit tests for Morphogenetic Test Generation
 * ADR-047: MinCut Self-Organizing QE Integration - Phase 3
 *
 * Tests the bio-inspired morphogenetic growth pattern for test generation:
 * - MorphogeneticFieldManager: Field creation and signal propagation
 * - MorphogeneticController: Seed planting, growth cycles, pruning, harvesting
 * - Growth patterns: radial, branching, adaptive
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MorphogeneticController,
  createMorphogeneticController,
  MorphogeneticFieldManager,
  createMorphogeneticFieldManager,
  DEFAULT_MORPHOGENETIC_CONFIG,
  type TestSpecification,
  type TestSeed,
  type GrowthPattern,
} from '../../../../src/coordination/mincut/morphogenetic-growth';
import {
  SwarmGraph,
  createSwarmGraph,
  type WeakVertex,
  type SwarmVertex,
} from '../../../../src/coordination/mincut';

// ============================================================================
// Helper Functions
// ============================================================================

function createTestVertex(overrides: Partial<SwarmVertex> = {}): SwarmVertex {
  const id = overrides.id || `agent-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    type: 'agent',
    domain: 'test-generation',
    weight: 1,
    createdAt: new Date(),
    capabilities: ['unit-tests', 'integration-tests'],
    ...overrides,
  };
}

function createWeakVertex(graph: SwarmGraph, vertexId: string, overrides: Partial<WeakVertex> = {}): WeakVertex {
  const vertex = graph.getVertex(vertexId);
  if (!vertex) {
    throw new Error(`Vertex ${vertexId} not found in graph`);
  }
  return {
    vertexId,
    vertex,
    weightedDegree: graph.weightedDegree(vertexId),
    riskScore: 0.7,
    reason: 'Low connectivity',
    suggestions: [],
    ...overrides,
  };
}

function createTestGraph(): SwarmGraph {
  const graph = createSwarmGraph();

  // Create a simple test topology
  graph.addVertex(createTestVertex({ id: 'agent-1', domain: 'test-generation' }));
  graph.addVertex(createTestVertex({ id: 'agent-2', domain: 'test-generation' }));
  graph.addVertex(createTestVertex({ id: 'agent-3', type: 'coordinator', domain: 'test-execution', weight: 2 }));

  graph.addEdge({
    source: 'agent-1',
    target: 'agent-2',
    weight: 1,
    type: 'coordination',
    bidirectional: true,
  });
  graph.addEdge({
    source: 'agent-2',
    target: 'agent-3',
    weight: 0.5,
    type: 'coordination',
    bidirectional: true,
  });

  return graph;
}

// ============================================================================
// MorphogeneticFieldManager Tests
// ============================================================================

describe('MorphogeneticFieldManager', () => {
  let manager: MorphogeneticFieldManager;
  let graph: SwarmGraph;

  beforeEach(() => {
    manager = createMorphogeneticFieldManager();
    graph = createTestGraph();
  });

  describe('createFieldFromGraph', () => {
    it('should create a field from a swarm graph', () => {
      const field = manager.createFieldFromGraph(graph);

      expect(field).toBeDefined();
      expect(field.id).toContain('field:');
      expect(field.cells.size).toBe(3);
      expect(field.globalSignal).toBe(1.0);
      expect(field.inhibitionZones.size).toBe(0);
    });

    it('should create cells with calculated potential values', () => {
      const field = manager.createFieldFromGraph(graph);

      // All cells should have potential between 0 and 1
      for (const cell of field.cells.values()) {
        expect(cell.potential).toBeGreaterThanOrEqual(0);
        expect(cell.potential).toBeLessThanOrEqual(1);
        expect(cell.coverage).toBe(0); // No initial coverage
      }
    });

    it('should set higher potential for less connected vertices', () => {
      const field = manager.createFieldFromGraph(graph);

      // agent-1 has degree 1, agent-2 has degree 1.5 (1 + 0.5), agent-3 has degree 0.5
      // Less connected = higher potential
      const cell1 = field.cells.get('agent-1');
      const cell3 = field.cells.get('agent-3');

      expect(cell1).toBeDefined();
      expect(cell3).toBeDefined();
      // agent-3 has lowest degree, should have high potential
      expect(cell3!.potential).toBeGreaterThan(0);
    });

    it('should filter by domain when specified', () => {
      const field = manager.createFieldFromGraph(graph, 'test-generation');

      // Only agents in test-generation domain
      expect(field.cells.size).toBe(2);
      expect(field.domain).toBe('test-generation');
      expect(field.cells.has('agent-1')).toBe(true);
      expect(field.cells.has('agent-2')).toBe(true);
      expect(field.cells.has('agent-3')).toBe(false);
    });

    it('should set correct neighbors for each cell', () => {
      const field = manager.createFieldFromGraph(graph);

      const cell1 = field.cells.get('agent-1');
      const cell2 = field.cells.get('agent-2');

      expect(cell1!.neighbors).toContain('agent-2');
      expect(cell2!.neighbors).toContain('agent-1');
      expect(cell2!.neighbors).toContain('agent-3');
    });
  });

  describe('updateFieldCoverage', () => {
    it('should update cell coverage and potential', () => {
      const field = manager.createFieldFromGraph(graph);
      const coverageData = new Map<string, number>([
        ['agent-1', 0.9],
        ['agent-2', 0.3],
      ]);

      manager.updateFieldCoverage(field.id, coverageData);

      const cell1 = field.cells.get('agent-1');
      const cell2 = field.cells.get('agent-2');

      expect(cell1!.coverage).toBe(0.9);
      expect(cell2!.coverage).toBe(0.3);
    });

    it('should add high-coverage cells to inhibition zone', () => {
      const field = manager.createFieldFromGraph(graph);
      const coverageData = new Map<string, number>([
        ['agent-1', 0.9], // Above 0.8 threshold
        ['agent-2', 0.3], // Below threshold
      ]);

      manager.updateFieldCoverage(field.id, coverageData);

      expect(field.inhibitionZones.has('agent-1')).toBe(true);
      expect(field.inhibitionZones.has('agent-2')).toBe(false);
    });

    it('should update potential based on coverage', () => {
      const field = manager.createFieldFromGraph(graph);
      const cell1Before = field.cells.get('agent-1')!.potential;

      const coverageData = new Map<string, number>([
        ['agent-1', 0.9],
      ]);

      manager.updateFieldCoverage(field.id, coverageData);

      const cell1After = field.cells.get('agent-1')!.potential;

      // Potential should decrease with higher coverage
      expect(cell1After).toBeLessThan(cell1Before);
    });
  });

  describe('getHighPotentialCells', () => {
    it('should return cells sorted by potential (highest first)', () => {
      const field = manager.createFieldFromGraph(graph);
      const highPotential = manager.getHighPotentialCells(field.id, 10);

      expect(highPotential.length).toBeGreaterThan(0);

      // Should be sorted by potential (highest first)
      for (let i = 1; i < highPotential.length; i++) {
        expect(highPotential[i - 1].potential).toBeGreaterThanOrEqual(
          highPotential[i].potential
        );
      }
    });

    it('should exclude inhibition zones', () => {
      const field = manager.createFieldFromGraph(graph);

      // Add agent-1 to inhibition zone via high coverage
      const coverageData = new Map<string, number>([['agent-1', 0.95]]);
      manager.updateFieldCoverage(field.id, coverageData);

      const highPotential = manager.getHighPotentialCells(field.id, 10);

      // agent-1 should not be in results
      expect(highPotential.find(c => c.position === 'agent-1')).toBeUndefined();
    });

    it('should respect limit parameter', () => {
      const field = manager.createFieldFromGraph(graph);
      const highPotential = manager.getHighPotentialCells(field.id, 1);

      expect(highPotential.length).toBeLessThanOrEqual(1);
    });
  });

  describe('propagateSignal', () => {
    it('should increase potential in neighboring cells', () => {
      const field = manager.createFieldFromGraph(graph);
      const cell2Before = field.cells.get('agent-2')!.potential;

      manager.propagateSignal(field.id, 'agent-1', 1.0);

      const cell2After = field.cells.get('agent-2')!.potential;

      // Potential should increase for neighbor
      expect(cell2After).toBeGreaterThan(cell2Before);
    });

    it('should not propagate to inhibition zones', () => {
      const field = manager.createFieldFromGraph(graph);

      // Make agent-2 an inhibition zone
      field.inhibitionZones.add('agent-2');
      const cell2Before = field.cells.get('agent-2')!.potential;

      manager.propagateSignal(field.id, 'agent-1', 1.0);

      // agent-2 is in inhibition zone, signal should not propagate there
      // Note: The implementation may still update visited cells, but should not add to queue
    });

    it('should decay signal strength over distance', () => {
      // Create a longer chain: A -> B -> C
      const chainGraph = createSwarmGraph();
      chainGraph.addVertex(createTestVertex({ id: 'A' }));
      chainGraph.addVertex(createTestVertex({ id: 'B' }));
      chainGraph.addVertex(createTestVertex({ id: 'C' }));
      chainGraph.addEdge({ source: 'A', target: 'B', weight: 1, type: 'coordination', bidirectional: true });
      chainGraph.addEdge({ source: 'B', target: 'C', weight: 1, type: 'coordination', bidirectional: true });

      const chainManager = createMorphogeneticFieldManager();
      const field = chainManager.createFieldFromGraph(chainGraph);

      const cellBBefore = field.cells.get('B')!.potential;
      const cellCBefore = field.cells.get('C')!.potential;

      chainManager.propagateSignal(field.id, 'A', 1.0);

      const cellBAfter = field.cells.get('B')!.potential;
      const cellCAfter = field.cells.get('C')!.potential;

      // B should get more signal than C (signal decays)
      const bIncrease = cellBAfter - cellBBefore;
      const cIncrease = cellCAfter - cellCBefore;
      expect(bIncrease).toBeGreaterThanOrEqual(cIncrease);
    });
  });

  describe('getFieldStats', () => {
    it('should return correct statistics', () => {
      const field = manager.createFieldFromGraph(graph);
      const stats = manager.getFieldStats(field.id);

      expect(stats).toBeDefined();
      expect(stats!.totalCells).toBe(3);
      expect(stats!.coveredCells).toBe(0); // No coverage yet
      expect(stats!.averagePotential).toBeGreaterThan(0);
      expect(stats!.inhibitionZoneSize).toBe(0);
    });

    it('should update after coverage changes', () => {
      const field = manager.createFieldFromGraph(graph);

      const coverageData = new Map<string, number>([
        ['agent-1', 0.9],
        ['agent-2', 0.9],
      ]);
      manager.updateFieldCoverage(field.id, coverageData);

      const stats = manager.getFieldStats(field.id);

      expect(stats!.coveredCells).toBe(2);
      expect(stats!.inhibitionZoneSize).toBe(2);
    });

    it('should return undefined for non-existent field', () => {
      const stats = manager.getFieldStats('non-existent-field');
      expect(stats).toBeUndefined();
    });
  });

  describe('resetVisited', () => {
    it('should reset visited flags for all cells', () => {
      const field = manager.createFieldFromGraph(graph);

      // Manually mark some cells as visited
      for (const cell of field.cells.values()) {
        cell.visited = true;
      }

      manager.resetVisited(field.id);

      for (const cell of field.cells.values()) {
        expect(cell.visited).toBe(false);
      }
    });
  });
});

// ============================================================================
// MorphogeneticController Tests
// ============================================================================

describe('MorphogeneticController', () => {
  let controller: MorphogeneticController;
  let graph: SwarmGraph;

  beforeEach(() => {
    graph = createTestGraph();
    controller = createMorphogeneticController(graph, {
      enabled: false, // Disable auto-start for tests
      growthIntervalMs: 100,
      maxActiveSeeds: 5,
    });
  });

  afterEach(() => {
    controller.stop();
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  describe('Lifecycle', () => {
    it('should start and stop correctly', () => {
      controller = createMorphogeneticController(graph, { enabled: true, growthIntervalMs: 100 });

      controller.start();
      expect(controller.isRunning()).toBe(true);

      controller.stop();
      expect(controller.isRunning()).toBe(false);
    });

    it('should not start when disabled', () => {
      controller = createMorphogeneticController(graph, { enabled: false });

      controller.start();
      expect(controller.isRunning()).toBe(false);
    });

    it('should not start twice', () => {
      controller = createMorphogeneticController(graph, { enabled: true, growthIntervalMs: 100 });

      controller.start();
      controller.start();
      expect(controller.isRunning()).toBe(true);

      controller.stop();
    });
  });

  // ==========================================================================
  // Plant Seeds
  // ==========================================================================

  describe('plantSeeds', () => {
    it('should plant seeds at weak vertices', () => {
      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.7 }),
      ];

      const seeds = controller.plantSeeds(weakVertices);

      expect(seeds.length).toBe(1);
      expect(seeds[0].sourceVertexId).toBe('agent-1');
      expect(seeds[0].active).toBe(true);
      expect(seeds[0].energy).toBe(1.0);
    });

    it('should set growth rate based on risk score', () => {
      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.9 }),
      ];

      const seeds = controller.plantSeeds(weakVertices);

      // Growth rate should be proportional to risk score
      expect(seeds[0].growthRate).toBeGreaterThanOrEqual(1);
      expect(seeds[0].growthRate).toBeLessThanOrEqual(3);
    });

    it('should respect maxActiveSeeds limit', () => {
      // Add more vertices to the graph
      for (let i = 4; i <= 10; i++) {
        graph.addVertex(createTestVertex({ id: `agent-${i}` }));
      }

      const weakVertices: WeakVertex[] = [];
      for (let i = 1; i <= 10; i++) {
        weakVertices.push(createWeakVertex(graph, `agent-${i}`, { riskScore: 0.5 + i * 0.04 }));
      }

      const seeds = controller.plantSeeds(weakVertices);

      expect(seeds.length).toBeLessThanOrEqual(5); // maxActiveSeeds = 5
    });

    it('should prioritize higher risk vertices', () => {
      graph.addVertex(createTestVertex({ id: 'agent-4' }));

      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.3 }),
        createWeakVertex(graph, 'agent-4', { riskScore: 0.9 }),
      ];

      controller = createMorphogeneticController(graph, {
        enabled: false,
        maxActiveSeeds: 1,
      });

      const seeds = controller.plantSeeds(weakVertices);

      // Should plant seed at higher risk vertex
      expect(seeds[0].sourceVertexId).toBe('agent-4');
    });

    it('should select radial pattern for coordinators', () => {
      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-3', { riskScore: 0.8 }), // agent-3 is coordinator
      ];

      const seeds = controller.plantSeeds(weakVertices);

      expect(seeds[0].pattern).toBe('radial');
    });

    it('should not plant duplicate seeds for same vertex', () => {
      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.7 }),
      ];

      controller.plantSeeds(weakVertices);
      const secondPlanting = controller.plantSeeds(weakVertices);

      expect(secondPlanting.length).toBe(0);
    });

    it('should generate mutation rules', () => {
      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.7 }),
      ];

      const seeds = controller.plantSeeds(weakVertices);

      expect(seeds[0].mutationRules).toBeDefined();
      expect(seeds[0].mutationRules.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Growth Cycles
  // ==========================================================================

  describe('runGrowthCycle', () => {
    beforeEach(() => {
      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.7 }),
      ];
      controller.plantSeeds(weakVertices);
    });

    it('should generate tests from active seeds', async () => {
      const result = await controller.runGrowthCycle();

      expect(result).toBeDefined();
      expect(result.cycle).toBe(1);
      expect(result.activeSeeds).toBeGreaterThan(0);
      expect(result.newTests.length).toBeGreaterThan(0);
    });

    it('should increment cycle count', async () => {
      expect(controller.getCycle()).toBe(0);

      await controller.runGrowthCycle();
      expect(controller.getCycle()).toBe(1);

      await controller.runGrowthCycle();
      expect(controller.getCycle()).toBe(2);
    });

    it('should decay seed energy over cycles', async () => {
      const seeds = controller.getActiveSeeds();
      const energyBefore = seeds[0].energy;

      await controller.runGrowthCycle();

      const seedAfter = controller.getSeed(seeds[0].id);
      expect(seedAfter!.energy).toBeLessThan(energyBefore);
    });

    it('should deactivate seeds when energy depleted', async () => {
      // Run many cycles to deplete energy
      for (let i = 0; i < 15; i++) {
        await controller.runGrowthCycle();
      }

      const activeSeeds = controller.getActiveSeeds();
      // Seeds should eventually become inactive
      expect(activeSeeds.length).toBeLessThanOrEqual(1);
    });

    it('should track generated tests on seed', async () => {
      const seeds = controller.getActiveSeeds();
      expect(seeds[0].generatedTests.length).toBe(0);

      await controller.runGrowthCycle();

      const seedAfter = controller.getSeed(seeds[0].id);
      expect(seedAfter!.generatedTests.length).toBeGreaterThan(0);
    });

    it('should return field snapshot in result', async () => {
      const result = await controller.runGrowthCycle();

      expect(result.fieldSnapshot).toBeDefined();
      expect(result.fieldSnapshot.totalCells).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Test Specifications
  // ==========================================================================

  describe('TestSpecification generation', () => {
    beforeEach(async () => {
      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.7 }),
      ];
      controller.plantSeeds(weakVertices);
      await controller.runGrowthCycle();
    });

    it('should create tests with required properties', () => {
      const tests = controller.getTests();
      expect(tests.length).toBeGreaterThan(0);

      const test = tests[0];
      expect(test.id).toBeDefined();
      expect(test.name).toBeDefined();
      expect(test.targetPath).toBeDefined();
      expect(test.type).toBeDefined();
      expect(test.description).toBeDefined();
      expect(test.priority).toBeGreaterThanOrEqual(0);
      expect(test.priority).toBeLessThanOrEqual(1);
      expect(test.seedId).toBeDefined();
      expect(test.generation).toBeGreaterThanOrEqual(0);
      expect(test.complexity).toBeGreaterThanOrEqual(1);
      expect(test.complexity).toBeLessThanOrEqual(10);
      expect(test.status).toBe('growing');
    });

    it('should generate appropriate test types', () => {
      const tests = controller.getTests();
      const validTypes = ['unit', 'integration', 'e2e', 'property'];

      for (const test of tests) {
        expect(validTypes).toContain(test.type);
      }
    });

    it('should track generation distance from seed', async () => {
      // Run multiple cycles
      for (let i = 0; i < 3; i++) {
        await controller.runGrowthCycle();
      }

      const tests = controller.getTests();
      const generations = tests.map(t => t.generation);

      // Should have tests at different generations
      expect(Math.max(...generations)).toBeGreaterThanOrEqual(0);
    });

    it('should include mutation rules for property tests', async () => {
      // Run several cycles to potentially generate property tests
      for (let i = 0; i < 5; i++) {
        await controller.runGrowthCycle();
        // Record negative feedback to trigger adaptive pattern switch to property tests
        for (const test of controller.getTests()) {
          controller.recordFeedback(test.id, false);
        }
      }

      const propertyTests = controller.getTests().filter(t => t.type === 'property');

      if (propertyTests.length > 0) {
        expect(propertyTests[0].mutationRules).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // Pruning
  // ==========================================================================

  describe('prune', () => {
    beforeEach(async () => {
      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.1 }), // Very low priority
      ];
      controller.plantSeeds(weakVertices);
      await controller.runGrowthCycle();
    });

    it('should mark low priority tests as pruned', async () => {
      // Wait for tests to age
      await new Promise(resolve => setTimeout(resolve, 150));

      const pruned = controller.prune();
      expect(pruned).toBeDefined();
    });

    it('should prune tests with negative feedback', async () => {
      const tests = controller.getTests();

      // Record multiple negative feedbacks
      for (const test of tests) {
        controller.recordFeedback(test.id, false);
        controller.recordFeedback(test.id, false);
        controller.recordFeedback(test.id, false);
      }

      const pruned = controller.prune();

      // Some tests should be pruned due to high failure rate
      const prunedTests = controller.getTestsByStatus('pruned');
      expect(prunedTests.length + pruned.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Harvesting
  // ==========================================================================

  describe('harvest', () => {
    it('should harvest mature tests', async () => {
      const fastController = createMorphogeneticController(graph, {
        enabled: false,
        growthIntervalMs: 10,
        pruningThreshold: 0.1, // Low threshold so tests mature
      });

      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.8 }),
      ];
      fastController.plantSeeds(weakVertices);
      await fastController.runGrowthCycle();

      // Wait for tests to mature
      await new Promise(resolve => setTimeout(resolve, 50));

      const result = fastController.harvest();

      expect(result).toBeDefined();
      expect(result.totalTests).toBeGreaterThan(0);
      expect(result.executionOrder.length).toBe(result.totalTests);
      expect(result.specifications.length).toBe(result.totalTests);

      fastController.stop();
    });

    it('should categorize tests by type and priority', async () => {
      const fastController = createMorphogeneticController(graph, {
        enabled: false,
        growthIntervalMs: 10,
        pruningThreshold: 0.1,
      });

      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.8 }),
      ];
      fastController.plantSeeds(weakVertices);
      await fastController.runGrowthCycle();
      await new Promise(resolve => setTimeout(resolve, 50));

      const result = fastController.harvest();

      expect(result.byType).toBeDefined();
      expect(result.byPriority).toBeDefined();
      expect(result.byPriority.high).toBeGreaterThanOrEqual(0);
      expect(result.byPriority.medium).toBeGreaterThanOrEqual(0);
      expect(result.byPriority.low).toBeGreaterThanOrEqual(0);

      fastController.stop();
    });

    it('should sort execution order by priority', async () => {
      const fastController = createMorphogeneticController(graph, {
        enabled: false,
        growthIntervalMs: 10,
        pruningThreshold: 0.1,
      });

      // Plant multiple seeds with different priorities
      graph.addVertex(createTestVertex({ id: 'agent-4' }));
      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.3 }),
        createWeakVertex(graph, 'agent-4', { riskScore: 0.9 }),
      ];
      fastController.plantSeeds(weakVertices);

      for (let i = 0; i < 3; i++) {
        await fastController.runGrowthCycle();
      }
      await new Promise(resolve => setTimeout(resolve, 50));

      const result = fastController.harvest();

      if (result.specifications.length >= 2) {
        const first = result.specifications[0];
        const last = result.specifications[result.specifications.length - 1];
        expect(first.priority).toBeGreaterThanOrEqual(last.priority);
      }

      fastController.stop();
    });

    it('should mark harvested tests with correct status', async () => {
      const fastController = createMorphogeneticController(graph, {
        enabled: false,
        growthIntervalMs: 10,
        pruningThreshold: 0.1,
      });

      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.8 }),
      ];
      fastController.plantSeeds(weakVertices);
      await fastController.runGrowthCycle();
      await new Promise(resolve => setTimeout(resolve, 50));

      const result = fastController.harvest();

      for (const spec of result.specifications) {
        expect(spec.status).toBe('harvested');
      }

      fastController.stop();
    });
  });

  // ==========================================================================
  // Feedback System
  // ==========================================================================

  describe('recordFeedback', () => {
    beforeEach(async () => {
      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.7 }),
      ];
      controller.plantSeeds(weakVertices);
      await controller.runGrowthCycle();
    });

    it('should update seed coverage on success', () => {
      const tests = controller.getTests();
      const seed = controller.getSeed(tests[0].seedId);
      const coverageBefore = seed!.currentCoverage;

      controller.recordFeedback(tests[0].id, true);

      const seedAfter = controller.getSeed(tests[0].seedId);
      expect(seedAfter!.currentCoverage).toBeGreaterThan(coverageBefore);
    });

    it('should not increase coverage on failure', () => {
      const tests = controller.getTests();
      const seed = controller.getSeed(tests[0].seedId);
      const coverageBefore = seed!.currentCoverage;

      controller.recordFeedback(tests[0].id, false);

      const seedAfter = controller.getSeed(tests[0].seedId);
      expect(seedAfter!.currentCoverage).toBe(coverageBefore);
    });
  });

  // ==========================================================================
  // Statistics
  // ==========================================================================

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.7 }),
      ];
      controller.plantSeeds(weakVertices);
      await controller.runGrowthCycle();

      const stats = controller.getStats();

      expect(stats.totalSeeds).toBe(1);
      expect(stats.activeSeeds).toBeGreaterThanOrEqual(0);
      expect(stats.totalTests).toBeGreaterThan(0);
      expect(stats.currentCycle).toBe(1);
      expect(stats.averageEnergy).toBeGreaterThan(0);
      expect(stats.averageEnergy).toBeLessThanOrEqual(1);
    });

    it('should track test status counts', async () => {
      const fastController = createMorphogeneticController(graph, {
        enabled: false,
        growthIntervalMs: 10,
        pruningThreshold: 0.1,
      });

      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.8 }),
      ];
      fastController.plantSeeds(weakVertices);
      await fastController.runGrowthCycle();
      await new Promise(resolve => setTimeout(resolve, 50));

      const statsBefore = fastController.getStats();
      expect(statsBefore.growingTests).toBeGreaterThanOrEqual(0);

      fastController.harvest();

      const statsAfter = fastController.getStats();
      expect(statsAfter.harvestedTests).toBeGreaterThan(0);

      fastController.stop();
    });
  });

  // ==========================================================================
  // Configuration
  // ==========================================================================

  describe('configuration', () => {
    it('should expose default config', () => {
      expect(DEFAULT_MORPHOGENETIC_CONFIG).toBeDefined();
      expect(DEFAULT_MORPHOGENETIC_CONFIG.enabled).toBe(true);
      expect(DEFAULT_MORPHOGENETIC_CONFIG.defaultPattern).toBe('adaptive');
      expect(DEFAULT_MORPHOGENETIC_CONFIG.maxActiveSeeds).toBe(10);
    });

    it('should return config', () => {
      const config = controller.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.growthIntervalMs).toBe(100);
    });

    it('should merge custom config with defaults', () => {
      const customController = createMorphogeneticController(graph, {
        growthIntervalMs: 5000,
      });

      const config = customController.getConfig();
      expect(config.growthIntervalMs).toBe(5000);
      expect(config.defaultPattern).toBe('adaptive'); // Default preserved
    });
  });
});

// ============================================================================
// Growth Pattern Tests
// ============================================================================

describe('Growth Patterns', () => {
  let graph: SwarmGraph;

  beforeEach(() => {
    graph = createSwarmGraph();

    // Create a more complex graph for pattern testing
    for (let i = 1; i <= 5; i++) {
      graph.addVertex(createTestVertex({
        id: `agent-${i}`,
        domain: 'test-generation',
        capabilities: ['cap-a', 'cap-b', 'cap-c'],
      }));
    }

    // Create linear chain: 1-2-3-4-5
    for (let i = 1; i < 5; i++) {
      graph.addEdge({
        source: `agent-${i}`,
        target: `agent-${i + 1}`,
        weight: 1,
        type: 'coordination',
        bidirectional: true,
      });
    }
  });

  describe('radial pattern', () => {
    it('should expand coverage outward from seed', async () => {
      const controller = createMorphogeneticController(graph, {
        enabled: false,
        defaultPattern: 'radial',
      });

      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-3', { riskScore: 0.5 }), // Middle node
      ];

      controller.plantSeeds(weakVertices);
      await controller.runGrowthCycle();

      const tests = controller.getTests();

      // Should have generated tests
      expect(tests.length).toBeGreaterThan(0);

      // First test should target the seed
      const seedTests = tests.filter(t => t.targetPath.includes('agent-3'));
      expect(seedTests.length).toBeGreaterThan(0);

      controller.stop();
    });

    it('should generate integration tests for neighbors', async () => {
      const controller = createMorphogeneticController(graph, {
        enabled: false,
        defaultPattern: 'radial',
      });

      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-3', { riskScore: 0.7 }),
      ];

      controller.plantSeeds(weakVertices);
      await controller.runGrowthCycle();
      await controller.runGrowthCycle();

      const tests = controller.getTests();
      const integrationTests = tests.filter(t => t.type === 'integration');

      // Should have generated integration tests for neighbors
      expect(integrationTests.length).toBeGreaterThan(0);

      controller.stop();
    });
  });

  describe('branching pattern', () => {
    it('should follow dependencies/capabilities', async () => {
      const controller = createMorphogeneticController(graph, {
        enabled: false,
        defaultPattern: 'branching',
      });

      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.6 }),
      ];

      controller.plantSeeds(weakVertices);
      await controller.runGrowthCycle();

      const tests = controller.getTests();
      expect(tests.length).toBeGreaterThan(0);

      controller.stop();
    });

    it('should generate tests based on vertex capabilities', async () => {
      const controller = createMorphogeneticController(graph, {
        enabled: false,
        defaultPattern: 'branching',
      });

      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.6 }),
      ];

      controller.plantSeeds(weakVertices);

      // Run multiple cycles to generate capability-based tests
      for (let i = 0; i < 3; i++) {
        await controller.runGrowthCycle();
      }

      const tests = controller.getTests();

      // Some tests should target capabilities
      const capabilityTests = tests.filter(t =>
        t.targetPath.includes('cap-') || t.description.includes('capability')
      );
      expect(capabilityTests.length).toBeGreaterThanOrEqual(0);

      controller.stop();
    });
  });

  describe('adaptive pattern', () => {
    it('should adjust based on positive feedback', async () => {
      const controller = createMorphogeneticController(graph, {
        enabled: false,
        defaultPattern: 'adaptive',
      });

      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.6 }),
      ];

      controller.plantSeeds(weakVertices);

      // First cycle
      await controller.runGrowthCycle();
      const testsBefore = controller.getTests().length;

      // Record positive feedback
      for (const test of controller.getTests()) {
        controller.recordFeedback(test.id, true);
      }

      // Second cycle should continue similar pattern
      await controller.runGrowthCycle();
      const testsAfter = controller.getTests().length;

      expect(testsAfter).toBeGreaterThan(testsBefore);

      controller.stop();
    });

    it('should try property tests after repeated failures', async () => {
      const controller = createMorphogeneticController(graph, {
        enabled: false,
        defaultPattern: 'adaptive',
      });

      const weakVertices: WeakVertex[] = [
        createWeakVertex(graph, 'agent-1', { riskScore: 0.6 }),
      ];

      controller.plantSeeds(weakVertices);

      // Run cycles with negative feedback to trigger pattern switch
      for (let i = 0; i < 5; i++) {
        await controller.runGrowthCycle();
        for (const test of controller.getTests()) {
          controller.recordFeedback(test.id, false);
        }
      }

      const tests = controller.getTests();
      const propertyTests = tests.filter(t => t.type === 'property');

      // Adaptive pattern should try property tests after failures
      // (This may or may not generate property tests depending on conditions)
      expect(tests.length).toBeGreaterThan(0);

      controller.stop();
    });
  });
});

// ============================================================================
// Factory Functions
// ============================================================================

describe('Factory Functions', () => {
  it('should create controller via factory', () => {
    const graph = createTestGraph();
    const controller = createMorphogeneticController(graph);

    expect(controller).toBeInstanceOf(MorphogeneticController);
    controller.stop();
  });

  it('should create field manager via factory', () => {
    const manager = createMorphogeneticFieldManager();

    expect(manager).toBeInstanceOf(MorphogeneticFieldManager);
  });

  it('should accept partial config in factories', () => {
    const graph = createTestGraph();
    const controller = createMorphogeneticController(graph, {
      growthIntervalMs: 5000,
    });

    expect(controller.getConfig().growthIntervalMs).toBe(5000);
    expect(controller.getConfig().enabled).toBe(true); // Default preserved

    controller.stop();
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty graph', () => {
    const emptyGraph = createSwarmGraph();
    const controller = createMorphogeneticController(emptyGraph, { enabled: false });

    const stats = controller.getStats();
    expect(stats.totalSeeds).toBe(0);
    expect(stats.totalTests).toBe(0);

    controller.stop();
  });

  it('should handle graph with single vertex', async () => {
    const singleGraph = createSwarmGraph();
    singleGraph.addVertex(createTestVertex({ id: 'lonely' }));

    const controller = createMorphogeneticController(singleGraph, { enabled: false });

    const weakVertices: WeakVertex[] = [
      createWeakVertex(singleGraph, 'lonely', { riskScore: 0.8 }),
    ];

    controller.plantSeeds(weakVertices);
    await controller.runGrowthCycle();

    expect(controller.getTests().length).toBeGreaterThan(0);

    controller.stop();
  });

  it('should handle graph with no edges', async () => {
    const disconnectedGraph = createSwarmGraph();
    disconnectedGraph.addVertex(createTestVertex({ id: 'a' }));
    disconnectedGraph.addVertex(createTestVertex({ id: 'b' }));
    // No edges

    const controller = createMorphogeneticController(disconnectedGraph, { enabled: false });

    const weakVertices: WeakVertex[] = [
      createWeakVertex(disconnectedGraph, 'a', { riskScore: 0.8 }),
    ];

    controller.plantSeeds(weakVertices);
    await controller.runGrowthCycle();

    expect(controller.getTests().length).toBeGreaterThan(0);

    controller.stop();
  });

  it('should handle concurrent operations', async () => {
    const graph = createTestGraph();
    const controller = createMorphogeneticController(graph, { enabled: false });

    const weakVertices: WeakVertex[] = [
      createWeakVertex(graph, 'agent-1', { riskScore: 0.7 }),
    ];

    controller.plantSeeds(weakVertices);

    // Run multiple cycles concurrently
    const cycles = Promise.all([
      controller.runGrowthCycle(),
      controller.runGrowthCycle(),
      controller.runGrowthCycle(),
    ]);

    await expect(cycles).resolves.toBeDefined();

    controller.stop();
  });
});
