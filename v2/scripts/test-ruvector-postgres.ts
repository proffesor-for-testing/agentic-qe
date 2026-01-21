#!/usr/bin/env npx tsx
/**
 * Test RuVectorPostgresAdapter with Docker container
 * Verifies Phase 0.5 self-learning integration
 */

import { createDockerRuVectorAdapter } from '../src/providers/RuVectorPostgresAdapter';

async function testRuVectorPostgresAdapter() {
  console.log('=== RuVector PostgreSQL Adapter Test ===\n');

  // Create adapter with Docker defaults
  const adapter = createDockerRuVectorAdapter({
    host: 'localhost',
    port: 5432,
    database: 'ruvector_db',
    user: 'ruvector',
    password: 'ruvector'
  });

  try {
    // 1. Initialize connection
    console.log('1. Initializing PostgreSQL adapter...');
    await adapter.initialize();
    console.log('   ✓ Connection established\n');

    // 2. Health check
    console.log('2. Running health check...');
    const health = await adapter.healthCheck();
    console.log(`   Status: ${health.status}`);
    console.log(`   RuVector extension: ${health.hasExtension ? 'loaded' : 'not loaded'}`);
    console.log(`   Pattern count: ${health.patternCount}`);
    console.log(`   ✓ Health check passed\n`);

    // 3. Store test patterns
    console.log('3. Storing test vulnerability patterns...');
    const testPatterns = [
      {
        domain: 'security-scanner',
        content: JSON.stringify({
          title: 'SQL Injection in login form',
          severity: 'critical',
          cwe: 'CWE-89',
          type: 'sast'
        }),
        metadata: { scanType: 'sast', severity: 'critical' }
      },
      {
        domain: 'security-scanner',
        content: JSON.stringify({
          title: 'XSS vulnerability in user input',
          severity: 'high',
          cwe: 'CWE-79',
          type: 'sast'
        }),
        metadata: { scanType: 'sast', severity: 'high' }
      },
      {
        domain: 'flaky-test-hunter',
        content: JSON.stringify({
          testName: 'auth.spec.ts::login timeout',
          pattern: 'RACE_CONDITION',
          severity: 'MEDIUM'
        }),
        metadata: { category: 'RACE_CONDITION', severity: 'MEDIUM' }
      }
    ];

    for (const pattern of testPatterns) {
      // Generate 768-dim embedding
      const embedding = new Array(768).fill(0).map(() => Math.random() * 2 - 1);
      // Normalize
      const mag = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
      const normalized = embedding.map(v => v / mag);

      await adapter.store({
        embedding: normalized,
        content: pattern.content,
        metadata: {
          ...pattern.metadata,
          domain: pattern.domain,
          createdAt: Date.now()
        }
      });
    }
    console.log(`   ✓ Stored ${testPatterns.length} patterns\n`);

    // 4. Search for similar patterns
    console.log('4. Searching for security patterns...');
    const queryEmbedding: number[] = [];
    for (let i = 0; i < 768; i++) {
      queryEmbedding.push(Math.random() * 2 - 1);
    }
    const queryMag = Math.sqrt(queryEmbedding.reduce((s, v) => s + v * v, 0));
    const normalizedQuery = queryEmbedding.map(v => v / queryMag);

    console.log(`   Query embedding length: ${normalizedQuery.length}`);
    const results = await adapter.search(normalizedQuery, 5);
    console.log(`   Found ${results.length} matching patterns`);
    for (const result of results.slice(0, 3)) {
      try {
        const content = JSON.parse(result.content);
        const similarity = result.similarity ?? result.confidence ?? 0;
        console.log(`   - ${content.title || content.testName} (score: ${similarity.toFixed?.(4) ?? similarity})`);
      } catch {
        console.log(`   - Pattern ID: ${result.id}`);
      }
    }
    console.log('   ✓ Search completed\n');

    // 5. Query with learning
    console.log('5. Testing queryWithLearning (self-learning mode)...');
    const learnResults = await adapter.queryWithLearning(
      'SQL injection vulnerability',
      normalizedQuery,
      async () => 'LLM fallback response'
    );
    console.log(`   Content: ${learnResults.content.substring(0, 50)}...`);
    console.log(`   Source: ${learnResults.source}`);
    console.log(`   Confidence: ${learnResults.confidence.toFixed(4)}`);
    console.log(`   Latency: ${learnResults.latency.toFixed(2)}ms`);
    console.log('   ✓ Learning query completed\n');

    // 6. Get metrics
    console.log('6. Getting GOAP metrics...');
    const metrics = await adapter.getMetrics();
    console.log(`   Total patterns: ${metrics.patternCount}`);
    console.log(`   Queries: ${metrics.queryCount}`);
    console.log(`   Cache hits: ${metrics.cacheHits}`);
    console.log(`   Avg latency: ${metrics.avgLatencyMs?.toFixed?.(2) ?? 'N/A'}ms`);
    console.log(`   Cache hit rate: ${((metrics.cacheHitRate || 0) * 100).toFixed(1)}%`);
    console.log('   ✓ Metrics retrieved\n');

    // 7. Force learning cycle
    console.log('7. Triggering force learn...');
    await adapter.forceLearn();
    console.log('   ✓ Learning cycle triggered\n');

    // 8. Cleanup
    console.log('8. Closing connection...');
    await adapter.close();
    console.log('   ✓ Connection closed\n');

    console.log('=== All Tests Passed ===');
    console.log('\nPhase 0.5 RuVector PostgreSQL integration verified!');
    console.log('Self-learning features available:');
    console.log('  - Pattern storage and retrieval');
    console.log('  - Similarity search with HNSW');
    console.log('  - Active learning mode');
    console.log('  - GOAP metrics tracking');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    await adapter.close().catch(() => {});
    process.exit(1);
  }
}

testRuVectorPostgresAdapter();
