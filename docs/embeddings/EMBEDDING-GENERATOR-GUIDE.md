# Embedding Generator Guide

## Overview

The Embedding Generator provides a flexible, high-performance solution for converting text and code into vector embeddings. It supports two modes:

1. **Phase 1 (Simple)**: Hash-based embeddings for quick start and testing
2. **Phase 2 (ML)**: Transformers.js-based embeddings for production quality

## Features

- ✅ **Dual-mode operation**: Hash-based (fast) or ML-based (accurate)
- ✅ **Intelligent caching**: LRU cache with separate namespaces
- ✅ **Batch processing**: Efficient multi-text embedding
- ✅ **Graceful fallback**: Automatic fallback to hash if ML unavailable
- ✅ **TypeScript**: Full type safety and IntelliSense support
- ✅ **Zero dependencies**: Hash mode works without external ML libraries

## Performance

| Operation | Hash Mode | ML Mode |
|-----------|-----------|---------|
| Single embedding | ~50µs | ~5-10ms (cached) |
| Batch (10 texts) | ~500µs | ~2ms per text |
| Cache lookup | ~1µs | ~1µs |
| Memory footprint | Minimal | ~200MB (models) |

## Installation

The embedding generator is included in the core package:

```bash
npm install agentic-qe
```

For ML-based embeddings, ensure the transformers dependency is installed:

```bash
npm install @xenova/transformers
```

## Quick Start

### Basic Usage (Hash-based)

```typescript
import { EmbeddingGenerator } from 'agentic-qe/core/embeddings';

// Create generator (hash mode by default)
const generator = new EmbeddingGenerator();

// Generate text embedding
const result = await generator.generateTextEmbedding('hello world', {
  useML: false,
  dimension: 256
});

console.log('Embedding:', result.embedding);
console.log('Dimension:', result.dimension); // 256
console.log('Method:', result.method); // 'hash'
console.log('Time:', result.generationTime); // ~0.05ms
```

### ML-based Embeddings

```typescript
import { EmbeddingGenerator } from 'agentic-qe/core/embeddings';

// Create generator with ML auto-initialization
const generator = new EmbeddingGenerator(10000, true);

// Wait for ML models to load
await generator.initializeML();

// Generate ML embedding
const result = await generator.generateTextEmbedding('production text', {
  useML: true
});

console.log('Dimension:', result.dimension); // 384 (MiniLM)
console.log('Method:', result.method); // 'ml'
console.log('Model:', result.model); // 'Xenova/all-MiniLM-L6-v2'
```

## Use Cases

### 1. Pattern Storage for AgentDB

Store test patterns with semantic embeddings:

```typescript
import { EmbeddingGenerator } from 'agentic-qe/core/embeddings';
import { AgentDBManager } from 'agentic-qe/core/memory';

const embedder = new EmbeddingGenerator();
const agentDB = new AgentDBManager({
  dbPath: '.agentic-qe/patterns.db',
  enableLearning: true
});

// Generate embedding for test pattern
const pattern = {
  type: 'unit-test',
  code: 'expect(result).toBe(42)',
  framework: 'jest'
};

const embedding = await embedder.generateTextEmbedding(
  JSON.stringify(pattern),
  { useML: true }
);

// Store in AgentDB
await agentDB.storePattern({
  id: 'test-pattern-1',
  type: 'experience',
  domain: 'unit-testing',
  pattern_data: JSON.stringify({
    ...pattern,
    embedding: embedding.embedding
  }),
  confidence: 0.95,
  usage_count: 0,
  success_count: 0,
  created_at: Date.now(),
  last_used: Date.now()
});
```

### 2. Code Similarity Search

Find similar code patterns:

```typescript
import { EmbeddingGenerator } from 'agentic-qe/core/embeddings';

const embedder = new EmbeddingGenerator();

// Initialize code model
await embedder.initializeCodeModel();

// Generate embeddings for code snippets
const code1 = `
function addNumbers(a: number, b: number): number {
  return a + b;
}
`;

const code2 = `
const sum = (x: number, y: number) => x + y;
`;

const emb1 = await embedder.generateCodeEmbedding(code1, 'typescript', {
  useML: true
});

const emb2 = await embedder.generateCodeEmbedding(code2, 'typescript', {
  useML: true
});

// Calculate cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

const similarity = cosineSimilarity(emb1.embedding, emb2.embedding);
console.log('Similarity:', similarity); // High value (similar functions)
```

### 3. Batch Processing for Performance

Process multiple texts efficiently:

```typescript
import { EmbeddingGenerator } from 'agentic-qe/core/embeddings';

const embedder = new EmbeddingGenerator();

// Process 100 test descriptions
const testDescriptions = [
  'should add two numbers correctly',
  'should handle edge cases',
  'should validate input parameters',
  // ... 97 more
];

const batchResult = await embedder.generateBatchTextEmbeddings(
  testDescriptions,
  { useML: false, dimension: 128 }
);

console.log('Total time:', batchResult.totalTime); // ~50ms for 100
console.log('Average time:', batchResult.avgTime); // ~0.5ms each
console.log('Cache hits:', batchResult.cacheHits);
```

### 4. Caching for Repeated Patterns

Leverage caching for common patterns:

```typescript
import { EmbeddingGenerator } from 'agentic-qe/core/embeddings';

const embedder = new EmbeddingGenerator(1000); // Cache 1000 embeddings

// First call - generates embedding
const result1 = await embedder.generateTextEmbedding('common pattern', {
  useCache: true
});
console.log('First call - cached:', result1.cached); // false

// Second call - retrieves from cache
const result2 = await embedder.generateTextEmbedding('common pattern', {
  useCache: true
});
console.log('Second call - cached:', result2.cached); // true

// Check cache stats
const stats = embedder.getCacheStats();
console.log('Cache stats:', {
  totalEntries: stats.totalCount,
  hitRate: stats.hitRate,
  memoryUsage: stats.memoryUsage
});
```

## API Reference

### EmbeddingGenerator

#### Constructor

```typescript
constructor(
  cacheSize: number = 10000,
  autoInitML: boolean = false
)
```

**Parameters:**
- `cacheSize`: Maximum number of cached embeddings (default: 10000)
- `autoInitML`: Automatically initialize ML models (default: false)

#### Methods

##### generateTextEmbedding

```typescript
async generateTextEmbedding(
  text: string,
  options?: EmbeddingOptions
): Promise<EmbeddingResult>
```

Generate embedding for text.

**Options:**
- `useML`: Use ML-based embedding (default: true)
- `useCache`: Enable caching (default: true)
- `normalize`: Normalize to unit length (default: true)
- `dimension`: Target dimension for hash mode (default: 256)

##### generateCodeEmbedding

```typescript
async generateCodeEmbedding(
  code: string,
  language: string,
  options?: EmbeddingOptions
): Promise<EmbeddingResult>
```

Generate embedding for code with language context.

**Parameters:**
- `code`: Source code to embed
- `language`: Programming language (e.g., 'typescript', 'python')
- `options`: Embedding options

##### generateBatchTextEmbeddings

```typescript
async generateBatchTextEmbeddings(
  texts: string[],
  options?: EmbeddingOptions
): Promise<BatchEmbeddingResult>
```

Generate embeddings for multiple texts efficiently.

##### generateHashEmbedding

```typescript
generateHashEmbedding(
  text: string,
  dimension: number = 256
): number[]
```

Generate hash-based embedding directly (synchronous).

##### initializeML

```typescript
async initializeML(): Promise<void>
```

Initialize ML models for production embeddings.

##### initializeCodeModel

```typescript
async initializeCodeModel(): Promise<void>
```

Initialize code-specific ML model.

##### getCachedEmbedding

```typescript
getCachedEmbedding(
  key: string,
  type: 'text' | 'code' = 'text'
): number[] | null
```

Retrieve cached embedding.

##### cacheEmbedding

```typescript
cacheEmbedding(
  key: string,
  embedding: number[],
  type: 'text' | 'code' = 'text'
): void
```

Manually cache an embedding.

##### clearCache

```typescript
clearCache(type: 'text' | 'code' | 'all' = 'all'): void
```

Clear cache entries.

##### getCacheStats

```typescript
getCacheStats(): CacheStats
```

Get cache statistics.

##### isMLAvailable

```typescript
isMLAvailable(): boolean
```

Check if ML models are initialized.

##### getModelInfo

```typescript
getModelInfo(): {
  textModel: string;
  codeModel: string;
  textDimension: number;
  codeDimension: number;
  hashDimension: number;
  mlAvailable: boolean;
  cacheSize: number;
}
```

Get model configuration information.

## Models

### Text Embeddings

**Model**: `Xenova/all-MiniLM-L6-v2`
- **Dimension**: 384
- **Use case**: General text, test descriptions, documentation
- **Performance**: ~5-10ms per embedding
- **Quality**: High semantic accuracy

### Code Embeddings

**Model**: `microsoft/codebert-base`
- **Dimension**: 768
- **Use case**: Source code, code patterns, snippets
- **Performance**: ~10-15ms per embedding
- **Quality**: Code-aware semantic understanding

### Hash Embeddings

