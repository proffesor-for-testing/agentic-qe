# HNSW Pattern Store Usage Guide

## Overview

The `HNSWPatternStore` provides 150x faster pattern matching using HNSW (Hierarchical Navigable Small World) indexing via `@ruvector/core`. This is a key component of Phase 0 M0.3 for AQE LLM Independence.

## Performance Characteristics

- **Search Latency**: O(log n) - significantly faster than linear search
- **Insert Latency**: O(log n)
- **Memory**: Scales efficiently with 3x overhead for HNSW graph structure
- **Throughput**: Handles 100k+ patterns efficiently

## Basic Usage

### Creating a Pattern Store

```typescript
import { HNSWPatternStore, DistanceMetric } from '@/memory/HNSWPatternStore';

// Default configuration (768-dim, cosine similarity)
const store = new HNSWPatternStore();

// Custom configuration
const customStore = new HNSWPatternStore({
  dimension: 768,
  m: 32,                    // Connections per layer
  efConstruction: 200,      // Construction quality
  efSearch: 100,            // Search quality
  distanceMetric: DistanceMetric.Cosine,
  storagePath: './data/patterns'  // Persistence location
});
```

### Using Presets

```typescript
import { PatternStorePresets } from '@/memory/HNSWPatternStore';

// Optimized configurations
const defaultStore = PatternStorePresets.default();
const highPerfStore = PatternStorePresets.highPerformance();
const lowMemStore = PatternStorePresets.lowMemory();
const smallEmbStore = PatternStorePresets.smallEmbeddings();
const largeEmbStore = PatternStorePresets.largeEmbeddings();
```

## Storing Patterns

### Single Pattern

```typescript
import { QEPattern } from '@/memory/HNSWPatternStore';

const pattern: QEPattern = {
  id: 'test-gen-001',
  embedding: [0.1, 0.2, ...],  // 768-dim vector
  content: 'Jest test pattern for user authentication',
  type: 'test-generation',
  quality: 0.95,
  metadata: {
    framework: 'jest',
    language: 'typescript',
    category: 'authentication'
  },
  createdAt: new Date()
};

await store.store(pattern);
```

### Batch Storage

```typescript
const patterns: QEPattern[] = [
  { id: '1', embedding: [...], content: '...', type: 'test-generation', quality: 0.9, metadata: {}, createdAt: new Date() },
  { id: '2', embedding: [...], content: '...', type: 'coverage-analysis', quality: 0.85, metadata: {}, createdAt: new Date() },
  // ... more patterns
];

// Much faster than individual stores
await store.storeBatch(patterns);
```

## Searching Patterns

### Basic Similarity Search

```typescript
// Get embedding for your query (e.g., from an embedding model)
const queryEmbedding = await getEmbedding('test for user login');

// Find top 10 most similar patterns
const results = await store.search(queryEmbedding, 10);

results.forEach(pattern => {
  console.log(`Found: ${pattern.content}`);
  console.log(`Quality: ${pattern.quality}`);
  console.log(`Type: ${pattern.type}`);
});
```

### Filtered Search

```typescript
// Filter by pattern type
const testGenPatterns = await store.searchFiltered(
  queryEmbedding,
  10,
  'test-generation'  // Only test generation patterns
);

// Filter by minimum quality
const highQualityPatterns = await store.searchFiltered(
  queryEmbedding,
  10,
  undefined,  // Any type
  0.9         // Quality >= 0.9
);

// Filter by both
const highQualityTestPatterns = await store.searchFiltered(
  queryEmbedding,
  10,
  'test-generation',
  0.9
);
```

## Pattern Management

### Counting Patterns

```typescript
const count = await store.count();
console.log(`Total patterns: ${count}`);

const isEmpty = await store.isEmpty();
if (isEmpty) {
  console.log('No patterns stored yet');
}
```

### Deleting Patterns

```typescript
// Delete specific pattern
await store.delete('test-gen-001');

// Clear all patterns
await store.clear();
```

## Persistence

### Saving and Loading

```typescript
// Save metadata to disk (vectors are auto-persisted if storagePath is set)
await store.saveMetadata();

// Load from disk
const persistentStore = new HNSWPatternStore({
  dimension: 768,
  storagePath: './data/patterns'
});

await persistentStore.loadMetadata();
```

## Statistics

```typescript
const stats = await store.getStats();

console.log(`Total patterns: ${stats.totalPatterns}`);
console.log(`Dimension: ${stats.dimension}`);
console.log(`Distance metric: ${stats.distanceMetric}`);
console.log(`Estimated memory: ${stats.memoryEstimateMB} MB`);
```

## Integration Examples

### QE Test Generation Agent

```typescript
import { HNSWPatternStore, PatternStorePresets } from '@/memory/HNSWPatternStore';
import { embedText } from '@/utils/embedding';  // Your embedding function

class TestGenerationAgent {
  private patternStore: HNSWPatternStore;

  constructor() {
    this.patternStore = PatternStorePresets.default();
  }

  async findSimilarTests(userStory: string): Promise<string[]> {
    // Get embedding for user story
    const embedding = await embedText(userStory);

    // Find similar high-quality test patterns
    const patterns = await this.patternStore.searchFiltered(
      embedding,
      5,
      'test-generation',
      0.85  // Minimum 85% quality
    );

    return patterns.map(p => p.content);
  }

  async learnFromTest(testCode: string, quality: number): Promise<void> {
    const embedding = await embedText(testCode);

    const pattern: QEPattern = {
      id: generateId(),
      embedding,
      content: testCode,
      type: 'test-generation',
      quality,
      metadata: {
        framework: detectFramework(testCode),
        timestamp: Date.now()
      },
      createdAt: new Date()
    };

    await this.patternStore.store(pattern);
  }
}
```

