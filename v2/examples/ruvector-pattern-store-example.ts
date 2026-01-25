/**
 * RuVector Pattern Store Usage Example
 *
 * Demonstrates how to use RuVector for high-performance test pattern storage.
 *
 * Run: npx ts-node examples/ruvector-pattern-store-example.ts
 */

import {
  RuVectorPatternStore,
  createQEPatternStore,
  TestPattern,
} from '../src/core/memory/RuVectorPatternStore';

async function main() {
  console.log('='.repeat(60));
  console.log('RuVector Pattern Store - Usage Example');
  console.log('='.repeat(60));

  // Create a pattern store (uses sensible defaults for QE)
  const store = createQEPatternStore('./data/example-patterns.ruvector');

  try {
    // Initialize
    await store.initialize();

    // Show implementation info
    const info = store.getImplementationInfo();
    console.log(`\n✓ Initialized RuVector (${info.type} v${info.version})`);

    // Example 1: Store individual patterns
    console.log('\n--- Storing Individual Patterns ---');

    const authTestPattern: TestPattern = {
      id: 'auth-login-001',
      type: 'unit-test',
      domain: 'authentication',
      content: 'Test user login with valid credentials returns JWT token',
      embedding: generateEmbedding('authentication login JWT token validation'),
      framework: 'jest',
      coverage: 0.92,
      flakinessScore: 0.02,
      verdict: 'success',
    };

    await store.storePattern(authTestPattern);
    console.log(`✓ Stored pattern: ${authTestPattern.id}`);

    const apiTestPattern: TestPattern = {
      id: 'api-users-002',
      type: 'integration-test',
      domain: 'api',
      content: 'Test GET /users endpoint returns paginated user list',
      embedding: generateEmbedding('API users endpoint REST pagination'),
      framework: 'jest',
      coverage: 0.88,
      flakinessScore: 0.05,
      verdict: 'success',
    };

    await store.storePattern(apiTestPattern);
    console.log(`✓ Stored pattern: ${apiTestPattern.id}`);

    // Example 2: Batch insert (faster for bulk operations)
    console.log('\n--- Batch Insert ---');

    const batchPatterns: TestPattern[] = [
      {
        id: 'db-query-003',
        type: 'unit-test',
        domain: 'database',
        content: 'Test SQL query builder generates valid SELECT statements',
        embedding: generateEmbedding('database SQL query builder SELECT'),
        framework: 'vitest',
        coverage: 0.95,
        verdict: 'success',
      },
      {
        id: 'ui-button-004',
        type: 'component-test',
        domain: 'ui',
        content: 'Test Button component renders with correct styles',
        embedding: generateEmbedding('UI button component React styles'),
        framework: 'jest',
        coverage: 0.90,
        verdict: 'success',
      },
      {
        id: 'auth-logout-005',
        type: 'unit-test',
        domain: 'authentication',
        content: 'Test user logout invalidates session token',
        embedding: generateEmbedding('authentication logout session token invalidate'),
        framework: 'jest',
        coverage: 0.85,
        verdict: 'success',
      },
    ];

    await store.storeBatch(batchPatterns);
    console.log(`✓ Batch inserted ${batchPatterns.length} patterns`);

    // Build HNSW index for fast search
    await store.buildIndex();
    console.log('✓ Built HNSW index');

    // Example 3: Search for similar patterns
    console.log('\n--- Searching for Similar Patterns ---');

    // Search for authentication-related patterns
    const authQuery = generateEmbedding('test authentication login user session');
    const authResults = await store.searchSimilar(authQuery, { k: 3 });

    console.log('\nQuery: "test authentication login user session"');
    console.log(`Found ${authResults.length} similar patterns:`);
    for (const result of authResults) {
      console.log(`  - ${result.pattern.id} (score: ${result.score.toFixed(4)})`);
      console.log(`    Content: ${result.pattern.content.substring(0, 60)}...`);
      console.log(`    Domain: ${result.pattern.domain}, Framework: ${result.pattern.framework}`);
    }

    // Search with domain filter
    console.log('\n--- Filtered Search (domain: authentication) ---');
    const filteredResults = await store.searchSimilar(authQuery, {
      k: 5,
      domain: 'authentication',
    });

    console.log(`Found ${filteredResults.length} authentication patterns:`);
    for (const result of filteredResults) {
      console.log(`  - ${result.pattern.id} (score: ${result.score.toFixed(4)})`);
    }

    // Example 4: Get pattern by ID
    console.log('\n--- Get Pattern by ID ---');
    const retrieved = await store.getPattern('auth-login-001');
    if (retrieved) {
      console.log(`✓ Retrieved: ${retrieved.id}`);
      console.log(`  Domain: ${retrieved.domain}`);
      console.log(`  Coverage: ${(retrieved.coverage! * 100).toFixed(1)}%`);
      console.log(`  Flakiness: ${(retrieved.flakinessScore! * 100).toFixed(1)}%`);
    }

    // Example 5: Record usage (updates lastUsed and usageCount)
    console.log('\n--- Recording Usage ---');
    await store.recordUsage('auth-login-001');
    const updated = await store.getPattern('auth-login-001');
    console.log(`✓ Updated usage count: ${updated?.usageCount}`);

    // Example 6: Get statistics
    console.log('\n--- Database Statistics ---');
    const stats = await store.getStats();
    console.log(`  Total vectors: ${stats.count}`);
    console.log(`  Dimension: ${stats.dimension}`);
    console.log(`  Metric: ${stats.metric}`);
    console.log(`  Implementation: ${stats.implementation}`);
    if (stats.memoryUsage) {
      console.log(`  Memory usage: ${(stats.memoryUsage / 1024).toFixed(2)} KB`);
    }

    // Example 7: Performance demo
    console.log('\n--- Performance Demo ---');
    const testEmbedding = generateEmbedding('test performance benchmark');

    // Measure search latency
    const iterations = 100;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await store.searchSimilar(testEmbedding, { k: 10 });
      times.push(performance.now() - start);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    console.log(`  Search latency (${iterations} iterations):`);
    console.log(`    Avg: ${avg.toFixed(3)}ms`);
    console.log(`    Min: ${min.toFixed(3)}ms`);
    console.log(`    Max: ${max.toFixed(3)}ms`);

    // Example 8: Cleanup
    console.log('\n--- Cleanup ---');
    await store.save();
    console.log('✓ Saved to disk');

    await store.shutdown();
    console.log('✓ Shutdown complete');

    console.log('\n' + '='.repeat(60));
    console.log('Example completed successfully!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('Error:', error);
    await store.shutdown();
    process.exit(1);
  }
}

/**
 * Generate a simple embedding (in production, use a real embedding model)
 */
function generateEmbedding(text: string): number[] {
  // Simple hash-based embedding for demo purposes
  // In production, use MiniLM or similar transformer model
  const dimension = 384;
  const embedding = new Array(dimension).fill(0);

  // Create a deterministic embedding based on text content
  const words = text.toLowerCase().split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const charCode = word.charCodeAt(j);
      const idx = (i * 7 + j * 13 + charCode) % dimension;
      embedding[idx] += (charCode / 255) * 0.1;
    }
  }

  // Normalize to unit vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimension; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}

// Run the example
main().catch(console.error);
