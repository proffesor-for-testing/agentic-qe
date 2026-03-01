# ONNX Embeddings Adapter

Fast local vector embeddings with hyperbolic space support for the Agentic QE v3 platform. Bridges to agentic-flow MCP tools for production use.

## Overview

This adapter provides a comprehensive interface for:

- **Fast Local Embeddings**: Generate embeddings without API calls using ONNX runtime
- **Hyperbolic Space**: Support for Poincaré ball embeddings for hierarchical data
- **Semantic Search**: Find similar embeddings using multiple distance metrics
- **Neural Substrate**: Integration with ReasoningBank and memory systems

## Architecture

Per [ADR-051](../../docs/adr/051-onnx-embeddings-adapter.md), this adapter follows the Integration Principle with proper dependency injection:

```
┌─────────────────────────────────────────┐
│     ONNXEmbeddingsAdapter (Facade)      │
├─────────────────────────────────────────┤
│  - Initialize & coordinate components    │
│  - Bridge to agentic-flow MCP tools     │
│  - Expose unified API                   │
└──────────┬──────────┬──────────┬────────┘
           │          │          │
     ┌─────▼──┐  ┌────▼───┐  ┌──▼──────┐
     │Embedding│  │Similarity││Hyperbolic│
     │Generator│  │  Search  ││   Ops    │
     └─────────┘  └──────────┘└──────────┘
```

## Features

### 1. Embedding Generation

Generate vector embeddings from text with automatic normalization and caching:

```typescript
import { createONNXEmbeddingsAdapter, EmbeddingModel } from '@agentic-qe/integrations/agentic-flow/onnx-embeddings';

const adapter = createONNXEmbeddingsAdapter({
  embedding: {
    model: EmbeddingModel.MINI_LM_L6, // 384 dimensions, fast
    normalize: true,
    cacheSize: 256
  }
});

// Single embedding
const embedding = await adapter.generateEmbedding('Hello world');
console.log(embedding.vector.length); // 384

// Batch generation
const result = await adapter.generateBatch({
  texts: ['Text 1', 'Text 2', 'Text 3']
});
console.log(`Generated ${result.embeddings.length} in ${result.duration}ms`);
```

**Supported Models:**
- `all-MiniLM-L6-v2`: 384 dimensions, fast inference, good for general use
- `all-mpnet-base-v2`: 768 dimensions, higher quality, slower

### 2. Semantic Similarity Search

Find semantically similar embeddings using multiple metrics:

```typescript
// Store embeddings
await adapter.generateAndStore('Machine learning is fascinating');
await adapter.generateAndStore('Deep learning models are powerful');
await adapter.generateAndStore('I love pizza and pasta');

// Search by text
const results = await adapter.searchByText('AI and neural networks', {
  topK: 2,
  threshold: 0.5,
  metric: 'cosine'
});

results.forEach(result => {
  console.log(`${result.text}: ${result.score}`);
});

// Compare two texts
const similarity = await adapter.compareSimilarity(
  'machine learning',
  'deep learning'
);
```

**Similarity Metrics:**
- `cosine`: Cosine similarity (range: [-1, 1], higher is better)
- `euclidean`: Euclidean distance (L2 norm, lower is better)
- `poincare`: Poincaré distance in hyperbolic space

### 3. Hyperbolic Embeddings

Use hyperbolic space (Poincaré ball model) for hierarchical data:

```typescript
const adapter = createONNXEmbeddingsAdapter({
  embedding: {
    hyperbolic: true,
    curvature: -1.0
  }
});

// Generate hyperbolic embedding
const embedding = await adapter.generateEmbedding('Hierarchical data');
console.log(embedding.isHyperbolic); // true

// Convert between spaces
const euclidean = await adapter.generateEmbedding('Test');
const hyperbolic = adapter.toHyperbolic(euclidean);
const backToEuclidean = adapter.toEuclidean(hyperbolic);

// Calculate hyperbolic distance
const emb1 = await adapter.generateEmbedding('Parent node');
const emb2 = await adapter.generateEmbedding('Child node');
const hyp1 = adapter.toHyperbolic(emb1);
const hyp2 = adapter.toHyperbolic(emb2);

const distance = adapter.hyperbolicDistance(hyp1, hyp2);
const midpoint = adapter.hyperbolicMidpoint(hyp1, hyp2);
```

**Why Hyperbolic Space?**

Hyperbolic geometry naturally represents hierarchical structures (trees, taxonomies) better than Euclidean space. Distances grow exponentially with tree depth, making it ideal for:

- Code hierarchies (packages → classes → methods)
- Test organization (suites → cases → assertions)
- Knowledge graphs with parent-child relationships

### 4. Namespaces and Metadata

Organize embeddings with namespaces and custom metadata:

```typescript
await adapter.generateAndStore('Test pattern', {
  namespace: 'test-patterns',
  id: 'pattern-123',
  customData: {
    source: 'test-generator',
    confidence: 0.95,
    tags: ['unit', 'integration']
  }
});

// Search within namespace
const results = await adapter.searchByText('test', {
  namespace: 'test-patterns',
  topK: 10
});

// Get all embeddings in namespace
const patterns = adapter.getAllEmbeddings('test-patterns');
```

## Integration with agentic-flow MCP

This adapter bridges to the following agentic-flow MCP tools:

```typescript
// In production, these methods call the actual MCP tools:

// Bridge to mcp__claude-flow__embeddings_generate
const embedding = await adapter.bridgeToMCPGenerate('Text', false);

// Bridge to mcp__claude-flow__embeddings_search
const results = await adapter.bridgeToMCPSearch('Query', { topK: 5 });

// Bridge to mcp__claude-flow__embeddings_compare
const similarity = await adapter.bridgeToMCPCompare('Text1', 'Text2', 'cosine');
```

