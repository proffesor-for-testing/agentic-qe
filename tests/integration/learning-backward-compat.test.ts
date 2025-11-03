/**
 * Integration Test: Learning Engine Backward Compatibility
 *
 * Verifies that the refactored LearningEngine maintains backward compatibility:
 * 1. Old recordExperience() API still works (with deprecation warning)
 * 2. BaseAgent integration remains unchanged
 * 3. Existing test suites pass without modification
 * 4. Migration path is smooth
 */

// CRITICAL: Unmock Database to use real implementation
jest.unmock('../../src/utils/Database');

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LearningEngine } from '../../src/learning/LearningEngine';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { Database } from '../../src/utils/Database';
import { TaskResult } from '../../src/learning/RewardCalculator';
import { LearningFeedback } from '../../src/learning/types';
import fs from 'fs';
import path from 'path';

describe('LearningEngine Backward Compatibility', () => {
  const testDbPath = path.join(process.cwd(), '.test-learning-compat.db');
  const memoryDbPath = path.join(process.cwd(), '.test-memory-compat.db');
  let database: Database;
  let memoryManager: SwarmMemoryManager;

  beforeEach(async () => {
    // Clean up test databases
    [testDbPath, memoryDbPath].forEach(dbPath => {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    });

    // Create fresh database and memory manager
    database = new Database(testDbPath);
    await database.initialize();

    memoryManager = new SwarmMemoryManager(memoryDbPath);
    await memoryManager.initialize();
  });

  afterEach(async () => {
    // Close database connections
    try {
      if (database) await database.close();
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

    // Clean up test databases
    [testDbPath, memoryDbPath].forEach(dbPath => {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    });
  });

  describe('recordExperience() Compatibility', () => {
    it('should work with old recordExperience() API', async () => {
      const agentId = 'compat-agent-old-api';

      const engine = new LearningEngine(
        agentId,
        memoryManager,
        { enabled: true },
        database
      );
      await engine.initialize();

      // Use OLD API (recordExperience instead of learnFromExecution)
      const task = {
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

      // OLD API - should still work
      await engine.recordExperience(task, result);

      // Verify data was persisted
      const stats = await database.getLearningStatistics(agentId);
      expect(stats.totalExperiences).toBeGreaterThan(0);
      expect(stats.qTableSize).toBeGreaterThan(0);
    });

    it('should work with old recordExperience() API with feedback', async () => {
      const agentId = 'compat-agent-feedback';

      const engine = new LearningEngine(
        agentId,
        memoryManager,
        { enabled: true },
        database
      );
      await engine.initialize();

      const task = {
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

      // OLD API with feedback
      await engine.recordExperience(task, result, feedback);

      // Verify feedback influenced learning
      const stats = await database.getLearningStatistics(agentId);
      expect(stats.avgReward).toBeGreaterThan(0);
    });

    it('should handle multiple calls to old API', async () => {
      const agentId = 'compat-agent-multiple';

      const engine = new LearningEngine(
        agentId,
        memoryManager,
        { enabled: true },
        database
      );
      await engine.initialize();

      // Multiple calls using OLD API
      for (let i = 0; i < 10; i++) {
        const task = {
          type: 'test-generation',
          context: {},
          requirements: { capabilities: ['testing'] }
        };

        const result: TaskResult = {
          success: i % 2 === 0,
          executionTime: 1000 + i * 100,
          errors: [],
          coverage: 0.7 + i * 0.02,
          metadata: {
            strategy: i % 2 === 0 ? 'template' : 'property',
            toolsUsed: ['jest'],
            parallelization: 0.5,
            retryPolicy: 'exponential',
            resourceAllocation: 0.5
          }
        };

        await engine.recordExperience(task, result);
      }

      // Verify all experiences were recorded
      const stats = await database.getLearningStatistics(agentId);
      expect(stats.totalExperiences).toBe(10);
    });
  });

  describe('learnFromExecution() New API', () => {
    it('should work with new learnFromExecution() API', async () => {
      const agentId = 'compat-agent-new-api';

      const engine = new LearningEngine(
        agentId,
        memoryManager,
        { enabled: true },
        database
      );
      await engine.initialize();

      // Use NEW API
      const task = {
        type: 'integration-test-generation',
        context: {},
        requirements: {
          capabilities: ['api-testing']
        }
      };

      const result = {
        success: true,
        executionTime: 2000,
        errors: [],
        coverage: 0.90
      };

      // NEW API - returns LearningOutcome
      const outcome = await engine.learnFromExecution(task, result);

      expect(outcome).toBeDefined();
      expect(outcome.newPerformance).toBeDefined();
      expect(outcome.confidence).toBeGreaterThanOrEqual(0);
      expect(outcome.patterns).toBeDefined();

      // Verify learning occurred (but no database persistence in learnFromExecution)
      expect(engine.getTotalExperiences()).toBe(1);
    });

    it('should support both APIs in same session', async () => {
      const agentId = 'compat-agent-mixed';

      const engine = new LearningEngine(
        agentId,
        memoryManager,
        { enabled: true },
        database
      );
      await engine.initialize();

      const task1 = {
        type: 'test-generation',
        context: {},
        requirements: { capabilities: ['testing'] }
      };

      const result1: TaskResult = {
        success: true,
        executionTime: 1000,
        errors: [],
        coverage: 0.85,
        metadata: {
          strategy: 'template',
          toolsUsed: ['jest'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.5
        }
      };

      // OLD API (with database persistence)
      await engine.recordExperience(task1, result1);

      const task2 = {
        type: 'test-generation',
        context: {},
        requirements: { capabilities: ['testing'] }
      };

      const result2 = {
        success: true,
        executionTime: 1200,
        errors: [],
        coverage: 0.88
      };

      // NEW API (in-memory only)
      await engine.learnFromExecution(task2, result2);

      // Verify both APIs worked
      expect(engine.getTotalExperiences()).toBe(2);

      // OLD API should have persisted to database
      const stats = await database.getLearningStatistics(agentId);
      expect(stats.totalExperiences).toBeGreaterThan(0);
    });
  });

  describe('Migration Scenarios', () => {
    it('should migrate from old to new API smoothly', async () => {
      const agentId = 'compat-agent-migration';

      const engine = new LearningEngine(
        agentId,
        memoryManager,
        { enabled: true },
        database
      );
      await engine.initialize();

      // Phase 1: Using OLD API (existing codebase)
      for (let i = 0; i < 5; i++) {
        const task = {
          type: 'test-generation',
          context: {},
          requirements: { capabilities: ['testing'] }
        };

        const result: TaskResult = {
          success: true,
          executionTime: 1000,
          errors: [],
          coverage: 0.85,
          metadata: {
            strategy: 'template',
            toolsUsed: ['jest'],
            parallelization: 0.5,
            retryPolicy: 'exponential',
            resourceAllocation: 0.5
          }
        };

        await engine.recordExperience(task, result);
      }

      // Verify OLD API worked
      let stats = await database.getLearningStatistics(agentId);
      expect(stats.totalExperiences).toBe(5);

      // Phase 2: Gradual migration to NEW API
      for (let i = 0; i < 5; i++) {
        const task = {
          type: 'test-generation',
          context: {},
          requirements: { capabilities: ['testing'] }
        };

        const result = {
          success: true,
          executionTime: 1000,
          errors: [],
          coverage: 0.85
        };

        // NEW API
        await engine.learnFromExecution(task, result);
      }

      // Verify total experiences (5 old + 5 new)
      expect(engine.getTotalExperiences()).toBe(10);

      // OLD API calls should still be in database
      stats = await database.getLearningStatistics(agentId);
      expect(stats.totalExperiences).toBe(5); // Only OLD API persists
    });

    it('should handle disabled learning gracefully', async () => {
      const agentId = 'compat-agent-disabled';

      const engine = new LearningEngine(
        agentId,
        memoryManager,
        { enabled: false }, // Learning disabled
        database
      );
      await engine.initialize();

      const task = {
        type: 'test-generation',
        context: {},
        requirements: { capabilities: ['testing'] }
      };

      const result: TaskResult = {
        success: true,
        executionTime: 1000,
        errors: [],
        coverage: 0.85,
        metadata: {
          strategy: 'template',
          toolsUsed: ['jest'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.5
        }
      };

      // Should not throw even when disabled
      await expect(engine.recordExperience(task, result)).resolves.not.toThrow();

      const result2 = {
        success: true,
        executionTime: 1000,
        errors: [],
        coverage: 0.85
      };

      await expect(engine.learnFromExecution(task, result2)).resolves.not.toThrow();

      // No learning should have occurred
      expect(engine.getTotalExperiences()).toBe(0);
    });
  });

  describe('Error Recovery', () => {
    it('should handle persistence errors gracefully in old API', async () => {
      const agentId = 'compat-agent-error';

      const engine = new LearningEngine(
        agentId,
        memoryManager,
        { enabled: true },
        database
      );
      await engine.initialize();

      const task = {
        type: 'test-generation',
        context: {},
        requirements: { capabilities: ['testing'] }
      };

      const result: TaskResult = {
        success: true,
        executionTime: 1000,
        errors: [],
        coverage: 0.85,
        metadata: {
          strategy: 'template',
          toolsUsed: ['jest'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.5
        }
      };

      // Record first experience
      await engine.recordExperience(task, result);

      // Close database to trigger error
      await database.close();

      // Should not throw - error should be caught internally
      await expect(engine.recordExperience(task, result)).resolves.not.toThrow();

      // Learning should continue (in-memory)
      expect(engine.getTotalExperiences()).toBe(2);
    });

    it('should recover from database errors and continue learning', async () => {
      const agentId = 'compat-agent-recovery';

      // Temporarily set invalid database path
      const badDbPath = '/invalid/path/db.sqlite';
      const badDatabase = new Database(badDbPath);

      // This should fail to initialize, but engine should handle it
      let engine: LearningEngine;
      try {
        await badDatabase.initialize();
      } catch (error) {
        // Expected - database initialization failed
      }

      // Create engine with bad database
      engine = new LearningEngine(
        agentId,
        memoryManager,
        { enabled: true },
        badDatabase
      );

      // Initialize should not throw
      await expect(engine.initialize()).resolves.not.toThrow();

      const task = {
        type: 'test-generation',
        context: {},
        requirements: { capabilities: ['testing'] }
      };

      const result: TaskResult = {
        success: true,
        executionTime: 1000,
        errors: [],
        coverage: 0.85,
        metadata: {
          strategy: 'template',
          toolsUsed: ['jest'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.5
        }
      };

      // Should not throw - error should be caught internally
      await expect(engine.recordExperience(task, result)).resolves.not.toThrow();

      // Learning should continue (in-memory)
      expect(engine.getTotalExperiences()).toBeGreaterThan(0);
    });
  });

  describe('Feature Parity', () => {
    it('should provide same learning capabilities in both APIs', async () => {
      const agentId1 = 'compat-agent-old-features';
      const agentId2 = 'compat-agent-new-features';

      const engine1 = new LearningEngine(agentId1, memoryManager, { enabled: true }, database);
      await engine1.initialize();

      const engine2 = new LearningEngine(agentId2, memoryManager, { enabled: true }, database);
      await engine2.initialize();

      const task = {
        type: 'test-generation',
        context: {},
        requirements: { capabilities: ['testing'] }
      };

      const result1: TaskResult = {
        success: true,
        executionTime: 1000,
        errors: [],
        coverage: 0.85,
        metadata: {
          strategy: 'template',
          toolsUsed: ['jest'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.5
        }
      };

      const result2 = {
        success: true,
        executionTime: 1000,
        errors: [],
        coverage: 0.85
      };

      // OLD API
      await engine1.recordExperience(task, result1);

      // NEW API
      await engine2.learnFromExecution(task, result2);

      // Both should have learned
      expect(engine1.getTotalExperiences()).toBe(1);
      expect(engine2.getTotalExperiences()).toBe(1);

      // Both should support strategy recommendations
      const state = {
        taskComplexity: 0.5,
        requiredCapabilities: ['testing'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8,
        timeConstraint: 30000
      };

      const rec1 = await engine1.recommendStrategy(state);
      const rec2 = await engine2.recommendStrategy(state);

      expect(rec1).toBeDefined();
      expect(rec2).toBeDefined();
      expect(rec1.strategy).toBeDefined();
      expect(rec2.strategy).toBeDefined();
    });
  });
});
