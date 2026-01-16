/**
 * Q-Value Cross-Session Persistence Integration Test
 *
 * ADR-046 Verification: Tests that Q-values persist across process restarts.
 *
 * This test verifies:
 * 1. Q-values can be stored in SQLite
 * 2. Database can be closed
 * 3. Database can be reopened
 * 4. Q-values are correctly retrieved after reopen
 *
 * BRUTAL HONESTY: This is NOT a mock test - it uses real SQLite persistence.
 *
 * Updated for unified persistence (ADR-046) - uses shared database
 */

import { describe, it, expect, afterAll, beforeAll, beforeEach, afterEach } from 'vitest';
import { QValueStore, createQValueStore } from '../../../src/integrations/rl-suite/persistence/q-value-store.js';
import { resetUnifiedPersistence } from '../../../src/kernel/unified-persistence.js';
import * as fs from 'fs';

// Unified database path (now using memory.db for true unification)
const UNIFIED_DB_DIR = '.agentic-qe';
const UNIFIED_DB_PATH = `${UNIFIED_DB_DIR}/memory.db`;

// Helper to clean up unified database
function cleanupUnifiedDb(): void {
  if (fs.existsSync(UNIFIED_DB_PATH)) {
    fs.unlinkSync(UNIFIED_DB_PATH);
  }
  if (fs.existsSync(`${UNIFIED_DB_PATH}-wal`)) {
    fs.unlinkSync(`${UNIFIED_DB_PATH}-wal`);
  }
  if (fs.existsSync(`${UNIFIED_DB_PATH}-shm`)) {
    fs.unlinkSync(`${UNIFIED_DB_PATH}-shm`);
  }
}