## Integration with ReasoningBank

Use embeddings for pattern storage and retrieval in ReasoningBank:

```typescript
import { createONNXEmbeddingsAdapter } from '@agentic-qe/integrations/agentic-flow/onnx-embeddings';
import { createReasoningBankAdapter } from '@agentic-qe/integrations/agentic-flow/reasoningbank';

const embeddings = createONNXEmbeddingsAdapter();
const reasoningBank = createReasoningBankAdapter({
  embeddings // Inject embeddings adapter
});

// Store pattern with semantic embedding
await reasoningBank.storePattern({
  type: 'test-generation',
  pattern: 'Always mock external dependencies',
  confidence: 0.9,
  evidence: ['test-1', 'test-2']
});

// Search patterns semantically
const similar = await reasoningBank.searchPatterns(
  'How to handle external APIs in tests?',
  { topK: 5 }
);
```

## Performance

### LRU Caching

The adapter includes LRU caching for repeated text:

```typescript
const text = 'Repeated text';

await adapter.generateEmbedding(text); // Cache miss: ~10ms
await adapter.generateEmbedding(text); // Cache hit: <1ms
await adapter.generateEmbedding(text); // Cache hit: <1ms

const stats = adapter.getStats();
console.log(`Cache hits: ${stats.cacheHits}`);
console.log(`Cache misses: ${stats.cacheMisses}`);
```

### Batch Processing

Process multiple texts efficiently:

```typescript
const result = await adapter.generateBatch({
  texts: Array.from({ length: 100 }, (_, i) => `Text ${i}`)
});

console.log(`Processed 100 texts in ${result.duration}ms`);
console.log(`Average: ${result.duration / 100}ms per text`);
console.log(`Cache hits: ${result.cacheHits}`);
```

### Statistics Tracking

Monitor performance and usage:

```typescript
const stats = adapter.getStats();

console.log(`Total generated: ${stats.totalGenerated}`);
console.log(`Cache hit rate: ${stats.cacheHits / (stats.cacheHits + stats.cacheMisses)}`);
console.log(`Avg generation time: ${stats.avgGenerationTime}ms`);
console.log(`Avg search time: ${stats.avgSearchTime}ms`);
console.log(`Vectors stored: ${stats.vectorsStored}`);
```

## API Reference

### ONNXEmbeddingsAdapter

Main adapter class with comprehensive embedding operations.

#### Methods

**Initialization:**
- `initialize(): Promise<void>` - Initialize ONNX runtime
- `getHealth(): Promise<EmbeddingHealth>` - Check system health
- `isReady(): boolean` - Check if adapter is ready

**Generation:**
- `generateEmbedding(text: string): Promise<Embedding>` - Generate single embedding
- `generateBatch(request: BatchEmbeddingRequest): Promise<BatchEmbeddingResult>` - Batch generation
- `generateAndStore(text: string, metadata?): Promise<StoredEmbedding>` - Generate and store

**Search:**
- `searchByText(query: string, config?): Promise<SimilarityResult[]>` - Search by text
- `searchByEmbedding(embedding: Embedding, config?): Promise<SimilarityResult[]>` - Search by embedding
- `findMostSimilar(query: string, config?): Promise<SimilarityResult | null>` - Find top match
- `compareSimilarity(text1: string, text2: string, metric?): Promise<number>` - Compare texts

**Storage:**
- `storeEmbedding(embedding: StoredEmbedding): void` - Store embedding
- `storeBatch(embeddings: StoredEmbedding[]): void` - Store multiple
- `getEmbedding(id: string): StoredEmbedding | undefined` - Retrieve by ID
- `getAllEmbeddings(namespace?: string): StoredEmbedding[]` - Get all embeddings
- `removeEmbedding(id: string): boolean` - Remove embedding
- `clearEmbeddings(): void` - Clear all stored embeddings

**Hyperbolic:**
- `toHyperbolic(embedding: Embedding): Embedding` - Convert to Poincaré ball
- `toEuclidean(embedding: Embedding): Embedding` - Convert to Euclidean space
- `hyperbolicDistance(emb1: Embedding, emb2: Embedding): number` - Hyperbolic distance
- `hyperbolicMidpoint(emb1: Embedding, emb2: Embedding): Embedding` - Hyperbolic midpoint
- `projectToBall(vector: number[]): number[]` - Project to unit ball

**Configuration:**
- `updateEmbeddingConfig(config: Partial<EmbeddingConfig>): void` - Update config
- `updateHyperbolicConfig(config: Partial<HyperbolicConfig>): void` - Update hyperbolic config
- `getStats(): EmbeddingStats` - Get statistics
- `clearCaches(): void` - Clear caches
- `reset(): void` - Reset adapter state

**MCP Bridge:**
- `bridgeToMCPGenerate(text: string, hyperbolic?: boolean): Promise<Embedding>` - Bridge to MCP
- `bridgeToMCPSearch(query: string, config?): Promise<SimilarityResult[]>` - Bridge to MCP
- `bridgeToMCPCompare(text1: string, text2: string, metric?): Promise<number>` - Bridge to MCP

## Testing

Run tests:

```bash
cd v3
npm test -- --run src/integrations/agentic-flow/onnx-embeddings
```

## Related Documentation

- [ADR-051: ONNX Embeddings Adapter](../../docs/adr/051-onnx-embeddings-adapter.md)
- [ADR-050: ReasoningBank Adapter](../../docs/adr/050-reasoningbank-adapter.md)
- [agentic-flow MCP Documentation](https://github.com/cyanheads/agentic-flow)

## License

MIT
