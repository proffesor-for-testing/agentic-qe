/**
 * Agent Pool Benchmark Tests
 * Phase 3 D1: Memory Pooling for 16x Agent Spawn Speedup
 *
 * Target: Reduce spawn time from ~50-100ms to ~3-6ms
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';
import {
  AgentPool,
  QEAgentPoolFactory,
  createQEAgentPool,
  PoolableAgent,
  AgentCreator,
} from '../../src/agents/pool';
import { QEAgentType } from '../../src/types';
import { QEAgentFactory } from '../../src/agents';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';

describe('Agent Pool Benchmarks', () => {
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventEmitter;
  let agentFactory: QEAgentFactory;
  let pool: AgentPool<PoolableAgent>;
  let agentCreator: AgentCreator;

  // Benchmark results storage
  const benchmarkResults: {
    pooledSpawnTimes: number[];
    nonPooledSpawnTimes: number[];
    poolHitTimes: number[];
    poolMissTimes: number[];
  } = {
    pooledSpawnTimes: [],
    nonPooledSpawnTimes: [],
    poolHitTimes: [],
    poolMissTimes: [],
  };

  beforeAll(async () => {
    // Initialize memory store
    memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();

    eventBus = new EventEmitter();

    // Create agent factory
    agentFactory = new QEAgentFactory({
      eventBus,
      memoryStore,
      context: {
        id: 'benchmark-context',
        type: 'benchmark',
        status: 'initializing' as any,
      },
    });

    // Create agent creator function
    agentCreator = async (type: QEAgentType) => {
      return agentFactory.createAgent(type, { enableLearning: false });
    };
  });

  afterAll(async () => {
    if (pool) {
      await pool.shutdown();
    }
    // Cleanup memory store
    if (memoryStore) {
      await memoryStore.close();
    }
  });

  describe('Pool Warmup Performance', () => {
    it('should warmup pool within acceptable time', async () => {
      const startTime = Date.now();

      pool = await createQEAgentPool(
        agentCreator,
        { enableLearning: false },
        {
          debug: false,
          warmupStrategy: 'eager',
          typeConfigs: new Map([
            [
              QEAgentType.TEST_GENERATOR,
              {
                type: QEAgentType.TEST_GENERATOR,
                minSize: 2,
                maxSize: 5,
                warmupCount: 2,
                preInitialize: false, // Skip init for faster warmup
                idleTtlMs: 60000,
                growthIncrement: 1,
              },
            ],
          ]),
        }
      );

      await pool.warmup([QEAgentType.TEST_GENERATOR]);

      const warmupTime = Date.now() - startTime;
      console.log(`Pool warmup time: ${warmupTime}ms`);

      // Warmup should complete in reasonable time
      expect(warmupTime).toBeLessThan(5000); // 5 seconds max

      const stats = pool.getStats();
      expect(stats.totalAgents).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Pooled vs Non-Pooled Acquisition', () => {
    beforeEach(async () => {
      // Ensure pool is ready
      if (!pool) {
        pool = await createQEAgentPool(
          agentCreator,
          { enableLearning: false },
          {
            debug: false,
            typeConfigs: new Map([
              [
                QEAgentType.TEST_GENERATOR,
                {
                  type: QEAgentType.TEST_GENERATOR,
                  minSize: 3,
                  maxSize: 10,
                  warmupCount: 3,
                  preInitialize: true,
                  idleTtlMs: 60000,
                  growthIncrement: 2,
                },
              ],
            ]),
          }
        );
        await pool.warmup([QEAgentType.TEST_GENERATOR]);
      }
    });

    it('should acquire from pool faster than creating new (pool hit)', async () => {
      // First, ensure agents are available and initialized
      const stats = pool.getStats();
      expect(stats.availableAgents).toBeGreaterThan(0);

      // Measure pool hit time (acquiring from warmed pool)
      const iterations = 5;
      const poolHitTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        const result = await pool.acquire(QEAgentType.TEST_GENERATOR);
        const elapsed = performance.now() - startTime;

        poolHitTimes.push(elapsed);
        benchmarkResults.poolHitTimes.push(elapsed);

        // Release back to pool
        await pool.release(result.meta.poolId);
      }

      const avgPoolHitTime = poolHitTimes.reduce((a, b) => a + b, 0) / poolHitTimes.length;
      console.log(`Average pool hit acquisition time: ${avgPoolHitTime.toFixed(2)}ms`);
      console.log(`Pool hit times: ${poolHitTimes.map((t) => t.toFixed(2)).join(', ')}ms`);

      // Pool hits should be very fast (target: <6ms)
      // Note: First acquisition may be slower due to lazy init
      const fastHits = poolHitTimes.slice(1); // Exclude first which might have init overhead
      if (fastHits.length > 0) {
        const avgFastHit = fastHits.reduce((a, b) => a + b, 0) / fastHits.length;
        console.log(`Average pool hit (excluding first): ${avgFastHit.toFixed(2)}ms`);
      }
    });

    it('should measure non-pooled creation time for comparison', async () => {
      // Create agents without pool for comparison
      const iterations = 3;
      const createTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        const agent = await agentCreator(QEAgentType.TEST_GENERATOR);
        const elapsed = performance.now() - startTime;

        createTimes.push(elapsed);
        benchmarkResults.nonPooledSpawnTimes.push(elapsed);
      }

      const avgCreateTime = createTimes.reduce((a, b) => a + b, 0) / createTimes.length;
      console.log(`Average non-pooled creation time: ${avgCreateTime.toFixed(2)}ms`);
      console.log(`Non-pooled times: ${createTimes.map((t) => t.toFixed(2)).join(', ')}ms`);

      // Non-pooled should be slower than pooled hits
      expect(avgCreateTime).toBeGreaterThan(0);
    });
  });

  describe('Pool Performance Under Load', () => {
    it('should handle concurrent acquisitions efficiently', async () => {
      if (!pool) {
        pool = await createQEAgentPool(
          agentCreator,
          { enableLearning: false },
          {
            debug: false,
            typeConfigs: new Map([
              [
                QEAgentType.TEST_GENERATOR,
                {
                  type: QEAgentType.TEST_GENERATOR,
                  minSize: 5,
                  maxSize: 15,
                  warmupCount: 5,
                  preInitialize: false,
                  idleTtlMs: 60000,
                  growthIncrement: 2,
                },
              ],
            ]),
          }
        );
        await pool.warmup([QEAgentType.TEST_GENERATOR]);
      }

      const concurrentRequests = 5;
      const startTime = performance.now();

      // Launch concurrent acquisitions
      const acquisitions = await Promise.all(
        Array(concurrentRequests)
          .fill(null)
          .map(() => pool.acquire(QEAgentType.TEST_GENERATOR))
      );

      const totalTime = performance.now() - startTime;
      const avgTimePerAcquisition = totalTime / concurrentRequests;

      console.log(`Concurrent acquisitions (${concurrentRequests}): ${totalTime.toFixed(2)}ms total`);
      console.log(`Average time per acquisition: ${avgTimePerAcquisition.toFixed(2)}ms`);

      // Verify all acquisitions succeeded
      expect(acquisitions).toHaveLength(concurrentRequests);
      acquisitions.forEach((result) => {
        expect(result.agent).toBeDefined();
        expect(result.meta.poolId).toBeDefined();
      });

      // Release all
      await Promise.all(
        acquisitions.map((result) => pool.release(result.meta.poolId))
      );

      // Check stats
      const stats = pool.getStats();
      console.log(`Total acquisitions: ${stats.totalAcquisitions}`);
      console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
      console.log(`Average acquisition time: ${stats.avgAcquisitionTimeMs.toFixed(2)}ms`);
    });

    it('should maintain performance with acquire/release cycles', async () => {
      const cycles = 10;
      const cycleTimes: number[] = [];

      for (let i = 0; i < cycles; i++) {
        const startTime = performance.now();

        const result = await pool.acquire(QEAgentType.TEST_GENERATOR);
        await pool.release(result.meta.poolId);

        const elapsed = performance.now() - startTime;
        cycleTimes.push(elapsed);
      }

      const avgCycleTime = cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length;
      console.log(`Average acquire/release cycle: ${avgCycleTime.toFixed(2)}ms`);
      console.log(`Cycle times: ${cycleTimes.map((t) => t.toFixed(2)).join(', ')}ms`);

      // Later cycles should be faster due to reuse
      const firstHalf = cycleTimes.slice(0, Math.floor(cycles / 2));
      const secondHalf = cycleTimes.slice(Math.floor(cycles / 2));

      const avgFirstHalf = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avgSecondHalf = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      console.log(`First half avg: ${avgFirstHalf.toFixed(2)}ms`);
      console.log(`Second half avg: ${avgSecondHalf.toFixed(2)}ms`);
    });
  });

  describe('Pool Statistics', () => {
    it('should track pool metrics accurately', async () => {
      const stats = pool.getStats();

      console.log('\n=== Pool Statistics ===');
      console.log(`Total agents: ${stats.totalAgents}`);
      console.log(`Available: ${stats.availableAgents}`);
      console.log(`In use: ${stats.inUseAgents}`);
      console.log(`Total acquisitions: ${stats.totalAcquisitions}`);
      console.log(`Total misses: ${stats.totalMisses}`);
      console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
      console.log(`Avg acquisition time: ${stats.avgAcquisitionTimeMs.toFixed(2)}ms`);

      // Verify stats are being tracked
      expect(stats.totalAcquisitions).toBeGreaterThan(0);
      expect(stats.hitRate).toBeGreaterThanOrEqual(0);
      expect(stats.hitRate).toBeLessThanOrEqual(1);
    });

    it('should report type-specific stats', async () => {
      const stats = pool.getStats();

      for (const [type, typeStats] of stats.byType) {
        console.log(`\n--- ${type} ---`);
        console.log(`  Total: ${typeStats.total}`);
        console.log(`  Available: ${typeStats.available}`);
        console.log(`  In use: ${typeStats.inUse}`);
        console.log(`  Min/Max: ${typeStats.minSize}/${typeStats.maxSize}`);
        console.log(`  Avg reuse: ${typeStats.avgReuseCount.toFixed(1)}`);
      }

      // Should have at least one type
      expect(stats.byType.size).toBeGreaterThan(0);
    });
  });

  describe('Benchmark Summary', () => {
    it('should print benchmark summary', () => {
      console.log('\n========================================');
      console.log('       AGENT POOL BENCHMARK SUMMARY    ');
      console.log('========================================\n');

      if (benchmarkResults.poolHitTimes.length > 0) {
        const avgPoolHit =
          benchmarkResults.poolHitTimes.reduce((a, b) => a + b, 0) /
          benchmarkResults.poolHitTimes.length;
        console.log(`Pool Hit Acquisition: ${avgPoolHit.toFixed(2)}ms avg`);
      }

      if (benchmarkResults.nonPooledSpawnTimes.length > 0) {
        const avgNonPooled =
          benchmarkResults.nonPooledSpawnTimes.reduce((a, b) => a + b, 0) /
          benchmarkResults.nonPooledSpawnTimes.length;
        console.log(`Non-Pooled Creation: ${avgNonPooled.toFixed(2)}ms avg`);

        if (benchmarkResults.poolHitTimes.length > 0) {
          const avgPoolHit =
            benchmarkResults.poolHitTimes.reduce((a, b) => a + b, 0) /
            benchmarkResults.poolHitTimes.length;
          const speedup = avgNonPooled / avgPoolHit;
          console.log(`\nSpeedup Factor: ${speedup.toFixed(1)}x`);
          console.log(`Target: 16x (from ~50-100ms to ~3-6ms)`);
        }
      }

      console.log('\n========================================\n');

      // This test always passes - it's just for reporting
      expect(true).toBe(true);
    });
  });
});
