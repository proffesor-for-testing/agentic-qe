/**
 * Learning Persistence Verification Test
 *
 * Verifies that the refactored LearningEngine correctly persists learning data
 * to the database via SwarmMemoryManager (Phase 6 completion).
 *
 * Tests:
 * 1. Learning experiences are saved to database
 * 2. Q-values are persisted and retrievable
 * 3. Learning history is stored correctly
 * 4. Pattern data is saved
 * 5. QE agents can learn and persist data
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LearningEngine } from '@learning/LearningEngine';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { TaskExperience, TaskState, AgentAction } from '@learning/types';
import * as fs from 'fs-extra';
import * as path from 'path';
import Database from 'better-sqlite3';

describe('Learning Persistence Verification', () => {
  const TEST_DB_PATH = path.join(__dirname, '../../.test-data/learning-persistence-test.db');
  let memoryStore: SwarmMemoryManager;
  let learningEngine: LearningEngine;
  const agentId = 'test-qe-agent-001';

  beforeEach(async () => {
    // Clean up test database
    await fs.remove(path.dirname(TEST_DB_PATH));
    await fs.ensureDir(path.dirname(TEST_DB_PATH));

    // Create SwarmMemoryManager with file-based database
    memoryStore = new SwarmMemoryManager(TEST_DB_PATH);
    await memoryStore.initialize();

    // Create LearningEngine using SwarmMemoryManager
    learningEngine = new LearningEngine(agentId, memoryStore, {
      enabled: true,
      learningRate: 0.1,
      explorationRate: 0.3
    });
    await learningEngine.initialize();
  });

  afterEach(async () => {
    await memoryStore.close();
    await fs.remove(path.dirname(TEST_DB_PATH));
  });

  describe('Database Persistence', () => {
    it('should save learning experiences to database', async () => {
      // Create a task experience
      const experience: TaskExperience = {
        taskId: 'task-001',
        taskType: 'test-generation',
        state: {
          taskComplexity: 0.7,
          requiredCapabilities: ['unit-test', 'mocking'],
          contextFeatures: { framework: 'jest' },
          previousAttempts: 0,
          availableResources: 0.8,
          timeConstraint: 30000
        },
        action: {
          strategy: 'tdd-london',
          toolsUsed: ['jest', 'sinon'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.6
        },
        reward: 0.9,
        nextState: {
          taskComplexity: 0.7,
          requiredCapabilities: ['unit-test', 'mocking'],
          contextFeatures: { framework: 'jest' },
          previousAttempts: 1,
          availableResources: 0.7,
          timeConstraint: 30000
        },
        timestamp: new Date(),
        agentId
      };

      // Learn from execution (this should persist to database)
      await learningEngine.learnFromExecution(
        { id: experience.taskId, type: experience.taskType },
        { success: true, executionTime: 1000 }
      );

      // Verify data is in database by querying directly
      const db = new Database(TEST_DB_PATH);
      const experiences = db.prepare(
        'SELECT * FROM learning_experiences WHERE agent_id = ?'
      ).all(agentId);
      db.close();

      expect(experiences.length).toBeGreaterThan(0);
      expect(experiences[0].agent_id).toBe(agentId);
      expect(experiences[0].task_type).toBe(experience.taskType);
    });

    it('should persist Q-values to database', async () => {
      // Execute multiple learning iterations
      for (let i = 0; i < 5; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'test-generation' },
          {
            success: i % 2 === 0, // Alternate success/failure
            executionTime: 1000 + i * 100
          }
        );
      }

      // Query database directly
      const db = new Database(TEST_DB_PATH);
      const qValues = db.prepare(
        'SELECT * FROM q_values WHERE agent_id = ?'
      ).all(agentId);
      db.close();

      // Should have Q-values stored
      expect(qValues.length).toBeGreaterThan(0);
      expect(qValues[0].agent_id).toBe(agentId);
      expect(qValues[0]).toHaveProperty('state_key');
      expect(qValues[0]).toHaveProperty('action_key');
      expect(qValues[0]).toHaveProperty('q_value');
      expect(typeof qValues[0].q_value).toBe('number');
    });

    it('should retrieve Q-values from database on initialization', async () => {
      // First session: learn and persist
      for (let i = 0; i < 3; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'coverage-analysis' },
          { success: true, coverage: 0.85, executionTime: 800 }
        );
      }

      const firstSessionQValues = await memoryStore.getAllQValues(agentId);
      expect(firstSessionQValues.length).toBeGreaterThan(0);

      // Close and create new instance
      await learningEngine.dispose();
      await memoryStore.close();

      // Second session: verify Q-values are loaded
      const newMemoryStore = new SwarmMemoryManager(TEST_DB_PATH);
      await newMemoryStore.initialize();

      const newLearningEngine = new LearningEngine(agentId, newMemoryStore);
      await newLearningEngine.initialize();

      // Q-values should be loaded from database
      const secondSessionQValues = await newMemoryStore.getAllQValues(agentId);
      expect(secondSessionQValues.length).toBe(firstSessionQValues.length);

      // Verify Q-values match
      for (let i = 0; i < firstSessionQValues.length; i++) {
        expect(secondSessionQValues[i].state_key).toBe(firstSessionQValues[i].state_key);
        expect(secondSessionQValues[i].action_key).toBe(firstSessionQValues[i].action_key);
        expect(secondSessionQValues[i].q_value).toBeCloseTo(firstSessionQValues[i].q_value, 5);
      }

      await newLearningEngine.dispose();
      await newMemoryStore.close();
    });

    it('should store learning history', async () => {
      // Trigger learning with feedback
      await learningEngine.learnFromExecution(
        { id: 'task-001', type: 'security-scan' },
        { success: true, vulnerabilities: 0 },
        { rating: 0.9, issues: [], suggestions: ['Add dependency scanning'] }
      );

      // Check learning history table
      const db = new Database(TEST_DB_PATH);
      const history = db.prepare(
        'SELECT * FROM learning_history WHERE agent_id = ?'
      ).all(agentId);
      db.close();

      expect(history.length).toBeGreaterThan(0);
      expect(history[0].agent_id).toBe(agentId);
    });

    it('should persist learning snapshots', async () => {
      // Execute multiple tasks to trigger periodic snapshots
      for (let i = 0; i < 12; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'performance-test' },
          { success: true, responseTime: 200 + i * 10 }
        );
      }

      // Snapshots should be stored (every 10 tasks by default)
      const snapshots = await memoryStore.getLearningHistory(agentId, 50);
      expect(snapshots.length).toBeGreaterThan(0);
    });
  });

  describe('Pattern Learning', () => {
    it('should learn and persist patterns', async () => {
      // Execute similar tasks to create patterns
      const taskType = 'api-contract-validation';
      const strategy = 'schema-driven';

      for (let i = 0; i < 5; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: taskType },
          {
            success: true,
            strategy,
            coverage: 0.95,
            executionTime: 1200
          }
        );
      }

      // Get learned patterns
      const patterns = learningEngine.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      // Pattern should include task type and strategy
      const matchingPattern = patterns.find(p =>
        p.pattern.includes(taskType) && p.pattern.includes(strategy)
      );
      expect(matchingPattern).toBeDefined();
      expect(matchingPattern!.successRate).toBeGreaterThan(0.8);
      expect(matchingPattern!.usageCount).toBeGreaterThanOrEqual(5);
    });

    it('should recommend strategies based on learned patterns', async () => {
      // Learn from successful executions with specific strategy
      const successfulStrategy = 'mutation-testing';

      for (let i = 0; i < 8; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'test-quality-validation' },
          {
            success: true,
            strategy: successfulStrategy,
            mutationScore: 0.92
          }
        );
      }

      // Request recommendation for similar state
      const state: TaskState = {
        taskComplexity: 0.6,
        requiredCapabilities: ['test-analysis', 'mutation-testing'],
        contextFeatures: { framework: 'jest' },
        previousAttempts: 0,
        availableResources: 0.8,
        timeConstraint: 60000
      };

      const recommendation = await learningEngine.recommendStrategy(state);

      expect(recommendation).toBeDefined();
      expect(recommendation.confidence).toBeGreaterThan(0.5);
      expect(recommendation.strategy).toContain(successfulStrategy);
    });
  });

  describe('QE Agent Integration', () => {
    it('should persist learning data during QE agent task execution', async () => {
      // Simulate QE agent task execution with learning
      const qeAgentId = 'qe-test-generator-001';
      const qeLearningEngine = new LearningEngine(qeAgentId, memoryStore);
      await qeLearningEngine.initialize();

      // Simulate test generation tasks
      const tasks = [
        { type: 'unit-test-generation', success: true, coverage: 0.85 },
        { type: 'integration-test-generation', success: true, coverage: 0.78 },
        { type: 'e2e-test-generation', success: false, coverage: 0.45 },
        { type: 'unit-test-generation', success: true, coverage: 0.92 }
      ];

      for (let i = 0; i < tasks.length; i++) {
        await qeLearningEngine.learnFromExecution(
          { id: `qe-task-${i}`, type: tasks[i].type },
          { success: tasks[i].success, coverage: tasks[i].coverage }
        );
      }

      // Verify learning data is persisted
      const experiences = await memoryStore.getAllQValues(qeAgentId);
      expect(experiences.length).toBeGreaterThan(0);

      // Verify patterns were learned
      const patterns = qeLearningEngine.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      // Verify learning statistics
      expect(qeLearningEngine.getTotalExperiences()).toBe(tasks.length);
      expect(qeLearningEngine.getExplorationRate()).toBeGreaterThan(0);

      await qeLearningEngine.dispose();
    });

    it('should improve performance over multiple task executions', async () => {
      const iterations = 20;
      const rewards: number[] = [];

      // Execute multiple learning cycles
      for (let i = 0; i < iterations; i++) {
        const result = await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'flaky-test-detection' },
          {
            success: i > 5, // Improve after 5 iterations
            flakinessScore: Math.max(0.1, 0.9 - (i * 0.04)),
            executionTime: Math.max(800, 2000 - (i * 50))
          }
        );

        rewards.push(result.newPerformance);
      }

      // Performance should improve over time
      const firstHalf = rewards.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
      const secondHalf = rewards.slice(10).reduce((a, b) => a + b, 0) / 10;

      expect(secondHalf).toBeGreaterThan(firstHalf);
    });
  });

  describe('Cross-Session Persistence', () => {
    it('should maintain learning state across sessions', async () => {
      // Session 1: Learn patterns
      for (let i = 0; i < 10; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'regression-test-selection' },
          { success: true, testsSelected: 150 - i * 5 }
        );
      }

      const session1Patterns = learningEngine.getPatterns();
      const session1Experiences = learningEngine.getTotalExperiences();

      // Close session 1
      await learningEngine.dispose();
      await memoryStore.close();

      // Session 2: Resume learning
      const session2MemoryStore = new SwarmMemoryManager(TEST_DB_PATH);
      await session2MemoryStore.initialize();

      const session2LearningEngine = new LearningEngine(agentId, session2MemoryStore);
      await session2LearningEngine.initialize();

      // Continue learning
      for (let i = 10; i < 15; i++) {
        await session2LearningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'regression-test-selection' },
          { success: true, testsSelected: 100 - i * 3 }
        );
      }

      // Verify state continuity
      expect(session2LearningEngine.getTotalExperiences()).toBeGreaterThan(session1Experiences);

      await session2LearningEngine.dispose();
      await session2MemoryStore.close();
    });
  });
});
