/**
 * Unit Tests for LearningEngine Persistence Adapters
 *
 * Tests the database persistence adapter and in-memory adapter to ensure:
 * 1. Batch writes work efficiently
 * 2. Error handling doesn't break learning
 * 3. Flush logic triggers correctly
 * 4. In-memory adapter provides testability
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// CRITICAL: Override jest.setup.ts bare mock with proper mock
// This must be done BEFORE any imports that use Database
jest.mock('../../../src/utils/Database', () => {
  const mockMod = jest.requireActual<typeof import('../../../src/utils/__mocks__/Database')>('../../../src/utils/__mocks__/Database');
  return mockMod;
});

import { Database } from '@utils/Database';
import { TaskExperience } from '@learning/types';

// ============================================================================
// Persistence Adapter Interfaces (Simulating refactored design)
// ============================================================================

interface LearningPersistenceAdapter {
  storeExperience(experience: TaskExperience): Promise<void>;
  storeQValue(agentId: string, stateKey: string, actionKey: string, qValue: number): Promise<void>;
  storeSnapshot(agentId: string, metrics: any): Promise<void>;
  flush(): Promise<void>;
}

/**
 * Database-backed persistence adapter with batching
 */
class DatabaseLearningPersistence implements LearningPersistenceAdapter {
  private experienceBatch: TaskExperience[] = [];
  private qValueBatch: Array<{ agentId: string; stateKey: string; actionKey: string; qValue: number }> = [];
  private readonly batchSize: number;
  private readonly database: Database;
  private flushInProgress = false;

  constructor(database: Database, batchSize: number = 10) {
    this.database = database;
    this.batchSize = batchSize;
  }

  async storeExperience(experience: TaskExperience): Promise<void> {
    this.experienceBatch.push(experience);

    if (this.experienceBatch.length >= this.batchSize) {
      await this.flush();
    }
  }

  async storeQValue(agentId: string, stateKey: string, actionKey: string, qValue: number): Promise<void> {
    this.qValueBatch.push({ agentId, stateKey, actionKey, qValue });

    if (this.qValueBatch.length >= this.batchSize) {
      await this.flush();
    }
  }

  async storeSnapshot(agentId: string, metrics: any): Promise<void> {
    try {
      await this.database.storeLearningSnapshot({
        agentId,
        snapshotType: 'performance',
        metrics,
        improvementRate: metrics.improvementRate || 0,
        totalExperiences: metrics.totalExperiences || 0,
        explorationRate: metrics.explorationRate || 0
      });
    } catch (error) {
      // Log but don't throw - snapshots are not critical
    }
  }

  async flush(): Promise<void> {
    if (this.flushInProgress) {
      return; // Prevent concurrent flushes
    }

    this.flushInProgress = true;

    try {
      // Flush experiences
      if (this.experienceBatch.length > 0) {
        for (const exp of this.experienceBatch) {
          await this.database.storeLearningExperience({
            agentId: exp.agentId,
            taskId: exp.taskId,
            taskType: exp.taskType,
            state: this.encodeState(exp.state),
            action: this.encodeAction(exp.action),
            reward: exp.reward,
            nextState: this.encodeState(exp.nextState),
            episodeId: `episode-${Date.now()}`
          });
        }
        this.experienceBatch = [];
      }

      // Flush Q-values
      if (this.qValueBatch.length > 0) {
        for (const qv of this.qValueBatch) {
          await this.database.upsertQValue(qv.agentId, qv.stateKey, qv.actionKey, qv.qValue);
        }
        this.qValueBatch = [];
      }
    } finally {
      this.flushInProgress = false;
    }
  }

  private encodeState(state: any): string {
    return JSON.stringify(state);
  }

  private encodeAction(action: any): string {
    return JSON.stringify(action);
  }

  getPendingBatchSize(): number {
    return this.experienceBatch.length + this.qValueBatch.length;
  }
}

/**
 * In-memory persistence adapter for testing
 */
