/**
 * Integration Test: Memory/Learning/Patterns Full Loop
 *
 * This test verifies the complete learning cycle for QE agents:
 * 1. Pattern storage with embeddings
 * 2. Learning experience capture
 * 3. Q-value reinforcement learning
 * 4. Memory persistence
 * 5. Pattern retrieval and similarity search
 *
 * Based on Sherlock Investigation findings from 2025-11-30
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import {
  AgentDBManager,
  AdapterType,
  SwarmMemoryManager
} from '../../src/core/memory';

const TEST_DB_DIR = '/tmp/aqe-integration-test';
const AGENTDB_PATH = path.join(TEST_DB_DIR, 'agentdb.db');
const MEMORY_DB_PATH = path.join(TEST_DB_DIR, 'memory.db');

describe('Memory/Learning/Patterns Integration', () => {
  let agentDb: AgentDBManager;
  let memoryManager: SwarmMemoryManager;

  beforeAll(async () => {
    // Clean up and create test directory
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });

    // Initialize AgentDB Manager
    agentDb = new AgentDBManager({
      adapter: {
        type: AdapterType.REAL,
        dbPath: AGENTDB_PATH,
        dimension: 384
      }
    });
    await agentDb.initialize();

    // Initialize SwarmMemoryManager
    memoryManager = new SwarmMemoryManager(MEMORY_DB_PATH);
    await memoryManager.initialize();
  }, 30000);

  afterAll(async () => {
    if (agentDb) await agentDb.close();
    if (memoryManager) await memoryManager.close();
    // Clean up test directory
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true });
    }
  });

  describe('Phase 1: Pattern Storage with Embeddings', () => {
    it('should store patterns via AgentDBManager with embeddings', async () => {
      const pattern = {
        id: 'test-pattern-001',
        type: 'test-template',
        data: {
          testName: 'should validate user input',
          assertions: ['toThrow', 'ValidationError'],
          domain: 'user-management'
        },
        confidence: 0.95,
        metadata: {
          agent_id: 'qe-test-generator',
          framework: 'jest'
        }
      };

      const patternId = await agentDb.storePattern(pattern);
      expect(patternId).toBe('test-pattern-001');

      // Verify embedding was stored
      const results = await agentDb.query(
        'SELECT id, embedding FROM patterns WHERE id = ?',
        ['test-pattern-001']
      );

      expect(results.length).toBe(1);
      expect(results[0].embedding).toBeDefined();
      expect(results[0].embedding).toBeInstanceOf(Uint8Array);
    });

    it('should store patterns via SwarmMemoryManager', async () => {
      const pattern = {
        pattern: JSON.stringify({
          type: 'coverage-gap',
          file: 'src/UserService.ts',
          uncoveredLines: [45, 67, 89]
        }),
        confidence: 0.88,
        usageCount: 0,
        metadata: {
          agent_id: 'qe-coverage-analyzer',
          priority: 'high'
        }
      };

      const patternId = await memoryManager.storePattern(pattern);
      expect(patternId).toBeDefined();
      expect(patternId).toMatch(/^pattern-/);
    });
  });

  describe('Phase 2: Learning Experience Capture', () => {
    it('should store learning experiences', async () => {
      const experience = {
        agentId: 'qe-test-generator',
        taskType: 'test-generation',
        state: JSON.stringify({ targetFile: 'UserService.ts', coverage: 0.75 }),
        action: 'generate-test',
        reward: 0.9,
        nextState: JSON.stringify({ targetFile: 'UserService.ts', coverage: 0.85 })
      };

      await memoryManager.storeLearningExperience(experience);

      // Verify experience was stored using the new getter method
      const experiences = await memoryManager.getRecentLearningExperiences(
        'qe-test-generator',
        10
      );

      expect(experiences.length).toBeGreaterThan(0);
      expect(experiences[0].reward).toBe(0.9);
    });

    it('should get learning statistics', async () => {
      // Store a few more experiences
      await memoryManager.storeLearningExperience({
        agentId: 'qe-test-generator',
        taskType: 'test-generation',
        state: JSON.stringify({ targetFile: 'AuthService.ts', coverage: 0.60 }),
        action: 'generate-test',
        reward: 0.75,
        nextState: JSON.stringify({ targetFile: 'AuthService.ts', coverage: 0.70 })
      });

      const stats = await memoryManager.getLearningStats('qe-test-generator');

      expect(stats.totalExperiences).toBeGreaterThanOrEqual(2);
      expect(stats.averageReward).toBeGreaterThan(0);
      expect(stats.maxReward).toBe(0.9);
    });

    it('should get high-reward experiences', async () => {
      const highReward = await memoryManager.getHighRewardExperiences('qe-test-generator', 0.85);

      expect(highReward.length).toBeGreaterThan(0);
      highReward.forEach(exp => {
        expect(exp.reward).toBeGreaterThanOrEqual(0.85);
      });
    });
  });

  describe('Phase 3: Q-Value Reinforcement Learning', () => {
    it('should store and update Q-values', async () => {
      // Initial Q-value
      await memoryManager.upsertQValue(
        'qe-test-generator',
        'low-coverage',
        'generate-unit-test',
        0.75
      );

      // Update Q-value (should increase update_count)
      await memoryManager.upsertQValue(
        'qe-test-generator',
        'low-coverage',
        'generate-unit-test',
        0.85
      );

      // Retrieve Q-values
      const qValues = await memoryManager.getAllQValues('qe-test-generator');

      expect(qValues.length).toBeGreaterThan(0);

      const targetQ = qValues.find(
        q => q.state_key === 'low-coverage' && q.action_key === 'generate-unit-test'
      );
      expect(targetQ).toBeDefined();
      expect(targetQ?.q_value).toBe(0.85);
      expect(targetQ?.update_count).toBeGreaterThanOrEqual(2);
    });

    it('should retrieve best action for state', async () => {
      // Store multiple Q-values for same state
      await memoryManager.upsertQValue(
        'qe-test-generator',
        'medium-coverage',
        'generate-integration-test',
        0.72
      );
      await memoryManager.upsertQValue(
        'qe-test-generator',
        'medium-coverage',
        'generate-e2e-test',
        0.65
      );

      // Use the proper getBestAction method
      const bestAction = await memoryManager.getBestAction(
        'qe-test-generator',
        'medium-coverage'
      );

      expect(bestAction).toBeDefined();
      expect(bestAction?.action_key).toBe('generate-integration-test');
      expect(bestAction?.q_value).toBe(0.72);
    });
  });

  describe('Phase 4: Memory Persistence', () => {
    it('should persist data across close/reopen cycle', async () => {
      // Store some data with proper options object
      const testKey = 'aqe/test-plan/integration-test';
      const testValue = {
        targetFile: 'integration.test.ts',
        testTypes: ['unit', 'integration'],
        priority: 'high'
      };

      await memoryManager.store(testKey, testValue, { partition: 'default', owner: 'test-agent' });

      // Close memory manager
      await memoryManager.close();

      // Reopen
      const memoryManager2 = new SwarmMemoryManager(MEMORY_DB_PATH);
      await memoryManager2.initialize();

      // Verify data persisted (get returns the parsed JSON)
      const retrieved = await memoryManager2.get(testKey);
      expect(retrieved).toEqual(testValue);

      // Clean up
      await memoryManager2.close();

      // Reinitialize for subsequent tests
      memoryManager = new SwarmMemoryManager(MEMORY_DB_PATH);
      await memoryManager.initialize();
    });
  });

  describe('Phase 5: Pattern Retrieval', () => {
    it('should retrieve patterns by agent ID', async () => {
      // Store a pattern first
      await memoryManager.storePattern({
        pattern: JSON.stringify({
          type: 'assertion-pattern',
          assertion: 'expect().toThrow()',
          domain: 'error-handling'
        }),
        confidence: 0.90,
        usageCount: 5,
        metadata: {
          agent_id: 'qe-test-generator',
          framework: 'jest'
        }
      });

      const patterns = await memoryManager.queryPatternsByAgent('qe-test-generator', 0.5);

      expect(patterns.length).toBeGreaterThan(0);
      // Patterns return snake_case field names
      expect(patterns[0].confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('should query memory entries by pattern', async () => {
      // Store some memory entries with proper options object
      await memoryManager.store(
        'aqe/coverage/file1',
        { coverage: 0.85 },
        { partition: 'default', owner: 'coverage-agent' }
      );
      await memoryManager.store(
        'aqe/coverage/file2',
        { coverage: 0.72 },
        { partition: 'default', owner: 'coverage-agent' }
      );

      // Query with LIKE pattern - partition defaults to 'default'
      const results = await memoryManager.query('aqe/coverage/%', {
        partition: 'default'
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Phase 6: Vector Similarity Search (via AgentDB)', () => {
    it('should store multiple patterns with embeddings', async () => {
      const patterns = [
        {
          id: 'similar-001',
          type: 'test-pattern',
          data: { testName: 'user authentication test' },
          confidence: 0.9,
          metadata: {}
        },
        {
          id: 'similar-002',
          type: 'test-pattern',
          data: { testName: 'user authorization test' },
          confidence: 0.85,
          metadata: {}
        },
        {
          id: 'similar-003',
          type: 'test-pattern',
          data: { testName: 'database connection test' },
          confidence: 0.8,
          metadata: {}
        }
      ];

      for (const pattern of patterns) {
        await agentDb.storePattern(pattern);
      }

      // Verify all patterns have embeddings
      const results = await agentDb.query(
        'SELECT id, embedding FROM patterns WHERE id LIKE ?',
        ['similar-%']
      );

      expect(results.length).toBe(3);
      results.forEach(r => {
        expect(r.embedding).toBeDefined();
        expect(r.embedding).toBeInstanceOf(Uint8Array);
      });
    });
  });

  describe('Phase 7: Full Learning Loop Simulation', () => {
    it('should simulate a complete QE agent learning cycle', async () => {
      const agentId = 'qe-test-generator-loop';
      const iterations = 3;

      for (let i = 0; i < iterations; i++) {
        // 1. Store pattern discovered during test generation
        const patternId = await memoryManager.storePattern({
          pattern: JSON.stringify({
            type: 'learned-pattern',
            iteration: i,
            discovery: `Pattern discovered in iteration ${i}`
          }),
          confidence: 0.7 + (i * 0.1), // Increasing confidence over iterations
          usageCount: i,
          metadata: { agent_id: agentId }
        });
        expect(patternId).toBeDefined();

        // 2. Store learning experience
        await memoryManager.storeLearningExperience({
          agentId,
          taskType: 'test-generation',
          state: JSON.stringify({ iteration: i, patterns: i }),
          action: 'generate-test',
          reward: 0.5 + (i * 0.15), // Improving reward over iterations
          nextState: JSON.stringify({ iteration: i + 1, patterns: i + 1 })
        });

        // 3. Update Q-value based on experience
        await memoryManager.upsertQValue(
          agentId,
          `state-${i}`,
          'generate-test',
          0.5 + (i * 0.15)
        );
      }

      // Verify learning progress
      const experiences = await memoryManager.getRecentLearningExperiences(agentId, 10);
      expect(experiences.length).toBe(iterations);

      const qValues = await memoryManager.getAllQValues(agentId);
      expect(qValues.length).toBe(iterations);

      // Verify rewards improved over iterations
      const sortedExperiences = experiences.sort((a, b) =>
        JSON.parse(a.state).iteration - JSON.parse(b.state).iteration
      );
      expect(sortedExperiences[sortedExperiences.length - 1].reward).toBeGreaterThan(
        sortedExperiences[0].reward
      );
    });
  });
});