describe('Q-Value Cross-Session Persistence', () => {
  beforeEach(() => {
    // Reset unified persistence for test isolation
    resetUnifiedPersistence();
    cleanupUnifiedDb();
  });

  afterEach(() => {
    resetUnifiedPersistence();
    cleanupUnifiedDb();
  });

  describe('Cross-Session Persistence', () => {
    it('should persist Q-values across database close/reopen', async () => {
      // =====================================================================
      // SESSION 1: Store Q-values
      // =====================================================================
      const store1 = createQValueStore();
      await store1.initialize();

      const agentId = 'test-agent-001';
      const testData = [
        { state: 'state-A', action: 'action-1', qValue: 0.75, reward: 1.0 },
        { state: 'state-A', action: 'action-2', qValue: 0.25, reward: 0.0 },
        { state: 'state-B', action: 'action-1', qValue: 0.5, reward: 0.5 },
        { state: 'state-B', action: 'action-3', qValue: 0.9, reward: 1.0 },
      ];

      // Store all Q-values
      for (const entry of testData) {
        await store1.setQValue(
          agentId,
          entry.state,
          entry.action,
          entry.qValue,
          entry.reward,
          { algorithm: 'q-learning', domain: 'test-domain' }
        );
      }

      // Verify storage in session 1
      for (const entry of testData) {
        const stored = await store1.getQValue(agentId, entry.state, entry.action, 'q-learning');
        expect(stored).toBe(entry.qValue);
      }

      // Get stats before closing
      const stats1 = await store1.getStats();
      expect(stats1.totalEntries).toBe(4);
      expect(stats1.uniqueAgents).toBe(1);
      expect(stats1.uniqueStates).toBe(2);

      // =====================================================================
      // Close database (simulates process exit)
      // =====================================================================
      await store1.close();

      // Verify store1 is closed (should throw on access)
      await expect(store1.getQValue(agentId, 'state-A', 'action-1', 'q-learning')).rejects.toThrow();

      // =====================================================================
      // SESSION 2: Reopen and verify persistence
      // =====================================================================
      const store2 = createQValueStore();
      await store2.initialize();

      // Verify ALL Q-values persisted
      for (const entry of testData) {
        const retrieved = await store2.getQValue(agentId, entry.state, entry.action, 'q-learning');
        expect(retrieved).toBe(entry.qValue);
      }

      // Verify stats persisted
      const stats2 = await store2.getStats();
      expect(stats2.totalEntries).toBe(4);
      expect(stats2.uniqueAgents).toBe(1);
      expect(stats2.uniqueStates).toBe(2);

      // =====================================================================
      // SESSION 2: Update values and verify
      // =====================================================================
      await store2.setQValue(agentId, 'state-A', 'action-1', 0.85, 1.0, {
        algorithm: 'q-learning',
        domain: 'test-domain',
      });

      const updated = await store2.getQValue(agentId, 'state-A', 'action-1', 'q-learning');
      expect(updated).toBe(0.85);

      await store2.close();

      // =====================================================================
      // SESSION 3: Verify update persisted
      // =====================================================================
      const store3 = createQValueStore();
      await store3.initialize();

      const afterUpdate = await store3.getQValue(agentId, 'state-A', 'action-1', 'q-learning');
      expect(afterUpdate).toBe(0.85);

      // Original unchanged values should still be there
      const unchanged = await store3.getQValue(agentId, 'state-B', 'action-3', 'q-learning');
      expect(unchanged).toBe(0.9);

      await store3.close();
    });

    it('should persist Q-values for multiple algorithms', async () => {
      const store = createQValueStore();
      await store.initialize();

      const agentId = 'multi-algo-agent';
      const algorithms = ['q-learning', 'sarsa', 'dqn'] as const;

      // Store different Q-values for each algorithm
      for (const algo of algorithms) {
        await store.setQValue(agentId, 'state-X', 'action-Y', Math.random(), 0.5, {
          algorithm: algo,
          domain: 'multi-test',
        });
      }

      const stats = await store.getStats();
      // Should have at least 3 entries (might have more from previous test)
      expect(stats.totalEntries).toBeGreaterThanOrEqual(3);

      await store.close();

      // Reopen and verify
      const store2 = createQValueStore();
      await store2.initialize();

      for (const algo of algorithms) {
        const qValue = await store2.getQValue(agentId, 'state-X', 'action-Y', algo);
        expect(qValue).toBeGreaterThan(0); // Should have persisted
      }

      await store2.close();
    });

    it('should persist visit counts across sessions', async () => {
      const store = createQValueStore();
      await store.initialize();

      const agentId = 'visit-test-agent';

      // Set Q-value
      await store.setQValue(agentId, 'state-V', 'action-V', 0.5, 0.5, {
        algorithm: 'q-learning',
        domain: 'visit-test',
      });

      // Increment visits
      await store.incrementVisits(agentId, 'state-V', 'action-V', 'q-learning');
      await store.incrementVisits(agentId, 'state-V', 'action-V', 'q-learning');
      await store.incrementVisits(agentId, 'state-V', 'action-V', 'q-learning');

      // Get entry to check visits
      const entry = await store.getEntry(agentId, 'state-V', 'action-V', 'q-learning');
      expect(entry).not.toBeNull();
      expect(entry!.visits).toBe(4); // 1 initial + 3 increments

      await store.close();

      // Reopen and verify visits persisted
      const store2 = createQValueStore();
      await store2.initialize();

      const entry2 = await store2.getEntry(agentId, 'state-V', 'action-V', 'q-learning');
      expect(entry2).not.toBeNull();
      expect(entry2!.visits).toBe(4);

      await store2.close();
    });
  });

  describe('Performance Benchmarks', () => {
    it('should lookup Q-values in <10ms', async () => {
      const store = createQValueStore();
      await store.initialize();

      const agentId = 'perf-test-agent';

      // Seed with some data
      for (let i = 0; i < 100; i++) {
        await store.setQValue(agentId, `state-${i}`, `action-${i % 10}`, Math.random(), 0.5, {
          algorithm: 'q-learning',
          domain: 'perf-test',
        });
      }

      // Benchmark lookups
      const lookupTimes: number[] = [];
      for (let i = 0; i < 50; i++) {
        const stateIdx = Math.floor(Math.random() * 100);
        const actionIdx = stateIdx % 10;

        const start = performance.now();
        await store.getQValue(agentId, `state-${stateIdx}`, `action-${actionIdx}`, 'q-learning');
        const elapsed = performance.now() - start;
        lookupTimes.push(elapsed);
      }

      const avgLookup = lookupTimes.reduce((a, b) => a + b, 0) / lookupTimes.length;
      const maxLookup = Math.max(...lookupTimes);

      console.log(`[Q-Value Performance] Avg lookup: ${avgLookup.toFixed(3)}ms, Max: ${maxLookup.toFixed(3)}ms`);

      // ADR-046 Success Metric: <10ms Q-value lookup
      expect(avgLookup).toBeLessThan(10);

      await store.close();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty state on reopen', async () => {
      // With unified persistence, this tests the singleton reinitialization
      const store1 = createQValueStore();
      await store1.initialize();
      await store1.close();

      // Reset singleton to simulate a new process
      resetUnifiedPersistence();

      const store2 = createQValueStore();
      await store2.initialize();

      const qValue = await store2.getQValue('nonexistent', 'state', 'action', 'q-learning');
      expect(qValue).toBe(0); // Default for missing

      const stats = await store2.getStats();
      expect(stats.totalEntries).toBe(0);

      await store2.close();
    });

    it('should handle concurrent access safely', async () => {
      // With unified persistence, both stores share the same connection

      const store1 = createQValueStore();
      const store2 = createQValueStore();

      await store1.initialize();
      await store2.initialize();

      // Both stores writing to same DB
      const promises = [
        store1.setQValue('agent-1', 'state', 'action', 0.5, 0.5, { algorithm: 'q-learning' }),
        store2.setQValue('agent-2', 'state', 'action', 0.7, 0.7, { algorithm: 'q-learning' }),
      ];

      await Promise.all(promises);

      // Both should be able to read
      const val1 = await store1.getQValue('agent-1', 'state', 'action', 'q-learning');
      const val2 = await store2.getQValue('agent-2', 'state', 'action', 'q-learning');

      expect(val1).toBe(0.5);
      expect(val2).toBe(0.7);

      await store1.close();
      await store2.close();
    });
  });
});
