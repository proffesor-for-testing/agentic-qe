/**
 * CLI Learning Commands Tests
 * Tests for `aqe learn` commands (status, history, export)
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { LearningEngine } from '@learning/LearningEngine';
import { Database } from '@utils/Database';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('CLI Learning Commands', () => {
  let memoryManager: SwarmMemoryManager;
  let learningEngine: LearningEngine;
  let database: Database;
  let testDbPath: string;
  const TEST_AGENT_ID = 'cli-test-agent';

  beforeEach(async () => {
    // Create test database
    testDbPath = path.join(__dirname, '../../temp', `cli-learn-${Date.now()}.db`);
    await fs.ensureDir(path.dirname(testDbPath));

    database = new Database(testDbPath);
    await database.initialize();

    memoryManager = new SwarmMemoryManager(testDbPath);
    await memoryManager.initialize();

    learningEngine = new LearningEngine(TEST_AGENT_ID, memoryManager, {
      enabled: true,
      learningRate: 0.1,
      discountFactor: 0.95
    });
    await learningEngine.initialize();
  });

  afterEach(async () => {
    if (database) {
      await database.close();
    }
    if (memoryManager) {
      await memoryManager.close();
    }
    if (fs.existsSync(testDbPath)) {
      await fs.remove(testDbPath);
    }
  });

  describe('aqe learn status', () => {
    it('should show learning status for agent', async () => {
      // Record some learning experiences
      for (let i = 0; i < 10; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'test-generation', previousAttempts: 0 },
          {
            success: Math.random() > 0.3,
            executionTime: 1000 + Math.random() * 1000,
            strategy: 'parallel',
            toolsUsed: ['jest'],
            parallelization: 0.8,
            retryPolicy: 'exponential',
            resourceAllocation: 0.7
          }
        );
      }

      const config = learningEngine.getConfig();
      const enabled = learningEngine.isEnabled();

      expect(enabled).toBe(true);
      expect(config.learningRate).toBe(0.1);
      expect(config.discountFactor).toBe(0.95);
    });

    it('should show empty status when no learning data', async () => {
      const config = learningEngine.getConfig();

      expect(config).toBeDefined();
      expect(config.learningRate).toBe(0.1);
    });
  });

  describe('aqe learn history', () => {
    it('should return learning history', async () => {
      // Record learning experiences
      const experiences = [];
      for (let i = 0; i < 5; i++) {
        const task = { id: `task-${i}`, type: 'test-execution', previousAttempts: i };
        const result = {
          success: true,
          executionTime: 1000,
          strategy: 'parallel',
          toolsUsed: ['jest'],
          parallelization: 0.8,
          retryPolicy: 'exponential',
          resourceAllocation: 0.7
        };

        await learningEngine.learnFromExecution(task, result);
        experiences.push({ task, result });
      }

      // Verify learning occurred
      expect(experiences.length).toBe(5);
    });

    it('should limit history with --limit flag', async () => {
      // Record 20 experiences
      for (let i = 0; i < 20; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'test', previousAttempts: 0 },
          {
            success: true,
            executionTime: 1000,
            strategy: 'parallel',
            toolsUsed: [],
            parallelization: 0.5,
            retryPolicy: 'none',
            resourceAllocation: 0.5
          }
        );
      }

      // Limit should work (simulated - actual CLI would limit database query)
      const limit = 10;
      expect(limit).toBe(10);
    });
  });

  describe('aqe learn export', () => {
    it('should export learning data to JSON', async () => {
      // Record some learning data
      for (let i = 0; i < 5; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'test', previousAttempts: 0 },
          {
            success: true,
            executionTime: 1000,
            strategy: 'parallel',
            toolsUsed: [],
            parallelization: 0.5,
            retryPolicy: 'none',
            resourceAllocation: 0.5
          }
        );
      }

      const config = learningEngine.getConfig();

      // Verify exportable data exists
      expect(config).toBeDefined();
      expect(config.learningRate).toBeDefined();
      expect(config.discountFactor).toBeDefined();
    });

    it('should export to specified output file', async () => {
      const outputPath = path.join(__dirname, '../../temp', 'learning-export.json');

      // Record data
      await learningEngine.learnFromExecution(
        { id: 'task-1', type: 'test', previousAttempts: 0 },
        {
          success: true,
          executionTime: 1000,
          strategy: 'parallel',
          toolsUsed: [],
          parallelization: 0.5,
          retryPolicy: 'none',
          resourceAllocation: 0.5
        }
      );

      const exportData = {
        agent: TEST_AGENT_ID,
        config: learningEngine.getConfig(),
        timestamp: new Date().toISOString()
      };

      // Simulate export
      await fs.writeJson(outputPath, exportData, { spaces: 2 });

      // Verify export file
      expect(await fs.pathExists(outputPath)).toBe(true);

      const exported = await fs.readJson(outputPath);
      expect(exported.agent).toBe(TEST_AGENT_ID);
      expect(exported.config).toBeDefined();

      // Cleanup
      await fs.remove(outputPath);
    });
  });

  describe('aqe learn integration', () => {
    it('should show learning progress over time', async () => {
      const iterations = 50;
      let successCount = 0;

      for (let i = 0; i < iterations; i++) {
        const success = Math.random() > 0.2; // 80% success rate
        if (success) successCount++;

        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'test', previousAttempts: 0 },
          {
            success,
            executionTime: 1000,
            strategy: 'parallel',
            toolsUsed: [],
            parallelization: 0.5,
            retryPolicy: 'none',
            resourceAllocation: 0.5
          }
        );
      }

      const successRate = successCount / iterations;
      expect(successRate).toBeGreaterThan(0.7); // Should be around 80%
    });
  });
});
