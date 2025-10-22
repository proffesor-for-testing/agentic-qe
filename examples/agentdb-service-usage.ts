/**
 * AgentDBService Usage Example
 *
 * Demonstrates how to use AgentDBService for pattern storage and retrieval
 * with vector embeddings and HNSW search.
 */

import { createAgentDBService, QEPattern } from '../src/core/memory';

/**
 * Example 1: Basic Pattern Storage and Retrieval
 */
async function example1_basicUsage() {
  console.log('\n=== Example 1: Basic Usage ===\n');

  // Create service
  const service = createAgentDBService({
    dbPath: '.agentic-qe/agentdb/examples.db',
    embeddingDim: 384 // all-MiniLM-L6-v2 dimension
  });

  // Initialize
  await service.initialize();

  // Create a pattern
  const pattern: QEPattern = {
    id: 'test-pattern-1',
    type: 'test-generator',
    domain: 'unit-testing',
    data: {
      framework: 'jest',
      language: 'typescript',
      testType: 'unit'
    },
    confidence: 0.95,
    usageCount: 1,
    successCount: 1,
    createdAt: Date.now(),
    lastUsed: Date.now()
  };

  // Generate a mock embedding (in real usage, use actual embedding model)
  const embedding = Array.from({ length: 384 }, () => Math.random());

  // Store pattern
  const id = await service.storePattern(pattern, embedding);
  console.log(`✓ Stored pattern: ${id}`);

  // Retrieve pattern
  const retrieved = await service.retrievePattern(id);
  console.log(`✓ Retrieved pattern:`, {
    id: retrieved?.id,
    type: retrieved?.type,
    domain: retrieved?.domain,
    confidence: retrieved?.confidence
  });

  // Clean up
  await service.close();
}

/**
 * Example 2: Vector Similarity Search
 */
async function example2_vectorSearch() {
  console.log('\n=== Example 2: Vector Similarity Search ===\n');

  const service = createAgentDBService({
    dbPath: '.agentic-qe/agentdb/examples.db',
    embeddingDim: 384
  });

  await service.initialize();

  // Store multiple patterns
  const patterns: Array<{ pattern: QEPattern; embedding: number[] }> = [
    {
      pattern: {
        id: 'jest-unit-1',
        type: 'test-generator',
        domain: 'unit-testing',
        data: { framework: 'jest', testType: 'unit' },
        confidence: 0.95,
        usageCount: 10,
        successCount: 9,
        createdAt: Date.now(),
        lastUsed: Date.now()
      },
      embedding: Array.from({ length: 384 }, () => 0.1 + Math.random() * 0.1)
    },
    {
      pattern: {
        id: 'vitest-unit-1',
        type: 'test-generator',
        domain: 'unit-testing',
        data: { framework: 'vitest', testType: 'unit' },
        confidence: 0.90,
        usageCount: 5,
        successCount: 4,
        createdAt: Date.now(),
        lastUsed: Date.now()
      },
      embedding: Array.from({ length: 384 }, () => 0.15 + Math.random() * 0.1)
    },
    {
      pattern: {
        id: 'cypress-e2e-1',
        type: 'test-generator',
        domain: 'e2e-testing',
        data: { framework: 'cypress', testType: 'e2e' },
        confidence: 0.85,
        usageCount: 3,
        successCount: 3,
        createdAt: Date.now(),
        lastUsed: Date.now()
      },
      embedding: Array.from({ length: 384 }, () => 0.5 + Math.random() * 0.1)
    }
  ];

  console.log('Storing patterns...');
  for (const { pattern, embedding } of patterns) {
    await service.storePattern(pattern, embedding);
  }
  console.log(`✓ Stored ${patterns.length} patterns`);

  // Search for similar patterns
  const queryEmbedding = Array.from({ length: 384 }, () => 0.12 + Math.random() * 0.1);

  const results = await service.searchSimilar(queryEmbedding, {
    k: 3,
    metric: 'cosine',
    domain: 'unit-testing'
  });

  console.log(`\n✓ Found ${results.length} similar patterns:`);
  results.forEach((result, i) => {
    console.log(`  ${i + 1}. ${result.pattern.id} (similarity: ${result.similarity.toFixed(4)})`);
    console.log(`     Framework: ${result.pattern.data.framework}`);
    console.log(`     Confidence: ${result.pattern.confidence}`);
  });

  await service.close();
}

/**
 * Example 3: Batch Operations (High Performance)
 */
