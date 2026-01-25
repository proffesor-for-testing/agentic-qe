/**
 * AgentDBManager Usage Examples
 *
 * Demonstrates how to use AgentDBManager for:
 * - Memory storage and retrieval
 * - QUIC synchronization
 * - Neural training
 * - Hybrid search
 * - Context synthesis
 */

import { createAgentDBManager, AgentDBConfig, MemoryPattern } from '../src/core/memory/AgentDBManager';

// Example 1: Basic Usage
async function basicExample() {
  console.log('=== Example 1: Basic Usage ===');

  // Create manager with default config
  const manager = createAgentDBManager();

  // Initialize
  await manager.initialize();

  // Store a pattern
  const pattern: MemoryPattern = {
    id: '',
    type: 'conversation',
    domain: 'user-interactions',
    pattern_data: JSON.stringify({
      embedding: Array(768).fill(0).map(() => Math.random()), // Mock 768-dim embedding
      pattern: {
        user: 'What is the capital of France?',
        assistant: 'The capital of France is Paris.',
        timestamp: Date.now(),
      },
    }),
    confidence: 0.95,
    usage_count: 1,
    success_count: 1,
    created_at: Date.now(),
    last_used: Date.now(),
  };

  const patternId = await manager.store(pattern);
  console.log('Stored pattern ID:', patternId);

  // Retrieve similar patterns
  const queryEmbedding = Array(768).fill(0).map(() => Math.random());
  const result = await manager.search(queryEmbedding, 'user-interactions', 5);

  console.log('Found memories:', result.memories.length);
  console.log('Query time:', result.metadata.queryTime, 'ms');

  // Cleanup
  await manager.close();
}

// Example 2: QUIC Synchronization
async function quicSyncExample() {
  console.log('\n=== Example 2: QUIC Synchronization ===');

  const config: Partial<AgentDBConfig> = {
    dbPath: '.agentdb/node1.db',
    enableQUICSync: true,
    syncPort: 4433,
    syncPeers: [
      'localhost:4434', // Node 2
      'localhost:4435', // Node 3
    ],
    syncInterval: 1000, // Sync every second
    syncBatchSize: 100,
    compression: true,
  };

  const manager = createAgentDBManager(config);
  await manager.initialize();

  console.log('QUIC sync enabled on port 4433');
  console.log('Connected to peers:', config.syncPeers);

  // Store pattern - will sync to peers automatically
  const pattern: MemoryPattern = {
    id: '',
    type: 'task',
    domain: 'distributed-system',
    pattern_data: JSON.stringify({
      embedding: Array(768).fill(0).map(() => Math.random()),
      pattern: {
        task: 'Process data',
        status: 'completed',
        node: 'node1',
      },
    }),
    confidence: 1.0,
    usage_count: 1,
    success_count: 1,
    created_at: Date.now(),
    last_used: Date.now(),
  };

  await manager.store(pattern);
  console.log('Pattern stored and syncing to peers (<1ms)');

  // Wait for sync
  await new Promise(resolve => setTimeout(resolve, 1000));

  await manager.close();
}

// Example 3: Neural Training
async function neuralTrainingExample() {
  console.log('\n=== Example 3: Neural Training ===');

  const manager = createAgentDBManager({
    enableLearning: true,
    enableReasoning: true,
    quantizationType: 'scalar', // 4x memory reduction
  });

  await manager.initialize();

  // Store training experiences
  console.log('Storing training experiences...');
  for (let i = 0; i < 100; i++) {
    const experience: MemoryPattern = {
      id: '',
      type: 'experience',
      domain: 'game-playing',
      pattern_data: JSON.stringify({
        embedding: Array(768).fill(0).map(() => Math.random()),
        pattern: {
          state: Array(10).fill(0).map(() => Math.random()),
          action: Math.floor(Math.random() * 4),
          reward: Math.random(),
          next_state: Array(10).fill(0).map(() => Math.random()),
          done: Math.random() > 0.9,
        },
      }),
      confidence: Math.random(),
      usage_count: 1,
      success_count: Math.random() > 0.5 ? 1 : 0,
      created_at: Date.now(),
      last_used: Date.now(),
    };

    await manager.store(experience);
  }

  // Train learning model
  console.log('Training learning model...');
  const metrics = await manager.train({
    epochs: 50,
    batchSize: 32,
    learningRate: 0.001,
    validationSplit: 0.2,
  });

  console.log('Training complete:');
  console.log('  Loss:', metrics.loss);
  console.log('  Val Loss:', metrics.valLoss);
  console.log('  Duration:', metrics.duration, 'ms');
  console.log('  Epochs:', metrics.epochs);

  await manager.close();
}