### Coverage Analysis Agent

```typescript
class CoverageAnalysisAgent {
  private patternStore: HNSWPatternStore;

  constructor() {
    this.patternStore = new HNSWPatternStore({
      dimension: 768,
      storagePath: './data/coverage-patterns'
    });
  }

  async findUncoveredAreas(codeModule: string): Promise<string[]> {
    const embedding = await embedText(codeModule);

    // Find coverage gap patterns
    const gapPatterns = await this.patternStore.searchFiltered(
      embedding,
      10,
      'coverage-analysis',
      0.8
    );

    return gapPatterns.map(p => p.metadata.uncoveredPath as string);
  }

  async recordCoverageGap(
    codeContext: string,
    uncoveredPath: string,
    confidence: number
  ): Promise<void> {
    const embedding = await embedText(codeContext);

    const pattern: QEPattern = {
      id: generateId(),
      embedding,
      content: codeContext,
      type: 'coverage-analysis',
      quality: confidence,
      metadata: {
        uncoveredPath,
        timestamp: Date.now()
      },
      createdAt: new Date()
    };

    await this.patternStore.store(pattern);
  }
}
```

## Performance Tips

### 1. Batch Operations

```typescript
// ❌ Slow: Individual stores
for (const pattern of patterns) {
  await store.store(pattern);
}

// ✅ Fast: Batch store
await store.storeBatch(patterns);
```

### 2. Adjust HNSW Parameters

```typescript
// For faster search at cost of accuracy
const fastStore = new HNSWPatternStore({
  dimension: 768,
  efSearch: 50,  // Lower = faster but less accurate
});

// For better accuracy at cost of speed
const accurateStore = new HNSWPatternStore({
  dimension: 768,
  efSearch: 200,  // Higher = slower but more accurate
});
```

### 3. Use Appropriate Presets

```typescript
// For production with lots of RAM
const prodStore = PatternStorePresets.highPerformance();

// For development/testing with limited RAM
const devStore = PatternStorePresets.lowMemory();
```

### 4. Pre-filter Before Search

```typescript
// Instead of searching all patterns and filtering
const allResults = await store.search(embedding, 100);
const filtered = allResults.filter(p => p.type === 'test-generation');

// Use filtered search directly (faster)
const results = await store.searchFiltered(
  embedding,
  100,
  'test-generation'
);
```

## Distance Metrics

Choose the right metric for your use case:

```typescript
import { DistanceMetric } from '@/memory/HNSWPatternStore';

// Cosine similarity (default, best for normalized embeddings)
const cosineStore = new HNSWPatternStore({
  distanceMetric: DistanceMetric.Cosine
});

// Euclidean distance (L2, good for spatial data)
const euclideanStore = new HNSWPatternStore({
  distanceMetric: DistanceMetric.Euclidean
});

// Dot product (fast, assumes normalized vectors)
const dotStore = new HNSWPatternStore({
  distanceMetric: DistanceMetric.DotProduct
});

// Manhattan distance (L1, robust to outliers)
const manhattanStore = new HNSWPatternStore({
  distanceMetric: DistanceMetric.Manhattan
});
```

## Error Handling

```typescript
try {
  await store.store(pattern);
} catch (error) {
  if (error.message.includes('dimension mismatch')) {
    console.error('Embedding has wrong dimensions');
  } else if (error.message.includes('Quality must be between')) {
    console.error('Invalid quality score');
  } else {
    throw error;
  }
}
```

## Best Practices

1. **Normalize Embeddings**: For cosine similarity, normalize vectors to unit length
2. **Persist Regularly**: Call `saveMetadata()` periodically to prevent data loss
3. **Quality Control**: Only store patterns with quality >= 0.7
4. **Monitor Memory**: Check `getStats()` periodically to track memory usage
5. **Batch Operations**: Use `storeBatch()` for bulk inserts
6. **Choose Right Preset**: Match preset to your embedding model dimension

## Troubleshooting

### Issue: Slow search performance

**Solution**: Increase `efSearch` parameter or use `highPerformance` preset

```typescript
const store = new HNSWPatternStore({
  efSearch: 200  // Increase for better accuracy
});
```

### Issue: High memory usage

**Solution**: Use `lowMemory` preset or reduce `m` parameter

```typescript
const store = PatternStorePresets.lowMemory();
```

### Issue: Dimension mismatch errors

**Solution**: Ensure all embeddings have the same dimension as the store

```typescript
const store = new HNSWPatternStore({
  dimension: 384  // Match your embedding model
});
```

## Next Steps

- Integrate with embedding models (OpenAI, Cohere, local models)
- Implement pattern quality scoring
- Add pattern versioning and updates
- Build pattern recommendation system
- Create pattern analytics dashboard

## References

- [HNSW Algorithm Paper](https://arxiv.org/abs/1603.09320)
- [@ruvector/core Documentation](https://github.com/ruvnet/ruvector)
- [AQE LLM Independence Plan](../roadmaps/llm-independence.md)
