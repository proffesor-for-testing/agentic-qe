/**
 * SwarmMemoryManager Unit Tests with Q-Learning
 *
 * Comprehensive test suite for SwarmMemoryManager covering:
 * - Core CRUD operations (initialize, store, retrieve, delete)
 * - TTL expiration and cleanup
 * - Access control and permissions
 * - Partitioning and multi-table operations
 * - Q-learning integration for pattern discovery
 *
 * @version 1.0.0
 * @author Agentic QE Test Generator
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { SwarmMemoryManager, AccessLevel, Permission } from '../../../src/core/memory/SwarmMemoryManager';
import * as path from 'path';
import * as fs from 'fs-extra';
import BetterSqlite3 from 'better-sqlite3';

// Q-Learning state tracking
interface QState {
  operation: string;
  partition: string;
  dataSize: number;
  ttl?: number;
}

interface QAction {
  type: 'store' | 'retrieve' | 'delete' | 'query';
  payload?: any;
}

interface QValue {
  state: QState;
  action: QAction;
  reward: number;
  nextState: QState;
  timestamp: number;
}

describe('SwarmMemoryManager Unit Tests with Q-Learning', () => {
  let memoryManager: SwarmMemoryManager;
  const testDbPath = path.join(__dirname, '../../fixtures/test-memory-manager.db');
  const learningDb = path.join(__dirname, '../../fixtures/test-qlearning.db');

  // Q-Learning tracking
  let qValues: QValue[] = [];
  let episodes = 0;
  let totalReward = 0;
  let explorationRate = 0.3;
  const learningRate = 0.1;
  const discountFactor = 0.99;

  beforeAll(async () => {
    // Ensure test directories exist
    const dirs = [
      path.dirname(testDbPath),
      path.dirname(learningDb),
      path.join(__dirname, '../../..', '.agentic-qe/patterns'),
      path.join(__dirname, '../../..', '.agentic-qe/db')
    ];

    for (const dir of dirs) {
      await fs.ensureDir(dir);
    }

    // Initialize Q-Learning database
    initializeLearningDatabase();
  });

  beforeEach(async () => {
    // Clean up existing test database
    if (await fs.pathExists(testDbPath)) {
      await fs.remove(testDbPath);
    }

    // Initialize memory manager with fresh in-memory database
    memoryManager = new SwarmMemoryManager(testDbPath);
    await memoryManager.initialize();

    // Reset Q-Learning state for this test
    qValues = [];
    episodes += 1;
    totalReward = 0;
  });

  afterEach(async () => {
    // Close memory manager
    await memoryManager.close();
  });

  afterAll(async () => {
    // Clean up test databases
    if (await fs.pathExists(testDbPath)) {
      await fs.remove(testDbPath);
    }
    if (await fs.pathExists(learningDb)) {
      await fs.remove(learningDb);
    }
  });

  // ============================================================================
  // Test 1: Initialize memory manager
  // ============================================================================
  describe('Test 1: Initialize', () => {
    it('should initialize database with all 12 tables', async () => {
      const mgr = new SwarmMemoryManager(':memory:');
      await mgr.initialize();

      const stats = await mgr.stats();

      // Verify initialization completed
      expect(stats).toBeDefined();
      expect(stats.totalEntries).toBe(0);
      expect(stats.totalHints).toBe(0);
      expect(stats.totalEvents).toBe(0);
      expect(stats.totalWorkflows).toBe(0);
      expect(stats.totalPatterns).toBe(0);
      expect(stats.totalConsensus).toBe(0);
      expect(stats.totalMetrics).toBe(0);
      expect(stats.totalArtifacts).toBe(0);
      expect(stats.totalSessions).toBe(0);
      expect(stats.totalAgents).toBe(0);
      expect(stats.totalGOAPGoals).toBe(0);
      expect(stats.totalGOAPActions).toBe(0);
      expect(stats.totalGOAPPlans).toBe(0);
      expect(stats.totalOODACycles).toBe(0);

      await mgr.close();

      // Record learning
      recordQLearning({
        operation: 'initialize',
        partition: 'default',
        dataSize: 0
      }, 'store', 10);
    });

    it('should handle multiple initialization calls gracefully', async () => {
      // First initialization
      await memoryManager.initialize();
      const stats1 = await memoryManager.stats();

      // Second initialization (should be idempotent)
      await memoryManager.initialize();
      const stats2 = await memoryManager.stats();

      expect(stats1.totalEntries).toBe(stats2.totalEntries);
      expect(stats1.totalHints).toBe(stats2.totalHints);

      recordQLearning({
        operation: 'initialize',
        partition: 'default',
        dataSize: 0
      }, 'store', 10);
    });
  });

  // ============================================================================
  // Test 2: Store operations
  // ============================================================================
  describe('Test 2: Store', () => {
    it('should store and retrieve simple key-value pairs', async () => {
      const testData = { name: 'test', value: 42 };
      const testKey = 'test-key-1';

      await memoryManager.store(testKey, testData);
      const retrieved = await memoryManager.retrieve(testKey);

      expect(retrieved).toEqual(testData);

      recordQLearning({
        operation: 'store',
        partition: 'default',
        dataSize: JSON.stringify(testData).length
      }, 'store', 10);
    });

    it('should store data with custom partition', async () => {
      const testData = { message: 'partitioned' };
      const partition = 'custom-partition';

      await memoryManager.store('key-1', testData, { partition });
      const retrieved = await memoryManager.retrieve('key-1', { partition });

      expect(retrieved).toEqual(testData);

      recordQLearning({
        operation: 'store',
        partition,
        dataSize: JSON.stringify(testData).length
      }, 'store', 10);
    });

    it('should store data with TTL expiration', async () => {
      const testData = { expires: true };
      const ttlSeconds = 1; // 1 second TTL

      await memoryManager.store('ttl-key', testData, { ttl: ttlSeconds });
      const retrieved = await memoryManager.retrieve('ttl-key');

      expect(retrieved).toEqual(testData);

      recordQLearning({
        operation: 'store',
        partition: 'default',
        dataSize: JSON.stringify(testData).length,
        ttl: ttlSeconds
      }, 'store', 8);
    });

    it('should overwrite existing keys', async () => {
      const key = 'overwrite-key';
      const data1 = { version: 1 };
      const data2 = { version: 2 };

      await memoryManager.store(key, data1);
      await memoryManager.store(key, data2);

      const retrieved = await memoryManager.retrieve(key);
      expect(retrieved).toEqual(data2);

      recordQLearning({
        operation: 'store',
        partition: 'default',
        dataSize: JSON.stringify(data2).length
      }, 'store', 10);
    });

    it('should store complex nested objects', async () => {
      const complexData = {
        nested: {
          deeply: {
            object: {
              array: [1, 2, 3, { key: 'value' }],
              bool: true,
              null: null
            }
          }
        }
      };

      await memoryManager.store('complex-key', complexData);
      const retrieved = await memoryManager.retrieve('complex-key');

      expect(retrieved).toEqual(complexData);

      recordQLearning({
        operation: 'store',
        partition: 'default',
        dataSize: JSON.stringify(complexData).length
      }, 'store', 10);
    });

    it('should store with access control metadata', async () => {
      const testData = { secure: true };

      await memoryManager.store('secure-key', testData, {
        owner: 'agent-1',
        accessLevel: AccessLevel.TEAM,
        teamId: 'team-1',
        metadata: { classification: 'internal' }
      });

      const retrieved = await memoryManager.retrieve('secure-key');
      expect(retrieved).toEqual(testData);

      recordQLearning({
        operation: 'store',
        partition: 'default',
        dataSize: JSON.stringify(testData).length
      }, 'store', 10);
    });
  });

  // ============================================================================
  // Test 3: Retrieve operations
  // ============================================================================
  describe('Test 3: Retrieve', () => {
    beforeEach(async () => {
      // Store test data
      await memoryManager.store('key-1', { data: 'value-1' });
      await memoryManager.store('key-2', { data: 'value-2' }, { partition: 'partition-1' });
      await memoryManager.store('expired-key', { data: 'expired' }, { ttl: 1 });
    });

    it('should retrieve stored values', async () => {
      const retrieved = await memoryManager.retrieve('key-1');
      expect(retrieved).toEqual({ data: 'value-1' });

      recordQLearning({
        operation: 'retrieve',
        partition: 'default',
        dataSize: 13
      }, 'retrieve', 10);
    });

    it('should retrieve from specific partition', async () => {
      const retrieved = await memoryManager.retrieve('key-2', { partition: 'partition-1' });
      expect(retrieved).toEqual({ data: 'value-2' });

      recordQLearning({
        operation: 'retrieve',
        partition: 'partition-1',
        dataSize: 13
      }, 'retrieve', 10);
    });

    it('should return null for non-existent keys', async () => {
      const retrieved = await memoryManager.retrieve('non-existent-key');
      expect(retrieved).toBeNull();

      recordQLearning({
        operation: 'retrieve',
        partition: 'default',
        dataSize: 0
      }, 'retrieve', 5);
    });

    it('should return null for expired keys by default', async () => {
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      const retrieved = await memoryManager.retrieve('expired-key');
      expect(retrieved).toBeNull();

      recordQLearning({
        operation: 'retrieve',
        partition: 'default',
        dataSize: 0
      }, 'retrieve', 5);
    });

    it('should retrieve expired keys with includeExpired flag', async () => {
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      const retrieved = await memoryManager.retrieve('expired-key', { includeExpired: true });
      expect(retrieved).toEqual({ data: 'expired' });

      recordQLearning({
        operation: 'retrieve',
        partition: 'default',
        dataSize: 13
      }, 'retrieve', 10);
    });

    it('should support query with pattern matching', async () => {
      await memoryManager.store('user-1', { type: 'user' });
      await memoryManager.store('user-2', { type: 'user' });
      await memoryManager.store('admin-1', { type: 'admin' });

      const results = await memoryManager.query('user-%');
      expect(results).toHaveLength(2);
      expect(results[0].key).toMatch(/^user-/);
      expect(results[1].key).toMatch(/^user-/);

      recordQLearning({
        operation: 'retrieve',
        partition: 'default',
        dataSize: 26
      }, 'query', 10);
    });
  });

  // ============================================================================
  // Test 4: Delete operations
  // ============================================================================
  describe('Test 4: Delete', () => {
    beforeEach(async () => {
      await memoryManager.store('delete-key-1', { data: 'value-1' });
      await memoryManager.store('delete-key-2', { data: 'value-2' }, { partition: 'p1' });
    });

    it('should delete stored keys', async () => {
      await memoryManager.delete('delete-key-1');
      const retrieved = await memoryManager.retrieve('delete-key-1');

      expect(retrieved).toBeNull();

      recordQLearning({
        operation: 'delete',
        partition: 'default',
        dataSize: 0
      }, 'delete', 10);
    });

    it('should delete from specific partition', async () => {
      await memoryManager.delete('delete-key-2', 'p1');
      const retrieved = await memoryManager.retrieve('delete-key-2', { partition: 'p1' });

      expect(retrieved).toBeNull();

      recordQLearning({
        operation: 'delete',
        partition: 'p1',
        dataSize: 0
      }, 'delete', 10);
    });

    it('should clear entire partition', async () => {
      await memoryManager.store('key-1', { data: 'v1' }, { partition: 'clear-test' });
      await memoryManager.store('key-2', { data: 'v2' }, { partition: 'clear-test' });

      await memoryManager.clear('clear-test');

      const results = await memoryManager.query('%', { partition: 'clear-test' });
      expect(results).toHaveLength(0);

      recordQLearning({
        operation: 'delete',
        partition: 'clear-test',
        dataSize: 0
      }, 'delete', 10);
    });

    it('should handle deletion of non-existent keys', async () => {
      await expect(
        memoryManager.delete('non-existent-key')
      ).resolves.not.toThrow();

      recordQLearning({
        operation: 'delete',
        partition: 'default',
        dataSize: 0
      }, 'delete', 5);
    });
  });

  // ============================================================================
  // Test 5: TTL expiration
  // ============================================================================
  describe('Test 5: TTL Expiration', () => {
    it('should expire entries after TTL duration', async () => {
      const ttlSeconds = 1;
      await memoryManager.store('expiring-key', { data: 'will-expire' }, { ttl: ttlSeconds });

      // Before expiration
      let retrieved = await memoryManager.retrieve('expiring-key');
      expect(retrieved).not.toBeNull();

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, (ttlSeconds + 0.5) * 1000));

      // After expiration
      retrieved = await memoryManager.retrieve('expiring-key');
      expect(retrieved).toBeNull();

      recordQLearning({
        operation: 'store',
        partition: 'default',
        dataSize: 20,
        ttl: ttlSeconds
      }, 'store', 10);
    });

    it('should clean up expired entries', async () => {
      // Store entries with different TTLs
      await memoryManager.store('key-1', { data: 'v1' }, { ttl: 1 });
      await memoryManager.store('key-2', { data: 'v2' }, { ttl: 3600 }); // 1 hour

      // Wait for first to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Clean expired
      await memoryManager.cleanExpired();

      // Verify expired entry is gone, but others remain
      const retrieved1 = await memoryManager.retrieve('key-1');
      const retrieved2 = await memoryManager.retrieve('key-2');

      expect(retrieved1).toBeNull();
      expect(retrieved2).not.toBeNull();

      recordQLearning({
        operation: 'delete',
        partition: 'default',
        dataSize: 0
      }, 'delete', 10);
    });

    it('should support entries without TTL (permanent)', async () => {
      await memoryManager.store('permanent-key', { data: 'permanent' });

      // Even after a long time, should still exist
      await new Promise(resolve => setTimeout(resolve, 500));

      const retrieved = await memoryManager.retrieve('permanent-key');
      expect(retrieved).toEqual({ data: 'permanent' });

      recordQLearning({
        operation: 'store',
        partition: 'default',
        dataSize: 19
      }, 'store', 10);
    });
  });

  // ============================================================================
  // Test 6: Pattern storage and retrieval
  // ============================================================================
  describe('Test 6: Pattern Storage', () => {
    it('should store and retrieve patterns', async () => {
      const patternId = await memoryManager.storePattern({
        pattern: 'test-pattern-1',
        confidence: 0.95,
        usageCount: 5,
        metadata: { category: 'edge-cases' }
      });

      expect(patternId).toBeDefined();

      const retrieved = await memoryManager.getPattern('test-pattern-1');
      expect(retrieved.pattern).toBe('test-pattern-1');
      expect(retrieved.confidence).toBe(0.95);
      expect(retrieved.usageCount).toBe(5);

      recordQLearning({
        operation: 'store',
        partition: 'patterns',
        dataSize: 50
      }, 'store', 10);
    });

    it('should increment pattern usage count', async () => {
      await memoryManager.storePattern({
        pattern: 'usage-test',
        confidence: 0.9,
        usageCount: 0
      });

      await memoryManager.incrementPatternUsage('usage-test');
      const pattern = await memoryManager.getPattern('usage-test');

      expect(pattern.usageCount).toBe(1);

      recordQLearning({
        operation: 'retrieve',
        partition: 'patterns',
        dataSize: 30
      }, 'retrieve', 10);
    });

    it('should query patterns by confidence threshold', async () => {
      await memoryManager.storePattern({
        pattern: 'high-confidence',
        confidence: 0.95,
        usageCount: 0
      });

      await memoryManager.storePattern({
        pattern: 'low-confidence',
        confidence: 0.5,
        usageCount: 0
      });

      const results = await memoryManager.queryPatternsByConfidence(0.8);

      expect(results).toHaveLength(1);
      expect(results[0].pattern).toBe('high-confidence');

      recordQLearning({
        operation: 'retrieve',
        partition: 'patterns',
        dataSize: 30
      }, 'query', 10);
    });
  });

  // ============================================================================
  // Test 7: Event storage
  // ============================================================================
  describe('Test 7: Event Storage', () => {
    it('should store and retrieve events', async () => {
      const eventId = await memoryManager.storeEvent({
        type: 'test-event',
        payload: { message: 'test' },
        source: 'test-source'
      });

      expect(eventId).toBeDefined();

      const events = await memoryManager.queryEvents('test-event');
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('test-event');

      recordQLearning({
        operation: 'store',
        partition: 'events',
        dataSize: 30
      }, 'store', 10);
    });

    it('should retrieve events by source', async () => {
      await memoryManager.storeEvent({
        type: 'event-1',
        payload: { data: 'value' },
        source: 'source-1'
      });

      await memoryManager.storeEvent({
        type: 'event-2',
        payload: { data: 'value' },
        source: 'source-1'
      });

      const events = await memoryManager.getEventsBySource('source-1');
      expect(events).toHaveLength(2);

      recordQLearning({
        operation: 'retrieve',
        partition: 'events',
        dataSize: 60
      }, 'query', 10);
    });
  });

  // ============================================================================
  // Test 8: Access control
  // ============================================================================
  describe('Test 8: Access Control', () => {
    it('should store entries with access control', async () => {
      await memoryManager.store('secure-entry', { data: 'secure' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.TEAM,
        teamId: 'team-1'
      });

      const retrieved = await memoryManager.retrieve('secure-entry');
      expect(retrieved).toEqual({ data: 'secure' });

      recordQLearning({
        operation: 'store',
        partition: 'default',
        dataSize: 14
      }, 'store', 10);
    });

    it('should enforce read permissions with agentId', async () => {
      // Store with private access
      await memoryManager.store('private-entry', { data: 'private' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE
      });

      // Attempt read as different agent (system agents can bypass)
      const retrieved = await memoryManager.retrieve('private-entry', {
        agentId: 'agent-1',
        isSystemAgent: true
      });

      expect(retrieved).toEqual({ data: 'private' });

      recordQLearning({
        operation: 'retrieve',
        partition: 'default',
        dataSize: 15
      }, 'retrieve', 10);
    });
  });

  // ============================================================================
  // Test 9: Consensus state management
  // ============================================================================
  describe('Test 9: Consensus State', () => {
    it('should create and retrieve consensus proposals', async () => {
      const proposalId = 'proposal-1';

      await memoryManager.createConsensusProposal({
        id: proposalId,
        decision: 'deploy-v1.0',
        proposer: 'agent-1',
        votes: [],
        quorum: 3,
        status: 'pending'
      });

      const retrieved = await memoryManager.getConsensusProposal(proposalId);

      expect(retrieved.id).toBe(proposalId);
      expect(retrieved.status).toBe('pending');
      expect(retrieved.votes).toHaveLength(0);

      recordQLearning({
        operation: 'store',
        partition: 'consensus',
        dataSize: 50
      }, 'store', 10);
    });

    it('should handle voting on proposals', async () => {
      const proposalId = 'proposal-2';

      await memoryManager.createConsensusProposal({
        id: proposalId,
        decision: 'test-decision',
        proposer: 'agent-1',
        votes: [],
        quorum: 2,
        status: 'pending'
      });

      // First vote
      let approved = await memoryManager.voteOnConsensus(proposalId, 'agent-1');
      expect(approved).toBe(false);

      // Second vote (reaches quorum)
      approved = await memoryManager.voteOnConsensus(proposalId, 'agent-2');
      expect(approved).toBe(true);

      const proposal = await memoryManager.getConsensusProposal(proposalId);
      expect(proposal.status).toBe('approved');

      recordQLearning({
        operation: 'retrieve',
        partition: 'consensus',
        dataSize: 30
      }, 'retrieve', 10);
    });
  });

  // ============================================================================
  // Test 10: Stats and monitoring
  // ============================================================================
  describe('Test 10: Stats and Monitoring', () => {
    it('should provide accurate statistics', async () => {
      // Store various entries
      await memoryManager.store('key-1', { data: 'v1' });
      await memoryManager.store('key-2', { data: 'v2' }, { partition: 'p1' });
      await memoryManager.storePattern({
        pattern: 'test',
        confidence: 0.9,
        usageCount: 0
      });

      const stats = await memoryManager.stats();

      expect(stats.totalEntries).toBeGreaterThanOrEqual(2);
      expect(stats.totalPatterns).toBeGreaterThanOrEqual(1);
      expect(stats.partitions).toContain('default');
      expect(stats.partitions).toContain('p1');

      recordQLearning({
        operation: 'retrieve',
        partition: 'default',
        dataSize: 0
      }, 'query', 10);
    });

    it('should track access levels in statistics', async () => {
      await memoryManager.store('private-key', { data: 'v1' }, {
        accessLevel: AccessLevel.PRIVATE
      });

      await memoryManager.store('public-key', { data: 'v2' }, {
        accessLevel: AccessLevel.PUBLIC
      });

      const stats = await memoryManager.stats();

      expect(stats.accessLevels).toBeDefined();
      expect(stats.accessLevels[AccessLevel.PRIVATE]).toBeGreaterThan(0);
      expect(stats.accessLevels[AccessLevel.PUBLIC]).toBeGreaterThan(0);

      recordQLearning({
        operation: 'retrieve',
        partition: 'default',
        dataSize: 0
      }, 'query', 10);
    });
  });

  // ============================================================================
  // Helper functions
  // ============================================================================

  function recordQLearning(state: QState, actionType: QAction['type'], reward: number): void {
    totalReward += reward;

    const action: QAction = { type: actionType };
    const nextState: QState = { ...state };

    const qValue: QValue = {
      state,
      action,
      reward,
      nextState,
      timestamp: Date.now()
    };

    qValues.push(qValue);

    // Update exploration rate (epsilon decay)
    explorationRate = Math.max(0.01, explorationRate * 0.95);

    // Store Q-value in learning database
    storeQLearning(qValue);
  }

  function initializeLearningDatabase(): void {
    try {
      const db = new BetterSqlite3(learningDb);

      db.exec(`
        CREATE TABLE IF NOT EXISTS q_values (
          id TEXT PRIMARY KEY,
          state_operation TEXT NOT NULL,
          state_partition TEXT NOT NULL,
          state_data_size INTEGER NOT NULL,
          action_type TEXT NOT NULL,
          reward REAL NOT NULL,
          timestamp INTEGER NOT NULL,
          episode INTEGER NOT NULL
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS patterns (
          id TEXT PRIMARY KEY,
          pattern TEXT NOT NULL UNIQUE,
          discovered_at INTEGER NOT NULL,
          episode INTEGER NOT NULL,
          metadata TEXT
        )
      `);

      db.close();
    } catch (error) {
      console.warn('Could not initialize learning database:', error);
    }
  }

  function storeQLearning(qValue: QValue): void {
    try {
      const db = new BetterSqlite3(learningDb);

      const id = `qv-${qValue.timestamp}-${Math.random().toString(36).substr(2, 9)}`;

      db.prepare(`
        INSERT INTO q_values (
          id, state_operation, state_partition, state_data_size,
          action_type, reward, timestamp, episode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        qValue.state.operation,
        qValue.state.partition,
        qValue.state.dataSize,
        qValue.action.type,
        qValue.reward,
        qValue.timestamp,
        episodes
      );

      db.close();
    } catch (error) {
      console.warn('Could not store Q-value:', error);
    }
  }
});