// Example 4: Hybrid Search
async function hybridSearchExample() {
  console.log('\n=== Example 4: Hybrid Search ===');

  const manager = createAgentDBManager();
  await manager.initialize();

  // Store research papers with metadata
  const papers = [
    { title: 'Neural Networks', year: 2025, category: 'ai', citations: 150 },
    { title: 'Deep Learning', year: 2024, category: 'ai', citations: 200 },
    { title: 'Quantum Computing', year: 2023, category: 'quantum', citations: 80 },
    { title: 'Blockchain', year: 2025, category: 'crypto', citations: 120 },
  ];

  console.log('Storing research papers...');
  for (const paper of papers) {
    const pattern: MemoryPattern = {
      id: '',
      type: 'document',
      domain: 'research-papers',
      pattern_data: JSON.stringify({
        embedding: Array(768).fill(0).map(() => Math.random()),
        text: paper.title,
        metadata: paper,
      }),
      confidence: 1.0,
      usage_count: 0,
      success_count: 0,
      created_at: Date.now(),
      last_used: Date.now(),
    };

    await manager.store(pattern);
  }

  // Search with filters
  const queryEmbedding = Array(768).fill(0).map(() => Math.random());
  const result = await manager.retrieve(queryEmbedding, {
    domain: 'research-papers',
    k: 10,
    filters: {
      year: { $gte: 2024 }, // Published 2024 or later
      category: 'ai',        // AI papers only
      citations: { $gte: 100 }, // Highly cited
    },
    metric: 'cosine',
  });

  console.log('Hybrid search results:', result.memories.length);
  result.memories.forEach((memory, i) => {
    const data = JSON.parse(memory.pattern_data);
    console.log(`  ${i + 1}. ${data.metadata.title} (${data.metadata.citations} citations, similarity: ${memory.similarity.toFixed(3)})`);
  });

  await manager.close();
}

// Example 5: Context Synthesis
async function contextSynthesisExample() {
  console.log('\n=== Example 5: Context Synthesis ===');

  const manager = createAgentDBManager({
    enableReasoning: true,
  });

  await manager.initialize();

  // Store problem-solving attempts
  const attempts = [
    { approach: 'brute-force', success: false, time: 1000 },
    { approach: 'divide-conquer', success: true, time: 100 },
    { approach: 'dynamic-programming', success: true, time: 50 },
    { approach: 'greedy', success: false, time: 200 },
  ];

  console.log('Storing problem-solving attempts...');
  for (const attempt of attempts) {
    const pattern: MemoryPattern = {
      id: '',
      type: 'attempt',
      domain: 'problem-solving',
      pattern_data: JSON.stringify({
        embedding: Array(768).fill(0).map(() => Math.random()),
        pattern: attempt,
      }),
      confidence: attempt.success ? 0.9 : 0.3,
      usage_count: 1,
      success_count: attempt.success ? 1 : 0,
      created_at: Date.now(),
      last_used: Date.now(),
    };

    await manager.store(pattern);
  }

  // Retrieve with context synthesis
  const queryEmbedding = Array(768).fill(0).map(() => Math.random());
  const result = await manager.retrieve(queryEmbedding, {
    domain: 'problem-solving',
    k: 10,
    synthesizeContext: true,
    optimizeMemory: true,
    useMMR: true, // Diverse results
  });

  console.log('\nSynthesized Context:');
  console.log(result.context);
  console.log('\nExtracted Patterns:');
  result.patterns?.forEach((pattern, i) => {
    console.log(`  ${i + 1}. ${pattern}`);
  });

  await manager.close();
}

// Example 6: Performance Monitoring
async function performanceExample() {
  console.log('\n=== Example 6: Performance Monitoring ===');

  const manager = createAgentDBManager({
    quantizationType: 'binary', // 32x memory reduction
    cacheSize: 2000,            // Large cache
  });

  await manager.initialize();

  // Get initial stats
  const statsBefore = await manager.getStats();
  console.log('Initial Stats:');
  console.log('  Total Patterns:', statsBefore.totalPatterns);
  console.log('  Database Size:', statsBefore.dbSize);
  console.log('  Cache Hit Rate:', statsBefore.cacheHitRate);

  // Perform operations
  console.log('\nPerforming 100 operations...');
  const startTime = Date.now();

  for (let i = 0; i < 100; i++) {
    const pattern: MemoryPattern = {
      id: '',
      type: 'test',
      domain: 'performance',
      pattern_data: JSON.stringify({
        embedding: Array(768).fill(0).map(() => Math.random()),
        data: { iteration: i },
      }),
      confidence: 1.0,
      usage_count: 1,
      success_count: 1,
      created_at: Date.now(),
      last_used: Date.now(),
    };

    await manager.store(pattern);
  }

  const operationTime = Date.now() - startTime;
  console.log('Operations completed in:', operationTime, 'ms');
  console.log('Avg time per operation:', (operationTime / 100).toFixed(2), 'ms');

  // Get final stats
  const statsAfter = await manager.getStats();
  console.log('\nFinal Stats:');
  console.log('  Total Patterns:', statsAfter.totalPatterns);
  console.log('  Database Size:', statsAfter.dbSize);
  console.log('  Cache Hit Rate:', statsAfter.cacheHitRate);
  console.log('  Avg Search Latency:', statsAfter.avgSearchLatency);

  await manager.close();
}

// Run all examples
async function runAllExamples() {
  try {
    await basicExample();
    await quicSyncExample();
    await neuralTrainingExample();
    await hybridSearchExample();
    await contextSynthesisExample();
    await performanceExample();

    console.log('\n=== All Examples Completed Successfully ===');
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

// Run if executed directly
if (require.main === module) {
  runAllExamples();
}

export {
  basicExample,
  quicSyncExample,
  neuralTrainingExample,
  hybridSearchExample,
  contextSynthesisExample,
  performanceExample,
};
