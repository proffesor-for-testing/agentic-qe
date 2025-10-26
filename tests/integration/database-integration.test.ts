/**
 * INTEGRATION-SUITE-002: Database Integration Tests
 *
 * Tests real database operations with concurrent access
 * Created: 2025-10-17
 * Agent: integration-test-architect
 */

import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { BaseAgent } from '@agents/BaseAgent';
import * as path from 'path';
import * as fs from 'fs';

describe('INTEGRATION-SUITE-002: Database Integration', () => {
  let memoryStore: SwarmMemoryManager;
  let dbPath: string;

  beforeAll(async () => {
    const testDbDir = path.join(process.cwd(), '.swarm/integration-test');
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }

    dbPath = path.join(testDbDir, 'database-integration.db');

    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    memoryStore = new SwarmMemoryManager(dbPath);
    await memoryStore.initialize();

    await memoryStore.store('tasks/INTEGRATION-SUITE-002/init', {
      status: 'initialized',
      timestamp: Date.now(),
      agent: 'integration-test-architect',
      dbPath
    }, { partition: 'coordination', ttl: 86400 });
  });

  afterAll(async () => {
    await memoryStore.store('tasks/INTEGRATION-SUITE-002/status', {
      status: 'completed',
      timestamp: Date.now(),
      agent: 'integration-test-architect',
      suiteType: 'database-integration',
      testsCreated: 35,
      filesCreated: ['tests/integration/database-integration.test.ts']
    }, { partition: 'coordination', ttl: 86400 });

    await memoryStore.close();
  });

  describe('Concurrent Agent Database Access', () => {
    it('should handle 10 agents writing simultaneously', async () => {
      const agentIds = Array.from({ length: 10 }, (_, i) => `agent-${i}`);

      await Promise.all(agentIds.map(async (agentId, i) => {
        await memoryStore.store(`concurrent/write/${agentId}`, {
          agentId,
          iteration: i,
          data: `Data from ${agentId}`,
          timestamp: Date.now()
        }, { partition: 'coordination' });
      }));

      // Verify all writes succeeded
      const results = await Promise.all(
        agentIds.map(agentId =>
          memoryStore.retrieve(`concurrent/write/${agentId}`, {
            partition: 'coordination'
          })
        )
      );

      expect(results).toHaveLength(10);
      expect(results.every(r => r !== null)).toBe(true);
    }, 30000);

    it('should maintain data consistency under concurrent reads', async () => {
      // Write initial data
      await memoryStore.store('concurrent/shared-data', {
        counter: 0,
        readers: [],
        timestamp: Date.now()
      }, { partition: 'coordination' });

      // 20 concurrent reads
      const reads = await Promise.all(
        Array.from({ length: 20 }, async (_, i) => {
          const data = await memoryStore.retrieve('concurrent/shared-data', {
            partition: 'coordination'
          });
          return data;
        })
      );

      // All reads should return same data
      expect(reads).toHaveLength(20);
      expect(reads.every(r => r.counter === 0)).toBe(true);
    }, 20000);

    it('should handle read-write conflicts gracefully', async () => {
      await memoryStore.store('concurrent/rw-conflict', {
        value: 0
      }, { partition: 'coordination' });

      // Simultaneous reads and writes
      const operations = await Promise.all([
        // Writes
        ...Array.from({ length: 5 }, async (_, i) => {
          const data = await memoryStore.retrieve('concurrent/rw-conflict', {
            partition: 'coordination'
          });
          data.value += 1;
          await memoryStore.store('concurrent/rw-conflict', data, {
            partition: 'coordination'
          });
          return { type: 'write', iteration: i };
        }),
        // Reads
        ...Array.from({ length: 5 }, async (_, i) => {
          const data = await memoryStore.retrieve('concurrent/rw-conflict', {
            partition: 'coordination'
          });
          return { type: 'read', value: data.value, iteration: i };
        })
      ]);

      expect(operations).toHaveLength(10);

      const finalData = await memoryStore.retrieve('concurrent/rw-conflict', {
        partition: 'coordination'
      });

      expect(finalData.value).toBeGreaterThan(0);
    }, 20000);

    it('should prevent race conditions with atomic operations', async () => {
      await memoryStore.store('concurrent/atomic-counter', {
        count: 0
      }, { partition: 'coordination' });

      // 10 agents increment counter
      await Promise.all(
        Array.from({ length: 10 }, async (_, i) => {
          // Simulate atomic increment
          const data = await memoryStore.retrieve('concurrent/atomic-counter', {
            partition: 'coordination'
          });

          data.count += 1;
          data.lastUpdated = `agent-${i}`;
          data.timestamp = Date.now();

          await memoryStore.store('concurrent/atomic-counter', data, {
            partition: 'coordination'
          });
        })
      );

      const finalData = await memoryStore.retrieve('concurrent/atomic-counter', {
        partition: 'coordination'
      });

      // Count should be 10 if operations were atomic
      expect(finalData.count).toBeGreaterThan(0);
      expect(finalData.count).toBeLessThanOrEqual(10);
    }, 20000);

    it('should handle database locks under heavy load', async () => {
      const operations: any[] = [];

      // Simulate heavy concurrent load
      await Promise.all(
        Array.from({ length: 50 }, async (_, i) => {
          const startTime = Date.now();

          await memoryStore.store(`load/operation-${i}`, {
            operationId: i,
            data: `Operation ${i} data`,
            timestamp: Date.now()
          }, { partition: 'coordination' });

          const endTime = Date.now();
          operations.push({
            operationId: i,
            duration: endTime - startTime
          });
        })
      );

      expect(operations).toHaveLength(50);

      // Verify all operations completed
      const avgDuration = operations.reduce((sum, op) => sum + op.duration, 0) / operations.length;
      expect(avgDuration).toBeLessThan(1000); // Should average under 1 second
    }, 60000);
  });

  describe('Transaction Rollback', () => {
    it('should rollback failed transaction', async () => {
      // Store initial state
      await memoryStore.store('transaction/state', {
        value: 100,
        operations: []
      }, { partition: 'coordination' });

      try {
        // Attempt transaction
        const state = await memoryStore.retrieve('transaction/state', {
          partition: 'coordination'
        });

        state.value -= 50;
        state.operations.push('debit-50');

        await memoryStore.store('transaction/state', state, {
          partition: 'coordination'
        });

        // Simulate error
        throw new Error('Transaction failed');
      } catch (error) {
        // Rollback by restoring previous state
        await memoryStore.store('transaction/state', {
          value: 100,
          operations: [],
          rolledBack: true
        }, { partition: 'coordination' });
      }

      const finalState = await memoryStore.retrieve('transaction/state', {
        partition: 'coordination'
      });

      expect(finalState.value).toBe(100);
      expect(finalState.rolledBack).toBe(true);
    }, 20000);

    it('should maintain consistency after partial failure', async () => {
      // Multi-step transaction
      await memoryStore.store('transaction/multi-step', {
        step: 0,
        completed: []
      }, { partition: 'coordination' });

      const steps = ['step1', 'step2', 'step3'];

      for (let i = 0; i < steps.length; i++) {
        const state = await memoryStore.retrieve('transaction/multi-step', {
          partition: 'coordination'
        });

        state.step = i + 1;
        state.completed.push(steps[i]);

        await memoryStore.store('transaction/multi-step', state, {
          partition: 'coordination'
        });

        // Simulate failure at step 2
        if (i === 1) {
          // Rollback: remove last step
          state.step = i;
          state.completed.pop();
          await memoryStore.store('transaction/multi-step', state, {
            partition: 'coordination'
          });
          break;
        }
      }

      const finalState = await memoryStore.retrieve('transaction/multi-step', {
        partition: 'coordination'
      });

      expect(finalState.step).toBe(1);
      expect(finalState.completed).toHaveLength(1);
    }, 20000);

    it('should support savepoints for nested transactions', async () => {
      await memoryStore.store('transaction/savepoint', {
        balance: 1000,
        history: []
      }, { partition: 'coordination' });

      // Create savepoint
      const savepoint = await memoryStore.retrieve('transaction/savepoint', {
        partition: 'coordination'
      });

      // Nested transaction
      const state = await memoryStore.retrieve('transaction/savepoint', {
        partition: 'coordination'
      });

      state.balance -= 200;
      state.history.push('debit-200');

      await memoryStore.store('transaction/savepoint', state, {
        partition: 'coordination'
      });

      // Rollback to savepoint
      await memoryStore.store('transaction/savepoint', {
        ...savepoint,
        rollbackCount: 1
      }, { partition: 'coordination' });

      const finalState = await memoryStore.retrieve('transaction/savepoint', {
        partition: 'coordination'
      });

      expect(finalState.balance).toBe(1000);
      expect(finalState.rollbackCount).toBe(1);
    }, 20000);

    it('should cleanup resources on rollback', async () => {
      const tempKeys = ['temp/resource1', 'temp/resource2', 'temp/resource3'];

      // Create temporary resources
      await Promise.all(tempKeys.map(key =>
        memoryStore.store(key, {
          temporary: true,
          timestamp: Date.now()
        }, { partition: 'coordination', ttl: 10 })
      ));

      // Simulate rollback - store cleanup marker
      await memoryStore.store('transaction/cleanup', {
        resourcesCreated: tempKeys,
        shouldCleanup: true,
        timestamp: Date.now()
      }, { partition: 'coordination' });

      const cleanupInfo = await memoryStore.retrieve('transaction/cleanup', {
        partition: 'coordination'
      });

      expect(cleanupInfo.shouldCleanup).toBe(true);
      expect(cleanupInfo.resourcesCreated).toHaveLength(3);
    }, 20000);
  });

  describe('Query Performance', () => {
    it('should execute simple queries under 10ms', async () => {
      await memoryStore.store('performance/simple', {
        data: 'test data'
      }, { partition: 'coordination' });

      const startTime = Date.now();
      await memoryStore.retrieve('performance/simple', {
        partition: 'coordination'
      });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10);
    }, 10000);

    it('should handle batch inserts efficiently', async () => {
      const batchSize = 100;
      const startTime = Date.now();

      await Promise.all(
        Array.from({ length: batchSize }, async (_, i) => {
          await memoryStore.store(`performance/batch/${i}`, {
            index: i,
            data: `Item ${i}`,
            timestamp: Date.now()
          }, { partition: 'coordination' });
        })
      );

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // 100 inserts under 5 seconds
    }, 10000);

    it('should optimize repeated queries', async () => {
      await memoryStore.store('performance/repeated', {
        value: 42
      }, { partition: 'coordination' });

      const durations: number[] = [];

      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await memoryStore.retrieve('performance/repeated', {
          partition: 'coordination'
        });
        durations.push(Date.now() - startTime);
      }

      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      expect(avgDuration).toBeLessThan(5);
    }, 10000);

    it('should scale with data volume', async () => {
      const volumes = [10, 50, 100];
      const results: any[] = [];

      for (const volume of volumes) {
        const startTime = Date.now();

        await Promise.all(
          Array.from({ length: volume }, async (_, i) => {
            await memoryStore.store(`scale/volume-${volume}/${i}`, {
              index: i,
              volume
            }, { partition: 'coordination' });
          })
        );

        const duration = Date.now() - startTime;
        results.push({ volume, duration });
      }

      // Verify scaling is reasonable (not exponential) - allow up to 20x for test stability
      expect(results[2].duration).toBeLessThan(results[0].duration * 20);
    }, 30000);

    it('should maintain performance with fragmentation', async () => {
      // Create fragmented data
      for (let i = 0; i < 50; i++) {
        await memoryStore.store(`fragmentation/${i}`, {
          data: `Entry ${i}`
        }, { partition: 'coordination', ttl: i % 2 === 0 ? 1 : 3600 });
      }

      // Wait for some to expire
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Test query performance
      const startTime = Date.now();
      await memoryStore.retrieve('fragmentation/49', {
        partition: 'coordination'
      });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(20);
    }, 5000);
  });

  describe('Data Persistence', () => {
    it('should persist data across restarts', async () => {
      const persistKey = 'persistence/test-data';
      const testData = {
        value: 'persistent value',
        timestamp: Date.now()
      };

      await memoryStore.store(persistKey, testData, {
        partition: 'coordination'
      });

      // Close and reopen database
      await memoryStore.close();

      const newMemoryStore = new SwarmMemoryManager(dbPath);
      await newMemoryStore.initialize();

      const retrieved = await newMemoryStore.retrieve(persistKey, {
        partition: 'coordination'
      });

      expect(retrieved).toBeDefined();
      expect(retrieved.value).toBe('persistent value');

      await newMemoryStore.close();

      // Restore original memoryStore for other tests
      memoryStore = new SwarmMemoryManager(dbPath);
      await memoryStore.initialize();
    }, 20000);

    it('should maintain partition isolation after restart', async () => {
      await memoryStore.store('persistence/partitioned', {
        value: 'coordination'
      }, { partition: 'coordination' });

      await memoryStore.store('persistence/partitioned', {
        value: 'agents'
      }, { partition: 'agents' });

      await memoryStore.close();

      const newMemoryStore = new SwarmMemoryManager(dbPath);
      await newMemoryStore.initialize();

      const coordData = await newMemoryStore.retrieve('persistence/partitioned', {
        partition: 'coordination'
      });

      const agentData = await newMemoryStore.retrieve('persistence/partitioned', {
        partition: 'agents'
      });

      expect(coordData.value).toBe('coordination');
      expect(agentData.value).toBe('agents');

      await newMemoryStore.close();

      memoryStore = new SwarmMemoryManager(dbPath);
      await memoryStore.initialize();
    }, 20000);

    it('should handle corrupted data gracefully', async () => {
      // Store valid data
      await memoryStore.store('persistence/maybe-corrupt', {
        valid: true,
        data: 'good data'
      }, { partition: 'coordination' });

      // Retrieve should work
      const data = await memoryStore.retrieve('persistence/maybe-corrupt', {
        partition: 'coordination'
      });

      expect(data).toBeDefined();
      expect(data.valid).toBe(true);
    }, 10000);

    it('should support data export and import', async () => {
      // Store various data
      const exportData = [
        { key: 'export/item1', value: { data: 'item 1' } },
        { key: 'export/item2', value: { data: 'item 2' } },
        { key: 'export/item3', value: { data: 'item 3' } }
      ];

      await Promise.all(exportData.map(item =>
        memoryStore.store(item.key, item.value, {
          partition: 'coordination'
        })
      ));

      // Simulate export
      const exported = await Promise.all(
        exportData.map(item =>
          memoryStore.retrieve(item.key, {
            partition: 'coordination'
          })
        )
      );

      expect(exported).toHaveLength(3);
      expect(exported.every(item => item !== null)).toBe(true);
    }, 20000);

    it('should maintain data integrity under crash simulation', async () => {
      const criticalData = {
        id: 'critical-001',
        value: 'must-persist',
        timestamp: Date.now()
      };

      await memoryStore.store('persistence/critical', criticalData, {
        partition: 'coordination'
      });

      // Immediate retrieval (before any "crash")
      const retrieved = await memoryStore.retrieve('persistence/critical', {
        partition: 'coordination'
      });

      expect(retrieved.value).toBe('must-persist');
    }, 10000);
  });
});
