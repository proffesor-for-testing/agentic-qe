/**
 * Integration Test: Learning System Database Persistence
 *
 * Verifies that Q-learning experiences and Q-values are correctly
 * persisted to the database and restored across agent restarts.
 *
 * This test was created to prevent regression of the issue where
 * LearningEngine was not receiving a Database instance, causing
 * all persistence operations to be silently skipped.
 */

// CRITICAL: Unmock Database to use real implementation for persistence tests
jest.unmock('../../src/utils/Database');

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LearningEngine } from '../../src/learning/LearningEngine';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { Database } from '../../src/utils/Database';
import { TaskResult } from '../../src/learning/RewardCalculator';
import { LearningFeedback } from '../../src/learning/types';
import fs from 'fs';
import path from 'path';

describe('Learning System Database Persistence', () => {
  // Use tests/.tmp directory for test databases (not project root)
  const tmpDir = path.join(__dirname, '../.tmp');
  const testDbPath = path.join(tmpDir, '.test-learning.db');
  const memoryDbPath = path.join(tmpDir, '.test-memory.db');
  let database: Database;
  let memoryManager: SwarmMemoryManager;
  let learningEngine: LearningEngine | null = null;

  beforeEach(async () => {
    // Ensure tmp directory exists
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Clean up test databases if they exist
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(memoryDbPath)) {
      fs.unlinkSync(memoryDbPath);
    }

    // Create fresh database (for Q-learning) and memory manager (for coordination)
    database = new Database(testDbPath);
    await database.initialize();

    memoryManager = new SwarmMemoryManager(memoryDbPath);
    await memoryManager.initialize();
  });

  afterEach(async () => {
    // CRITICAL: Dispose LearningEngine instances to prevent open handles
    if (learningEngine) {
      learningEngine.dispose();
      learningEngine = null;
    }

    // CRITICAL: Close database connections before cleanup to prevent crashes
    try {
      if (database && typeof database.close === 'function') {
        await database.close();
      }
    } catch (error) {
      // Ignore close errors
    }

    try {
      if (memoryManager && (memoryManager as any).db) {
        (memoryManager as any).db.close();
      }
    } catch (error) {
      // Ignore close errors
    }

    // Clean up test database files
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(memoryDbPath)) {
      fs.unlinkSync(memoryDbPath);
    }
  });

  describe('Q-Value Persistence', () => {
    it('should persist Q-values to database when explicitly provided', async () => {
      const agentId = 'test-agent-explicit-db';

      // Create LearningEngine WITH database parameter (old way)
      learningEngine = new LearningEngine(
        agentId,
        memoryManager,
        { enabled: true },
        database // ← Explicitly provided
      );
      await learningEngine.initialize();

      // Create test task and result (NO task_id to avoid FK constraint complexity)
      const task = {
        // id: undefined,  // Don't provide ID to avoid FK constraint to tasks table
        type: 'unit-test-generation',
        context: {},
        requirements: {
          capabilities: ['code-analysis', 'test-generation']
        }
      };

      const result: TaskResult = {
        success: true,
        executionTime: 1500,
        errors: [],
        coverage: 0.85,
        metadata: {
          strategy: 'template-based',
          toolsUsed: ['ast-parser', 'jest-generator'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.6
        }
      };

      // Record experience (should persist to database)
      await learningEngine.recordExperience(task, result);

      // Verify Q-values were persisted
      const qValues = await database.getAllQValues(agentId);
      expect(qValues.length).toBeGreaterThan(0);
      expect(qValues[0].q_value).toBeDefined();
      expect(qValues[0].state_key).toBeDefined();
      expect(qValues[0].action_key).toBeDefined();
    });

    it('should auto-initialize database if not provided (NEW FIX)', async () => {
      const agentId = 'test-agent-auto-init';

      // Temporarily set AQE_DB_PATH to test database
      const originalPath = process.env.AQE_DB_PATH;
      process.env.AQE_DB_PATH = testDbPath;

      try {
        // Create LearningEngine WITHOUT database parameter (new way - should auto-init)
        learningEngine = new LearningEngine(
          agentId,
          memoryManager,
          { enabled: true }
          // ← No 4th parameter - should auto-initialize
        );
        await learningEngine.initialize();

        // Create test task and result
        const task = {
          id: 'task-002',
          type: 'integration-test-generation',
          context: {},
          requirements: {
            capabilities: ['api-testing']
          }
        };

        const result: TaskResult = {
          success: true,
          executionTime: 2000,
          errors: [],
          coverage: 0.90,
          metadata: {
            strategy: 'property-based',
            toolsUsed: ['fast-check'],
            parallelization: 0.7,
            retryPolicy: 'linear',
            resourceAllocation: 0.8
          }
        };

        // Record experience (should persist to auto-initialized database)
        await learningEngine.recordExperience(task, result);

        // Verify Q-values were persisted to auto-initialized database
        const qValues = await database.getAllQValues(agentId);
        expect(qValues.length).toBeGreaterThan(0);
        expect(qValues[0].q_value).toBeGreaterThan(-2); // Valid Q-value range [-2, 2]
        expect(qValues[0].q_value).toBeLessThan(2);

      } finally {
        // Restore environment
        if (originalPath) {
          process.env.AQE_DB_PATH = originalPath;
        } else {
          delete process.env.AQE_DB_PATH;
        }
      }
    });

    it('should restore Q-values across agent restarts', async () => {
      const agentId = 'test-agent-restart';

      // Agent 1: Learn from multiple tasks
      learningEngine = new LearningEngine(
        agentId,
        memoryManager,
        { enabled: true },
        database
      );
      await learningEngine.initialize();

      // Execute 5 tasks to build Q-table
      for (let i = 0; i < 5; i++) {
        const task = {
          id: `task-00${i}`,
          type: 'unit-test-generation',
          context: {},
          requirements: { capabilities: ['testing'] }
        };

        const result: TaskResult = {
          success: i % 2 === 0, // Alternate success/failure
          executionTime: 1000 + i * 200,
          errors: [],
          coverage: 0.7 + i * 0.05,
          metadata: {
            strategy: i % 2 === 0 ? 'template-based' : 'property-based',
            toolsUsed: ['jest'],
            parallelization: 0.5,
            retryPolicy: 'exponential',
            resourceAllocation: 0.5
          }
        };

        await learningEngine.recordExperience(task, result);
      }

      // Get Q-table size from first agent
      const qValues1 = await database.getAllQValues(agentId);
      const firstAgentQTableSize = qValues1.length;

      expect(firstAgentQTableSize).toBeGreaterThan(0);

      // Dispose first engine before creating second one
      learningEngine.dispose();

      // Agent 2: Same ID, should restore previous learning
      learningEngine = new LearningEngine(
        agentId,
        memoryManager,
        { enabled: true },
        database
      );
      await learningEngine.initialize();

      // Verify Q-table was restored
      const qValues2 = await database.getAllQValues(agentId);
      expect(qValues2.length).toBe(firstAgentQTableSize);

      // Get strategy recommendation (should use learned Q-values)
      const recommendation = await learningEngine.recommendStrategy({
        taskComplexity: 0.5,
        requiredCapabilities: ['testing'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8,
        timeConstraint: 30000
      });

      expect(recommendation.confidence).toBeGreaterThan(0);
      expect(recommendation.strategy).toBeDefined();
    });
  });

  describe('Experience Persistence', () => {
    it('should store learning experiences in database', async () => {
      const agentId = 'test-agent-experiences';
      learningEngine = new LearningEngine(
        agentId,
        memoryManager,
        { enabled: true },
        database
      );
      await learningEngine.initialize();

      // Create task with feedback
      const task = {
        id: 'task-feedback-001',
        type: 'security-test-generation',
        context: {},
        requirements: {
          capabilities: ['security-testing', 'owasp']
        }
      };

      const result: TaskResult = {
        success: true,
        executionTime: 3000,
        errors: [],
        coverage: 0.95,
        metadata: {
          strategy: 'threat-modeling',
          toolsUsed: ['semgrep', 'bandit'],
          parallelization: 0.8,
          retryPolicy: 'exponential',
          resourceAllocation: 0.9
        }
      };

      const feedback: LearningFeedback = {
        rating: 0.9,
        issues: [],
        suggestions: ['Excellent coverage of OWASP Top 10']
      };

      // Record experience with feedback
      await learningEngine.recordExperience(task, result, feedback);

      // Verify experience was stored
      const stats = await database.getLearningStatistics(agentId);
      expect(stats.totalExperiences).toBeGreaterThan(0);
      expect(stats.avgReward).toBeGreaterThan(0);
    });

    it('should handle high volume of experiences efficiently', async () => {
      const agentId = 'test-agent-volume';
      learningEngine = new LearningEngine(
        agentId,
        memoryManager,
        {
          enabled: true,
          batchSize: 10,
          updateFrequency: 5
        },
        database
      );
      await learningEngine.initialize();

      const startTime = Date.now();

      // REDUCED: Record only 10 experiences to prevent memory overload in constrained environments
      for (let i = 0; i < 10; i++) {
        const task = {
          id: `volume-task-${i}`,
          type: 'test-generation',
          context: {},
          requirements: { capabilities: ['testing'] }
        };

        const result: TaskResult = {
          success: Math.random() > 0.3,
          executionTime: 1000 + Math.random() * 2000,
          errors: [],
          coverage: 0.6 + Math.random() * 0.4,
          metadata: {
            strategy: i % 3 === 0 ? 'template' : i % 3 === 1 ? 'property' : 'mutation',
            toolsUsed: ['jest'],
            parallelization: 0.5,
            retryPolicy: 'exponential',
            resourceAllocation: 0.5
          }
        };

        await learningEngine.recordExperience(task, result);
      }

      const duration = Date.now() - startTime;

      // Verify all experiences were stored
      const stats = await database.getLearningStatistics(agentId);
      expect(stats.totalExperiences).toBe(10);

      // Performance check: Should complete in under 3 seconds
      expect(duration).toBeLessThan(3000);

      // Verify Q-table was built
      expect(stats.qTableSize).toBeGreaterThan(0);
    });
  });

  describe('Pattern Discovery Persistence', () => {
    it('should discover and persist patterns across tasks', async () => {
      const agentId = 'test-agent-patterns';
      learningEngine = new LearningEngine(
        agentId,
        memoryManager,
        { enabled: true },
        database
      );
      await learningEngine.initialize();

      // Execute similar tasks to discover pattern
      for (let i = 0; i < 10; i++) {
        const task = {
          id: `pattern-task-${i}`,
          type: 'api-test-generation', // Same type
          context: {},
          requirements: { capabilities: ['api-testing'] }
        };

        const result: TaskResult = {
          success: true, // Always successful
          executionTime: 1500,
          errors: [],
          coverage: 0.88,
          metadata: {
            strategy: 'contract-based', // Same strategy
            toolsUsed: ['pact'],
            parallelization: 0.6,
            retryPolicy: 'exponential',
            resourceAllocation: 0.7
          }
        };

        await learningEngine.recordExperience(task, result);
      }

      // Get discovered patterns
      const patterns = learningEngine.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      // Verify pattern has increasing confidence and high success rate
      const topPattern = patterns[0];
      // Confidence starts at 0.5 and increases by 0.01 per use: 0.5 + (10 * 0.01) = 0.6
      expect(topPattern.confidence).toBeGreaterThanOrEqual(0.59); // Allow floating point margin
      expect(topPattern.confidence).toBeLessThanOrEqual(0.61);
      expect(topPattern.successRate).toBe(1.0); // All 10 tasks succeeded
      expect(topPattern.usageCount).toBe(10);
    });
  });

  describe('Learning Statistics', () => {
    it('should provide accurate statistics from database', async () => {
      const agentId = 'test-agent-stats';
      learningEngine = new LearningEngine(
        agentId,
        memoryManager,
        { enabled: true },
        database
      );
      await learningEngine.initialize();

      // Record mix of successful and failed experiences
      const experiences = [
        { success: true, coverage: 0.85 },
        { success: true, coverage: 0.90 },
        { success: false, coverage: 0.50 },
        { success: true, coverage: 0.88 },
        { success: false, coverage: 0.45 }
      ];

      for (let i = 0; i < experiences.length; i++) {
        const exp = experiences[i];
        const task = {
          id: `stats-task-${i}`,
          type: 'test-generation',
          context: {},
          requirements: { capabilities: ['testing'] }
        };

        const result: TaskResult = {
          success: exp.success,
          executionTime: 1500,
          errors: exp.success ? [] : [{ message: 'Test failed' }],
          coverage: exp.coverage,
          metadata: {
            strategy: 'template-based',
            toolsUsed: ['jest'],
            parallelization: 0.5,
            retryPolicy: 'exponential',
            resourceAllocation: 0.5
          }
        };

        await learningEngine.recordExperience(task, result);
      }

      // Get statistics from database
      const stats = await database.getLearningStatistics(agentId);

      expect(stats.totalExperiences).toBe(5);
      // Verify average reward is positive (more successes than failures: 3 vs 2)
      expect(stats.avgReward).toBeGreaterThan(0);
      expect(stats.avgReward).toBeLessThan(2); // Within valid reward range
      expect(stats.qTableSize).toBeGreaterThan(0);
    });
  });
});
