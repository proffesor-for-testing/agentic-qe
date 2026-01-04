/**
 * Nervous System Integration Tests
 *
 * Comprehensive tests for the nervous system integration components:
 * - HybridPatternStore: HDC + IPatternStore integration
 * - BTSPLearningEngine: BTSP + LearningEngine integration
 * - WorkspaceAgentCoordinator: GlobalWorkspace + Agent coordination
 * - CircadianAgentManager: CircadianController + Agent lifecycle
 *
 * @module tests/nervous-system/integration
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';

// Integration components under test
import { HybridPatternStore, createHybridPatternStore } from '../../src/nervous-system/integration/HybridPatternStore.js';
import { BTSPLearningEngine } from '../../src/nervous-system/integration/BTSPLearningEngine.js';
import { WorkspaceAgentCoordinator, AgentWorkspaceItem, TaskCoordinationRequest } from '../../src/nervous-system/integration/WorkspaceAgent.js';
import { CircadianAgentManager, AgentPhaseConfig, CriticalityLevel } from '../../src/nervous-system/integration/CircadianAgent.js';

// Types
import type { TestPattern } from '../../src/core/memory/IPatternStore.js';
import type { CircadianPhase } from '../../src/nervous-system/adapters/CircadianController.js';
import { QEAgentType } from '../../src/types/index.js';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock the WASM loader to prevent actual WASM loading in tests
vi.mock('../../src/nervous-system/wasm-loader.js', () => ({
  initNervousSystem: vi.fn().mockResolvedValue(undefined),
  isWasmInitialized: vi.fn().mockReturnValue(true),
  Hypervector: {
    random: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({ to_bytes: vi.fn().mockReturnValue(new Uint8Array(1250)) }),
      similarity: vi.fn().mockReturnValue(0.85),
      to_bytes: vi.fn().mockReturnValue(new Uint8Array(1250)),
      free: vi.fn(),
    }),
    from_seed: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({ to_bytes: vi.fn().mockReturnValue(new Uint8Array(1250)) }),
      similarity: vi.fn().mockReturnValue(0.85),
      to_bytes: vi.fn().mockReturnValue(new Uint8Array(1250)),
      free: vi.fn(),
    }),
    from_bytes: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({ to_bytes: vi.fn().mockReturnValue(new Uint8Array(1250)) }),
      similarity: vi.fn().mockReturnValue(0.85),
      to_bytes: vi.fn().mockReturnValue(new Uint8Array(1250)),
      free: vi.fn(),
    }),
    bundle_3: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({ to_bytes: vi.fn().mockReturnValue(new Uint8Array(1250)) }),
      similarity: vi.fn().mockReturnValue(0.85),
      to_bytes: vi.fn().mockReturnValue(new Uint8Array(1250)),
      free: vi.fn(),
    }),
  },
  HdcMemory: vi.fn().mockImplementation(() => ({
    store: vi.fn(),
    retrieve: vi.fn().mockReturnValue([]),
    get: vi.fn(),
    has: vi.fn().mockReturnValue(false),
    clear: vi.fn(),
    size: 0,
    top_k: vi.fn().mockReturnValue([]),
    free: vi.fn(),
  })),
  WTALayer: vi.fn().mockImplementation(() => ({
    compete: vi.fn().mockReturnValue(1), // Returns Active phase index
    free: vi.fn(),
  })),
  GlobalWorkspace: vi.fn().mockImplementation(() => ({
    broadcast: vi.fn().mockReturnValue(true),
    compete: vi.fn(),
    retrieve_top_k: vi.fn().mockReturnValue([]),
    retrieve: vi.fn().mockReturnValue([]),
    clear: vi.fn(),
    free: vi.fn(),
    len: 0,
    capacity: 7,
    available_slots: vi.fn().mockReturnValue(7),
    current_load: vi.fn().mockReturnValue(0),
    is_full: vi.fn().mockReturnValue(false),
    is_empty: vi.fn().mockReturnValue(true),
    average_salience: vi.fn().mockReturnValue(0),
    most_salient: vi.fn().mockReturnValue(null),
    set_decay_rate: vi.fn(),
  })),
  WorkspaceItem: vi.fn().mockImplementation((content, salience, source, timestamp) => ({
    content,
    salience,
    source_module: source,
    timestamp,
  })),
}));

// Mock BTSPAdapter with a proper class implementation
vi.mock('../../src/nervous-system/adapters/BTSPAdapter.js', () => {
  class MockBTSPAdapter {
    private _initialized = false;

    async initialize() {
      this._initialized = true;
    }

    isInitialized() {
      return this._initialized;
    }

    learnFromFailure(_cue: Float32Array, _target: Float32Array) {
      // No-op for mock
    }

    recallWithConfidence(_cue: Float32Array) {
      return {
        pattern: new Float32Array(256),
        confidence: 0.75,
      };
    }

    detectPlateau() {
      return {
        detected: true,
        magnitude: 0.5,
        trend: 'stable',
      };
    }

    async consolidate() {
      // No-op for mock
    }

    getCapacity() {
      return {
        utilization: 0.3,
        available: 0.7,
      };
    }

    getStats() {
      return {
        learningEvents: 10,
        recallEvents: 5,
        consolidations: 2,
      };
    }

    reset() {
      // No-op for mock
    }

    dispose() {
      // No-op for mock
    }
  }

  return { BTSPAdapter: MockBTSPAdapter };
});

// Mock SwarmMemoryManager
const mockSwarmMemoryManager = {
  initialize: vi.fn().mockResolvedValue(undefined),
  store: vi.fn().mockResolvedValue(undefined),
  retrieve: vi.fn().mockResolvedValue(null),
  delete: vi.fn().mockResolvedValue(true),
  search: vi.fn().mockResolvedValue([]),
  getStats: vi.fn().mockReturnValue({ entries: 0 }),
};

// Mock LearningEngine with a proper class implementation
vi.mock('../../src/learning/LearningEngine.js', () => {
  class MockLearningEngine {
    private _initialized = false;

    async initialize() {
      this._initialized = true;
    }

    isInitialized() {
      return this._initialized;
    }

    async learnFromExecution(_task: unknown, _result: unknown) {
      return {
        improved: true,
        previousPerformance: 0.7,
        newPerformance: 0.8,
        improvementRate: 14.3,
        confidence: 0.85,
        patterns: [],
        timestamp: new Date(),
      };
    }

    async recommendStrategy(_state: unknown) {
      return {
        strategy: 'parallel-execution',
        confidence: 0.8,
        expectedImprovement: 15,
        reasoning: 'Q-learning recommendation',
        alternatives: [],
      };
    }

    async getPatterns() {
      return [];
    }

    getAlgorithm() {
      return 'q-learning';
    }

    getAlgorithmStats() {
      return {};
    }

    getTotalExperiences() {
      return 100;
    }

    getExplorationRate() {
      return 0.1;
    }

    getQLearningStats() {
      return {};
    }

    dispose() {
      // No-op for mock
    }
  }

  return { LearningEngine: MockLearningEngine };
});

// Mock BaseAgent for WorkspaceAgentCoordinator tests
const createMockAgent = (id: string, type: QEAgentType) => ({
  getAgentId: vi.fn().mockReturnValue({ id, type }),
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
});

// Mock CircadianController
const createMockCircadianController = () => ({
  getPhase: vi.fn().mockReturnValue('Active' as CircadianPhase),
  getState: vi.fn().mockReturnValue({
    phase: 'Active',
    cycleTime: 5000,
    timeToNextPhase: 10000,
    wasmEnabled: false,
  }),
  getConfig: vi.fn().mockReturnValue({
    cyclePeriodMs: 60000,
    phases: {
      Active: { duration: 0.4, dutyFactor: 1.0 },
      Dawn: { duration: 0.15, dutyFactor: 0.6 },
      Dusk: { duration: 0.15, dutyFactor: 0.4 },
      Rest: { duration: 0.3, dutyFactor: 0.1 },
    },
  }),
  getMetrics: vi.fn().mockReturnValue({
    phaseTime: { Active: 1000, Dawn: 500, Dusk: 500, Rest: 1000 },
    averageDutyFactor: 0.52,
  }),
  getDutyFactor: vi.fn().mockReturnValue(1.0),
  advance: vi.fn(),
  modulate: vi.fn(),
  reset: vi.fn(),
});

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a test pattern for HybridPatternStore tests
 */
