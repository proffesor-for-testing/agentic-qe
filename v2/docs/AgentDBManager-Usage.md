# AgentDBManager Usage Guide

## Overview

`AgentDBManager` is a production-ready memory management system that replaces 2,290 lines of custom QUIC and Neural code with AgentDB's battle-tested implementation from `agentic-flow/reasoningbank`.

## Key Features

- **QUIC Synchronization**: <1ms latency between nodes
- **Neural Training**: 9 reinforcement learning algorithms
- **Fast Search**: 150x faster with HNSW indexing
- **Memory Efficiency**: 4-32x reduction with quantization
- **Pattern Retrieval**: <1ms with caching

## Installation

```bash
npm install agentic-flow
npx agentdb@latest --version
```

## Basic Usage

### 1. Initialize AgentDB Manager

```typescript
import { createAgentDBManager } from '@/core/memory/AgentDBManager';

// Create with default configuration
const manager = createAgentDBManager();

// Initialize
await manager.initialize();
```

### 2. Store Memory Patterns

```typescript
// Store a conversation pattern
const patternId = await manager.store({
  id: '',
  type: 'conversation',
  domain: 'user-interactions',
  pattern_data: JSON.stringify({
    embedding: [0.1, 0.2, 0.3, ...], // 768-dim vector
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
});
```

### 3. Retrieve with Reasoning

```typescript
// Search for similar patterns
const result = await manager.retrieve(queryEmbedding, {
  domain: 'user-interactions',
  k: 10,
  useMMR: true, // Maximal Marginal Relevance for diversity
  synthesizeContext: true, // Generate rich context
  optimizeMemory: true, // Consolidate similar patterns
});

console.log('Memories:', result.memories);
console.log('Context:', result.context);
console.log('Query Time:', result.metadata.queryTime, 'ms');
```

### 4. Train Learning Model

```typescript
// Train on collected experiences
const metrics = await manager.train({
  epochs: 50,
  batchSize: 32,
  learningRate: 0.001,
  validationSplit: 0.2,
});

console.log('Training Loss:', metrics.loss);
console.log('Duration:', metrics.duration, 'ms');
```

## Advanced Configuration

### Enable QUIC Synchronization

```typescript
const manager = createAgentDBManager({
  enableQUICSync: true,
  syncPort: 4433,
  syncPeers: [
    '192.168.1.10:4433',
    '192.168.1.11:4433',
    '192.168.1.12:4433',
  ],
  syncInterval: 1000, // 1 second
  syncBatchSize: 100,
  maxRetries: 3,
  compression: true,
});

await manager.initialize();
```

### Configure Quantization

```typescript
const manager = createAgentDBManager({
  quantizationType: 'binary', // 32x memory reduction
  // quantizationType: 'scalar', // 4x memory reduction
  // quantizationType: 'product', // Advanced quantization
  // quantizationType: 'none', // No quantization
  cacheSize: 2000, // Increase cache for better performance
});
```

### Custom Database Path

```typescript
const manager = createAgentDBManager({
  dbPath: '.agentdb/custom-memory.db',
  enableLearning: true,
  enableReasoning: true,
});
```

## Retrieval Options

### Hybrid Search (Vector + Metadata)

```typescript
const result = await manager.retrieve(queryEmbedding, {
  domain: 'research-papers',
  k: 20,
  filters: {
    year: { $gte: 2023 },
    category: 'machine-learning',
    citations: { $gte: 50 },
  },
  metric: 'cosine', // 'cosine' | 'euclidean' | 'dot'
});
```

### Diverse Results with MMR

```typescript
const result = await manager.retrieve(queryEmbedding, {
  domain: 'content',
  k: 10,
  useMMR: true,
  mmrLambda: 0.5, // 0=relevance, 1=diversity
});
```

### Context Synthesis

```typescript
const result = await manager.retrieve(queryEmbedding, {
  domain: 'problem-solving',
  k: 10,
  synthesizeContext: true, // Generate coherent narrative
  optimizeMemory: true, // Consolidate patterns
});

console.log(result.context);
// "Based on 10 similar problem-solving attempts, the most effective
//  approach involves: 1) analyzing root cause, 2) brainstorming solutions..."
```

## Performance Metrics

### Get Database Statistics

```typescript
const stats = await manager.getStats();

console.log('Total Patterns:', stats.totalPatterns);
console.log('Database Size:', stats.dbSize);
console.log('Cache Hit Rate:', stats.cacheHitRate);
console.log('Avg Search Latency:', stats.avgSearchLatency);
```

## Error Handling

```typescript
try {
  await manager.initialize();
} catch (error) {
  console.error('Initialization failed:', error.message);
}

try {
  const result = await manager.retrieve(queryEmbedding, { k: 10 });
} catch (error) {
  if (error.code === 'DIMENSION_MISMATCH') {
    console.error('Query embedding dimension mismatch');
  } else if (error.code === 'DATABASE_LOCKED') {
    // Retry with exponential backoff
  }
}
```

## Cleanup

```typescript
// Always close the manager when done
await manager.close();
```

## Migration from Custom Code

Replace this:

```typescript
// Old: Custom QUIC implementation
const quicTransport = new QUICTransportWrapper(config);
await quicTransport.start();
```

With this:

```typescript
// New: AgentDB with built-in QUIC
const manager = createAgentDBManager({
  enableQUICSync: true,
  syncPort: 4433,
  syncPeers: ['peer1:4433'],
});
await manager.initialize();
```

## Performance Benefits

| Feature | Custom Code | AgentDB | Improvement |
|---------|-------------|---------|-------------|
| Vector Search | 15ms | <100µs | **150x faster** |
| Pattern Retrieval | N/A | <1ms | **New capability** |
| Batch Insert | 1s | 2ms | **500x faster** |
| Memory Usage | Baseline | 4-32x less | **4-32x reduction** |
| Code Lines | 2,290 | 100 | **96% reduction** |

## Learn More

- [AgentDB Documentation](https://agentdb.ruv.io)
- [GitHub](https://github.com/ruvnet/agentic-flow/tree/main/packages/agentdb)
- [Skills](../.claude/skills/agentdb-*)
