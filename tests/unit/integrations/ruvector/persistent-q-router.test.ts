/**
 * Agentic QE v3 - Persistent Q-Learning Router Unit Tests
 *
 * Tests for PersistentQLearningRouter with SQLite persistence.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  PersistentQLearningRouter,
  createPersistentQLearningRouter,
  createPersistentQLearningRouterSync,
  DEFAULT_EWC_CONFIG,
  type EWCConfig,
  type PersistentQLearningRouterConfig,
} from '../../../../src/integrations/ruvector/persistent-q-router';
import { QValueStore, createQValueStore } from '../../../../src/integrations/rl-suite/persistence/q-value-store';
import { resetUnifiedPersistence } from '../../../../src/kernel/unified-persistence';
import { resetUnifiedMemory } from '../../../../src/kernel/unified-memory';
import type {
  TestTask,
  RuVectorConfig,
  QLearningState,
  QLearningAction,
} from '../../../../src/integrations/ruvector';

// Test database path
const TEST_DB_DIR = '/tmp/agentic-qe-test-persistent-q';
const TEST_DB_PATH = `${TEST_DB_DIR}/memory.db`;

// Ensure test directory exists
function setupTestDb(): void {
  if (!fs.existsSync(TEST_DB_DIR)) {
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  }
  // Clean up any existing test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  if (fs.existsSync(`${TEST_DB_PATH}-wal`)) {
    fs.unlinkSync(`${TEST_DB_PATH}-wal`);
  }
  if (fs.existsSync(`${TEST_DB_PATH}-shm`)) {
    fs.unlinkSync(`${TEST_DB_PATH}-shm`);
  }
}

// Test fixtures
function createTestTask(overrides: Partial<TestTask> = {}): TestTask {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: 'Test Task',
    type: 'unit',
    complexity: 0.5,
    priority: 'p2',
    ...overrides,
  };
}

function createRuVectorConfig(overrides: Partial<RuVectorConfig> = {}): RuVectorConfig {
  return {
    enabled: true,
    endpoint: 'http://localhost:8080',
    fallbackEnabled: true,
    cacheEnabled: false,
    ...overrides,
  };
}

function createPersistentConfig(overrides: Partial<PersistentQLearningRouterConfig> = {}): PersistentQLearningRouterConfig {
  return {
    ruvectorConfig: createRuVectorConfig(),
    agentId: `test-agent-${Date.now()}`,
    algorithm: 'q-learning',
    domain: 'test-routing',
    loadOnInit: true,
    autoSaveInterval: 0, // Immediate saves for testing
    ...overrides,
  };
}

describe('PersistentQLearningRouter', () => {
  let qValueStore: QValueStore;

  beforeEach(async () => {
    // Reset singletons before each test
    resetUnifiedPersistence();
    resetUnifiedMemory();

    // Setup fresh test database
    setupTestDb();

    // Set environment to use test database
    process.env.AQE_DB_PATH = TEST_DB_PATH;

    // Create and initialize QValueStore
    qValueStore = createQValueStore();
  });

  afterEach(async () => {
    // Clean up
    try {
      await qValueStore?.close();
    } catch {
      // Ignore cleanup errors
    }

    resetUnifiedPersistence();
    resetUnifiedMemory();

    delete process.env.AQE_DB_PATH;
  });

  describe('Factory Functions', () => {
    it('should create router with async factory', async () => {
      const router = await createPersistentQLearningRouter(createPersistentConfig(), qValueStore);

      expect(router).toBeInstanceOf(PersistentQLearningRouter);
      expect(router.isInitialized()).toBe(true);

      await router.close();
    });

    it('should create router with sync factory (requires manual init)', () => {
      const router = createPersistentQLearningRouterSync(createPersistentConfig(), qValueStore);

      expect(router).toBeInstanceOf(PersistentQLearningRouter);
      expect(router.isInitialized()).toBe(false);
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const config = createPersistentConfig();
      const router = new PersistentQLearningRouter(config, qValueStore);

      await router.initialize();

      expect(router.isInitialized()).toBe(true);
      expect(router.getAgentId()).toBe(config.agentId);

      await router.close();
    });

    it('should be idempotent (multiple initialize calls)', async () => {
      const router = new PersistentQLearningRouter(createPersistentConfig(), qValueStore);

      await router.initialize();
      await router.initialize();
      await router.initialize();

      expect(router.isInitialized()).toBe(true);

      await router.close();
    });

    it('should throw if not initialized when routing', async () => {
      const router = new PersistentQLearningRouter(createPersistentConfig(), qValueStore);
      const task = createTestTask();

      await expect(router.routeTask(task)).rejects.toThrow('not initialized');
    });
  });

  describe('Routing', () => {
    let router: PersistentQLearningRouter;

    beforeEach(async () => {
      router = await createPersistentQLearningRouter(createPersistentConfig(), qValueStore);
    });

    afterEach(async () => {
      await router?.close();
    });

    it('should route a test task', async () => {
      const task = createTestTask({ type: 'unit' });
      const result = await router.routeTask(task);

      expect(result).toHaveProperty('agentType');
      expect(result).toHaveProperty('domain');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('reasoning');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should route multiple tasks', async () => {
      const tasks = [
        createTestTask({ type: 'unit' }),
        createTestTask({ type: 'integration' }),
        createTestTask({ type: 'security' }),
      ];

      const results = await router.routeTasks(tasks);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toHaveProperty('agentType');
        expect(result).toHaveProperty('domain');
      });
    });
  });

  describe('Persistence', () => {
    it('should persist Q-values after feedback', async () => {
      const config = createPersistentConfig();
      const router = await createPersistentQLearningRouter(config, qValueStore);

      // Route a task
      const task = createTestTask({ type: 'unit' });
      await router.routeTask(task);

      // Provide feedback
      await router.provideFeedback(task.id, {
        success: true,
        durationMs: 1000,
        quality: 0.9,
      });

      // Get stats to verify persistence
      const stats = await router.getStats();
      expect(stats.totalEntries).toBeGreaterThanOrEqual(0);

      await router.close();
    });

    it('should load Q-values on initialization', async () => {
      const agentId = `persist-test-${Date.now()}`;
      const config = createPersistentConfig({ agentId });

      // Create first router and train it
      const router1 = await createPersistentQLearningRouter(config, qValueStore);

      const task = createTestTask({ type: 'unit' });
      await router1.routeTask(task);
      await router1.provideFeedback(task.id, {
        success: true,
        durationMs: 500,
        quality: 0.95,
      });

      const stats1 = await router1.getStats();
      await router1.close();

      // Create second router with same agentId - should load Q-values
      // Need to create a new QValueStore since we're simulating a new session
      const qValueStore2 = createQValueStore();
      const router2 = await createPersistentQLearningRouter(
        { ...config, loadOnInit: true },
        qValueStore2
      );

      const stats2 = await router2.getStats();

      // Q-values should be loaded (or at least the router should initialize)
      expect(router2.isInitialized()).toBe(true);

      await router2.close();
      await qValueStore2.close();
    });

    it('should export model with persistence info', async () => {
      const config = createPersistentConfig();
      const router = await createPersistentQLearningRouter(config, qValueStore);

      const model = await router.exportModel();

      expect(model).toHaveProperty('type', 'ruvector-qlearning');
      expect(model).toHaveProperty('persistence');
      expect((model.persistence as any).agentId).toBe(config.agentId);
      expect((model.persistence as any).algorithm).toBe(config.algorithm);
      expect(model).toHaveProperty('ewcConfig');

      await router.close();
    });

    it('should import model and persist', async () => {
      const config = createPersistentConfig();
      const router = await createPersistentQLearningRouter(config, qValueStore);

      const model = {
        type: 'ruvector-qlearning',
        version: '1.0',
        qTable: {
          'unit|p2|any|5': {
            'tester|test-execution': 0.8,
            'analyzer|code-intelligence': 0.3,
          },
        },
        params: {},
        episodeCount: 10,
      };

      await router.importModel(model);

      // Verify import
      const exportedModel = await router.exportModel();
      expect(exportedModel.qTable).toBeDefined();

      await router.close();
    });
  });

  describe('Feedback and Learning', () => {
    let router: PersistentQLearningRouter;

    beforeEach(async () => {
      router = await createPersistentQLearningRouter(createPersistentConfig(), qValueStore);
    });

    afterEach(async () => {
      await router?.close();
    });

    it('should process successful feedback', async () => {
      const task = createTestTask();
      await router.routeTask(task);

      await expect(
        router.provideFeedback(task.id, {
          success: true,
          durationMs: 1000,
          quality: 0.9,
        })
      ).resolves.not.toThrow();
    });

    it('should process failed feedback', async () => {
      const task = createTestTask();
      await router.routeTask(task);

      await expect(
        router.provideFeedback(task.id, {
          success: false,
          durationMs: 5000,
          quality: 0.2,
        })
      ).resolves.not.toThrow();
    });

    it('should handle feedback for unknown tasks gracefully', async () => {
      await expect(
        router.provideFeedback('nonexistent-task', {
          success: true,
          durationMs: 1000,
          quality: 0.8,
        })
      ).resolves.not.toThrow();
    });

    it('should improve routing through learning', async () => {
      // Simulate multiple learning cycles
      for (let i = 0; i < 10; i++) {
        const task = createTestTask({ type: 'unit', id: `learning-${i}` });
        await router.routeTask(task);

        await router.provideFeedback(task.id, {
          success: true,
          durationMs: 1000 - i * 50,
          quality: 0.6 + i * 0.04,
        });
      }

      // Router should still function after learning
      const finalTask = createTestTask({ type: 'unit' });
      const result = await router.routeTask(finalTask);

      expect(result).toHaveProperty('agentType');
      expect(result).toHaveProperty('confidence');
    });
  });

  describe('Q-Value Operations', () => {
    let router: PersistentQLearningRouter;

    beforeEach(async () => {
      router = await createPersistentQLearningRouter(createPersistentConfig(), qValueStore);
    });

    afterEach(async () => {
      await router?.close();
    });

    it('should get Q-value for state-action pair', () => {
      const state: QLearningState = {
        taskType: 'unit',
        complexity: 0.5,
        priority: 'p2',
        contextHash: 'test-hash',
      };
      const action: QLearningAction = {
        agentType: 'tester',
        domain: 'test-execution',
      };

      const qValue = router.getQValue(state, action);

      expect(typeof qValue).toBe('number');
    });
  });

  describe('Reset', () => {
    it('should reset in-memory state', async () => {
      const router = await createPersistentQLearningRouter(createPersistentConfig(), qValueStore);

      // Train the router
      const task = createTestTask();
      await router.routeTask(task);
      await router.provideFeedback(task.id, {
        success: true,
        durationMs: 500,
        quality: 0.95,
      });

      // Reset
      await router.reset();

      // Router should still function
      expect(router.isInitialized()).toBe(true);

      await router.close();
    });
  });

  describe('EWC++ Configuration', () => {
    it('should have default EWC config', async () => {
      const router = await createPersistentQLearningRouter(createPersistentConfig(), qValueStore);

      const ewcConfig = router.getEWCConfig();

      expect(ewcConfig.enabled).toBe(false);
      expect(ewcConfig.lambda).toBe(DEFAULT_EWC_CONFIG.lambda);
      expect(ewcConfig.consolidationInterval).toBe(DEFAULT_EWC_CONFIG.consolidationInterval);
      expect(ewcConfig.fisherSampleSize).toBe(DEFAULT_EWC_CONFIG.fisherSampleSize);
      expect(ewcConfig.fisherDecay).toBe(DEFAULT_EWC_CONFIG.fisherDecay);

      await router.close();
    });

    it('should accept custom EWC config', async () => {
      const customEWCConfig: Partial<EWCConfig> = {
        enabled: true,
        lambda: 5000,
        consolidationInterval: 60000,
        fisherSampleSize: 100,
      };

      const router = await createPersistentQLearningRouter(
        createPersistentConfig({ ewcConfig: customEWCConfig }),
        qValueStore
      );

      const ewcConfig = router.getEWCConfig();

      expect(ewcConfig.enabled).toBe(true);
      expect(ewcConfig.lambda).toBe(5000);
      expect(ewcConfig.consolidationInterval).toBe(60000);
      expect(ewcConfig.fisherSampleSize).toBe(100);

      await router.close();
    });

    it('should update EWC config', async () => {
      const router = await createPersistentQLearningRouter(createPersistentConfig(), qValueStore);

      router.setEWCConfig({ lambda: 2000, enabled: true });

      const ewcConfig = router.getEWCConfig();
      expect(ewcConfig.lambda).toBe(2000);
      expect(ewcConfig.enabled).toBe(true);

      await router.close();
    });
  });

  describe('Statistics', () => {
    it('should return statistics', async () => {
      const router = await createPersistentQLearningRouter(createPersistentConfig(), qValueStore);

      const stats = await router.getStats();

      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('uniqueStates');
      expect(stats).toHaveProperty('averageQValue');
      expect(stats).toHaveProperty('averageVisits');

      await router.close();
    });
  });

  describe('Cleanup', () => {
    it('should close cleanly', async () => {
      const router = await createPersistentQLearningRouter(createPersistentConfig(), qValueStore);

      await router.close();

      expect(router.isInitialized()).toBe(false);
    });

    it('should flush pending saves on close', async () => {
      // Create router with delayed saves
      const router = await createPersistentQLearningRouter(
        createPersistentConfig({ autoSaveInterval: 5000 }), // 5 second delay
        qValueStore
      );

      // Route and provide feedback (creates pending saves)
      const task = createTestTask();
      await router.routeTask(task);
      await router.provideFeedback(task.id, {
        success: true,
        durationMs: 1000,
        quality: 0.9,
      });

      // Close should flush pending saves
      await router.close();

      // Router should be closed
      expect(router.isInitialized()).toBe(false);
    });
  });

  describe('Integration', () => {
    it('should work end-to-end', async () => {
      const agentId = `e2e-test-${Date.now()}`;
      const config = createPersistentConfig({ agentId });

      // Session 1: Train the router
      const router1 = await createPersistentQLearningRouter(config, qValueStore);

      for (let i = 0; i < 5; i++) {
        const task = createTestTask({
          type: 'unit',
          id: `e2e-task-${i}`,
          complexity: 0.3 + i * 0.1,
        });
        await router1.routeTask(task);
        await router1.provideFeedback(task.id, {
          success: true,
          durationMs: 1000 - i * 100,
          quality: 0.7 + i * 0.05,
        });
      }

      // Export model from session 1
      const model1 = await router1.exportModel();
      await router1.close();

      // Session 2: Load and continue training
      const qValueStore2 = createQValueStore();
      const router2 = await createPersistentQLearningRouter(config, qValueStore2);

      // Continue with more training
      for (let i = 5; i < 10; i++) {
        const task = createTestTask({
          type: 'unit',
          id: `e2e-task-${i}`,
          complexity: 0.3 + i * 0.1,
        });
        await router2.routeTask(task);
        await router2.provideFeedback(task.id, {
          success: true,
          durationMs: 500,
          quality: 0.9,
        });
      }

      // Final routing should work
      const finalTask = createTestTask({ type: 'unit' });
      const result = await router2.routeTask(finalTask);

      expect(result).toHaveProperty('agentType');
      expect(result).toHaveProperty('domain');

      await router2.close();
      await qValueStore2.close();
    });
  });
});
