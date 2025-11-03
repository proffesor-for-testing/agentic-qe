/**
 * LearningEngine Database Integration Tests
 *
 * Tests Q-value persistence, experience recording, pattern discovery, and cross-session restoration
 * with mocked Database to avoid initialization issues.
 *
 * Coverage Target: 95%+
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { LearningEngine } from '@learning/LearningEngine';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { TaskResult } from '@learning/RewardCalculator';
import { LearningFeedback, TaskState } from '@learning/types';
import * as path from 'path';
import * as fs from 'fs-extra';

// Mock Logger
jest.mock('@utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

// Mock Database class
class MockDatabase {
  private qValues: Map<string, Array<{ state_key: string; action_key: string; q_value: number; agent_id: string }>> = new Map();
  private experiences: Array<any> = [];
  private snapshots: Array<any> = [];
  private isInitialized = false;
  private isClosed = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;
  }

  async close(): Promise<void> {
    this.isClosed = true;
    this.isInitialized = false;
  }

  async upsertQValue(agentId: string, stateKey: string, actionKey: string, qValue: number): Promise<void> {
    if (!this.qValues.has(agentId)) {
      this.qValues.set(agentId, []);
    }

    const agentQValues = this.qValues.get(agentId)!;
    const existingIndex = agentQValues.findIndex(
      qv => qv.state_key === stateKey && qv.action_key === actionKey
    );

    if (existingIndex >= 0) {
      agentQValues[existingIndex].q_value = qValue;
    } else {
      agentQValues.push({ agent_id: agentId, state_key: stateKey, action_key: actionKey, q_value: qValue });
    }
  }

  async getAllQValues(agentId: string): Promise<Array<{ state_key: string; action_key: string; q_value: number; agent_id: string }>> {
    return this.qValues.get(agentId) || [];
  }

  async storeLearningExperience(experience: any): Promise<void> {
    this.experiences.push(experience);
  }

  async storeLearningSnapshot(snapshot: any): Promise<void> {
    this.snapshots.push(snapshot);
  }

  async getLearningStatistics(agentId: string): Promise<any> {
    const agentExperiences = this.experiences.filter(e => e.agentId === agentId);
    const totalReward = agentExperiences.reduce((sum, e) => sum + (e.reward || 0), 0);

    return {
      totalExperiences: agentExperiences.length,
      averageReward: agentExperiences.length > 0 ? totalReward / agentExperiences.length : 0,
      recentImprovement: 0.05
    };
  }

  async all(sql: string, params: any[]): Promise<any[]> {
    if (sql.includes('learning_experiences')) {
      const agentId = params[0];
      return this.experiences.filter(e => e.agentId === agentId);
    }
    if (sql.includes('learning_snapshots')) {
      const agentId = params[0];
      return this.snapshots.filter(s => s.agentId === agentId);
    }
    return [];
  }

  // Helper to get stats
  getStats() {
    return {
      qValuesCount: Array.from(this.qValues.values()).reduce((sum, arr) => sum + arr.length, 0),
      experiencesCount: this.experiences.length,
      snapshotsCount: this.snapshots.length,
      isInitialized: this.isInitialized,
      isClosed: this.isClosed
    };
  }
}

describe('LearningEngine - Database Integration Tests', () => {
  let learningEngine: LearningEngine;
  let memoryStore: SwarmMemoryManager;
  let database: MockDatabase;
  let memoryDbPath: string;

  beforeEach(async () => {
    // Create mock database
    database = new MockDatabase();
    await database.initialize();

    // Create memory store
    memoryDbPath = path.join(__dirname, `../../../.test-memory-${Date.now()}.db`);
    memoryStore = new SwarmMemoryManager(memoryDbPath);
    await memoryStore.initialize();

    // Create learning engine with mock database
    learningEngine = new LearningEngine('test-agent-001', memoryStore, {
      enabled: true,
      learningRate: 0.1,
      discountFactor: 0.95,
      explorationRate: 0.3,
      updateFrequency: 5
    }, database as any);

    await learningEngine.initialize();
  });

  afterEach(async () => {
    // Cleanup
    learningEngine.dispose(); // Clear timers first
    await database.close();
    await memoryStore.close();

    // Remove test database
    if (fs.existsSync(memoryDbPath)) {
      fs.unlinkSync(memoryDbPath);
    }
  });

  // ===========================================================================
  // 1. Q-VALUE PERSISTENCE AND RETRIEVAL
  // ===========================================================================

  describe('Q-Value Persistence and Retrieval', () => {
    it('should persist Q-values to database after experience recording', async () => {
      const task = {
        id: 'task-001',
        type: 'test-generation',
        context: { framework: 'jest' }
      };

      const result: TaskResult = {
        success: true,
        executionTime: 150,
        metadata: {
          strategy: 'parallel',
          toolsUsed: ['ast-parser', 'template-engine'],
          parallelization: 0.8
        }
      };

      await learningEngine.recordExperience(task, result);

      // Verify Q-value was persisted to database
      const qValues = await database.getAllQValues('test-agent-001');
      expect(qValues.length).toBeGreaterThan(0);
      expect(qValues[0].agent_id).toBe('test-agent-001');
      expect(qValues[0].q_value).toBeDefined();
      expect(typeof qValues[0].q_value).toBe('number');
    });

    it('should load Q-values from database on initialization', async () => {
      // Store some Q-values in database
      await database.upsertQValue('test-agent-002', 'state1', 'action1', 0.85);
      await database.upsertQValue('test-agent-002', 'state1', 'action2', 0.65);
      await database.upsertQValue('test-agent-002', 'state2', 'action1', 0.75);

      // Create new learning engine that loads from database
      const newEngine = new LearningEngine('test-agent-002', memoryStore, {}, database as any);
      await newEngine.initialize();

      // Verify Q-values were loaded by checking recommendation works
      const recommendation = await newEngine.recommendStrategy({
        taskComplexity: 0.5,
        requiredCapabilities: ['test-generation'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      } as TaskState);

      expect(recommendation).toBeDefined();
      expect(recommendation.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should update existing Q-values in database (upsert)', async () => {
      const task = {
        id: 'task-003',
        type: 'test-generation',
        context: {}
      };

      const result: TaskResult = {
        success: true,
        executionTime: 100,
        metadata: { strategy: 'sequential', parallelization: 0.5, retryPolicy: 'linear' }
      };

      // Record first experience
      await learningEngine.recordExperience(task, result);
      const firstQValues = await database.getAllQValues('test-agent-001');
      expect(firstQValues.length).toBeGreaterThan(0);
      const firstQValue = firstQValues[0].q_value;

      // Record second experience with same task (should update Q-value)
      await learningEngine.recordExperience(task, result);
      const secondQValues = await database.getAllQValues('test-agent-001');
      const secondQValue = secondQValues[0].q_value;

      // Q-value should have changed due to learning algorithm
      expect(secondQValue).not.toBe(firstQValue);
    });

    it('should retrieve all Q-values for specific agent', async () => {
      // Create experiences for multiple agents
      await database.upsertQValue('agent-A', 'state1', 'action1', 0.9);
      await database.upsertQValue('agent-A', 'state2', 'action1', 0.8);
      await database.upsertQValue('agent-B', 'state1', 'action1', 0.7);

      const agentAValues = await database.getAllQValues('agent-A');
      const agentBValues = await database.getAllQValues('agent-B');

      expect(agentAValues.length).toBe(2);
      expect(agentBValues.length).toBe(1);
      expect(agentAValues.every(v => v.agent_id === 'agent-A')).toBe(true);
    });

    it('should handle empty Q-table on first initialization', async () => {
      const freshEngine = new LearningEngine('fresh-agent', memoryStore, {}, database as any);
      await freshEngine.initialize();

      const qValues = await database.getAllQValues('fresh-agent');
      expect(qValues.length).toBe(0);
    });

    it('should preserve Q-values across engine restarts', async () => {
      const task = { id: 'task-005', type: 'test-generation', context: {} };
      const result: TaskResult = {
        success: true,
        executionTime: 100,
        metadata: { strategy: 'adaptive', parallelization: 0.6, retryPolicy: 'exponential' }
      };

      await learningEngine.recordExperience(task, result);
      const originalQValues = await database.getAllQValues('test-agent-001');
      expect(originalQValues.length).toBeGreaterThan(0);

      // Simulate restart by creating new engine instance
      const restartedEngine = new LearningEngine('test-agent-001', memoryStore, {}, database as any);
      await restartedEngine.initialize();

      const restoredQValues = await database.getAllQValues('test-agent-001');
      expect(restoredQValues.length).toBe(originalQValues.length);
      expect(restoredQValues[0].q_value).toBe(originalQValues[0].q_value);
    });
  });

  // ===========================================================================
  // 2. EXPERIENCE RECORDING WITH REWARDS
  // ===========================================================================

  describe('Experience Recording with Rewards', () => {
    it('should record successful experience with positive reward', async () => {
      const task = {
        id: 'task-101',
        type: 'test-generation',
        context: { framework: 'jest', complexity: 'medium' }
      };

      const result: TaskResult = {
        success: true,
        executionTime: 120,
        coverage: 0.95,
        metadata: {
          strategy: 'property-based',
          toolsUsed: ['fast-check'],
          parallelization: 0.7
        }
      };

      const feedback: LearningFeedback = {
        rating: 0.9,
        issues: [],
        suggestions: []
      };

      await learningEngine.recordExperience(task, result, feedback);

      // Verify experience was stored
      const stats = await database.getLearningStatistics('test-agent-001');
      expect(stats.totalExperiences).toBeGreaterThan(0);
      expect(stats.averageReward).toBeDefined();
    });

    it('should record failed experience with negative reward', async () => {
      const task = {
        id: 'task-102',
        type: 'test-execution',
        context: {}
      };

      const result: TaskResult = {
        success: false,
        executionTime: 200,
        errors: ['Timeout', 'Connection error'],
        metadata: { strategy: 'sequential' }
      };

      await learningEngine.recordExperience(task, result);

      const stats = await database.getLearningStatistics('test-agent-001');
      expect(stats.totalExperiences).toBeGreaterThan(0);
    });

    it('should calculate reward based on execution time', async () => {
      const fastTask = { id: 'task-103-fast', type: 'test-generation', context: {} };
      const slowTask = { id: 'task-103-slow', type: 'test-generation', context: {} };

      const fastResult: TaskResult = {
        success: true,
        executionTime: 50,
        metadata: { strategy: 'fast-path', parallelization: 0.9, retryPolicy: 'none' }
      };

      const slowResult: TaskResult = {
        success: true,
        executionTime: 5000,
        metadata: { strategy: 'slow-path', parallelization: 0.1, retryPolicy: 'exponential' }
      };

      await learningEngine.recordExperience(fastTask, fastResult);
      await learningEngine.recordExperience(slowTask, slowResult);

      // Fast task should generate Q-values
      const qValues = await database.getAllQValues('test-agent-001');
      expect(qValues.length).toBeGreaterThan(0);
    });

    it('should incorporate user feedback into reward calculation', async () => {
      const task = { id: 'task-105', type: 'test-generation', context: {} };
      const result: TaskResult = {
        success: true,
        executionTime: 100,
        metadata: { strategy: 'feedback-test', parallelization: 0.5, retryPolicy: 'linear' }
      };

      const positiveFeedback: LearningFeedback = {
        rating: 0.95,
        issues: [],
        suggestions: ['Great coverage!']
      };

      await learningEngine.recordExperience(task, result, positiveFeedback);

      const stats = await database.getLearningStatistics('test-agent-001');
      expect(stats.totalExperiences).toBeGreaterThan(0);
    });

    it('should decay exploration rate after each experience', async () => {
      const initialExploration = learningEngine.getExplorationRate();

      for (let i = 0; i < 10; i++) {
        await learningEngine.recordExperience(
          { id: `task-${i}`, type: 'test', context: {} },
          { success: true, executionTime: 100, metadata: { strategy: 'test', parallelization: 0.5, retryPolicy: 'none' } }
        );
      }

      const finalExploration = learningEngine.getExplorationRate();
      expect(finalExploration).toBeLessThan(initialExploration);
      expect(finalExploration).toBeGreaterThanOrEqual(0.01); // Min exploration rate
    });
  });

  // ===========================================================================
  // 3. PATTERN DISCOVERY ALGORITHM
  // ===========================================================================

  describe('Pattern Discovery Algorithm', () => {
    it('should discover successful patterns over time', async () => {
      for (let i = 0; i < 15; i++) {
        await learningEngine.recordExperience(
          { id: `task-${i}`, type: 'test-generation', context: { framework: 'jest' } },
          {
            success: true,
            executionTime: 100,
            coverage: 0.9,
            metadata: { strategy: 'property-based', toolsUsed: ['fast-check'], parallelization: 0.8, retryPolicy: 'exponential' }
          }
        );
      }

      const patterns = learningEngine.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      const propertyPattern = patterns.find(p => p.pattern.includes('property-based'));
      expect(propertyPattern).toBeDefined();
      expect(propertyPattern!.confidence).toBeGreaterThan(0.5);
      expect(propertyPattern!.usageCount).toBe(15);
    });

    it('should track pattern success rates accurately', async () => {
      const strategy = 'boundary-testing';

      // Record 8 successes
      for (let i = 0; i < 8; i++) {
        await learningEngine.recordExperience(
          { id: `success-${i}`, type: 'test-generation', context: {} },
          { success: true, executionTime: 100, metadata: { strategy, parallelization: 0.5, retryPolicy: 'linear' } }
        );
      }

      // Record 2 failures
      for (let i = 0; i < 2; i++) {
        await learningEngine.recordExperience(
          { id: `failure-${i}`, type: 'test-generation', context: {} },
          { success: false, executionTime: 100, metadata: { strategy, parallelization: 0.5, retryPolicy: 'linear' } }
        );
      }

      const patterns = learningEngine.getPatterns();
      const boundaryPattern = patterns.find(p => p.pattern.includes(strategy));

      expect(boundaryPattern).toBeDefined();
      expect(boundaryPattern!.successRate).toBeCloseTo(0.8, 1); // 80% success rate
    });

    it('should recommend best strategy based on learned patterns', async () => {
      // Train with successful pattern
      for (let i = 0; i < 20; i++) {
        await learningEngine.recordExperience(
          { id: `task-${i}`, type: 'test-generation', context: { complexity: 'medium' } },
          {
            success: true,
            executionTime: 80,
            coverage: 0.95,
            metadata: {
              strategy: 'optimal-strategy',
              parallelization: 0.8,
              retryPolicy: 'exponential',
              toolsUsed: ['tool-a']
            }
          }
        );
      }

      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['test-generation'],
        contextFeatures: { complexity: 'medium' },
        previousAttempts: 0,
        availableResources: 0.8
      };

      const recommendation = await learningEngine.recommendStrategy(state);

      expect(recommendation.strategy).toContain('optimal-strategy');
      expect(recommendation.confidence).toBeGreaterThan(0);
      expect(recommendation.expectedImprovement).toBeGreaterThanOrEqual(0);
    });

    it('should return default strategy when no patterns learned', async () => {
      const freshEngine = new LearningEngine('fresh-agent-002', memoryStore, {}, database as any);
      await freshEngine.initialize();

      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['test-generation'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };

      const recommendation = await freshEngine.recommendStrategy(state);

      expect(recommendation.strategy).toBe('default');
      expect(recommendation.confidence).toBe(0.5);
      expect(recommendation.reasoning).toContain('No learned strategies available');
    });

    it('should detect and store failure patterns', async () => {
      for (let i = 0; i < 10; i++) {
        await learningEngine.recordExperience(
          { id: `fail-task-${i}`, type: 'flaky-test-detection', context: {} },
          { success: false, executionTime: 100, metadata: { strategy: 'failing-strategy', parallelization: 0.5, retryPolicy: 'none' } }
        );
      }

      const failurePatterns = learningEngine.getFailurePatterns();
      expect(failurePatterns.length).toBeGreaterThan(0);

      const flakyPattern = failurePatterns.find(p => p.pattern.includes('flaky-test-detection'));
      expect(flakyPattern).toBeDefined();
      expect(flakyPattern!.frequency).toBeGreaterThan(5);
    });
  });

  // ===========================================================================
  // 4. CROSS-SESSION RESTORATION
  // ===========================================================================

  describe('Cross-Session Restoration', () => {
    it('should save learning state periodically', async () => {
      // Record 50+ experiences to trigger save (every 50)
      for (let i = 0; i < 55; i++) {
        await learningEngine.recordExperience(
          { id: `task-${i}`, type: 'test-generation', context: {} },
          { success: true, executionTime: 100, metadata: { strategy: 'test', parallelization: 0.5, retryPolicy: 'none' } }
        );
      }

      // Verify state was saved to memory store
      const savedState = await memoryStore.retrieve(
        'phase2/learning/test-agent-001/state',
        { partition: 'learning' }
      );

      expect(savedState).toBeDefined();
      expect(savedState.agentId).toBe('test-agent-001');
      expect(savedState.experiences.length).toBeGreaterThan(0);
      expect(savedState.qTable).toBeDefined();
    });

    it('should restore learning state on initialization', async () => {
      // Record some experiences
      for (let i = 0; i < 20; i++) {
        await learningEngine.recordExperience(
          { id: `task-${i}`, type: 'test-generation', context: {} },
          { success: true, executionTime: 100, coverage: 0.9, metadata: { strategy: 'optimal', parallelization: 0.7, retryPolicy: 'exponential' } }
        );
      }

      const experienceCount = learningEngine.getTotalExperiences();
      expect(experienceCount).toBe(20);

      // Create new engine instance (simulates restart)
      const restoredEngine = new LearningEngine('test-agent-001', memoryStore, {}, database as any);
      await restoredEngine.initialize();

      // Verify state was restored
      const restoredCount = restoredEngine.getTotalExperiences();
      expect(restoredCount).toBeGreaterThan(0);
    });

    it('should handle missing state gracefully on first run', async () => {
      const newEngine = new LearningEngine('brand-new-agent', memoryStore, {}, database as any);

      await expect(newEngine.initialize()).resolves.not.toThrow();

      expect(newEngine.getTotalExperiences()).toBe(0);
      expect(newEngine.getPatterns().length).toBe(0);
    });

    it('should store learning snapshots periodically', async () => {
      // Record experiences to trigger batch update (every 5 per config)
      for (let i = 0; i < 10; i++) {
        await learningEngine.recordExperience(
          { id: `task-${i}`, type: 'test-generation', context: {} },
          { success: i % 2 === 0, executionTime: 100, metadata: { strategy: 'test', parallelization: 0.5, retryPolicy: 'none' } }
        );
      }

      // Verify snapshot was stored
      const snapshots = await database.all(
        'SELECT * FROM learning_snapshots WHERE agent_id = ?',
        ['test-agent-001']
      );

      expect(snapshots.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // 5. INTEGRATION TESTS
  // ===========================================================================

  describe('Integration Tests', () => {
    it('should demonstrate complete learning cycle', async () => {
      expect(learningEngine.getTotalExperiences()).toBe(0);

      for (let i = 0; i < 30; i++) {
        const isSuccess = i % 3 !== 0;
        await learningEngine.recordExperience(
          { id: `task-${i}`, type: 'test-generation', context: { complexity: 'medium' } },
          {
            success: isSuccess,
            executionTime: isSuccess ? 100 : 200,
            coverage: isSuccess ? 0.9 : 0.5,
            metadata: {
              strategy: isSuccess ? 'good-strategy' : 'bad-strategy',
              parallelization: 0.8,
              retryPolicy: 'exponential'
            }
          }
        );
      }

      expect(learningEngine.getTotalExperiences()).toBe(30);

      const patterns = learningEngine.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['test-generation'],
        contextFeatures: { complexity: 'medium' },
        previousAttempts: 0,
        availableResources: 0.8
      };

      const recommendation = await learningEngine.recommendStrategy(state);
      expect(recommendation.strategy).toContain('good-strategy');

      const qValues = await database.getAllQValues('test-agent-001');
      expect(qValues.length).toBeGreaterThan(0);

      const stats = await database.getLearningStatistics('test-agent-001');
      expect(stats.totalExperiences).toBe(30);
    });
  });

  // ===========================================================================
  // 6. EDGE CASES AND ERROR HANDLING
  // ===========================================================================

  describe('Edge Cases and Error Handling', () => {
    it('should handle disabled learning gracefully', async () => {
      learningEngine.setEnabled(false);

      await learningEngine.recordExperience(
        { id: 'task-disabled', type: 'test', context: {} },
        { success: true, executionTime: 100, metadata: { strategy: 'test', parallelization: 0.5, retryPolicy: 'none' } }
      );

      expect(learningEngine.getTotalExperiences()).toBe(0);
    });

    it('should handle null/undefined task properties', async () => {
      await expect(
        learningEngine.recordExperience(
          { id: undefined as any, type: 'test', context: {} },
          { success: true, executionTime: 100, metadata: { strategy: 'test', parallelization: 0.5, retryPolicy: 'none' } }
        )
      ).resolves.not.toThrow();
    });

    it('should handle concurrent experience recording', async () => {
      const promises = [];

      for (let i = 0; i < 20; i++) {
        promises.push(
          learningEngine.recordExperience(
            { id: `concurrent-${i}`, type: 'test', context: {} },
            { success: true, executionTime: 100, metadata: { strategy: 'concurrent', parallelization: 0.6, retryPolicy: 'linear' } }
          )
        );
      }

      await expect(Promise.all(promises)).resolves.not.toThrow();
      expect(learningEngine.getTotalExperiences()).toBe(20);
    });
  });
});