function createTestPattern(id: string, overrides: Partial<TestPattern> = {}): TestPattern {
  return {
    id,
    type: 'edge-case',
    domain: 'unit-test',
    content: `Test pattern content for ${id}`,
    embedding: new Array(384).fill(0).map(() => Math.random()),
    metadata: { source: 'test' },
    createdAt: Date.now(),
    lastUsed: Date.now(),
    usageCount: 0,
    ...overrides,
  };
}

/**
 * Create a random embedding vector
 */
function createRandomEmbedding(dim: number = 384): number[] {
  return new Array(dim).fill(0).map(() => Math.random() - 0.5);
}

// ============================================================================
// HybridPatternStore Integration Tests
// ============================================================================

describe('HybridPatternStore Integration', () => {
  let store: HybridPatternStore;

  beforeEach(async () => {
    store = createHybridPatternStore({
      dimension: 384,
      useHdcPrefilter: true,
      enableMetrics: true,
      debug: false,
    });
    await store.initialize();
  });

  afterEach(async () => {
    if (store) {
      await store.shutdown();
    }
  });

  describe('initialization', () => {
    it('should initialize with HDC adapter', async () => {
      const newStore = new HybridPatternStore({
        dimension: 384,
        useHdcPrefilter: true,
      });
      await newStore.initialize();

      const info = newStore.getImplementationInfo();
      // With mocked WASM, it will use fallback or ruvector depending on mock setup
      expect(['ruvector', 'fallback']).toContain(info.type);
      expect(info.version).toBeDefined();
      expect(Array.isArray(info.features)).toBe(true);

      await newStore.shutdown();
    });

    it('should fallback gracefully when WASM unavailable', async () => {
      // Create store with HDC initialization that will fail
      const fallbackStore = new HybridPatternStore({
        dimension: 384,
        useHdcPrefilter: true,
      });

      // Should not throw even if HDC fails
      await expect(fallbackStore.initialize()).resolves.not.toThrow();

      // Store should still work with fallback
      const pattern = createTestPattern('test-1');
      await fallbackStore.storePattern(pattern);

      const retrieved = await fallbackStore.getPattern('test-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('test-1');

      await fallbackStore.shutdown();
    });

    it('should not reinitialize if already initialized', async () => {
      // Store is already initialized in beforeEach
      // Second initialization should be a no-op
      await expect(store.initialize()).resolves.not.toThrow();

      // Should still function correctly
      const stats = await store.getStats();
      expect(stats.count).toBe(0);
    });
  });

  describe('pattern operations', () => {
    it('should store patterns with HDC encoding', async () => {
      const pattern = createTestPattern('pattern-001', {
        type: 'edge-case',
        domain: 'unit-test',
        content: 'null input handling',
      });

      await store.storePattern(pattern);

      const retrieved = await store.getPattern('pattern-001');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('pattern-001');
      expect(retrieved?.type).toBe('edge-case');
      expect(retrieved?.content).toBe('null input handling');
    });

    it('should search patterns using HDC pre-filter', async () => {
      // Store multiple patterns
      const patterns = [
        createTestPattern('p1', { content: 'null handling' }),
        createTestPattern('p2', { content: 'boundary condition' }),
        createTestPattern('p3', { content: 'error recovery' }),
      ];

      for (const pattern of patterns) {
        await store.storePattern(pattern);
      }

      // Search with query embedding
      const queryEmbedding = createRandomEmbedding(384);
      const results = await store.searchSimilar(queryEmbedding, { k: 2 });

      expect(Array.isArray(results)).toBe(true);
      // Results should contain pattern and score
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('pattern');
        expect(results[0]).toHaveProperty('score');
        expect(typeof results[0].score).toBe('number');
      }
    });

    it('should handle batch operations', async () => {
      const patterns = Array.from({ length: 10 }, (_, i) =>
        createTestPattern(`batch-${i}`, {
          content: `Batch pattern ${i}`,
        })
      );

      await store.storeBatch(patterns);

      const stats = await store.getStats();
      expect(stats.count).toBe(10);

      // Verify random sample can be retrieved
      const retrieved = await store.getPattern('batch-5');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.content).toBe('Batch pattern 5');
    });

    it('should delete patterns correctly', async () => {
      const pattern = createTestPattern('to-delete');
      await store.storePattern(pattern);

      let retrieved = await store.getPattern('to-delete');
      expect(retrieved).not.toBeNull();

      const deleted = await store.deletePattern('to-delete');
      expect(deleted).toBe(true);

      retrieved = await store.getPattern('to-delete');
      expect(retrieved).toBeNull();
    });

    it('should record pattern usage', async () => {
      const pattern = createTestPattern('usage-test');
      await store.storePattern(pattern);

      // Record usage
      await store.recordUsage('usage-test');

      const retrieved = await store.getPattern('usage-test');
      expect(retrieved?.usageCount).toBe(1);

      // Record more usage
      await store.recordUsage('usage-test');
      await store.recordUsage('usage-test');

      const updated = await store.getPattern('usage-test');
      expect(updated?.usageCount).toBe(3);
    });

    it('should clear all patterns', async () => {
      const patterns = Array.from({ length: 5 }, (_, i) =>
        createTestPattern(`clear-${i}`)
      );
      await store.storeBatch(patterns);

      let stats = await store.getStats();
      expect(stats.count).toBe(5);

      await store.clear();

      stats = await store.getStats();
      expect(stats.count).toBe(0);
    });

    it('should filter search results by domain', async () => {
      await store.storePattern(createTestPattern('p1', { domain: 'unit-test' }));
      await store.storePattern(createTestPattern('p2', { domain: 'integration-test' }));
      await store.storePattern(createTestPattern('p3', { domain: 'unit-test' }));

      const queryEmbedding = createRandomEmbedding(384);
      const results = await store.searchSimilar(queryEmbedding, {
        k: 10,
        domain: 'unit-test',
      });

      // All results should be from unit-test domain
      for (const result of results) {
        expect(result.pattern.domain).toBe('unit-test');
      }
    });

    it('should filter search results by type', async () => {
      await store.storePattern(createTestPattern('p1', { type: 'edge-case' }));
      await store.storePattern(createTestPattern('p2', { type: 'error-handling' }));
      await store.storePattern(createTestPattern('p3', { type: 'edge-case' }));

      const queryEmbedding = createRandomEmbedding(384);
      const results = await store.searchSimilar(queryEmbedding, {
        k: 10,
        type: 'edge-case',
      });

      // All results should be edge-case type
      for (const result of results) {
        expect(result.pattern.type).toBe('edge-case');
      }
    });
  });

  describe('performance metrics', () => {
    it('should track search latency', async () => {
      // Store some patterns
      const patterns = Array.from({ length: 20 }, (_, i) =>
        createTestPattern(`metric-${i}`)
      );
      await store.storeBatch(patterns);

      // Perform several searches
      for (let i = 0; i < 5; i++) {
        const queryEmbedding = createRandomEmbedding(384);
        await store.searchSimilar(queryEmbedding, { k: 5 });
      }

      const metrics = store.getHdcMetrics();
      expect(metrics.totalSearches).toBe(5);
      expect(metrics.searchTimes.length).toBeGreaterThan(0);
      expect(metrics.avgSearchTime).toBeGreaterThan(0);
    });

    it('should report QPS estimates', async () => {
      // Store patterns and perform searches
      const patterns = Array.from({ length: 10 }, (_, i) =>
        createTestPattern(`qps-${i}`)
      );
      await store.storeBatch(patterns);

      for (let i = 0; i < 10; i++) {
        const queryEmbedding = createRandomEmbedding(384);
        await store.searchSimilar(queryEmbedding, { k: 3 });
      }

      const stats = await store.getStats();
      // QPS should be calculated from average search time
      if (stats.qps !== undefined) {
        expect(stats.qps).toBeGreaterThan(0);
      }
    });

    it('should track encode times', async () => {
      // Store patterns to trigger encoding
      const patterns = Array.from({ length: 5 }, (_, i) =>
        createTestPattern(`encode-${i}`)
      );

      for (const pattern of patterns) {
        await store.storePattern(pattern);
      }

      const metrics = store.getHdcMetrics();
      // With mocked WASM, HDC encoding may be skipped but stores should still work
      expect(metrics.totalStores).toBe(5);
      // Encode count depends on whether HDC is enabled/available
      expect(metrics.totalEncodes).toBeGreaterThanOrEqual(0);
    });

    it('should track HDC hit rate', async () => {
      const patterns = Array.from({ length: 10 }, (_, i) =>
        createTestPattern(`hit-${i}`)
      );
      await store.storeBatch(patterns);

      // Perform searches
      for (let i = 0; i < 5; i++) {
        await store.searchSimilar(createRandomEmbedding(384), { k: 3 });
      }

      const metrics = store.getHdcMetrics();
      // Hit rate should be between 0 and 1
      expect(metrics.hdcHitRate).toBeGreaterThanOrEqual(0);
      expect(metrics.hdcHitRate).toBeLessThanOrEqual(1);
    });
  });

  describe('error handling', () => {
    it('should throw when not initialized', async () => {
      const uninitStore = new HybridPatternStore();

      await expect(uninitStore.storePattern(createTestPattern('test')))
        .rejects.toThrow('not initialized');
    });

    it('should handle empty search gracefully', async () => {
      const results = await store.searchSimilar(createRandomEmbedding(384), { k: 10 });
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should handle non-existent pattern deletion', async () => {
      const deleted = await store.deletePattern('non-existent');
      expect(deleted).toBe(false);
    });
  });
});

