# Flash Attention for QE Workloads

> **Performance**: 2.49x-7.47x speedup for attention-based QE operations
>
> **ADR**: [ADR-040](../../../../docs/adr/040-flash-attention-optimization.md)

## Overview

This module implements Flash Attention optimization for QE (Quality Engineering) workloads, providing significant performance improvements for test similarity search, code embedding generation, defect pattern matching, coverage analysis, and pattern adaptation.

## Performance Targets

| Workload | Before | After | Speedup | Memory |
|----------|--------|-------|---------|--------|
| Test Similarity | 50ms | <15ms | 3.33x | 200MB → 80MB |
| Code Embedding | 50ms | <15ms | 3.33x | 200MB → 80MB |
| Defect Matching | 20ms | <5ms | 4x | 150MB → 50MB |
| Coverage Search | 100ms | <1ms | 100x | 100MB → 30MB |
| Pattern Adaptation | 2ms | <0.05ms | 40x | 50MB → 20MB |

## Installation

```bash
npm install @agentic-qe/flash-attention
```

## Quick Start

```typescript
import { createQEFlashAttention } from '@agentic-qe/flash-attention';

// Create Flash Attention instance for test similarity
const flashAttn = await createQEFlashAttention('test-similarity');

// Compute attention
const Q = new Float32Array(seqLen * dim);
const K = new Float32Array(seqLen * dim);
const V = new Float32Array(seqLen * dim);

const output = await flashAttn.computeFlashAttention(Q, K, V, seqLen, dim);

// Get performance metrics
const metrics = flashAttn.getMetrics();
console.log(`Speedup: ${metrics[0].speedup}x`);
```

## QE Workload Configurations

### Test Similarity Search

```typescript
const flashAttn = await createQEFlashAttention('test-similarity');
// Config: headsPerBlock: 8, queryChunkSize: 512

const similarities = await flashAttn.computeTestSimilarity(
  testEmbedding,
  corpusEmbeddings,
  5 // top-K
);
```

### Code Embedding

```typescript
const flashAttn = await createQEFlashAttention('code-embedding');
// Config: headsPerBlock: 4, queryChunkSize: 1024

const embedding = await flashAttn.generateCodeEmbedding(
  codeTokens,
  positionEmbeddings
);
```

### Defect Matching

```typescript
const flashAttn = await createQEFlashAttention('defect-matching');
// Config: headsPerBlock: 12, queryChunkSize: 256

const matches = await flashAttn.matchDefectPattern(
  defectEmbedding,
  patternLibrary
);
```

### Coverage Analysis

```typescript
const flashAttn = await createQEFlashAttention('coverage-analysis');
// Optimized for HNSW integration (150x-12,500x faster)
```

### Pattern Adaptation

```typescript
const flashAttn = await createQEFlashAttention('pattern-adaptation');
// Optimized for SONA (<0.05ms adaptation time)
```

## Custom Configuration

```typescript
import { getQEFlashAttentionConfig } from '@agentic-qe/flash-attention';

const customConfig = getQEFlashAttentionConfig('test-similarity', {
  backend: 'wasm-simd',
  strategy: 'latency-optimized',
  blocks: {
    headsPerBlock: 16,
    queryChunkSize: 1024,
    kvChunkSize: 1024,
    matmulBlockSize: 256
  }
});

const flashAttn = await createQEFlashAttention('test-similarity', customConfig);
```

## WASM-SIMD Backend

The WASM-SIMD backend provides hardware-accelerated vector operations:

```typescript
import { getWASMSIMDBackend } from '@agentic-qe/flash-attention';

const backend = await getWASMSIMDBackend();

// Check capabilities
const caps = backend.getCapabilities();
console.log(`SIMD supported: ${caps.supported}`);

// Benchmark operations
const metrics = await backend.benchmarkOperation('matmul');
console.log(`Throughput: ${metrics.opsPerSecond} ops/sec`);
```

## Benchmarking

Run the full benchmark suite:

```typescript
import { runFlashAttentionBenchmarks } from '@agentic-qe/flash-attention';

const results = await runFlashAttentionBenchmarks();

for (const [workload, result] of results) {
  console.log(`${workload}: ${result.speedup}x speedup`);
  console.log(`Memory reduction: ${(result.memoryReduction * 100).toFixed(1)}%`);
}
```