async function example3_batchOperations() {
  console.log('\n=== Example 3: Batch Operations ===\n');

  const service = createAgentDBService({
    dbPath: '.agentic-qe/agentdb/examples.db',
    embeddingDim: 384
  });

  await service.initialize();

  // Generate 100 patterns
  const patterns: QEPattern[] = Array.from({ length: 100 }, (_, i) => ({
    id: `batch-pattern-${i}`,
    type: 'test-generator',
    domain: 'performance-testing',
    data: { index: i, framework: 'k6' },
    confidence: 0.8 + Math.random() * 0.2,
    usageCount: 1,
    successCount: 1,
    createdAt: Date.now(),
    lastUsed: Date.now()
  }));

  const embeddings = Array.from({ length: 100 }, () =>
    Array.from({ length: 384 }, () => Math.random())
  );

  console.log('Performing batch insert of 100 patterns...');
  const startTime = Date.now();

  const result = await service.storeBatch(patterns, embeddings);

  const duration = Date.now() - startTime;

  console.log(`\n✓ Batch insert complete:`);
  console.log(`  Success: ${result.success}`);
  console.log(`  Inserted: ${result.insertedIds.length} patterns`);
  console.log(`  Errors: ${result.errors.length}`);
  console.log(`  Duration: ${result.duration}ms`);
  console.log(`  Throughput: ${(patterns.length / (duration / 1000)).toFixed(0)} patterns/sec`);

  await service.close();
}

/**
 * Example 4: Advanced Filtering
 */
async function example4_advancedFiltering() {
  console.log('\n=== Example 4: Advanced Filtering ===\n');

  const service = createAgentDBService({
    dbPath: '.agentic-qe/agentdb/examples.db',
    embeddingDim: 384
  });

  await service.initialize();

  const queryEmbedding = Array.from({ length: 384 }, () => Math.random());

  // Search with multiple filters
  const results = await service.searchSimilar(queryEmbedding, {
    k: 10,
    metric: 'cosine',
    threshold: 0.7,
    domain: 'unit-testing',
    type: 'test-generator',
    minConfidence: 0.85
  });

  console.log(`✓ Found ${results.length} patterns matching all filters:`);
  console.log(`  - Domain: unit-testing`);
  console.log(`  - Type: test-generator`);
  console.log(`  - Min confidence: 0.85`);
  console.log(`  - Similarity threshold: 0.7`);

  await service.close();
}

/**
 * Example 5: Statistics and Monitoring
 */
async function example5_statistics() {
  console.log('\n=== Example 5: Statistics and Monitoring ===\n');

  const service = createAgentDBService({
    dbPath: '.agentic-qe/agentdb/examples.db',
    embeddingDim: 384,
    enableCache: true,
    cacheSize: 1000
  });

  await service.initialize();

  // Get database statistics
  const stats = await service.getStats();

  console.log('✓ Database Statistics:');
  console.log(`  Total patterns: ${stats.count}`);
  console.log(`  Database size: ${(stats.size / 1024).toFixed(2)} KB`);

  if (stats.cacheStats) {
    console.log(`\n✓ Cache Statistics:`);
    console.log(`  Hits: ${stats.cacheStats.hits || 0}`);
    console.log(`  Misses: ${stats.cacheStats.misses || 0}`);
    console.log(`  Hit rate: ${stats.cacheStats.hitRate?.toFixed(2) || 0}%`);
  }

  if (stats.compressionStats) {
    console.log(`\n✓ Compression Statistics:`);
    console.log(`  Original size: ${stats.compressionStats.originalSize} bytes`);
    console.log(`  Compressed size: ${stats.compressionStats.compressedSize} bytes`);
    console.log(`  Ratio: ${stats.compressionStats.ratio.toFixed(2)}x`);
  }

  await service.close();
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║   AgentDBService Usage Examples                  ║');
  console.log('╚═══════════════════════════════════════════════════╝');

  try {
    await example1_basicUsage();
    await example2_vectorSearch();
    await example3_batchOperations();
    await example4_advancedFiltering();
    await example5_statistics();

    console.log('\n✓ All examples completed successfully!\n');
  } catch (error) {
    console.error('\n✗ Example failed:', error);
    process.exit(1);
  }
}

// Run examples if executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}

export {
  example1_basicUsage,
  example2_vectorSearch,
  example3_batchOperations,
  example4_advancedFiltering,
  example5_statistics
};