**Algorithm**: Multi-pass SHA-256
- **Dimension**: Configurable (default: 256)
- **Use case**: Testing, development, fast prototyping
- **Performance**: ~50µs per embedding
- **Quality**: Deterministic but less semantic

## Best Practices

### 1. Choose the Right Mode

**Use Hash Mode when:**
- ✅ Testing and development
- ✅ Speed is critical (< 1ms)
- ✅ Exact matching is sufficient
- ✅ No ML dependencies desired

**Use ML Mode when:**
- ✅ Production deployments
- ✅ Semantic similarity needed
- ✅ High-quality retrieval required
- ✅ Cross-language understanding needed

### 2. Optimize Caching

```typescript
// Good: Enable caching for repeated patterns
const embedder = new EmbeddingGenerator(10000);

// Process with caching
const results = await Promise.all(
  patterns.map(p => embedder.generateTextEmbedding(p, { useCache: true }))
);

// Check cache performance
const stats = embedder.getCacheStats();
if (stats.hitRate < 50) {
  console.warn('Low cache hit rate - consider increasing cache size');
}
```

### 3. Batch When Possible

```typescript
// Bad: One at a time
for (const text of texts) {
  await embedder.generateTextEmbedding(text);
}

// Good: Use batch processing
const batchResult = await embedder.generateBatchTextEmbeddings(texts);
```

### 4. Handle ML Initialization

```typescript
// Good: Initialize once at startup
const embedder = new EmbeddingGenerator(10000, true);

try {
  await embedder.initializeML();
  console.log('✓ ML models loaded');
} catch (error) {
  console.warn('ML unavailable, using hash mode:', error.message);
}

// Now embeddings will use ML if available, hash as fallback
```

### 5. Monitor Performance

```typescript
const embedder = new EmbeddingGenerator();

// Generate embedding
const result = await embedder.generateTextEmbedding('test');

// Log performance metrics
console.log(`Generated ${result.dimension}D embedding in ${result.generationTime}ms`);
console.log(`Method: ${result.method}, Cached: ${result.cached}`);

// Periodically check cache stats
setInterval(() => {
  const stats = embedder.getCacheStats();
  console.log('Cache stats:', {
    entries: stats.totalCount,
    hitRate: `${stats.hitRate.toFixed(1)}%`,
    memory: `${(stats.memoryUsage / 1024).toFixed(1)}KB`
  });
}, 60000); // Every minute
```

## Troubleshooting

### ML Models Not Loading

**Problem**: `initializeML()` fails

**Solutions**:
1. Check internet connection (first-time download)
2. Verify `@xenova/transformers` is installed
3. Check disk space for model cache (~200MB)
4. Use hash mode as fallback

```typescript
const embedder = new EmbeddingGenerator();

try {
  await embedder.initializeML();
} catch (error) {
  console.warn('Using hash mode:', error.message);
  // Continue with hash-based embeddings
}
```

### Cache Memory Issues

**Problem**: High memory usage from cache

**Solutions**:
1. Reduce cache size
2. Clear cache periodically
3. Optimize cache entries

```typescript
// Reduce cache size
const embedder = new EmbeddingGenerator(1000); // Smaller cache

// Clear old entries
embedder.optimize(2); // Remove entries accessed < 2 times

// Monitor memory
const stats = embedder.getCacheStats();
if (stats.memoryUsage > 10 * 1024 * 1024) { // 10MB
  embedder.clearCache('text'); // Clear text cache
}
```

### Slow Performance

**Problem**: Embeddings taking too long

**Solutions**:
1. Enable caching
2. Use batch processing
3. Consider hash mode for speed
4. Check if ML models are loaded

```typescript
// Check ML availability
if (!embedder.isMLAvailable()) {
  await embedder.initializeML(); // Ensure models loaded
}

// Use batch for multiple texts
const batch = await embedder.generateBatchTextEmbeddings(texts, {
  useML: true,
  useCache: true
});
```

## Examples

See the `/workspaces/agentic-qe-cf/tests/unit/core/embeddings/EmbeddingGenerator.test.ts` file for comprehensive examples.

## Related Documentation

- [AgentDB Integration Guide](/workspaces/agentic-qe-cf/docs/AGENTDB-INTEGRATION.md)
- [Vector Search Guide](/workspaces/agentic-qe-cf/docs/vector-search/GUIDE.md)
- [Memory Management](/workspaces/agentic-qe-cf/docs/memory/GUIDE.md)

## Support

For issues or questions:
- GitHub Issues: https://github.com/proffesor-for-testing/agentic-qe/issues
- Documentation: https://github.com/proffesor-for-testing/agentic-qe#readme