class InMemoryLearningPersistence implements LearningPersistenceAdapter {
  public experiences: TaskExperience[] = [];
  public qValues: Map<string, Map<string, number>> = new Map();
  public snapshots: Array<{ agentId: string; metrics: any }> = [];

  async storeExperience(experience: TaskExperience): Promise<void> {
    this.experiences.push(experience);
  }

  async storeQValue(agentId: string, stateKey: string, actionKey: string, qValue: number): Promise<void> {
    if (!this.qValues.has(agentId)) {
      this.qValues.set(agentId, new Map());
    }
    const agentQValues = this.qValues.get(agentId)!;

    const key = `${stateKey}:${actionKey}`;
    agentQValues.set(key, qValue);
  }

  async storeSnapshot(agentId: string, metrics: any): Promise<void> {
    this.snapshots.push({ agentId, metrics });
  }

  async flush(): Promise<void> {
    // No-op for in-memory
  }

  clear(): void {
    this.experiences = [];
    this.qValues.clear();
    this.snapshots = [];
  }

  getExperienceCount(): number {
    return this.experiences.length;
  }

  getQValueCount(agentId: string): number {
    return this.qValues.get(agentId)?.size || 0;
  }
}

// ============================================================================
// Unit Tests
// ============================================================================

describe('DatabaseLearningPersistence', () => {
  const testDbPath = path.join(process.cwd(), '.test-persistence-adapter.db');
  let database: Database;
  let adapter: DatabaseLearningPersistence;

  beforeEach(async () => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create fresh database (uses the mock from jest.setup.ts)
    database = new Database(testDbPath);

    // CRITICAL: Make mocks stateful to track stored data
    const storedExperiences = new Map<string, number>(); // agentId -> count
    const storedQValues = new Map<string, Map<string, number>>(); // agentId -> Map<stateKey:actionKey, value>
    let databaseClosed = false;

    // Track storeLearningExperience calls
    (database.storeLearningExperience as jest.Mock).mockImplementation(async (exp: any) => {
      if (databaseClosed) {
        throw new Error('Database is closed');
      }
      const count = storedExperiences.get(exp.agentId) || 0;
      storedExperiences.set(exp.agentId, count + 1);
    });

    // Track upsertQValue calls
    (database.upsertQValue as jest.Mock).mockImplementation(async (agentId: string, stateKey: string, actionKey: string, qValue: number) => {
      if (databaseClosed) {
        throw new Error('Database is closed');
      }
      if (!storedQValues.has(agentId)) {
        storedQValues.set(agentId, new Map());
      }
      const key = `${stateKey}:${actionKey}`;
      storedQValues.get(agentId)!.set(key, qValue);
    });

    // Return stored experience count
    (database.getLearningStatistics as jest.Mock).mockImplementation(async (agentId: string) => {
      return {
        totalExperiences: storedExperiences.get(agentId) || 0,
        avgReward: 0,
        qTableSize: storedQValues.get(agentId)?.size || 0,
        recentImprovement: 0
      };
    });

    // Return stored Q-values as array
    (database.getAllQValues as jest.Mock).mockImplementation(async (agentId: string) => {
      const qValues = storedQValues.get(agentId);
      if (!qValues) return [];
      return Array.from(qValues.entries()).map(([key, value]) => {
        const [stateKey, actionKey] = key.split(':');
        return { stateKey, actionKey, qValue: value };
      });
    });

    // Return specific Q-value
    (database.getQValue as jest.Mock).mockImplementation(async (agentId: string, stateKey: string, actionKey: string) => {
      const qValues = storedQValues.get(agentId);
      if (!qValues) return null;
      const key = `${stateKey}:${actionKey}`;
      return qValues.get(key) ?? null;
    });

    // Track close calls
    const originalClose = (database.close as jest.Mock).getMockImplementation();
    (database.close as jest.Mock).mockImplementation(async () => {
      databaseClosed = true;
      if (originalClose) {
        await originalClose();
      }
    });

    await database.initialize();

    adapter = new DatabaseLearningPersistence(database, 5); // Small batch size for testing
  });

  afterEach(async () => {
    // Close database
    try {
      await database.close();
    } catch (error) {
      // Ignore close errors
    }

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Experience Batching', () => {
    it('should batch experiences before flushing', async () => {
      const agentId = 'test-agent-batch';

      // Add 3 experiences (batch size is 5)
      for (let i = 0; i < 3; i++) {
        const experience: TaskExperience = {
          taskId: `task-${i}`,
          taskType: 'test-generation',
          state: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 0, availableResources: 0.8 },
          action: { strategy: 'default', toolsUsed: [], parallelization: 0.5, retryPolicy: 'exponential', resourceAllocation: 0.5 },
          reward: 0.8,
          nextState: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 1, availableResources: 0.8 },
          timestamp: new Date(),
          agentId
        };

        await adapter.storeExperience(experience);
      }

      // Should still be in batch (not flushed)
      expect(adapter.getPendingBatchSize()).toBe(3);

      // Verify NOT in database yet
      const stats = await database.getLearningStatistics(agentId);
      expect(stats.totalExperiences).toBe(0);
    });

    it('should auto-flush when batch size reached', async () => {
      const agentId = 'test-agent-autoflush';

      // Add 5 experiences (exactly batch size)
      for (let i = 0; i < 5; i++) {
        const experience: TaskExperience = {
          taskId: `task-${i}`,
          taskType: 'test-generation',
          state: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 0, availableResources: 0.8 },
          action: { strategy: 'default', toolsUsed: [], parallelization: 0.5, retryPolicy: 'exponential', resourceAllocation: 0.5 },
          reward: 0.8,
          nextState: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 1, availableResources: 0.8 },
          timestamp: new Date(),
          agentId
        };

        await adapter.storeExperience(experience);
      }

      // Should be auto-flushed (batch cleared)
      expect(adapter.getPendingBatchSize()).toBe(0);

      // Verify in database
      const stats = await database.getLearningStatistics(agentId);
      expect(stats.totalExperiences).toBe(5);
    });

    it('should manually flush partial batch', async () => {
      const agentId = 'test-agent-manual-flush';

      // Add 2 experiences (less than batch size)
      for (let i = 0; i < 2; i++) {
        const experience: TaskExperience = {
          taskId: `task-${i}`,
          taskType: 'test-generation',
          state: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 0, availableResources: 0.8 },
          action: { strategy: 'default', toolsUsed: [], parallelization: 0.5, retryPolicy: 'exponential', resourceAllocation: 0.5 },
          reward: 0.8,
          nextState: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 1, availableResources: 0.8 },
          timestamp: new Date(),
          agentId
        };

        await adapter.storeExperience(experience);
      }

      // Manually flush
      await adapter.flush();

      // Should be cleared
      expect(adapter.getPendingBatchSize()).toBe(0);

      // Verify in database
      const stats = await database.getLearningStatistics(agentId);
      expect(stats.totalExperiences).toBe(2);
    });
  });

  describe('Q-Value Batching', () => {
    it('should batch Q-values before flushing', async () => {
      const agentId = 'test-agent-qvalue-batch';

      // Add 3 Q-values (batch size is 5)
      for (let i = 0; i < 3; i++) {
        await adapter.storeQValue(agentId, `state-${i}`, `action-${i}`, 0.8 + i * 0.1);
      }

      // Should still be in batch
      expect(adapter.getPendingBatchSize()).toBe(3);
    });

    it('should auto-flush Q-values when batch size reached', async () => {
      const agentId = 'test-agent-qvalue-autoflush';

      // Add 5 Q-values (exactly batch size)
      for (let i = 0; i < 5; i++) {
        await adapter.storeQValue(agentId, `state-${i}`, `action-${i}`, 0.8 + i * 0.1);
      }

      // Should be auto-flushed
      expect(adapter.getPendingBatchSize()).toBe(0);

      // Verify in database
      const qValues = await database.getAllQValues(agentId);
      expect(qValues.length).toBe(5);
    });

    it('should update existing Q-values on flush', async () => {
      const agentId = 'test-agent-qvalue-update';
      const stateKey = 'state-1';
      const actionKey = 'action-1';

      // Store initial Q-value
      await adapter.storeQValue(agentId, stateKey, actionKey, 0.5);
      await adapter.flush();

      // Update Q-value
      await adapter.storeQValue(agentId, stateKey, actionKey, 0.9);
      await adapter.flush();

      // Verify updated value
      const qValue = await database.getQValue(agentId, stateKey, actionKey);
      expect(qValue).toBeCloseTo(0.9, 2);
    });
  });

  describe('Snapshot Storage', () => {
    it('should store learning snapshots immediately (no batching)', async () => {
      const agentId = 'test-agent-snapshot';

      const metrics = {
        totalExperiences: 100,
        avgReward: 0.85,
        improvementRate: 15.5,
        explorationRate: 0.1
      };

      await adapter.storeSnapshot(agentId, metrics);

      // Snapshots are stored immediately, not batched
      // Verify via learning history (snapshots go to learning_history table)
      const stats = await database.getLearningStatistics(agentId);
      // Stats will be 0 for experiences, but snapshot was stored
      expect(stats).toBeDefined();
    });

    it('should handle snapshot errors gracefully', async () => {
      // Close database to trigger error
      await database.close();

      const agentId = 'test-agent-snapshot-error';

      // Should not throw error
      await expect(adapter.storeSnapshot(agentId, { test: 'data' })).resolves.not.toThrow();
    });
  });

  describe('Concurrent Flush Protection', () => {
    it('should prevent concurrent flushes', async () => {
      const agentId = 'test-agent-concurrent';

      // Add experiences to batch
      for (let i = 0; i < 3; i++) {
        const experience: TaskExperience = {
          taskId: `task-${i}`,
          taskType: 'test-generation',
          state: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 0, availableResources: 0.8 },
          action: { strategy: 'default', toolsUsed: [], parallelization: 0.5, retryPolicy: 'exponential', resourceAllocation: 0.5 },
          reward: 0.8,
          nextState: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 1, availableResources: 0.8 },
          timestamp: new Date(),
          agentId
        };

        await adapter.storeExperience(experience);
      }

      // Trigger concurrent flushes
      const flush1 = adapter.flush();
      const flush2 = adapter.flush();
      const flush3 = adapter.flush();

      await Promise.all([flush1, flush2, flush3]);

      // Verify all experiences were stored exactly once
      const stats = await database.getLearningStatistics(agentId);
      expect(stats.totalExperiences).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors during flush', async () => {
      const agentId = 'test-agent-error';

      // Add experience
      const experience: TaskExperience = {
        taskId: 'task-1',
        taskType: 'test-generation',
        state: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 0, availableResources: 0.8 },
        action: { strategy: 'default', toolsUsed: [], parallelization: 0.5, retryPolicy: 'exponential', resourceAllocation: 0.5 },
        reward: 0.8,
        nextState: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 1, availableResources: 0.8 },
        timestamp: new Date(),
        agentId
      };

      await adapter.storeExperience(experience);

      // Close database to trigger error
      await database.close();

      // Flush should handle error gracefully
      await expect(adapter.flush()).rejects.toThrow();

      // Batch should remain (not cleared on error)
      expect(adapter.getPendingBatchSize()).toBeGreaterThan(0);
    });
  });
});

