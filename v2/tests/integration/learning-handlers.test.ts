/**
 * Integration tests for learning persistence handlers
 *
 * Tests the fixed learning handlers after schema migration:
 * - LearningStorePatternHandler (uses patterns table)
 * - LearningStoreExperienceHandler (with metadata, created_at columns)
 * - LearningStoreQValueHandler (with metadata column, correct datetime usage)
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { LearningStorePatternHandler } from '../../src/mcp/handlers/learning/learning-store-pattern';
import { LearningStoreExperienceHandler } from '../../src/mcp/handlers/learning/learning-store-experience';
import { LearningStoreQValueHandler } from '../../src/mcp/handlers/learning/learning-store-qvalue';
import type { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { withFakeTimers, advanceAndFlush } from '../helpers/timerTestUtils';

describe('Learning Handlers Integration Tests', () => {
  let db: Database.Database;
  let mockMemoryManager: SwarmMemoryManager;
  const testDbPath = path.join(__dirname, '../temp/test-learning-handlers.db');

  beforeAll(() => {
    // Ensure temp directory exists
    const tempDir = path.dirname(testDbPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Remove existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create test database with schema
    db = new Database(testDbPath);

    // Create patterns table (matching memory.db schema + migration)
    db.prepare(`
      CREATE TABLE patterns (
        id TEXT PRIMARY KEY,
        pattern TEXT NOT NULL,
        confidence REAL NOT NULL,
        usage_count INTEGER NOT NULL,
        metadata TEXT,
        ttl INTEGER NOT NULL,
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        agent_id TEXT,
        domain TEXT DEFAULT 'general',
        success_rate REAL DEFAULT 1.0
      )
    `).run();

    // Create learning_experiences table (matching memory.db schema + migration)
    db.prepare(`
      CREATE TABLE learning_experiences (
        id INTEGER PRIMARY KEY,
        agent_id TEXT NOT NULL,
        task_id TEXT,
        task_type TEXT NOT NULL,
        state TEXT NOT NULL,
        action TEXT NOT NULL,
        reward REAL NOT NULL,
        next_state TEXT NOT NULL,
        episode_id TEXT,
        timestamp DATETIME,
        metadata TEXT,
        created_at INTEGER
      )
    `).run();

    // Create q_values table (matching memory.db schema + migration)
    db.prepare(`
      CREATE TABLE q_values (
        id INTEGER PRIMARY KEY,
        agent_id TEXT NOT NULL,
        state_key TEXT NOT NULL,
        action_key TEXT NOT NULL,
        q_value REAL NOT NULL,
        update_count INTEGER,
        last_updated DATETIME,
        created_at DATETIME,
        metadata TEXT
      )
    `).run();

    // Create mock SwarmMemoryManager with database access
    mockMemoryManager = {
      db
    } as any;
  });

  afterAll(() => {
    // Close database and clean up
    if (db) {
      db.close();
    }

    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterEach(() => {
    // Clear tables between tests
    db.prepare('DELETE FROM patterns').run();
    db.prepare('DELETE FROM learning_experiences').run();
    db.prepare('DELETE FROM q_values').run();
  });

  describe('LearningStorePatternHandler', () => {
    let handler: LearningStorePatternHandler;

    beforeEach(() => {
      handler = new LearningStorePatternHandler(undefined, undefined, mockMemoryManager);
    });

    it('should store a new pattern in patterns table', async () => {
      const result = await handler.handle({
        pattern: 'Test pattern for unit testing',
        confidence: 0.9,
        agentId: 'test-agent-1',
        domain: 'unit-testing',
        usageCount: 1,
        successRate: 1.0,
        metadata: { framework: 'jest' }
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('patternId');
      expect(result.data.message).toContain('stored successfully');

      // Verify data in database
      const stored = db.prepare('SELECT * FROM patterns WHERE agent_id = ?').get('test-agent-1');
      expect(stored).toBeDefined();
      expect(stored).toMatchObject({
        pattern: 'Test pattern for unit testing',
        confidence: 0.9,
        agent_id: 'test-agent-1',
        domain: 'unit-testing',
        usage_count: 1,
        success_rate: 1.0
      });

      const metadata = JSON.parse(stored.metadata);
      expect(metadata).toEqual({ framework: 'jest' });
    });

    it('should update existing pattern with weighted averages', async () => {
      // Store initial pattern
      const firstResult = await handler.handle({
        pattern: 'Reusable pattern',
        confidence: 0.8,
        agentId: 'test-agent-2',
        domain: 'integration-testing',
        usageCount: 10,
        successRate: 0.9
      });

      expect(firstResult.success).toBe(true);

      // Update the same pattern
      const secondResult = await handler.handle({
        pattern: 'Reusable pattern',
        confidence: 1.0,
        agentId: 'test-agent-2',
        domain: 'integration-testing',
        usageCount: 5,
        successRate: 1.0
      });

      expect(secondResult.success).toBe(true);
      expect(secondResult.data.message).toContain('updated successfully');

      // Verify weighted averages
      const updated = db.prepare('SELECT * FROM patterns WHERE agent_id = ?').get('test-agent-2');
      expect(updated.usage_count).toBe(15); // 10 + 5

      // Weighted confidence: (0.8 * 10 + 1.0 * 5) / 15 = 0.867
      expect(updated.confidence).toBeCloseTo(0.867, 2);

      // Weighted success rate: (0.9 * 10 + 1.0 * 5) / 15 = 0.933
      expect(updated.success_rate).toBeCloseTo(0.933, 2);
    });

    it('should store pattern without agentId (cross-agent pattern)', async () => {
      const result = await handler.handle({
        pattern: 'Universal pattern',
        confidence: 0.95,
        domain: 'general',
        usageCount: 1,
        successRate: 1.0
      });

      expect(result.success).toBe(true);

      const stored = db.prepare('SELECT * FROM patterns WHERE pattern = ?').get('Universal pattern');
      expect(stored).toBeDefined();
      expect(stored.agent_id).toBeNull();
      expect(stored.domain).toBe('general');
    });

    it('should validate confidence range (0-1)', async () => {
      const result = await handler.handle({
        pattern: 'Invalid pattern',
        confidence: 1.5, // Invalid: > 1
        domain: 'testing'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('confidence must be a number between 0 and 1');
    });

    it('should validate pattern is non-empty string', async () => {
      const result = await handler.handle({
        pattern: '   ', // Whitespace only
        confidence: 0.9,
        domain: 'testing'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('pattern must be a non-empty string');
    });
  });

  describe('LearningStoreExperienceHandler', () => {
    let handler: LearningStoreExperienceHandler;

    beforeEach(() => {
      handler = new LearningStoreExperienceHandler(undefined, undefined, mockMemoryManager);
    });

    it('should store learning experience with all columns', async () => {
      const outcome = {
        testsGenerated: 10,
        coverage: 0.95,
        qualityScore: 0.88
      };

      const result = await handler.handle({
        agentId: 'test-agent-exp-1',
        taskType: 'test-generation',
        reward: 0.85,
        outcome,
        timestamp: Date.now(),
        metadata: { framework: 'jest', language: 'typescript' }
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('experienceId');
      expect(result.data.message).toContain('stored successfully');

      // Verify data in database
      const stored = db.prepare('SELECT * FROM learning_experiences WHERE agent_id = ?').get('test-agent-exp-1');
      expect(stored).toBeDefined();
      expect(stored.agent_id).toBe('test-agent-exp-1');
      expect(stored.task_type).toBe('test-generation');
      expect(stored.reward).toBe(0.85);

      const action = JSON.parse(stored.action);
      expect(action).toEqual(outcome);

      const metadata = JSON.parse(stored.metadata);
      expect(metadata).toEqual({ framework: 'jest', language: 'typescript' });

      expect(stored.created_at).toBeDefined();
      expect(stored.timestamp).toBeDefined();
    });

    it('should validate reward range (0-1)', async () => {
      const result = await handler.handle({
        agentId: 'test-agent-exp-2',
        taskType: 'test-execution',
        reward: 1.5, // Invalid: > 1
        outcome: { success: true }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('reward must be a number between 0 and 1');
    });

    it('should store multiple experiences for the same agent', async () => {
      const experiences = [
        { reward: 0.7, outcome: { tests: 5 } },
        { reward: 0.8, outcome: { tests: 8 } },
        { reward: 0.9, outcome: { tests: 12 } }
      ];

      for (const exp of experiences) {
        const result = await handler.handle({
          agentId: 'test-agent-exp-3',
          taskType: 'test-generation',
          ...exp
        });
        expect(result.success).toBe(true);
      }

      // Verify all stored
      const allExperiences = db.prepare('SELECT * FROM learning_experiences WHERE agent_id = ?')
        .all('test-agent-exp-3');

      expect(allExperiences).toHaveLength(3);
      expect(allExperiences.map(e => e.reward)).toEqual([0.7, 0.8, 0.9]);
    });
  });

  describe('LearningStoreQValueHandler', () => {
    let handler: LearningStoreQValueHandler;

    beforeEach(() => {
      handler = new LearningStoreQValueHandler(undefined, undefined, mockMemoryManager);
    });

    it('should store new Q-value with metadata', async () => {
      const result = await handler.handle({
        agentId: 'test-agent-qval-1',
        stateKey: 'test-gen-state',
        actionKey: 'generate-unit-tests',
        qValue: 0.9,
        updateCount: 1,
        metadata: { algorithm: 'Q-learning', alpha: 0.1 }
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('qValueId');
      expect(result.data.message).toContain('stored successfully');

      // Verify data in database
      const stored = db.prepare('SELECT * FROM q_values WHERE agent_id = ?').get('test-agent-qval-1');
      expect(stored).toBeDefined();
      expect(stored.agent_id).toBe('test-agent-qval-1');
      expect(stored.state_key).toBe('test-gen-state');
      expect(stored.action_key).toBe('generate-unit-tests');
      expect(stored.q_value).toBe(0.9);
      expect(stored.update_count).toBe(1);

      const metadata = JSON.parse(stored.metadata);
      expect(metadata).toEqual({ algorithm: 'Q-learning', alpha: 0.1 });

      expect(stored.created_at).toBeDefined();
      expect(stored.last_updated).toBeDefined();
    });

    it('should update existing Q-value with weighted average', async () => {
      await withFakeTimers(async (timers) => {
        // Store initial Q-value
        const firstResult = await handler.handle({
          agentId: 'test-agent-qval-2',
          stateKey: 'coverage-state',
          actionKey: 'analyze-gaps',
          qValue: 0.7,
          updateCount: 10
        });

        expect(firstResult.success).toBe(true);

        // Advance time to ensure timestamp difference using fake timers
        await timers.advanceAsync(100);

        // Update the same Q-value
        const secondResult = await handler.handle({
          agentId: 'test-agent-qval-2',
          stateKey: 'coverage-state',
          actionKey: 'analyze-gaps',
          qValue: 0.9,
          updateCount: 5
        });

        expect(secondResult.success).toBe(true);
        expect(secondResult.data.message).toContain('updated successfully');

        // Verify weighted average
        const updated = db.prepare('SELECT * FROM q_values WHERE agent_id = ?').get('test-agent-qval-2');
        expect(updated.update_count).toBe(15); // 10 + 5

        // Weighted Q-value: (0.7 * 10 + 0.9 * 5) / 15 = 0.767
        expect(updated.q_value).toBeCloseTo(0.767, 2);

        // Verify last_updated changed
        expect(updated.last_updated).toBeDefined();
      });
    });

    it('should handle multiple state-action pairs for same agent', async () => {
      const pairs = [
        { stateKey: 'state-1', actionKey: 'action-a', qValue: 0.7 },
        { stateKey: 'state-1', actionKey: 'action-b', qValue: 0.8 },
        { stateKey: 'state-2', actionKey: 'action-a', qValue: 0.6 }
      ];

      for (const pair of pairs) {
        const result = await handler.handle({
          agentId: 'test-agent-qval-3',
          ...pair
        });
        expect(result.success).toBe(true);
      }

      // Verify all stored
      const allQValues = db.prepare('SELECT * FROM q_values WHERE agent_id = ?')
        .all('test-agent-qval-3');

      expect(allQValues).toHaveLength(3);
      expect(allQValues.map(q => q.q_value)).toEqual([0.7, 0.8, 0.6]);
    });

    it('should validate qValue is a number', async () => {
      const result = await handler.handle({
        agentId: 'test-agent-qval-4',
        stateKey: 'test-state',
        actionKey: 'test-action',
        qValue: 'not-a-number' as any
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('qValue must be a number');
    });
  });

  describe('Cross-Handler Integration', () => {
    it('should allow storing patterns, experiences, and q-values for same agent', async () => {
      const agentId = 'test-agent-integrated';

      // Store pattern
      const patternHandler = new LearningStorePatternHandler(undefined, undefined, mockMemoryManager);
      const patternResult = await patternHandler.handle({
        pattern: 'Integration test pattern',
        confidence: 0.9,
        agentId,
        domain: 'integration-testing'
      });
      expect(patternResult.success).toBe(true);

      // Store experience
      const expHandler = new LearningStoreExperienceHandler(undefined, undefined, mockMemoryManager);
      const expResult = await expHandler.handle({
        agentId,
        taskType: 'integration-test',
        reward: 0.85,
        outcome: { success: true }
      });
      expect(expResult.success).toBe(true);

      // Store Q-value
      const qvalHandler = new LearningStoreQValueHandler(undefined, undefined, mockMemoryManager);
      const qvalResult = await qvalHandler.handle({
        agentId,
        stateKey: 'integration-state',
        actionKey: 'run-tests',
        qValue: 0.88
      });
      expect(qvalResult.success).toBe(true);

      // Verify all stored
      const patterns = db.prepare('SELECT COUNT(*) as count FROM patterns WHERE agent_id = ?').get(agentId);
      const experiences = db.prepare('SELECT COUNT(*) as count FROM learning_experiences WHERE agent_id = ?').get(agentId);
      const qvalues = db.prepare('SELECT COUNT(*) as count FROM q_values WHERE agent_id = ?').get(agentId);

      expect(patterns.count).toBe(1);
      expect(experiences.count).toBe(1);
      expect(qvalues.count).toBe(1);
    });
  });
});