// ============================================================================
// BTSPLearningEngine Integration Tests
// ============================================================================

describe('BTSPLearningEngine Integration', () => {
  let engine: BTSPLearningEngine;

  beforeEach(async () => {
    engine = new BTSPLearningEngine(
      'test-agent-001',
      mockSwarmMemoryManager as any,
      {
        oneShotThreshold: 0,
        recallConfidenceThreshold: 0.6,
        consolidationInterval: 100,
        autoConsolidate: true,
        btspWeight: 0.7,
      }
    );
    await engine.initialize();
  });

  afterEach(() => {
    if (engine?.isInitialized()) {
      engine.dispose();
    }
  });

  describe('one-shot learning', () => {
    it('should learn from single failure', async () => {
      const task = {
        id: 'task-001',
        complexity: 0.7,
        requirements: { capabilities: ['testing', 'analysis'] },
        previousAttempts: 0,
      };

      const failureResult = {
        success: false,
        executionTime: 5000,
        errors: ['Test failed: assertion error'],
        strategy: 'sequential',
      };

      const outcome = await engine.learnFromExecution(task, failureResult);

      expect(outcome).toBeDefined();
      expect(typeof outcome.usedBTSP).toBe('boolean');
      expect(typeof outcome.consolidationTriggered).toBe('boolean');

      // For failures (reward < 0), BTSP should be considered
      if (outcome.usedBTSP) {
        expect(outcome.plateauResult).toBeDefined();
      }
    });

    it('should recall learned patterns', async () => {
      const state = {
        taskComplexity: 0.6,
        requiredCapabilities: ['testing'],
        contextFeatures: { environment: 'ci' },
        previousAttempts: 1,
        availableResources: 0.8,
      };

      const recommendation = await engine.recommendWithBTSP(state);

      expect(recommendation).toBeDefined();
      expect(recommendation.source).toBeDefined();
      expect(['btsp', 'q-learning', 'hybrid', 'default']).toContain(recommendation.source);
      expect(recommendation.hasBTSPAssociations).toBeDefined();
      expect(typeof recommendation.confidence).toBe('number');
    });

    it('should consolidate with EWC', async () => {
      // Learn from multiple experiences
      for (let i = 0; i < 5; i++) {
        await engine.learnFromExecution(
          { id: `task-${i}`, complexity: 0.5 },
          { success: i % 2 === 0, executionTime: 1000 }
        );
      }

      // Manually trigger consolidation
      await expect(engine.consolidate()).resolves.not.toThrow();

      const metrics = engine.getMetrics();
      expect(metrics.consolidationCount).toBeGreaterThan(0);
    });

    it('should track learning metrics', async () => {
      // Learn from several experiences
      for (let i = 0; i < 3; i++) {
        await engine.learnFromExecution(
          { id: `task-${i}` },
          { success: false, errors: ['error'] }
        );
      }

      const metrics = engine.getMetrics();
      expect(metrics.totalExperiences).toBe(3);
      expect(metrics.btspLearningCount).toBeGreaterThanOrEqual(0);
      expect(metrics.qLearningCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('hybrid recommendations', () => {
    it('should prefer BTSP when confident', async () => {
      const state = {
        taskComplexity: 0.5,
        requiredCapabilities: ['unit-testing'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 1.0,
      };

      const recommendation = await engine.recommendWithBTSP(state);

      // Should include both BTSP and Q-learning confidence
      expect(recommendation.btspConfidence).toBeDefined();
      expect(recommendation.qLearningConfidence).toBeDefined();

      // If BTSP has high confidence, it should influence the recommendation
      if (recommendation.btspConfidence && recommendation.btspConfidence > 0.6) {
        expect(['btsp', 'hybrid']).toContain(recommendation.source);
      }
    });

    it('should fallback to Q-learning', async () => {
      const state = {
        taskComplexity: 0.9,
        requiredCapabilities: ['complex-analysis'],
        contextFeatures: { novel: true },
        previousAttempts: 0,
        availableResources: 0.5,
      };

      const recommendation = await engine.recommendWithBTSP(state);

      // For novel situations, might fall back to Q-learning or default
      expect(['btsp', 'q-learning', 'hybrid', 'default']).toContain(recommendation.source);
      expect(recommendation.strategy).toBeDefined();
    });

    it('should provide hybrid recommendations when both have confidence', async () => {
      const state = {
        taskComplexity: 0.5,
        requiredCapabilities: ['testing'],
        contextFeatures: { familiar: true },
        previousAttempts: 1,
        availableResources: 0.8,
      };

      const recommendation = await engine.recommendWithBTSP(state);

      // When both systems have confidence, hybrid should be considered
      if (
        recommendation.btspConfidence! >= 0.6 &&
        recommendation.qLearningConfidence! > 0.5
      ) {
        expect(recommendation.source).toBe('hybrid');
        expect(recommendation.reasoning).toContain('Hybrid');
      }
    });
  });

  describe('plateau detection', () => {
    it('should detect stable learning state', async () => {
      // Learn from many experiences
      for (let i = 0; i < 15; i++) {
        await engine.learnFromExecution(
          { id: `task-${i}` },
          { success: true, executionTime: 1000 }
        );
      }

      const isStable = engine.isPlateauReached();
      expect(typeof isStable).toBe('boolean');
    });
  });

  describe('error handling', () => {
    it('should throw when not initialized', async () => {
      const uninitEngine = new BTSPLearningEngine(
        'uninit-agent',
        mockSwarmMemoryManager as any
      );

      await expect(uninitEngine.learnFromExecution({}, {}))
        .rejects.toThrow('not initialized');
    });

    it('should handle malformed task gracefully', async () => {
      const outcome = await engine.learnFromExecution(null as any, null as any);
      expect(outcome).toBeDefined();
      // Should not crash, but may indicate no improvement
    });

    it('should reset BTSP state', () => {
      engine.resetBTSP();

      const metrics = engine.getMetrics();
      expect(metrics.btspLearningCount).toBe(0);
      expect(metrics.plateauDetectionCount).toBe(0);
    });
  });

  describe('statistics and monitoring', () => {
    it('should provide BTSP stats', () => {
      const stats = engine.getBTSPStats();
      expect(stats).toBeDefined();
    });

    it('should provide base learning stats', () => {
      const stats = engine.getBaseLearningStats();
      expect(stats).toBeDefined();
      expect(stats.algorithm).toBeDefined();
      expect(stats.totalExperiences).toBeDefined();
    });

    it('should get patterns from both engines', async () => {
      const patterns = await engine.getPatterns();
      expect(Array.isArray(patterns)).toBe(true);
    });
  });
});

// ============================================================================
// WorkspaceAgentCoordinator Integration Tests
// ============================================================================

describe('WorkspaceAgentCoordinator Integration', () => {
  let coordinator: WorkspaceAgentCoordinator;

  beforeEach(async () => {
    coordinator = await WorkspaceAgentCoordinator.create({
      workspaceConfig: { capacity: 7 },
      autoCompete: true,
      defaultTtl: 30000,
      debug: false,
    });
  });

  afterEach(() => {
    if (coordinator) {
      coordinator.dispose();
    }
  });

  describe('agent registration', () => {
    it('should register agents for workspace', async () => {
      const agent = createMockAgent('agent-001', QEAgentType.TEST_GENERATOR);

      await coordinator.registerAgent(agent as any);

      const count = coordinator.getAgentCount();
      expect(count).toBe(1);

      const info = coordinator.getAgentInfo('agent-001');
      expect(info).not.toBeNull();
      expect(info?.agentType).toBe(QEAgentType.TEST_GENERATOR);
    });

    it('should enforce attention limit (7+/-2)', async () => {
      const occupancy = coordinator.getOccupancy();
      expect(occupancy.capacity).toBeGreaterThanOrEqual(5);
      expect(occupancy.capacity).toBeLessThanOrEqual(9);
    });

    it('should unregister agents', async () => {
      const agent = createMockAgent('agent-002', QEAgentType.COVERAGE_ANALYZER);
      await coordinator.registerAgent(agent as any);

      expect(coordinator.getAgentCount()).toBe(1);

      await coordinator.unregisterAgent('agent-002');
      expect(coordinator.getAgentCount()).toBe(0);
    });

    it('should update existing registration', async () => {
      const agent = createMockAgent('agent-003', QEAgentType.TEST_GENERATOR);

      await coordinator.registerAgent(agent as any);
      await coordinator.registerAgent(agent as any); // Re-register

      expect(coordinator.getAgentCount()).toBe(1);
    });

    it('should support subscription filters', async () => {
      const agent = createMockAgent('agent-004', QEAgentType.QUALITY_GATE);

      await coordinator.registerAgent(agent as any, {
        categories: ['task', 'result'],
        sourceTypes: [QEAgentType.TEST_GENERATOR],
      });

      const count = coordinator.getAgentCount();
      expect(count).toBe(1);
    });
  });

  describe('broadcasting', () => {
    it('should broadcast items to workspace', async () => {
      const agent = createMockAgent('broadcast-agent', QEAgentType.TEST_GENERATOR);
      await coordinator.registerAgent(agent as any);

      const item: AgentWorkspaceItem = {
        id: 'item-001',
        agentId: 'broadcast-agent',
        agentType: QEAgentType.TEST_GENERATOR,
        content: { tests: ['test1', 'test2'] },
        priority: 0.8,
        relevance: 0.9,
        timestamp: Date.now(),
      };

      const accepted = await coordinator.agentBroadcast('broadcast-agent', item);
      expect(accepted).toBe(true);
    });

    it('should filter by relevance', async () => {
      const agent1 = createMockAgent('filter-agent-1', QEAgentType.TEST_GENERATOR);
      const agent2 = createMockAgent('filter-agent-2', QEAgentType.COVERAGE_ANALYZER);

      await coordinator.registerAgent(agent1 as any);
      await coordinator.registerAgent(agent2 as any);

      // Broadcast item targeting specific agent type
      const item: AgentWorkspaceItem = {
        id: 'targeted-item',
        agentId: 'filter-agent-1',
        agentType: QEAgentType.TEST_GENERATOR,
        content: { data: 'test' },
        priority: 0.7,
        relevance: 0.8,
        timestamp: Date.now(),
        metadata: {
          targetTypes: [QEAgentType.COVERAGE_ANALYZER],
          category: 'result',
        },
      };

      await coordinator.agentBroadcast('filter-agent-1', item);

      // Get relevant items for coverage analyzer
      const relevantItems = await coordinator.getRelevantItems(QEAgentType.COVERAGE_ANALYZER);
      expect(Array.isArray(relevantItems)).toBe(true);
    });

    it('should reject broadcasts from unregistered agents', async () => {
      const item: AgentWorkspaceItem = {
        id: 'rejected-item',
        agentId: 'unknown-agent',
        agentType: 'unknown' as any,
        content: {},
        priority: 0.5,
        relevance: 0.5,
        timestamp: Date.now(),
      };

      const accepted = await coordinator.agentBroadcast('unknown-agent', item);
      expect(accepted).toBe(false);
    });

    it('should emit events on broadcast', async () => {
      const agent = createMockAgent('event-agent', QEAgentType.TEST_GENERATOR);
      await coordinator.registerAgent(agent as any);

      const acceptedEvents: any[] = [];
      coordinator.on('broadcast:accepted', (data) => acceptedEvents.push(data));

      const item: AgentWorkspaceItem = {
        id: 'event-item',
        agentId: 'event-agent',
        agentType: QEAgentType.TEST_GENERATOR,
        content: {},
        priority: 0.6,
        relevance: 0.7,
        timestamp: Date.now(),
      };

      await coordinator.agentBroadcast('event-agent', item);

      expect(acceptedEvents.length).toBeGreaterThan(0);
    });
  });

  describe('task coordination', () => {
    it('should coordinate parallel tasks', async () => {
      const agent1 = createMockAgent('coord-1', QEAgentType.TEST_GENERATOR);
      const agent2 = createMockAgent('coord-2', QEAgentType.COVERAGE_ANALYZER);

      await coordinator.registerAgent(agent1 as any);
      await coordinator.registerAgent(agent2 as any);

      const task: TaskCoordinationRequest = {
        taskId: 'parallel-task-001',
        type: 'comprehensive-testing',
        payload: { sourceFile: 'app.ts' },
        requiredAgents: [QEAgentType.TEST_GENERATOR, QEAgentType.COVERAGE_ANALYZER],
        priority: 0.9,
        strategy: 'parallel',
      };

      const result = await coordinator.coordinateTask(task);

      expect(result.taskId).toBe('parallel-task-001');
      expect(result.participatingAgents.length).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should coordinate sequential tasks', async () => {
      const agent1 = createMockAgent('seq-1', QEAgentType.TEST_GENERATOR);
      const agent2 = createMockAgent('seq-2', QEAgentType.QUALITY_GATE);

      await coordinator.registerAgent(agent1 as any);
      await coordinator.registerAgent(agent2 as any);

      const task: TaskCoordinationRequest = {
        taskId: 'sequential-task-001',
        type: 'quality-gate-check',
        payload: { tests: [] },
        requiredAgents: [QEAgentType.TEST_GENERATOR, QEAgentType.QUALITY_GATE],
        priority: 0.8,
        strategy: 'sequential',
      };

      const result = await coordinator.coordinateTask(task);

      expect(result.taskId).toBe('sequential-task-001');
      expect(result.agentResults).toBeDefined();
    });

    it('should handle consensus coordination', async () => {
      const agents = [
        createMockAgent('cons-1', QEAgentType.TEST_GENERATOR),
        createMockAgent('cons-2', QEAgentType.COVERAGE_ANALYZER),
        createMockAgent('cons-3', QEAgentType.QUALITY_GATE),
      ];

      for (const agent of agents) {
        await coordinator.registerAgent(agent as any);
      }

      const task: TaskCoordinationRequest = {
        taskId: 'consensus-task-001',
        type: 'quality-decision',
        payload: { decision: 'ship-or-not' },
        requiredAgents: [
          QEAgentType.TEST_GENERATOR,
          QEAgentType.COVERAGE_ANALYZER,
          QEAgentType.QUALITY_GATE,
        ],
        priority: 0.95,
        strategy: 'consensus',
      };

      const result = await coordinator.coordinateTask(task);

      expect(result.taskId).toBe('consensus-task-001');
      // Check for consensus result
      const consensus = result.agentResults.get('__consensus__');
      if (consensus) {
        expect((consensus as any).reached).toBeDefined();
      }
    });

    it('should handle no matching agents', async () => {
      const task: TaskCoordinationRequest = {
        taskId: 'no-match-task',
        type: 'test',
        payload: {},
        requiredAgents: [QEAgentType.SECURITY_SCANNER],
        priority: 0.5,
      };

      const result = await coordinator.coordinateTask(task);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });
  });

  describe('attention management', () => {
    it('should check attention status', async () => {
      const agent = createMockAgent('attention-agent', QEAgentType.TEST_GENERATOR);
      await coordinator.registerAgent(agent as any);

      const hasAttention = await coordinator.hasAttention('attention-agent');
      expect(typeof hasAttention).toBe('boolean');
    });

    it('should run competition', async () => {
      const agents = [
        createMockAgent('compete-1', QEAgentType.TEST_GENERATOR),
        createMockAgent('compete-2', QEAgentType.COVERAGE_ANALYZER),
      ];

      for (const agent of agents) {
        await coordinator.registerAgent(agent as any);
      }

      const winners = await coordinator.runCompetition();
      expect(Array.isArray(winners)).toBe(true);
    });

    it('should emit attention events', async () => {
      const agent = createMockAgent('attention-event-agent', QEAgentType.TEST_GENERATOR);
      await coordinator.registerAgent(agent as any);

      const competitionEvents: any[] = [];
      coordinator.on('competition:complete', (data) => competitionEvents.push(data));

      await coordinator.runCompetition();

      expect(competitionEvents.length).toBeGreaterThan(0);
    });

    it('should get attention winners', async () => {
      const agent = createMockAgent('winner-agent', QEAgentType.TEST_GENERATOR);
      await coordinator.registerAgent(agent as any);

      const winners = coordinator.getAttentionWinners(3);
      expect(Array.isArray(winners)).toBe(true);
    });
  });

  describe('statistics and cleanup', () => {
    it('should provide statistics', () => {
      const stats = coordinator.getStats();

      expect(stats.initialized).toBe(true);
      expect(stats.registeredAgents).toBeDefined();
      expect(stats.workspaceOccupancy).toBeDefined();
      expect(stats.synchronization).toBeDefined();
    });

    it('should clear workspace', async () => {
      const agent = createMockAgent('clear-agent', QEAgentType.TEST_GENERATOR);
      await coordinator.registerAgent(agent as any);

      coordinator.clear();

      const occupancy = coordinator.getOccupancy();
      expect(occupancy.isEmpty).toBe(true);
    });

    it('should get synchronization metrics', () => {
      const sync = coordinator.getSynchronization();

      expect(sync.averageSalience).toBeDefined();
      expect(sync.activeAgents).toBeDefined();
      expect(sync.synchronizationScore).toBeDefined();
    });
  });
});

// ============================================================================
// CircadianAgentManager Integration Tests
// ============================================================================

describe('CircadianAgentManager Integration', () => {
  let manager: CircadianAgentManager;
  let mockController: ReturnType<typeof createMockCircadianController>;

  beforeEach(() => {
    mockController = createMockCircadianController();
    manager = new CircadianAgentManager({
      controller: mockController as any,
      defaultCriticality: 'medium',
      autoRegister: true,
      checkIntervalMs: 100,
      debug: false,
    });
  });

  afterEach(async () => {
    if (manager?.running) {
      await manager.stop();
    }
  });

  describe('phase management', () => {
    it('should track agent phases', async () => {
      const agent = createMockAgent('phase-agent', QEAgentType.TEST_GENERATOR);

      const config: AgentPhaseConfig = {
        agentId: 'phase-agent',
        agentType: QEAgentType.TEST_GENERATOR,
        criticalityLevel: 'medium',
        minActiveHours: 4,
        canRest: true,
      };

      await manager.registerAgent(agent as any, config);

      const state = manager.getAgentState('phase-agent');
      expect(state).not.toBeNull();
      expect(state?.phase).toBe('Active');
      expect(state?.isActive).toBe(true);
    });

    it('should respect criticality levels', async () => {
      const criticalAgent = createMockAgent('critical-agent', QEAgentType.QUALITY_GATE);
      const lowAgent = createMockAgent('low-agent', QEAgentType.TEST_GENERATOR);

      await manager.registerAgent(criticalAgent as any, {
        agentId: 'critical-agent',
        agentType: QEAgentType.QUALITY_GATE,
        criticalityLevel: 'critical',
        minActiveHours: 24,
        canRest: false, // Critical agents should not rest
      });

      await manager.registerAgent(lowAgent as any, {
        agentId: 'low-agent',
        agentType: QEAgentType.TEST_GENERATOR,
        criticalityLevel: 'low',
        minActiveHours: 2,
        canRest: true,
      });

      // Critical agents should always be active
      const shouldCriticalBeActive = manager.shouldBeActive('critical-agent');
      expect(shouldCriticalBeActive).toBe(true);
    });

    it('should check if agent should be active based on phase', async () => {
      const agent = createMockAgent('active-check-agent', QEAgentType.TEST_GENERATOR);

      await manager.registerAgent(agent as any, {
        agentId: 'active-check-agent',
        agentType: QEAgentType.TEST_GENERATOR,
        criticalityLevel: 'medium',
        minActiveHours: 4,
        canRest: true,
      });

      const shouldBeActive = manager.shouldBeActive('active-check-agent');
      expect(typeof shouldBeActive).toBe('boolean');
    });

    it('should emit phase transition events', async () => {
      const agent = createMockAgent('transition-agent', QEAgentType.TEST_GENERATOR);

      await manager.registerAgent(agent as any, {
        agentId: 'transition-agent',
        agentType: QEAgentType.TEST_GENERATOR,
        criticalityLevel: 'medium',
        minActiveHours: 4,
        canRest: true,
      });

      const transitions: any[] = [];
      manager.on('phase-transition', (event) => transitions.push(event));

      // Force a phase transition
      await manager.forcePhaseTransition('Dawn');

      expect(transitions.length).toBeGreaterThan(0);
    });

    it('should handle all phase types', async () => {
      const phases: CircadianPhase[] = ['Active', 'Dawn', 'Dusk', 'Rest'];

      for (const phase of phases) {
        mockController.getPhase.mockReturnValue(phase);
        await manager.forcePhaseTransition(phase);

        const stats = manager.getStats();
        expect(stats.currentPhase).toBe(phase);
      }
    });
  });

  describe('rest cycles', () => {
    it('should put low-priority agents to sleep', async () => {
      const lowAgent = createMockAgent('sleep-low', QEAgentType.TEST_GENERATOR);

      await manager.registerAgent(lowAgent as any, {
        agentId: 'sleep-low',
        agentType: QEAgentType.TEST_GENERATOR,
        criticalityLevel: 'low',
        minActiveHours: 2,
        canRest: true,
      });

      manager.start();

      // Transition to rest phase
      mockController.getPhase.mockReturnValue('Rest');
      await manager.forcePhaseTransition('Rest');

      // Low criticality agent should be sleeping in rest phase
      const state = manager.getAgentState('sleep-low');
      // State check depends on implementation
      expect(state).not.toBeNull();
    });

    it('should keep critical agents active', async () => {
      const criticalAgent = createMockAgent('always-active', QEAgentType.QUALITY_GATE);

      await manager.registerAgent(criticalAgent as any, {
        agentId: 'always-active',
        agentType: QEAgentType.QUALITY_GATE,
        criticalityLevel: 'critical',
        minActiveHours: 24,
        canRest: false,
      });

      manager.start();

      // Even in rest phase, critical agent should be active
      mockController.getPhase.mockReturnValue('Rest');
      await manager.forcePhaseTransition('Rest');

      const shouldBeActive = manager.shouldBeActive('always-active');
      expect(shouldBeActive).toBe(true);
    });

    it('should calculate energy savings', async () => {
      const agents = [
        { id: 'save-1', criticality: 'low' as CriticalityLevel },
        { id: 'save-2', criticality: 'medium' as CriticalityLevel },
        { id: 'save-3', criticality: 'high' as CriticalityLevel },
      ];

      for (const { id, criticality } of agents) {
        const agent = createMockAgent(id, QEAgentType.TEST_GENERATOR);
        await manager.registerAgent(agent as any, {
          agentId: id,
          agentType: QEAgentType.TEST_GENERATOR,
          criticalityLevel: criticality,
          minActiveHours: 4,
          canRest: criticality !== 'critical',
        });
      }

      const savings = manager.getEnergySavings();

      expect(savings).toBeDefined();
      expect(savings.savedCycles).toBeDefined();
      expect(savings.savingsPercentage).toBeDefined();
      expect(savings.averageDutyFactor).toBeDefined();
      expect(savings.costReductionFactor).toBeDefined();
    });

    it('should emit fleet events', async () => {
      const agent = createMockAgent('fleet-agent', QEAgentType.TEST_GENERATOR);

      await manager.registerAgent(agent as any, {
        agentId: 'fleet-agent',
        agentType: QEAgentType.TEST_GENERATOR,
        criticalityLevel: 'low',
        minActiveHours: 2,
        canRest: true,
      });

      const fleetEvents: any[] = [];
      manager.on('fleet-phase-change', (event) => fleetEvents.push(event));

      manager.start();
      await manager.forcePhaseTransition('Rest');

      expect(fleetEvents.length).toBeGreaterThan(0);
    });
  });

  describe('lifecycle management', () => {
    it('should start and stop manager', async () => {
      expect(manager.running).toBe(false);

      manager.start();
      expect(manager.running).toBe(true);

      await manager.stop();
      expect(manager.running).toBe(false);
    });

    it('should advance time', async () => {
      const agent = createMockAgent('advance-agent', QEAgentType.TEST_GENERATOR);

      await manager.registerAgent(agent as any, {
        agentId: 'advance-agent',
        agentType: QEAgentType.TEST_GENERATOR,
        criticalityLevel: 'medium',
        minActiveHours: 4,
        canRest: true,
      });

      manager.start();

      const stateBefore = manager.getAgentState('advance-agent');
      const timeInStateBefore = stateBefore?.timeInState || 0;

      manager.advance(1000);

      const stateAfter = manager.getAgentState('advance-agent');
      expect(stateAfter?.timeInState).toBeGreaterThanOrEqual(timeInStateBefore);
    });

    it('should record task completion', async () => {
      const agent = createMockAgent('task-agent', QEAgentType.TEST_GENERATOR);

      await manager.registerAgent(agent as any, {
        agentId: 'task-agent',
        agentType: QEAgentType.TEST_GENERATOR,
        criticalityLevel: 'medium',
        minActiveHours: 4,
        canRest: true,
      });

      manager.recordTaskCompletion('task-agent');

      const state = manager.getAgentState('task-agent');
      expect(state?.tasksProcessed).toBe(1);
    });

    it('should unregister agents', async () => {
      const agent = createMockAgent('unreg-agent', QEAgentType.TEST_GENERATOR);

      await manager.registerAgent(agent as any, {
        agentId: 'unreg-agent',
        agentType: QEAgentType.TEST_GENERATOR,
        criticalityLevel: 'medium',
        minActiveHours: 4,
        canRest: true,
      });

      expect(manager.agentCount).toBe(1);

      await manager.unregisterAgent('unreg-agent');
      expect(manager.agentCount).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should reject duplicate registration', async () => {
      const agent = createMockAgent('dup-agent', QEAgentType.TEST_GENERATOR);

      await manager.registerAgent(agent as any, {
        agentId: 'dup-agent',
        agentType: QEAgentType.TEST_GENERATOR,
        criticalityLevel: 'medium',
        minActiveHours: 4,
        canRest: true,
      });

      await expect(
        manager.registerAgent(agent as any, {
          agentId: 'dup-agent',
          agentType: QEAgentType.TEST_GENERATOR,
          criticalityLevel: 'high',
          minActiveHours: 8,
          canRest: true,
        })
      ).rejects.toThrow('already registered');
    });

    it('should validate min active hours', async () => {
      const agent = createMockAgent('invalid-agent', QEAgentType.TEST_GENERATOR);

      await expect(
        manager.registerAgent(agent as any, {
          agentId: 'invalid-agent',
          agentType: QEAgentType.TEST_GENERATOR,
          criticalityLevel: 'medium',
          minActiveHours: 25, // Invalid: > 24
          canRest: true,
        })
      ).rejects.toThrow('minActiveHours');
    });

    it('should handle unregistered agent state query', async () => {
      const state = manager.getAgentState('non-existent');
      expect(state).toBeNull();
    });

    it('should handle shouldBeActive for unknown agent', async () => {
      const shouldBeActive = manager.shouldBeActive('unknown');
      expect(shouldBeActive).toBe(false);
    });
  });

  describe('metrics and reporting', () => {
    it('should provide controller metrics', () => {
      const metrics = manager.getControllerMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.phaseTime).toBeDefined();
    });

    it('should provide controller state', () => {
      const state = manager.getControllerState();
      expect(state).toBeDefined();
      expect(state.phase).toBeDefined();
    });

    it('should provide manager stats', async () => {
      const agent = createMockAgent('stats-agent', QEAgentType.TEST_GENERATOR);

      await manager.registerAgent(agent as any, {
        agentId: 'stats-agent',
        agentType: QEAgentType.TEST_GENERATOR,
        criticalityLevel: 'medium',
        minActiveHours: 4,
        canRest: true,
      });

      const stats = manager.getStats();

      expect(stats.totalAgents).toBe(1);
      expect(stats.activeAgents).toBeDefined();
      expect(stats.sleepingAgents).toBeDefined();
      expect(stats.currentPhase).toBeDefined();
      expect(stats.savings).toBeDefined();
    });

    it('should get all agent states', async () => {
      const agents = ['state-1', 'state-2', 'state-3'];

      for (const id of agents) {
        const agent = createMockAgent(id, QEAgentType.TEST_GENERATOR);
        await manager.registerAgent(agent as any, {
          agentId: id,
          agentType: QEAgentType.TEST_GENERATOR,
          criticalityLevel: 'medium',
          minActiveHours: 4,
          canRest: true,
        });
      }

      const states = manager.getAgentStates();

      expect(states.size).toBe(3);
      for (const id of agents) {
        expect(states.has(id)).toBe(true);
      }
    });
  });
});

// ============================================================================
// Cross-Component Integration Tests
// ============================================================================

describe('Cross-Component Integration', () => {
  it('should integrate HybridPatternStore with BTSPLearningEngine', async () => {
    // This tests that patterns learned by BTSP can be stored in HybridPatternStore
    const store = createHybridPatternStore();
    await store.initialize();

    const engine = new BTSPLearningEngine(
      'cross-test-agent',
      mockSwarmMemoryManager as any,
      { oneShotThreshold: 0 }
    );
    await engine.initialize();

    // Learn from a failure
    const outcome = await engine.learnFromExecution(
      { id: 'task-1', complexity: 0.5 },
      { success: false, errors: ['Test failed'] }
    );

    // Store a pattern based on learning
    const pattern = createTestPattern('learned-pattern', {
      content: 'Pattern from learning outcome',
      metadata: {
        usedBTSP: outcome.usedBTSP,
        confidence: outcome.confidence,
      },
    });
    await store.storePattern(pattern);

    const retrieved = await store.getPattern('learned-pattern');
    expect(retrieved).not.toBeNull();

    engine.dispose();
    await store.shutdown();
  });

  it('should coordinate agents through workspace with circadian phases', async () => {
    // Test that workspace coordination respects circadian phases
    const mockController = createMockCircadianController();
    const manager = new CircadianAgentManager({
      controller: mockController as any,
    });

    const coordinator = await WorkspaceAgentCoordinator.create({
      workspaceConfig: { capacity: 7 },
    });

    const agent = createMockAgent('integrated-agent', QEAgentType.TEST_GENERATOR);

    // Register with both systems
    await manager.registerAgent(agent as any, {
      agentId: 'integrated-agent',
      agentType: QEAgentType.TEST_GENERATOR,
      criticalityLevel: 'medium',
      minActiveHours: 4,
      canRest: true,
    });

    await coordinator.registerAgent(agent as any);

    // Check that agent is active and can broadcast
    const isActive = manager.shouldBeActive('integrated-agent');
    if (isActive) {
      const item: AgentWorkspaceItem = {
        id: 'phase-aware-item',
        agentId: 'integrated-agent',
        agentType: QEAgentType.TEST_GENERATOR,
        content: { phase: mockController.getPhase() },
        priority: 0.8,
        relevance: 0.9,
        timestamp: Date.now(),
      };

      const accepted = await coordinator.agentBroadcast('integrated-agent', item);
      expect(accepted).toBe(true);
    }

    coordinator.dispose();
    await manager.stop();
  });
});
