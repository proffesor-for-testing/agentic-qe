# AgentDB Integration Documentation

## Overview

AgentDB provides high-performance vector database capabilities with QUIC synchronization, HNSW indexing, and reinforcement learning plugins for AI agents.

## Features

✅ **150x Faster Vector Search** - HNSW indexing vs linear search
✅ **QUIC Synchronization** - <1ms latency for real-time sync
✅ **9 RL Algorithms** - Decision Transformer, Q-Learning, SARSA, Actor-Critic, DQN, PPO, A3C, REINFORCE, Monte Carlo
✅ **Vector Embeddings** - 384-dimension embeddings with quantization
✅ **Pattern Storage** - Persistent pattern storage with metadata
✅ **Batch Operations** - <2ms for 100 patterns

## Performance Benchmarks

### Vector Search (10K Vectors)

```
HNSW Search:    15ms
Linear Search:  2,250ms
Speedup:        150x faster ✓
```

### QUIC Sync Latency

```
Average:  0.8ms
P95:      1.2ms
Target:   <1ms ✓
```

### Batch Operations

```
100 patterns:  1.5ms
1000 patterns: 12ms
10000 patterns: 95ms
```

## Architecture

```
EnhancedAgentDBService
├── AgentDBService (base)
│   ├── Vector Storage (HNSW)
│   ├── Pattern Retrieval
│   └── Batch Operations
├── QUIC Transport
│   ├── Sub-ms Sync
│   └── Distributed Coordination
└── Learning Plugins
    ├── Q-Learning
    ├── SARSA
    ├── Actor-Critic
    └── 6 more algorithms
```

## Installation

```bash
npm install agentdb @babel/parser @babel/traverse
```

## Quick Start

### Basic Usage

```typescript
import { EnhancedAgentDBService } from 'agentic-qe/core/memory';

// Initialize
const agentDB = new EnhancedAgentDBService({
  dbPath: './.agentic-qe/agentdb.db',
  embeddingDim: 384,
  enableHNSW: true,
  enableCache: true,
  enableQuantization: true,
  enableQuic: true,
  enableLearning: true
});

await agentDB.initialize();
```

### Store Patterns

```typescript
const pattern = {
  id: 'pattern-1',
  type: 'test-generator',
  domain: 'unit-testing',
  data: { testType: 'unit', framework: 'jest' },
  confidence: 0.9,
  usageCount: 0,
  successCount: 0,
  createdAt: Date.now(),
  lastUsed: Date.now()
};

const embedding = await generateEmbedding(pattern.data);
const id = await agentDB.storePattern(pattern, embedding);
```

### Vector Search

```typescript
const queryEmbedding = await generateEmbedding(query);

const results = await agentDB.searchSimilar(queryEmbedding, {
  k: 10,
  metric: 'cosine',
  threshold: 0.7,
  domain: 'unit-testing',
  type: 'test-generator',
  minConfidence: 0.8
});

for (const result of results) {
  console.log(`Pattern: ${result.pattern.id}`);
  console.log(`Similarity: ${result.similarity}`);
  console.log(`Data:`, result.pattern.data);
}
```

## QUIC Synchronization

### Store with Sync

```typescript
// Stores locally and syncs via QUIC
const id = await agentDB.storePatternWithSync(pattern, embedding);

// Achieves <1ms latency for real-time coordination
```

### Configuration

```typescript
const agentDB = new EnhancedAgentDBService({
  // ... other config
  enableQuic: true,
  quicConfig: {
    host: 'localhost',
    port: 4433,
    channels: [
      { id: 'coordination', name: 'coordination', type: 'unicast', priority: 1 },
      { id: 'results', name: 'results', type: 'unicast', priority: 2 }
    ],
    connectionTimeout: 30000,
    enable0RTT: true,
    maxConcurrentStreams: 100
  }
});
```

## Learning Plugins

### Q-Learning

```typescript
// Train with experience
const experience = {
  state: { coverage: 75, complexity: 5 },
  action: 'generate-edge-cases',
  reward: 10,
  nextState: { coverage: 85, complexity: 5 },
  done: false
};

await agentDB.trainLearningPlugin('agent-1', experience, 'q-learning');
```

### Get Recommendations

```typescript
const recommendation = await agentDB.getLearningRecommendations(
  'agent-1',
  { coverage: 80 },
  'q-learning'
);

console.log(`Action: ${recommendation.action}`);
console.log(`Confidence: ${recommendation.confidence}`);
console.log(`Expected Reward: ${recommendation.expectedReward}`);
```

### Batch Training

```typescript
const experiences = [
  { state: {...}, action: 'a1', reward: 10, nextState: {...}, done: false },
  { state: {...}, action: 'a2', reward: 15, nextState: {...}, done: false },
  { state: {...}, action: 'a3', reward: 20, nextState: {...}, done: true }
];

await agentDB.batchTrain('agent-1', experiences, 'q-learning');
```

### Learning Statistics

```typescript
const stats = await agentDB.getLearningStats('agent-1');

console.log(`Total Experiences: ${stats.totalExperiences}`);
console.log(`Average Reward: ${stats.avgReward}`);
console.log(`Success Rate: ${stats.successRate}%`);
console.log(`Models Active: ${stats.modelsActive}`);
```

## Available RL Algorithms

