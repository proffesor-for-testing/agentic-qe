/**
 * Performance Benchmark: Pattern Query Optimization
 * Issue: #52 - LearningEngine O(n) to O(log n)
 *
 * Benchmarks:
 * 1. Query performance with different pattern counts
 * 2. Index effectiveness
 * 3. Cache performance
 * 4. Concurrent query performance
 */

import { SwarmMemoryManager, Pattern } from '../../src/core/memory/SwarmMemoryManager';
import * as path from 'path';
import * as fs from 'fs-extra';

interface BenchmarkResult {
  patternCount: number;
  queryTime: number;
  cacheHitTime?: number;
  cacheHitRate?: number;
  indexUsed: boolean;
  patternsReturned: number;
}

interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
  summary: {
    avgQueryTime: number;
    avgCacheHitTime: number;
    totalImprovement: number;
  };
}

/**
 * Seed database with test patterns
 */
async function seedPatterns(
  manager: SwarmMemoryManager,
  agentIds: string[],
  count: number
): Promise<void> {
  console.log(`   Seeding ${count} patterns...`);
  const startTime = performance.now();

  const patterns: Pattern[] = [];
  const patternsPerAgent = Math.floor(count / agentIds.length);

  for (const agentId of agentIds) {
    for (let i = 0; i < patternsPerAgent; i++) {
      patterns.push({
        pattern: `${agentId}:task-${i}:strategy-${i % 5}`,
        confidence: 0.5 + (Math.random() * 0.5),
        usageCount: Math.floor(Math.random() * 100),
        metadata: {
          agent_id: agentId,
          success_rate: Math.random(),
          contexts: [`task-${i}`],
          created_at: new Date().toISOString(),
          last_used_at: new Date().toISOString()
        }
      });
    }
  }

  // Batch insert
  for (const pattern of patterns) {
    await manager.storePattern(pattern);
  }

  const duration = performance.now() - startTime;
  console.log(`   ✓ Seeded in ${duration.toFixed(0)}ms`);
}

/**
 * Clear all patterns from database
 */
async function clearPatterns(manager: SwarmMemoryManager): Promise<void> {
  await manager['run']('DELETE FROM patterns');
  manager.clearPatternCache();
}

/**
 * Check if query uses index
 */
async function checkIndexUsage(
  manager: SwarmMemoryManager,
  agentId: string
): Promise<boolean> {
  const explain = await manager['queryAll']<any>(`
    EXPLAIN QUERY PLAN
    SELECT id, pattern, confidence FROM patterns
    WHERE agent_id = ? AND confidence >= 0.5
    ORDER BY confidence DESC
  `, [agentId]);

  const detail = explain[0]?.detail || '';
  return detail.includes('INDEX') || detail.includes('idx_patterns_agent');
}

/**
 * Benchmark query performance
 */
async function benchmarkQueries(
  manager: SwarmMemoryManager,
  agentIds: string[],
  count: number
): Promise<BenchmarkResult> {
  // Seed database
  await seedPatterns(manager, agentIds, count);

  // Check if index is used
  const indexUsed = await checkIndexUsage(manager, agentIds[0]);

  // Clear cache for fair comparison
  manager.clearPatternCache();

  // Measure first query (cache miss)
  const startTime = performance.now();
  const patterns = await manager.queryPatternsByAgent(agentIds[0], 0.5);
  const queryTime = performance.now() - startTime;

  // Measure second query (cache hit)
  const cacheStartTime = performance.now();
  const cachedPatterns = await manager.queryPatternsByAgent(agentIds[0], 0.5);
  const cacheHitTime = performance.now() - cacheStartTime;

  // Get cache stats
  const cacheStats = manager.getPatternCacheStats();

  // Clean up
  await clearPatterns(manager);

  return {
    patternCount: count,
    queryTime,
    cacheHitTime,
    cacheHitRate: cacheStats.hitRate,
    indexUsed,
    patternsReturned: patterns.length
  };
}

