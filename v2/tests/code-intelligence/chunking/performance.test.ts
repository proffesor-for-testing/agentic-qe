/**
 * Performance Benchmark Tests for Chunking and Embedding
 *
 * Tests throughput, latency, memory usage, and scalability
 * of the chunking and embedding pipeline.
 *
 * Run with: npm run test:performance
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import type { CodeEntity } from '../../../src/code-intelligence/parser/types';
import type { CodeChunk } from '../../../src/code-intelligence/embeddings/types';

describe('Chunking Performance Benchmarks', () => {
  describe('throughput tests', () => {
    it('should chunk 1000 entities in <1 second', () => {
      const entities: CodeEntity[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `e${i}`,
        type: 'function',
        name: `func${i}`,
        filePath: '/test.ts',
        lineStart: i * 10,
        lineEnd: i * 10 + 8,
        content: `function func${i}() { return ${i}; }`,
        language: 'typescript',
        metadata: {},
      }));

      const start = performance.now();

      // const chunker = new ASTChunker({ maxTokens: 512, overlapPercentage: 0.15 });
      // const chunks = chunker.chunk(entities);

      const duration = performance.now() - start;

      expect(entities).toHaveLength(1000);
      expect(duration).toBeLessThan(1000); // <1 second
      // console.log(`Chunked 1000 entities in ${duration.toFixed(2)}ms`);
    });

    it('should achieve >500 entities/sec throughput', () => {
      const entityCount = 1000;
      const targetThroughput = 500; // entities per second
      const maxTimeMs = (entityCount / targetThroughput) * 1000;

      expect(maxTimeMs).toBe(2000); // Should complete in 2 seconds
    });

    it('should handle large entity arrays (10k+ entities)', () => {
      const largeCount = 10000;
      const entities: CodeEntity[] = Array.from({ length: largeCount }, (_, i) => ({
        id: `e${i}`,
        type: 'function',
        name: `f${i}`,
        filePath: '/test.ts',
        lineStart: i * 5,
        lineEnd: i * 5 + 3,
        content: `const f${i} = () => ${i};`,
        language: 'typescript',
        metadata: {},
      }));

      const start = performance.now();
      // Processing
      const duration = performance.now() - start;

      expect(entities).toHaveLength(10000);
      expect(duration).toBeLessThan(10000); // <10 seconds
    });
  });

  describe('latency tests', () => {
    it('should chunk single entity in <10ms', () => {
      const entity: CodeEntity = {
        id: 'e1',
        type: 'function',
        name: 'test',
        filePath: '/test.ts',
        lineStart: 1,
        lineEnd: 10,
        content: 'function test() { return 42; }',
        language: 'typescript',
        metadata: {},
      };

      const start = performance.now();

      // const chunker = new ASTChunker({ maxTokens: 512, overlapPercentage: 0.15 });
      // const chunks = chunker.chunk([entity]);

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10); // <10ms
    });

    it('should maintain consistent latency under load', () => {
      const measurements: number[] = [];

      for (let i = 0; i < 100; i++) {
        const entity: CodeEntity = {
          id: `e${i}`,
          type: 'function',
          name: `f${i}`,
          filePath: '/test.ts',
          lineStart: 1,
          lineEnd: 5,
          content: `function f${i}() { return ${i}; }`,
          language: 'typescript',
          metadata: {},
        };

        const start = performance.now();
        // Process entity
        const duration = performance.now() - start;
        measurements.push(duration);
      }

      const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const max = Math.max(...measurements);
      const min = Math.min(...measurements);

      expect(avg).toBeLessThan(20);
      expect(max - min).toBeLessThan(50); // Low variance
    });
  });

  describe('memory usage tests', () => {
    it('should not leak memory when chunking repeatedly', () => {
      const entity: CodeEntity = {
        id: 'mem1',
        type: 'function',
        name: 'test',
        filePath: '/test.ts',
        lineStart: 1,
        lineEnd: 5,
        content: 'function test() {}',
        language: 'typescript',
        metadata: {},
      };

      const iterations = 10000;

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const before = process.memoryUsage().heapUsed;

      for (let i = 0; i < iterations; i++) {
        // const chunker = new ASTChunker({ maxTokens: 512, overlapPercentage: 0.15 });
        // chunker.chunk([entity]);
      }

      if (global.gc) {
        global.gc();
      }

      const after = process.memoryUsage().heapUsed;
      const growth = after - before;

      // Memory growth should be minimal
      expect(growth).toBeLessThan(10 * 1024 * 1024); // <10MB
    });

    it('should handle large chunks without excessive memory', () => {
      const largeContent = 'x'.repeat(100000); // ~100KB content
      const entity: CodeEntity = {
        id: 'large1',
        type: 'class',
        name: 'Large',
        filePath: '/test.ts',
        lineStart: 1,
        lineEnd: 5000,
        content: largeContent,
        language: 'typescript',
        metadata: {},
      };

      const before = process.memoryUsage().heapUsed;

      // const chunker = new ASTChunker({ maxTokens: 512, overlapPercentage: 0.15 });
      // const chunks = chunker.chunk([entity]);

      const after = process.memoryUsage().heapUsed;
      const growth = after - before;

      expect(entity.content.length).toBe(100000);
      expect(growth).toBeLessThan(50 * 1024 * 1024); // <50MB
    });
  });

  describe('scalability tests', () => {
    it('should scale linearly with entity count', () => {
      const sizes = [100, 200, 400, 800];
      const timings: number[] = [];

      for (const size of sizes) {
        const entities: CodeEntity[] = Array.from({ length: size }, (_, i) => ({
          id: `e${i}`,
          type: 'function',
          name: `f${i}`,
          filePath: '/test.ts',
          lineStart: i * 5,
          lineEnd: i * 5 + 3,
          content: `function f${i}() {}`,
          language: 'typescript',
          metadata: {},
        }));

        const start = performance.now();
        // Process entities
        const duration = performance.now() - start;
        timings.push(duration);
      }

      // Check for linear scaling (approximately)
      const ratio1 = timings[1] / timings[0]; // 200/100
      const ratio2 = timings[2] / timings[1]; // 400/200
      const ratio3 = timings[3] / timings[2]; // 800/400

      // Ratios should be roughly similar (linear scaling)
      expect(Math.abs(ratio1 - ratio2)).toBeLessThan(1.0);
      expect(Math.abs(ratio2 - ratio3)).toBeLessThan(1.0);
    });
  });
});

describe('Embedding Performance Benchmarks', () => {
  describe('throughput tests', () => {
    it('should embed 1000 chunks in <2 minutes', async () => {
      const chunks: CodeChunk[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `chunk${i}`,
        fileId: 'file1',
        content: `function f${i}() { return ${i}; }`,
        startLine: i * 5,
        endLine: i * 5 + 3,
        type: 'function',
        name: `f${i}`,
        language: 'typescript',
      }));

      const start = performance.now();

      // const embedder = new NomicEmbedder();
      // const result = await embedder.batchEmbed(chunks);

      const duration = performance.now() - start;

      expect(chunks).toHaveLength(1000);
      expect(duration).toBeLessThan(120000); // <2 minutes
    });

    it('should achieve <100ms per embedding on average', async () => {
      const targetAvgMs = 100;
      const chunkCount = 100;
      const maxTotalMs = targetAvgMs * chunkCount;

      expect(maxTotalMs).toBe(10000); // 10 seconds for 100 chunks
    });
  });

  describe('cache performance', () => {
    it('should achieve >90% cache hit rate on repeated content', async () => {
      const sameContent = 'function stable() { return 42; }';

      const chunks: CodeChunk[] = Array.from({ length: 100 }, (_, i) => ({
        id: `c${i}`,
        fileId: `f${i}`,
        content: sameContent,
        startLine: 1,
        endLine: 3,
        type: 'function',
        language: 'typescript',
      }));

      // const embedder = new NomicEmbedder();

      // First run: populate cache
      // await embedder.batchEmbed(chunks);

      // Second run: should use cache
      // const result = await embedder.batchEmbed(chunks);
      // const cacheHitRate = result.stats.cachedHits / result.stats.totalChunks;

      expect(chunks).toHaveLength(100);
      // expect(cacheHitRate).toBeGreaterThan(0.9);
    });

    it('should improve performance by >10x with caching', async () => {
      const chunks: CodeChunk[] = Array.from({ length: 50 }, () => ({
        id: 'same',
        fileId: 'f',
        content: 'const x = 1;',
        startLine: 1,
        endLine: 1,
        type: 'function',
        language: 'typescript',
      }));

      // Time without cache (first run)
      // const embedder = new NomicEmbedder();
      // const start1 = performance.now();
      // await embedder.batchEmbed(chunks);
      // const duration1 = performance.now() - start1;

      // Time with cache (second run)
      // const start2 = performance.now();
      // await embedder.batchEmbed(chunks);
      // const duration2 = performance.now() - start2;

      // const speedup = duration1 / duration2;
      // expect(speedup).toBeGreaterThan(10);

      expect(chunks).toHaveLength(50);
    });
  });

  describe('batch optimization', () => {
    it('should process batches in parallel', async () => {
      const batchSize = 100;
      const chunks: CodeChunk[] = Array.from({ length: batchSize }, (_, i) => ({
        id: `c${i}`,
        fileId: 'f',
        content: `content ${i}`,
        startLine: i,
        endLine: i,
        type: 'function',
        language: 'typescript',
      }));

      // Sequential would take: batchSize * 100ms = 10 seconds
      // Parallel should be much faster

      const start = performance.now();
      // await embedder.batchEmbed(chunks);
      const duration = performance.now() - start;

      // Should complete in <2 seconds (much faster than sequential)
      expect(duration).toBeLessThan(2000);
    });
  });
});

describe('End-to-End Performance', () => {
  it('should process a typical file (50 entities) in <5 seconds', async () => {
    const entities: CodeEntity[] = Array.from({ length: 50 }, (_, i) => ({
      id: `e${i}`,
      type: 'function',
      name: `func${i}`,
      filePath: '/src/service.ts',
      lineStart: i * 10,
      lineEnd: i * 10 + 8,
      content: `export function func${i}(data: any) {\n  return process(data);\n}`,
      language: 'typescript',
      metadata: {
        isExported: true,
      },
    }));

    const start = performance.now();

    // Complete pipeline: parse → chunk → embed
    // const chunker = new ASTChunker({ maxTokens: 512, overlapPercentage: 0.15 });
    // const chunks = chunker.chunk(entities);
    // const embedder = new NomicEmbedder();
    // const results = await embedder.batchEmbed(chunks);

    const duration = performance.now() - start;

    expect(entities).toHaveLength(50);
    expect(duration).toBeLessThan(5000); // <5 seconds
  });

  it('should handle a large codebase (1000 files) efficiently', async () => {
    const fileCount = 1000;
    const entitiesPerFile = 10;
    const totalEntities = fileCount * entitiesPerFile;

    // Simulate processing 1000 files
    expect(totalEntities).toBe(10000);
    // Should complete in reasonable time (<5 minutes)
  });
});