| Algorithm | Use Case | Learning Rate | Best For |
|-----------|----------|---------------|----------|
| **Q-Learning** | Value-based, off-policy | 0.1 | General purpose, discrete actions |
| **SARSA** | Value-based, on-policy | 0.1 | Safe exploration, online learning |
| **Actor-Critic** | Policy gradient | 0.01 | Continuous actions, faster convergence |
| **DQN** | Deep Q-Network | 0.001 | Complex state spaces |
| **PPO** | Proximal Policy Optimization | 0.0003 | Stable training, high-dimensional |
| **A3C** | Asynchronous Actor-Critic | 0.0001 | Parallel training |
| **REINFORCE** | Monte Carlo Policy Gradient | 0.01 | Episodic tasks |
| **Monte Carlo** | Model-free | N/A | Complete episodes |
| **Decision Transformer** | Transformer-based | 0.0001 | Sequence modeling |

## Batch Operations

### High-Performance Batch Insert

```typescript
const patterns = [];
const embeddings = [];

for (let i = 0; i < 1000; i++) {
  patterns.push(createPattern(i));
  embeddings.push(generateEmbedding(i));
}

const result = await agentDB.storeBatch(patterns, embeddings);

console.log(`Inserted: ${result.insertedIds.length}`);
console.log(`Errors: ${result.errors.length}`);
console.log(`Duration: ${result.duration}ms`);
```

## Quantization

### Enable Memory Optimization

```typescript
const agentDB = new EnhancedAgentDBService({
  embeddingDim: 384,
  enableQuantization: true,
  quantizationBits: 8  // 4, 8, or 16 bits
});

// Reduces memory usage by 4x (32-bit to 8-bit)
// Maintains >95% accuracy
```

### Memory Savings

| Bits | Compression | Accuracy | Use Case |
|------|-------------|----------|----------|
| 4-bit | 8x | ~90% | Maximum compression |
| 8-bit | 4x | ~95% | Balanced |
| 16-bit | 2x | ~99% | High accuracy |

## Cache Configuration

```typescript
const agentDB = new EnhancedAgentDBService({
  enableCache: true,
  cacheSize: 1000,        // Max entries
  cacheTTL: 3600000       // 1 hour
});

// First query (cold): 15ms
// Cached queries (warm): <1ms
```

## HNSW Index Configuration

```typescript
const agentDB = new EnhancedAgentDBService({
  enableHNSW: true,
  hnswConfig: {
    M: 16,                  // Connections per layer
    efConstruction: 200,    // Construction time accuracy
    efSearch: 100           // Search time accuracy
  }
});

// Higher M = Better recall, more memory
// Higher ef = Better accuracy, slower
```

## Testing

### Run Integration Tests

```bash
npm run test:agentdb
```

### Run Performance Benchmarks

```bash
npm run test:benchmark
```

### Expected Results

```
✓ Vector search 150x faster
✓ QUIC sync <1ms latency
✓ Batch insert <2ms for 100 patterns
✓ Learning plugins functional
✓ Cache speedup >10x
```

## Examples

### Test Pattern Storage

```typescript
// Store test generation patterns
const testPattern = {
  id: 'test-gen-1',
  type: 'test-generator',
  domain: 'unit-testing',
  data: {
    framework: 'jest',
    testType: 'unit',
    coverage: 95,
    hasEdgeCases: true,
    hasMocks: true
  },
  confidence: 0.92,
  usageCount: 15,
  successCount: 14,
  createdAt: Date.now(),
  lastUsed: Date.now()
};

await agentDB.storePattern(testPattern, embedding);
```

### Coverage Pattern Search

```typescript
// Find similar coverage analysis patterns
const coverageEmbedding = await generateEmbedding({
  type: 'coverage-analysis',
  threshold: 95
});

const similarPatterns = await agentDB.searchSimilar(coverageEmbedding, {
  k: 5,
  domain: 'coverage-analysis',
  minConfidence: 0.8
});
```

### Learning from Test Execution

```typescript
// Agent learns which actions improve coverage
const experience = {
  state: {
    coverage: 75,
    gaps: 25,
    complexity: 7
  },
  action: 'generate-edge-case-tests',
  reward: 15,  // Coverage improved by 15%
  nextState: {
    coverage: 90,
    gaps: 10,
    complexity: 7
  },
  done: false
};

await agentDB.trainLearningPlugin('qe-test-generator', experience, 'q-learning');

// Later, get recommendation
const rec = await agentDB.getLearningRecommendations(
  'qe-test-generator',
  { coverage: 75, gaps: 25, complexity: 7 },
  'q-learning'
);

// Agent recommends: 'generate-edge-case-tests' (learned from experience)
```

## Troubleshooting

### Slow Search

1. Verify HNSW is enabled
2. Check index configuration (M, efConstruction)
3. Review quantization settings
4. Monitor cache hit rate

### High Memory Usage

1. Enable quantization (8-bit recommended)
2. Reduce cache size
3. Lower HNSW M parameter
4. Use batch operations

### QUIC Sync Issues

1. Check network configuration
2. Verify QUIC ports are open
3. Review connection timeout settings
4. Check certificate paths (if TLS enabled)

## API Reference

See [API Documentation](./api/agentdb/) for complete API reference.

## Performance Tips

1. **Use Batch Operations**: 10x faster for bulk inserts
2. **Enable Caching**: >10x speedup for repeated queries
3. **Tune HNSW**: Balance M and ef for your use case
4. **Quantize Embeddings**: 4x memory reduction with minimal accuracy loss
5. **QUIC for Real-Time**: <1ms sync for distributed coordination

## Migration from SQLite

```typescript
// Old: SQLite-based memory
const oldMemory = new SwarmMemoryManager(dbPath);

// New: AgentDB with vector search
const newMemory = new EnhancedAgentDBService({
  dbPath,
  embeddingDim: 384,
  enableHNSW: true
});

// Migrate data
const patterns = await oldMemory.getAllPatterns();
for (const pattern of patterns) {
  const embedding = await generateEmbedding(pattern.data);
  await newMemory.storePattern(pattern, embedding);
}
```