/**
 * Benchmark concurrent queries
 */
async function benchmarkConcurrentQueries(
  manager: SwarmMemoryManager,
  agentIds: string[],
  count: number
): Promise<{ avgTime: number; totalTime: number }> {
  await seedPatterns(manager, agentIds, count);
  manager.clearPatternCache();

  const startTime = performance.now();

  // Run 10 concurrent queries
  const promises = [];
  for (let i = 0; i < 10; i++) {
    const agentId = agentIds[i % agentIds.length];
    promises.push(manager.queryPatternsByAgent(agentId, 0.5));
  }

  await Promise.all(promises);

  const totalTime = performance.now() - startTime;
  const avgTime = totalTime / 10;

  await clearPatterns(manager);

  return { avgTime, totalTime };
}

/**
 * Main benchmark suite
 */
async function runBenchmarks(): Promise<void> {
  console.log('🔥 Pattern Query Performance Benchmark\n');
  console.log('Issue: #52 - LearningEngine O(n) to O(log n)');
  console.log('='.repeat(80));

  // Setup
  const dbPath = path.resolve(process.cwd(), '.agentic-qe/benchmark.db');
  await fs.remove(dbPath);

  const manager = new SwarmMemoryManager({
    dbPath,
    cacheSize: 100,
    cacheTTL: 60000,
    enableCache: true
  });

  await manager.initialize();

  const agentIds = ['agent-1', 'agent-2', 'agent-3'];
  const patternCounts = [100, 1000, 10000, 50000];

  const suite: BenchmarkSuite = {
    name: 'Pattern Query Optimization',
    results: [],
    summary: {
      avgQueryTime: 0,
      avgCacheHitTime: 0,
      totalImprovement: 0
    }
  };

  // Run benchmarks
  console.log('\n📊 Running benchmarks...\n');

  for (const count of patternCounts) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Testing with ${count.toLocaleString()} patterns`);
    console.log('='.repeat(80));

    const result = await benchmarkQueries(manager, agentIds, count);
    suite.results.push(result);

    console.log(`\n📈 Results:`);
    console.log(`   First Query (uncached): ${result.queryTime.toFixed(2)}ms`);
    console.log(`   Second Query (cached):  ${result.cacheHitTime?.toFixed(2)}ms`);
    console.log(`   Cache Speedup:          ${(result.queryTime / (result.cacheHitTime || 1)).toFixed(0)}×`);
    console.log(`   Index Used:             ${result.indexUsed ? '✓' : '✗'}`);
    console.log(`   Patterns Returned:      ${result.patternsReturned}`);

    // Concurrent queries test
    if (count >= 1000) {
      console.log(`\n🔄 Concurrent Queries Test:`);
      const concurrent = await benchmarkConcurrentQueries(manager, agentIds, count);
      console.log(`   10 concurrent queries:  ${concurrent.totalTime.toFixed(2)}ms total`);
      console.log(`   Average per query:      ${concurrent.avgTime.toFixed(2)}ms`);
    }
  }

  // Calculate summary
  suite.summary.avgQueryTime = suite.results.reduce((sum, r) => sum + r.queryTime, 0) / suite.results.length;
  suite.summary.avgCacheHitTime = suite.results.reduce((sum, r) => sum + (r.cacheHitTime || 0), 0) / suite.results.length;
  suite.summary.totalImprovement = suite.summary.avgQueryTime / suite.summary.avgCacheHitTime;

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 Benchmark Summary');
  console.log('='.repeat(80));

  console.log('\n Performance Metrics:');
  console.log('   Average uncached query: ' + suite.summary.avgQueryTime.toFixed(2) + 'ms');
  console.log('   Average cached query:   ' + suite.summary.avgCacheHitTime.toFixed(2) + 'ms');
  console.log('   Overall improvement:    ' + suite.summary.totalImprovement.toFixed(0) + '×');

  console.log('\n Comparison Table:');
  console.log('   ┌────────────┬─────────────┬────────────┬──────────────┐');
  console.log('   │  Patterns  │  Uncached   │   Cached   │  Improvement │');
  console.log('   ├────────────┼─────────────┼────────────┼──────────────┤');

  for (const result of suite.results) {
    const improvement = result.queryTime / (result.cacheHitTime || 1);
    console.log(
      `   │ ${result.patternCount.toLocaleString().padStart(10)} │ ` +
      `${result.queryTime.toFixed(2).padStart(8)}ms │ ` +
      `${(result.cacheHitTime || 0).toFixed(2).padStart(7)}ms │ ` +
      `${improvement.toFixed(0).padStart(11)}× │`
    );
  }

  console.log('   └────────────┴─────────────┴────────────┴──────────────┘');

  // Cache statistics
  const cacheStats = manager.getPatternCacheStats();
  console.log('\n Cache Statistics:');
  console.log(`   Size:       ${cacheStats.size}/${cacheStats.maxSize}`);
  console.log(`   Hit rate:   ${(cacheStats.hitRate * 100).toFixed(1)}%`);
  console.log(`   Total hits: ${cacheStats.totalHits}`);
  console.log(`   Misses:     ${cacheStats.totalMisses}`);
  console.log(`   Evictions:  ${cacheStats.evictions}`);

  // Expected vs Actual comparison
  console.log('\n Expected Performance (based on O(n) vs O(log n)):');
  console.log('   Before Optimization (O(n) LIKE query):');
  console.log('     100 patterns:    ~15ms');
  console.log('     1,000 patterns:  ~85ms');
  console.log('     10,000 patterns: ~650ms');
  console.log('     50,000 patterns: ~3,200ms');

  console.log('\n   After Optimization (O(log n) indexed query):');
  for (const result of suite.results) {
    console.log(`     ${result.patternCount.toLocaleString().padStart(7)} patterns: ${result.queryTime.toFixed(1).padStart(6)}ms` +
      ` (cached: ${(result.cacheHitTime || 0).toFixed(2)}ms)`);
  }

  // Success criteria
  console.log('\n✅ Success Criteria:');
  const criteria = [
    {
      name: 'Query time <5ms for 10k patterns',
      actual: suite.results.find(r => r.patternCount === 10000)?.queryTime || 0,
      expected: 5,
      passed: (suite.results.find(r => r.patternCount === 10000)?.queryTime || 0) < 5
    },
    {
      name: 'Cache hit rate >80%',
      actual: cacheStats.hitRate * 100,
      expected: 80,
      passed: cacheStats.hitRate > 0.8
    },
    {
      name: 'Index used for queries',
      actual: suite.results.every(r => r.indexUsed) ? 100 : 0,
      expected: 100,
      passed: suite.results.every(r => r.indexUsed)
    },
    {
      name: 'Improvement >100× at 50k patterns',
      actual: suite.results.find(r => r.patternCount === 50000)?.queryTime || 0,
      expected: 32, // 3200ms / 100 = 32ms
      passed: (suite.results.find(r => r.patternCount === 50000)?.queryTime || 0) < 32
    }
  ];

  for (const criterion of criteria) {
    const status = criterion.passed ? '✓' : '✗';
    console.log(`   ${status} ${criterion.name}`);
    console.log(`      Expected: <${criterion.expected}, Actual: ${criterion.actual.toFixed(1)}`);
  }

  const allPassed = criteria.every(c => c.passed);
  console.log(`\n${allPassed ? '✅' : '❌'} Benchmark ${allPassed ? 'PASSED' : 'FAILED'}`);

  // Cleanup
  await manager.close();
  await fs.remove(dbPath);

  console.log('\n' + '='.repeat(80));
  process.exit(allPassed ? 0 : 1);
}

// Run benchmarks
if (require.main === module) {
  runBenchmarks().catch((error) => {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  });
}

export { runBenchmarks, benchmarkQueries, benchmarkConcurrentQueries };
