# Embedding Generator - Quick Reference

## Import

```typescript
import { EmbeddingGenerator } from 'agentic-qe/core/embeddings';
```

## Create Generator

```typescript
// Basic (hash mode)
const generator = new EmbeddingGenerator();

// With custom cache size
const generator = new EmbeddingGenerator(10000);

// Auto-initialize ML models
const generator = new EmbeddingGenerator(10000, true);
```

## Generate Embeddings

### Text Embedding (Hash Mode)

```typescript
const result = await generator.generateTextEmbedding('hello world', {
  useML: false,
  dimension: 256
});
// result.embedding: number[] (256D)
// result.method: 'hash'
// result.generationTime: ~0.05ms
```

### Text Embedding (ML Mode)

```typescript
await generator.initializeML();

const result = await generator.generateTextEmbedding('production text', {
  useML: true
});
// result.embedding: number[] (384D)
// result.method: 'ml'
// result.model: 'Xenova/all-MiniLM-L6-v2'
```

### Code Embedding

```typescript
const code = 'function add(a, b) { return a + b; }';
const result = await generator.generateCodeEmbedding(code, 'javascript', {
  useML: true
});
// result.embedding: number[] (768D)
// result.model: 'microsoft/codebert-base'
```

### Batch Processing

```typescript
const texts = ['text1', 'text2', 'text3'];
const batch = await generator.generateBatchTextEmbeddings(texts, {
  useML: false,
  dimension: 128
});
// batch.embeddings: number[][] (3 embeddings)
// batch.totalTime: total ms
// batch.avgTime: avg ms per embedding
// batch.cacheHits: number of cached results
```

## Caching

### Enable Caching

```typescript
const result = await generator.generateTextEmbedding('cached text', {
  useCache: true // default
});
```

### Check Cache Stats

```typescript
const stats = generator.getCacheStats();
console.log(`Hit rate: ${stats.hitRate}%`);
console.log(`Total: ${stats.totalCount}`);
console.log(`Memory: ${stats.memoryUsage} bytes`);
```

### Manual Cache Operations

```typescript
// Cache embedding
generator.cacheEmbedding('key', [0.1, 0.2, 0.3], 'text');

// Get cached
const cached = generator.getCachedEmbedding('key', 'text');

// Clear cache
generator.clearCache('text'); // or 'code' or 'all'
```

## Configuration Options

```typescript
interface EmbeddingOptions {
  useML?: boolean;        // Use ML models (default: true)
  useCache?: boolean;     // Enable caching (default: true)
  normalize?: boolean;    // Normalize to unit length (default: true)
  language?: string;      // For code embeddings
  model?: 'text' | 'code'; // Model type
  dimension?: number;     // For hash mode (default: 256)
}
```

## Performance

| Mode | Speed | Dimension | Use Case |
|------|-------|-----------|----------|
| Hash | ~50µs | 256 | Testing, dev |
| ML Text | ~5-10ms | 384 | Production |
| ML Code | ~10-15ms | 768 | Code analysis |
| Cached | ~1µs | Any | Repeated patterns |

## Models

### Text
- **Model**: Xenova/all-MiniLM-L6-v2
- **Dimension**: 384
- **Use**: General text, descriptions

### Code
- **Model**: microsoft/codebert-base
- **Dimension**: 768
- **Use**: Source code, patterns

### Hash
- **Algorithm**: SHA-256
- **Dimension**: Configurable
- **Use**: Fast prototyping

## Common Patterns

### Initialize Once

```typescript
const generator = new EmbeddingGenerator(10000, true);
await generator.initializeML();
// Now use throughout application
```

### Similarity Search

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}

const emb1 = await generator.generateTextEmbedding('text1');
const emb2 = await generator.generateTextEmbedding('text2');
const similarity = cosineSimilarity(emb1.embedding, emb2.embedding);
```

### Graceful Fallback

```typescript
try {
  await generator.initializeML();
} catch (error) {
  console.warn('Using hash mode:', error.message);
  // Continue with hash-based embeddings
}
```

### Monitor Performance

```typescript
const result = await generator.generateTextEmbedding('test');
console.log(`${result.method} in ${result.generationTime}ms`);

const stats = generator.getCacheStats();
console.log(`Cache: ${stats.hitRate.toFixed(1)}%`);
```

## Error Handling

```typescript
try {
  const result = await generator.generateTextEmbedding(text, {
    useML: true
  });
} catch (error) {
  console.error('Embedding failed:', error);
  // Fallback to hash mode
  const fallback = await generator.generateTextEmbedding(text, {
    useML: false
  });
}
```

## Best Practices

1. ✅ **Initialize ML once** at startup
2. ✅ **Enable caching** for repeated patterns
3. ✅ **Use batch processing** for multiple texts
4. ✅ **Choose hash mode** for testing
5. ✅ **Choose ML mode** for production
6. ✅ **Monitor cache stats** periodically
7. ✅ **Handle ML failures** gracefully

## Files

- Implementation: `/workspaces/agentic-qe-cf/src/core/embeddings/`
- Tests: `/workspaces/agentic-qe-cf/tests/unit/core/embeddings/`
- Guide: `/workspaces/agentic-qe-cf/docs/embeddings/EMBEDDING-GENERATOR-GUIDE.md`

## Test Coverage

✅ 40/40 tests passing

```bash
npm test -- tests/unit/core/embeddings/EmbeddingGenerator.test.ts
```

## Support

- GitHub: https://github.com/proffesor-for-testing/agentic-qe
- Docs: Full guide in `docs/embeddings/EMBEDDING-GENERATOR-GUIDE.md`
