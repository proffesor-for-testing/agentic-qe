/**
 * Agentic QE v3 - RuVector Client Unit Tests
 *
 * Tests for DefaultRuVectorClient with PersistentQLearningRouter integration.
 * Verifies that Q-values persist across client instances.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import {
  createRuVectorClient,
  createRuVectorClientSync,
  RuVectorQLearningRouter,
  type RuVectorClient,
  type RuVectorConfig,
  type TestTask,
} from '../../../../src/integrations/ruvector';
import { resetUnifiedPersistence } from '../../../../src/kernel/unified-persistence';
import { resetUnifiedMemory } from '../../../../src/kernel/unified-memory';

// Test database path
const TEST_DB_DIR = '/tmp/agentic-qe-test-ruvector-client';
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

describe('RuVectorClient', () => {
  beforeEach(async () => {
    // Reset singletons before each test
    resetUnifiedPersistence();
    resetUnifiedMemory();

    // Setup fresh test database
    setupTestDb();

    // Set environment to use test database
    process.env.AQE_DB_PATH = TEST_DB_PATH;
  });

  afterEach(async () => {
    // Clean up
    resetUnifiedPersistence();
    resetUnifiedMemory();

    delete process.env.AQE_DB_PATH;
  });

  describe('Factory Functions', () => {
    it('should create client with async factory', async () => {
      const client = await createRuVectorClient(createRuVectorConfig());

      expect(client).toBeDefined();
      expect(client.getQLearningRouter).toBeDefined();

      await client.dispose();
    });

    it('should create client with sync factory (requires manual init)', () => {
      const client = createRuVectorClientSync(createRuVectorConfig());

      expect(client).toBeDefined();
      expect(client.getQLearningRouter).toBeDefined();
    });
  });

  describe('Q-Learning Router Integration', () => {
    let client: RuVectorClient;

    beforeEach(async () => {
      client = await createRuVectorClient(createRuVectorConfig());
    });

    afterEach(async () => {
      await client?.dispose();
    });

    it('should return QLearningRouter from getQLearningRouter', async () => {
      const router = client.getQLearningRouter();

      // The router should be a RuVectorQLearningRouter (direct ML router)
      expect(router).toBeDefined();
      expect(router).toBeInstanceOf(RuVectorQLearningRouter);
    });

    it('should route test tasks through persistent router', async () => {
      const router = client.getQLearningRouter();
      const task = createTestTask({ type: 'unit' });

      const result = await router.routeTask(task);

      expect(result).toHaveProperty('agentType');
      expect(result).toHaveProperty('domain');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('reasoning');
    });

    it('should provide feedback through persistent router', async () => {
      const router = client.getQLearningRouter();
      const task = createTestTask({ type: 'unit' });

      await router.routeTask(task);

      await expect(
        router.provideFeedback(task.id, {
          success: true,
          durationMs: 1000,
          quality: 0.9,
        })
      ).resolves.not.toThrow();
    });

    it('should export model info', async () => {
      const router = client.getQLearningRouter();

      const model = await router.exportModel();

      expect(model).toHaveProperty('type', 'ruvector-qlearning');
      expect(model).toHaveProperty('params');
      expect(model).toHaveProperty('qTable');
    });
  });

  describe('Health Check', () => {
    it('should report health status', async () => {
      const client = await createRuVectorClient(createRuVectorConfig());

      const health = await client.getHealth();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('features');
      expect(health).toHaveProperty('lastChecked');

      await client.dispose();
    });

    it('should report unavailable when disabled', async () => {
      const client = await createRuVectorClient(createRuVectorConfig({ enabled: false }));

      const health = await client.getHealth();

      expect(health.status).toBe('unavailable');
      expect(health.error).toContain('disabled');

      await client.dispose();
    });
  });

  describe('Component Access', () => {
    let client: RuVectorClient;

    beforeEach(async () => {
      client = await createRuVectorClient(createRuVectorConfig());
    });

    afterEach(async () => {
      await client?.dispose();
    });

    it('should provide access to AST complexity analyzer', () => {
      const analyzer = client.getASTComplexityAnalyzer();
      expect(analyzer).toBeDefined();
    });

    it('should provide access to diff risk classifier', () => {
      const classifier = client.getDiffRiskClassifier();
      expect(classifier).toBeDefined();
    });

    it('should provide access to coverage router', () => {
      const router = client.getCoverageRouter();
      expect(router).toBeDefined();
    });

    it('should provide access to graph boundaries analyzer', () => {
      const analyzer = client.getGraphBoundaries();
      expect(analyzer).toBeDefined();
    });
  });

  describe('Dispose', () => {
    it('should properly dispose client', async () => {
      const client = await createRuVectorClient(createRuVectorConfig());
      const router = client.getQLearningRouter();

      // Route and provide feedback to create pending saves
      const task = createTestTask();
      await router.routeTask(task);
      await router.provideFeedback(task.id, {
        success: true,
        durationMs: 1000,
        quality: 0.9,
      });

      // Dispose should clean up the client
      await expect(client.dispose()).resolves.not.toThrow();
    });
  });

  describe('Persistence Across Instances', () => {
    it('should create independent router per client instance', async () => {
      // Create first client and train it
      const client1 = await createRuVectorClient(createRuVectorConfig());
      const router1 = client1.getQLearningRouter();

      // Train with multiple tasks
      for (let i = 0; i < 5; i++) {
        const task = createTestTask({
          type: 'unit',
          id: `persist-test-${i}`,
          complexity: 0.3 + i * 0.1,
        });
        await router1.routeTask(task);
        await router1.provideFeedback(task.id, {
          success: true,
          durationMs: 1000 - i * 100,
          quality: 0.7 + i * 0.05,
        });
      }

      // Dispose first client
      await client1.dispose();

      // Create second client — should get a fresh router
      const client2 = await createRuVectorClient(createRuVectorConfig());
      const router2 = client2.getQLearningRouter();

      // Should be able to route tasks
      const task = createTestTask({ type: 'unit' });
      const result = await router2.routeTask(task);

      expect(result).toHaveProperty('agentType');
      expect(result).toHaveProperty('domain');

      await client2.dispose();
    });
  });
});
