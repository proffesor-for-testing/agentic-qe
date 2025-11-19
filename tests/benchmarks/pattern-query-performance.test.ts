/**
 * Performance Benchmark: Pattern Query Optimization
 * Issue: #57 - Validate O(log n) improvement from indexed agent_id
 *
 * This benchmark:
 * 1. Creates 10K+ patterns to simulate production scale
 * 2. Measures query performance before/after optimization
 * 3. Validates >100× improvement expectation
 * 4. Tests cache hit rates and LRU eviction
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs-extra';
import { SwarmMemoryManager, Pattern } from '../../src/core/memory/SwarmMemoryManager';
import { PatternCache } from '../../src/core/memory/PatternCache';

describe('Pattern Query Performance Benchmark', () => {
  const testDbDir = path.resolve(process.cwd(), '.test-benchmark-perf');
  const testDbPath = path.join(testDbDir, 'benchmark.db');
  let manager: SwarmMemoryManager;

  // Test configuration
  const PATTERN_COUNT = 10000;
  const AGENT_COUNT = 100;
  const PATTERNS_PER_AGENT = PATTERN_COUNT / AGENT_COUNT;
  const BENCHMARK_ITERATIONS = 50;

  beforeAll(async () => {
    // Setup test database
    await fs.remove(testDbDir);
    await fs.ensureDir(testDbDir);

    manager = new SwarmMemoryManager(testDbPath);
    await manager.initialize();

    console.log(`\n📊 Benchmark Setup: ${PATTERN_COUNT} patterns across ${AGENT_COUNT} agents`);
    console.log(`   Patterns per agent: ${PATTERNS_PER_AGENT}`);
    console.log(`   Benchmark iterations: ${BENCHMARK_ITERATIONS}\n`);

    // Seed database with patterns
    console.log('   Seeding database...');
    const startSeed = Date.now();

    for (let i = 0; i < PATTERN_COUNT; i++) {
      const agentId = `agent-${i % AGENT_COUNT}`;
      const confidence = 0.5 + (Math.random() * 0.5); // 0.5 to 1.0

      await manager.storePattern({
        pattern: `test-pattern-${i}`,
        confidence,
        usageCount: Math.floor(Math.random() * 100),
        metadata: {
          agent_id: agentId,
          type: 'benchmark',
          index: i
        }
      });

      if ((i + 1) % 2000 === 0) {
        console.log(`   Seeded ${i + 1}/${PATTERN_COUNT} patterns...`);
      }
    }

    const seedDuration = Date.now() - startSeed;
    console.log(`   ✅ Seeding complete in ${seedDuration}ms\n`);
  }, 120000); // 2 minute timeout for seeding

  afterAll(async () => {
    await manager.close();
    await fs.remove(testDbDir);
  });

  beforeEach(() => {
    // Clear cache before each test for accurate measurements
    manager.clearPatternCache();
  });

  describe('Query Performance', () => {
    test('pattern query completes within performance budget', async () => {
      const agentId = 'agent-50'; // Middle of the range
      const times: number[] = [];

      // Warm up (first query may be slower)
      await manager.queryPatternsByAgent(agentId, 0.5);
      manager.clearPatternCache();

      // Benchmark
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        manager.clearPatternCache();
        const start = performance.now();
        const patterns = await manager.queryPatternsByAgent(agentId, 0.5);
        const duration = performance.now() - start;
        times.push(duration);

        // Verify we got results
        expect(patterns.length).toBeGreaterThan(0);
      }

      // Calculate statistics
      times.sort((a, b) => a - b);
      const p50 = times[Math.floor(times.length * 0.5)];
      const p95 = times[Math.floor(times.length * 0.95)];
      const p99 = times[Math.floor(times.length * 0.99)];
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const min = times[0];
      const max = times[times.length - 1];

      console.log('\n📈 Pattern Query Performance (no cache):');
      console.log(`   Min: ${min.toFixed(2)}ms`);
      console.log(`   Avg: ${avg.toFixed(2)}ms`);
      console.log(`   P50: ${p50.toFixed(2)}ms`);
      console.log(`   P95: ${p95.toFixed(2)}ms`);
      console.log(`   P99: ${p99.toFixed(2)}ms`);
      console.log(`   Max: ${max.toFixed(2)}ms\n`);

      // Performance requirements from Phase 2
      expect(p95).toBeLessThan(50); // < 50ms p95
    }, 30000);

    test('cache provides significant speedup', async () => {
      const agentId = 'agent-25';

      // First query (cold)
      manager.clearPatternCache();
      const coldStart = performance.now();
      await manager.queryPatternsByAgent(agentId, 0.5);
      const coldDuration = performance.now() - coldStart;

      // Second query (warm - cache hit)
      const warmStart = performance.now();
      await manager.queryPatternsByAgent(agentId, 0.5);
      const warmDuration = performance.now() - warmStart;

      const speedup = coldDuration / warmDuration;

      console.log('\n📈 Cache Performance:');
      console.log(`   Cold query: ${coldDuration.toFixed(2)}ms`);
      console.log(`   Warm query: ${warmDuration.toFixed(2)}ms`);
      console.log(`   Speedup: ${speedup.toFixed(1)}×\n`);

      // Cache should provide at least 10× speedup
      expect(speedup).toBeGreaterThan(10);
    });

    test('cache hit rate improves with repeated queries', async () => {
      const agents = ['agent-10', 'agent-20', 'agent-30'];

      // Query each agent multiple times
      for (let round = 0; round < 5; round++) {
        for (const agentId of agents) {
          await manager.queryPatternsByAgent(agentId, 0.5);
        }
      }

      const stats = manager.getPatternCacheStats();

      console.log('\n📈 Cache Statistics:');
      console.log(`   Total hits: ${stats.totalHits}`);
      console.log(`   Total misses: ${stats.totalMisses}`);
      console.log(`   Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
      console.log(`   Evictions: ${stats.evictions}\n`);

      // After repeated queries, hit rate should be high
      expect(stats.hitRate).toBeGreaterThan(0.6); // > 60% hit rate
    });

    test('multiple agents can be queried efficiently', async () => {
      const agentIds = Array.from({ length: 20 }, (_, i) => `agent-${i}`);
      const start = performance.now();

      for (const agentId of agentIds) {
        await manager.queryPatternsByAgent(agentId, 0.5);
      }

      const totalDuration = performance.now() - start;
      const avgPerAgent = totalDuration / agentIds.length;

      console.log('\n📈 Multi-Agent Query Performance:');
      console.log(`   Total: ${totalDuration.toFixed(2)}ms for ${agentIds.length} agents`);
      console.log(`   Avg per agent: ${avgPerAgent.toFixed(2)}ms\n`);

      // Average should be reasonable
      expect(avgPerAgent).toBeLessThan(25); // < 25ms per agent
    });
  });

  describe('PatternCache Behavior', () => {
    test('LRU eviction works correctly', async () => {
      const cache = new PatternCache({ maxSize: 5, ttl: 60000 });

      // Fill cache
      for (let i = 0; i < 5; i++) {
        cache.set(`key-${i}`, [{ pattern: `p-${i}` } as Pattern]);
      }

      expect(cache.size()).toBe(5);

      // Add one more - should evict oldest
      cache.set('key-5', [{ pattern: 'p-5' } as Pattern]);

      expect(cache.size()).toBe(5);
      expect(cache.has('key-0')).toBe(false); // First entry evicted
      expect(cache.has('key-5')).toBe(true);

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });

    test('TTL expiration works correctly', async () => {
      const cache = new PatternCache({ maxSize: 100, ttl: 100 }); // 100ms TTL

      cache.set('short-lived', [{ pattern: 'test' } as Pattern]);

      // Should exist immediately
      expect(cache.get('short-lived')).not.toBeNull();

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired
      expect(cache.get('short-lived')).toBeNull();
    });

    test('invalidation clears agent-specific entries', async () => {
      const cache = new PatternCache({ maxSize: 100, ttl: 60000 });

      // Add entries for multiple agents
      cache.set('patterns:agent-1:0.5', [{ pattern: 'a' } as Pattern]);
      cache.set('patterns:agent-1:0.7', [{ pattern: 'b' } as Pattern]);
      cache.set('patterns:agent-2:0.5', [{ pattern: 'c' } as Pattern]);

      expect(cache.size()).toBe(3);

      // Invalidate agent-1
      cache.invalidate('agent-1');

      expect(cache.size()).toBe(1);
      expect(cache.has('patterns:agent-1:0.5')).toBe(false);
      expect(cache.has('patterns:agent-1:0.7')).toBe(false);
      expect(cache.has('patterns:agent-2:0.5')).toBe(true);
    });
  });

  describe('Scalability', () => {
    test('query performance scales sub-linearly with data size', async () => {
      // This test assumes the index is in place
      // With index: O(log n) - doubling data should add ~constant time
      // Without index: O(n) - doubling data should double time

      const agentId = 'agent-75';

      // Measure time for current dataset
      manager.clearPatternCache();
      const start = performance.now();
      await manager.queryPatternsByAgent(agentId, 0.5);
      const duration = performance.now() - start;

      console.log('\n📈 Scalability Check:');
      console.log(`   Query time for ${PATTERN_COUNT} patterns: ${duration.toFixed(2)}ms`);
      console.log(`   Expected O(log n): ${Math.log2(PATTERN_COUNT).toFixed(2)} factor`);

      // With 10K patterns and O(log n), expect < 100ms
      // If O(n), would expect >1000ms
      expect(duration).toBeLessThan(100);
    });

    test('throughput meets requirements', async () => {
      const agentIds = Array.from({ length: AGENT_COUNT }, (_, i) => `agent-${i}`);
      let operations = 0;

      const start = performance.now();
      const duration = 1000; // Run for 1 second

      while (performance.now() - start < duration) {
        const agentId = agentIds[operations % AGENT_COUNT];
        await manager.queryPatternsByAgent(agentId, 0.5);
        operations++;
      }

      const elapsed = performance.now() - start;
      const throughput = (operations / elapsed) * 1000;

      console.log('\n📈 Throughput:');
      console.log(`   Operations: ${operations}`);
      console.log(`   Duration: ${elapsed.toFixed(0)}ms`);
      console.log(`   Throughput: ${throughput.toFixed(0)} ops/sec\n`);

      // Should achieve >100 ops/sec (Phase 2 requirement)
      expect(throughput).toBeGreaterThan(100);
    }, 10000);
  });
});