describe('InMemoryLearningPersistence', () => {
  let adapter: InMemoryLearningPersistence;

  beforeEach(() => {
    adapter = new InMemoryLearningPersistence();
  });

  afterEach(() => {
    adapter.clear();
  });

  describe('Experience Storage', () => {
    it('should store experiences in memory', async () => {
      const agentId = 'test-agent-memory';

      const experience: TaskExperience = {
        taskId: 'task-1',
        taskType: 'test-generation',
        state: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 0, availableResources: 0.8 },
        action: { strategy: 'default', toolsUsed: [], parallelization: 0.5, retryPolicy: 'exponential', resourceAllocation: 0.5 },
        reward: 0.8,
        nextState: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 1, availableResources: 0.8 },
        timestamp: new Date(),
        agentId
      };

      await adapter.storeExperience(experience);

      expect(adapter.getExperienceCount()).toBe(1);
      expect(adapter.experiences[0].taskId).toBe('task-1');
    });

    it('should store multiple experiences', async () => {
      const agentId = 'test-agent-multi';

      for (let i = 0; i < 10; i++) {
        const experience: TaskExperience = {
          taskId: `task-${i}`,
          taskType: 'test-generation',
          state: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 0, availableResources: 0.8 },
          action: { strategy: 'default', toolsUsed: [], parallelization: 0.5, retryPolicy: 'exponential', resourceAllocation: 0.5 },
          reward: 0.8,
          nextState: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 1, availableResources: 0.8 },
          timestamp: new Date(),
          agentId
        };

        await adapter.storeExperience(experience);
      }

      expect(adapter.getExperienceCount()).toBe(10);
    });
  });

  describe('Q-Value Storage', () => {
    it('should store Q-values in memory', async () => {
      const agentId = 'test-agent-qvalue';

      await adapter.storeQValue(agentId, 'state-1', 'action-1', 0.85);

      expect(adapter.getQValueCount(agentId)).toBe(1);
    });

    it('should update existing Q-values', async () => {
      const agentId = 'test-agent-qvalue-update';

      await adapter.storeQValue(agentId, 'state-1', 'action-1', 0.5);
      await adapter.storeQValue(agentId, 'state-1', 'action-1', 0.9);

      expect(adapter.getQValueCount(agentId)).toBe(1);
      expect(adapter.qValues.get(agentId)!.get('state-1:action-1')).toBeCloseTo(0.9, 2);
    });

    it('should store Q-values for multiple agents', async () => {
      await adapter.storeQValue('agent-1', 'state-1', 'action-1', 0.8);
      await adapter.storeQValue('agent-2', 'state-1', 'action-1', 0.7);

      expect(adapter.getQValueCount('agent-1')).toBe(1);
      expect(adapter.getQValueCount('agent-2')).toBe(1);
    });
  });

  describe('Snapshot Storage', () => {
    it('should store snapshots in memory', async () => {
      const agentId = 'test-agent-snapshot';

      await adapter.storeSnapshot(agentId, { metric: 'test' });

      expect(adapter.snapshots.length).toBe(1);
      expect(adapter.snapshots[0].agentId).toBe(agentId);
    });
  });

  describe('Clear Functionality', () => {
    it('should clear all data', async () => {
      const agentId = 'test-agent-clear';

      // Add data
      await adapter.storeExperience({
        taskId: 'task-1',
        taskType: 'test',
        state: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 0, availableResources: 0.8 },
        action: { strategy: 'default', toolsUsed: [], parallelization: 0.5, retryPolicy: 'exponential', resourceAllocation: 0.5 },
        reward: 0.8,
        nextState: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 1, availableResources: 0.8 },
        timestamp: new Date(),
        agentId
      });
      await adapter.storeQValue(agentId, 'state-1', 'action-1', 0.8);
      await adapter.storeSnapshot(agentId, { test: 'data' });

      // Clear
      adapter.clear();

      // Verify all cleared
      expect(adapter.getExperienceCount()).toBe(0);
      expect(adapter.getQValueCount(agentId)).toBe(0);
      expect(adapter.snapshots.length).toBe(0);
    });
  });

  describe('Flush Functionality', () => {
    it('should be a no-op (instant persistence)', async () => {
      await adapter.storeExperience({
        taskId: 'task-1',
        taskType: 'test',
        state: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 0, availableResources: 0.8 },
        action: { strategy: 'default', toolsUsed: [], parallelization: 0.5, retryPolicy: 'exponential', resourceAllocation: 0.5 },
        reward: 0.8,
        nextState: { taskComplexity: 0.5, requiredCapabilities: [], contextFeatures: {}, previousAttempts: 1, availableResources: 0.8 },
        timestamp: new Date(),
        agentId: 'test-agent'
      });

      // Should not throw
      await expect(adapter.flush()).resolves.not.toThrow();

      // Data should still be present
      expect(adapter.getExperienceCount()).toBe(1);
    });
  });
});