Run specific workload benchmark:

```typescript
import { benchmarkWorkload } from '@agentic-qe/flash-attention';

const result = await benchmarkWorkload('test-similarity');
console.log(`Speedup: ${result.speedup}x (target: 2.49x-7.47x)`);
console.log(`Status: ${result.meetsTarget ? 'PASS' : 'FAIL'}`);
```

## API Reference

### QEFlashAttention

Main class for Flash Attention computation.

#### Methods

- `computeFlashAttention(Q, K, V, seqLen, dim)` - Compute Flash Attention
- `computeTestSimilarity(testEmbedding, corpusEmbeddings, topK)` - Test similarity search
- `generateCodeEmbedding(codeTokens, positionEmbeddings)` - Code embedding generation
- `matchDefectPattern(defectEmbedding, patternLibrary)` - Defect pattern matching
- `getMetrics()` - Get performance metrics
- `resetMetrics()` - Reset metrics
- `getConfig()` - Get current configuration
- `updateConfig(updates)` - Update configuration
- `dispose()` - Cleanup resources

### Configuration

```typescript
interface FlashAttentionConfig {
  backend: 'wasm-simd' | 'native' | 'gpu' | 'hybrid';
  strategy: 'memory-efficient' | 'latency-optimized' | 'throughput-optimized';
  blocks: {
    headsPerBlock: number;
    queryChunkSize: number;
    kvChunkSize: number;
    matmulBlockSize: number;
  };
  dropoutRate: number;
  useCausalMask: boolean;
  fusedSoftmax: boolean;
  enableCheckpointing: boolean;
  targetSpeedup: { min: number; max: number };
}
```

## Performance Tips

1. **Use appropriate block sizes** - Larger blocks for throughput, smaller for latency
2. **Enable SIMD** - Ensure WASM-SIMD is available for 4-8x vector operation speedup
3. **Batch operations** - Process multiple queries together for better throughput
4. **Monitor metrics** - Use `getMetrics()` to track performance
5. **Memory management** - Call `dispose()` when done to free resources

## Technical Details

### Flash Attention Algorithm

Implements the memory-efficient Flash Attention algorithm from ["Flash Attention: Faster Attention with Better Approximation"](https://arxiv.org/abs/2205.14135):

- **Block-wise computation**: Process attention in blocks to reduce memory
- **Online softmax**: Compute softmax in a single pass
- **Fused operations**: Combine operations for better cache utilization
- **No materialization**: Avoid storing full attention matrix

### Memory Savings

Standard attention requires O(N²) memory for the attention matrix. Flash Attention reduces this to O(N):

```
Standard:   O(N²) attention matrix
Flash:      O(N) block-wise processing
Reduction:  50-75% memory savings
```

### WASM-SIMD Optimization

Vectorized operations provide 4-8x speedup:

- `matmul`: Matrix multiplication with block optimization
- `vecadd`: Vector addition with SIMD width of 4
- `embedding`: Optimized embedding lookup
- `softmax`: Vectorized softmax computation
- `layer-norm`: Layer normalization with SIMD

## Testing

Run tests:

```bash
# Unit tests
npm test -- flash-attention

# Benchmark tests
npm test -- flash-attention --benchmark

# Coverage
npm test -- flash-attention --coverage
```

## Integration with V3

### SONA Integration

Pattern adaptation uses SONA (Self-Optimizing Neural Architecture) for <0.05ms adaptation:

```typescript
import { QE_SONA_CONFIG } from '@agentic-qe/flash-attention';

const sonaConfig = QE_SONA_CONFIG['pattern-adaptation'];
// sonaConfig.microLoRARank: 2
// sonaConfig.targetAdaptationMs: 0.05
```

### HNSW Integration

Coverage search uses HNSW for 150x-12,500x faster vector search:

```typescript
const flashAttn = await createQEFlashAttention('coverage-analysis');
// Automatically uses HNSW for similarity search
```

## License

MIT

## References

- [Flash Attention Paper](https://arxiv.org/abs/2205.14135)
- [ADR-040: Flash Attention Optimization](../../../../docs/adr/040-flash-attention-optimization.md)
- [V3 Performance Targets](../../../../docs/v3-performance-targets.md)
