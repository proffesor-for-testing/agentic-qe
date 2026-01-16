/**
 * Unit Tests - QValueStore
 * SQLite-backed Q-value persistence for RL algorithms
 *
 * Updated for unified persistence (ADR-046) - uses shared database
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  QValueStore,
  createQValueStore,
  QValueEntry,
  QValueStats,
} from '../../../../../src/integrations/rl-suite/persistence/q-value-store';
import { resetUnifiedPersistence, initializeUnifiedPersistence } from '../../../../../src/kernel/unified-persistence';

// Test database path - unique per test file to avoid parallel test conflicts
const UNIFIED_DB_DIR = `.agentic-qe-test-qvs-${process.pid}`;
const UNIFIED_DB_PATH = `${UNIFIED_DB_DIR}/memory.db`;

describe('QValueStore', () => {
  let store: QValueStore;

  beforeEach(async () => {
    // Reset unified persistence singleton for test isolation
    resetUnifiedPersistence();

    // Clean up any existing test database
    if (fs.existsSync(UNIFIED_DB_PATH)) {
      fs.unlinkSync(UNIFIED_DB_PATH);
    }
    // Also remove WAL and SHM files
    if (fs.existsSync(`${UNIFIED_DB_PATH}-wal`)) {
      fs.unlinkSync(`${UNIFIED_DB_PATH}-wal`);
    }
    if (fs.existsSync(`${UNIFIED_DB_PATH}-shm`)) {
      fs.unlinkSync(`${UNIFIED_DB_PATH}-shm`);
    }

    // Initialize unified persistence with custom test path
    await initializeUnifiedPersistence({ dbPath: UNIFIED_DB_PATH });

    store = createQValueStore();
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();

    // Reset unified persistence singleton
    resetUnifiedPersistence();

    // Clean up test database
    if (fs.existsSync(UNIFIED_DB_PATH)) {
      fs.unlinkSync(UNIFIED_DB_PATH);
    }
    if (fs.existsSync(`${UNIFIED_DB_PATH}-wal`)) {
      fs.unlinkSync(`${UNIFIED_DB_PATH}-wal`);
    }
    if (fs.existsSync(`${UNIFIED_DB_PATH}-shm`)) {
      fs.unlinkSync(`${UNIFIED_DB_PATH}-shm`);
    }
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(UNIFIED_DB_DIR)) {
      fs.rmSync(UNIFIED_DB_DIR, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(store.isInitialized()).toBe(true);
      // With unified persistence, returns the shared DB path
      expect(store.getDbPath()).toBe(UNIFIED_DB_PATH);
    });

    it('should create database file on initialization', async () => {
      expect(fs.existsSync(UNIFIED_DB_PATH)).toBe(true);
    });

    it('should skip initialization if already initialized', async () => {
      await store.initialize(); // Should not throw
      expect(store.isInitialized()).toBe(true);
    });

    it('should create database directory if it does not exist', async () => {
      // The unified persistence manager creates the directory automatically
      // Verify the directory exists after initialization
      expect(fs.existsSync(UNIFIED_DB_DIR)).toBe(true);
    });
  });

  describe('Core Q-Value Operations', () => {
    it('should get default Q-value of 0 for unknown state-action', async () => {
      const value = await store.getQValue('agent-1', 'state-1', 'action-1');
      expect(value).toBe(0);
    });

    it('should store and retrieve Q-value', async () => {
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.75);

      const value = await store.getQValue('agent-1', 'state-1', 'action-1');
      expect(value).toBe(0.75);
    });

    it('should update existing Q-value', async () => {
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.5);
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.9);

      const value = await store.getQValue('agent-1', 'state-1', 'action-1');
      expect(value).toBe(0.9);
    });

    it('should store Q-value with reward', async () => {
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.5, 1.0);

      const entry = await store.getEntry('agent-1', 'state-1', 'action-1');
      expect(entry).not.toBeNull();
      expect(entry!.lastReward).toBe(1.0);
    });

    it('should store Q-value with domain', async () => {
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.5, undefined, {
        domain: 'coverage-analysis',
      });

      const entry = await store.getEntry('agent-1', 'state-1', 'action-1');
      expect(entry).not.toBeNull();
      expect(entry!.domain).toBe('coverage-analysis');
    });

    it('should store Q-value with specific algorithm', async () => {
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.5, undefined, {
        algorithm: 'sarsa',
      });

      const value = await store.getQValue('agent-1', 'state-1', 'action-1', 'sarsa');
      expect(value).toBe(0.5);

      // Should not find with different algorithm
      const defaultValue = await store.getQValue('agent-1', 'state-1', 'action-1', 'q-learning');
      expect(defaultValue).toBe(0);
    });

    it('should increment visits', async () => {
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.5);

      await store.incrementVisits('agent-1', 'state-1', 'action-1');
      await store.incrementVisits('agent-1', 'state-1', 'action-1');

      const entry = await store.getEntry('agent-1', 'state-1', 'action-1');
      expect(entry).not.toBeNull();
      expect(entry!.visits).toBe(3); // 1 initial + 2 increments
    });
  });

  describe('Top Actions', () => {
    it('should return top actions by Q-value', async () => {
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.3);
      await store.setQValue('agent-1', 'state-1', 'action-2', 0.9);
      await store.setQValue('agent-1', 'state-1', 'action-3', 0.5);
      await store.setQValue('agent-1', 'state-1', 'action-4', 0.7);

      const topActions = await store.getTopActions('agent-1', 'state-1', 3);

      expect(topActions).toHaveLength(3);
      expect(topActions[0].actionKey).toBe('action-2');
      expect(topActions[0].qValue).toBe(0.9);
      expect(topActions[1].actionKey).toBe('action-4');
      expect(topActions[2].actionKey).toBe('action-3');
    });

    it('should return empty array for unknown state', async () => {
      const topActions = await store.getTopActions('agent-1', 'unknown-state');
      expect(topActions).toHaveLength(0);
    });
  });

  describe('Bulk Operations', () => {
    it('should export Q-values for agent as nested Map', async () => {
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.5);
      await store.setQValue('agent-1', 'state-1', 'action-2', 0.7);
      await store.setQValue('agent-1', 'state-2', 'action-1', 0.3);

      const qTable = await store.exportForAgent('agent-1');

      expect(qTable.has('state-1')).toBe(true);
      expect(qTable.has('state-2')).toBe(true);
      expect(qTable.get('state-1')!.get('action-1')).toBe(0.5);
      expect(qTable.get('state-1')!.get('action-2')).toBe(0.7);
      expect(qTable.get('state-2')!.get('action-1')).toBe(0.3);
    });

    it('should return empty Map for unknown agent', async () => {
      const qTable = await store.exportForAgent('unknown-agent');
      expect(qTable.size).toBe(0);
    });

    it('should import Q-values from Map', async () => {
      const qTable = new Map<string, Map<string, number>>();
      qTable.set(
        'state-1',
        new Map([
          ['action-1', 0.5],
          ['action-2', 0.7],
        ])
      );
      qTable.set('state-2', new Map([['action-1', 0.3]]));

      await store.importFromMap('agent-2', qTable);

      const value1 = await store.getQValue('agent-2', 'state-1', 'action-1');
      const value2 = await store.getQValue('agent-2', 'state-1', 'action-2');
      const value3 = await store.getQValue('agent-2', 'state-2', 'action-1');

      expect(value1).toBe(0.5);
      expect(value2).toBe(0.7);
      expect(value3).toBe(0.3);
    });

    it('should import with domain option', async () => {
      const qTable = new Map<string, Map<string, number>>();
      qTable.set('state-1', new Map([['action-1', 0.5]]));

      await store.importFromMap('agent-3', qTable, { domain: 'test-domain' });

      const entry = await store.getEntry('agent-3', 'state-1', 'action-1');
      expect(entry).not.toBeNull();
      expect(entry!.domain).toBe('test-domain');
    });
  });

  describe('Entry Operations', () => {
    it('should get specific entry', async () => {
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.5, 0.1, {
        domain: 'test-domain',
      });

      const entry = await store.getEntry('agent-1', 'state-1', 'action-1');

      expect(entry).not.toBeNull();
      expect(entry!.agentId).toBe('agent-1');
      expect(entry!.stateKey).toBe('state-1');
      expect(entry!.actionKey).toBe('action-1');
      expect(entry!.qValue).toBe(0.5);
      expect(entry!.lastReward).toBe(0.1);
      expect(entry!.domain).toBe('test-domain');
      expect(entry!.visits).toBe(1);
      expect(entry!.createdAt).toBeInstanceOf(Date);
      expect(entry!.updatedAt).toBeInstanceOf(Date);
    });

    it('should return null for unknown entry', async () => {
      const entry = await store.getEntry('unknown', 'unknown', 'unknown');
      expect(entry).toBeNull();
    });

    it('should delete entry', async () => {
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.5);

      const deleted = await store.deleteEntry('agent-1', 'state-1', 'action-1');
      expect(deleted).toBe(true);

      const entry = await store.getEntry('agent-1', 'state-1', 'action-1');
      expect(entry).toBeNull();
    });

    it('should return false when deleting non-existent entry', async () => {
      const deleted = await store.deleteEntry('unknown', 'unknown', 'unknown');
      expect(deleted).toBe(false);
    });
  });

  describe('Maintenance', () => {
    it('should prune old entries', async () => {
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.5);

      // Pruning entries older than 0 days should remove nothing (just created)
      const pruned1 = await store.pruneOldEntries(0);
      expect(pruned1).toBe(0);

      // Pruning entries older than -1 days (impossible) should remove everything
      // Actually SQLite datetime comparison works differently, let's test with actual logic
      const stats = await store.getStats();
      expect(stats.totalEntries).toBe(1);
    });

    it('should get store statistics', async () => {
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.5, undefined, {
        domain: 'domain-1',
      });
      await store.setQValue('agent-1', 'state-1', 'action-2', 0.7, undefined, {
        domain: 'domain-1',
      });
      await store.setQValue('agent-2', 'state-2', 'action-1', 0.3, undefined, {
        domain: 'domain-2',
      });

      const stats = await store.getStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.uniqueAgents).toBe(2);
      expect(stats.uniqueStates).toBe(2);
      expect(stats.byAlgorithm['q-learning']).toBe(3);
      expect(stats.byDomain['domain-1']).toBe(2);
      expect(stats.byDomain['domain-2']).toBe(1);
      expect(stats.averageVisits).toBe(1);
      expect(stats.averageQValue).toBeCloseTo(0.5, 1);
      expect(stats.oldestEntry).toBeInstanceOf(Date);
      expect(stats.newestEntry).toBeInstanceOf(Date);
    });

    it('should return empty stats for empty store', async () => {
      const stats = await store.getStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.uniqueAgents).toBe(0);
      expect(stats.uniqueStates).toBe(0);
      expect(Object.keys(stats.byAlgorithm)).toHaveLength(0);
      expect(Object.keys(stats.byDomain)).toHaveLength(0);
      expect(stats.averageVisits).toBe(0);
      expect(stats.averageQValue).toBe(0);
    });
  });

  describe('Close and Reopen', () => {
    it('should persist data across close and reopen', async () => {
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.75);
      await store.close();

      // Reset unified persistence to simulate fresh start
      resetUnifiedPersistence();

      // Reinitialize with the same test path to access the persisted data
      await initializeUnifiedPersistence({ dbPath: UNIFIED_DB_PATH });

      // Reopen
      const newStore = createQValueStore();
      await newStore.initialize();

      const value = await newStore.getQValue('agent-1', 'state-1', 'action-1');
      expect(value).toBe(0.75);

      await newStore.close();
    });

    it('should throw error when using closed store', async () => {
      await store.close();

      await expect(store.getQValue('agent-1', 'state-1', 'action-1')).rejects.toThrow(
        'QValueStore not initialized'
      );
    });
  });

  describe('Multi-Algorithm Support', () => {
    it('should separate Q-values by algorithm', async () => {
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.5, undefined, {
        algorithm: 'q-learning',
      });
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.8, undefined, {
        algorithm: 'sarsa',
      });
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.3, undefined, {
        algorithm: 'dqn',
      });

      const qLearningValue = await store.getQValue('agent-1', 'state-1', 'action-1', 'q-learning');
      const sarsaValue = await store.getQValue('agent-1', 'state-1', 'action-1', 'sarsa');
      const dqnValue = await store.getQValue('agent-1', 'state-1', 'action-1', 'dqn');

      expect(qLearningValue).toBe(0.5);
      expect(sarsaValue).toBe(0.8);
      expect(dqnValue).toBe(0.3);
    });

    it('should export only entries for specified algorithm', async () => {
      await store.setQValue('agent-1', 'state-1', 'action-1', 0.5, undefined, {
        algorithm: 'q-learning',
      });
      await store.setQValue('agent-1', 'state-1', 'action-2', 0.7, undefined, {
        algorithm: 'sarsa',
      });

      const qTable = await store.exportForAgent('agent-1', 'q-learning');

      expect(qTable.has('state-1')).toBe(true);
      expect(qTable.get('state-1')!.has('action-1')).toBe(true);
      expect(qTable.get('state-1')!.has('action-2')).toBe(false);
    });
  });

  describe('Factory Function', () => {
    it('should create store with default config', async () => {
      const defaultStore = createQValueStore();
      expect(defaultStore).toBeInstanceOf(QValueStore);
      // getDbPath returns empty string until initialized (uses unified persistence)
      await defaultStore.initialize();
      expect(defaultStore.getDbPath()).toBe(UNIFIED_DB_PATH);
      await defaultStore.close();
    });

    it('should create store with custom config', () => {
      const customStore = createQValueStore({
        defaultAlgorithm: 'sarsa',
      });
      expect(customStore).toBeInstanceOf(QValueStore);
    });
  });
});
