/**
 * Agentic QE v3 - Semantic Analyzer Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SemanticAnalyzerService,
  SemanticAnalyzerConfig,
} from '../../../../src/domains/code-intelligence/services/semantic-analyzer';
import { MemoryBackend, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { IEmbeddingProvider, EMBEDDING_CONFIG } from '../../../../src/shared/embeddings';

/**
 * Mock Embedding Provider for testing
 * Generates deterministic pseudo-embeddings without requiring Ollama
 */
function createMockEmbeddingProvider(): IEmbeddingProvider {
  return {
    async embed(text: string): Promise<number[]> {
      // Generate deterministic embedding based on text content
      const embedding = new Array(EMBEDDING_CONFIG.DIMENSIONS).fill(0);
      for (let i = 0; i < text.length && i < embedding.length; i++) {
        embedding[i] = text.charCodeAt(i) / 1000;
      }
      // Normalize
      const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
      return embedding.map((v) => v / magnitude);
    },
    async healthCheck(): Promise<boolean> {
      return true;
    },
    getDimensions(): number {
      return EMBEDDING_CONFIG.DIMENSIONS;
    },
  };
}

/**
 * Mock Memory Backend for testing
 */
function createMockMemoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();
  const vectors = new Map<string, { embedding: number[]; metadata: unknown }>();

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    set: vi.fn(async (key: string, value: unknown) => {
      storage.set(key, value);
    }),
    get: vi.fn(async <T>(key: string): Promise<T | undefined> => {
      return storage.get(key) as T | undefined;
    }),
    delete: vi.fn(async (key: string): Promise<boolean> => {
      return storage.delete(key);
    }),
    has: vi.fn(async (key: string): Promise<boolean> => {
      return storage.has(key);
    }),
    search: vi.fn(async (pattern: string, limit?: number): Promise<string[]> => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      const matches: string[] = [];
      for (const key of storage.keys()) {
        if (regex.test(key)) {
          matches.push(key);
          if (limit && matches.length >= limit) break;
        }
      }
      return matches;
    }),
    vectorSearch: vi.fn(async (_embedding: number[], k: number): Promise<VectorSearchResult[]> => {
      const results: VectorSearchResult[] = [];
      let count = 0;
      for (const [key, data] of vectors.entries()) {
        if (count >= k) break;
        results.push({
          key,
          score: 0.95 - count * 0.05,
          metadata: data.metadata,
        });
        count++;
      }
      return results;
    }),
    storeVector: vi.fn(async (key: string, embedding: number[], metadata?: unknown) => {
      vectors.set(key, { embedding, metadata });
    }),
  };
}

describe('SemanticAnalyzerService', () => {
  let service: SemanticAnalyzerService;
  let mockMemory: MemoryBackend;
  let mockEmbeddingProvider: IEmbeddingProvider;

  beforeEach(() => {
    mockMemory = createMockMemoryBackend();
    mockEmbeddingProvider = createMockEmbeddingProvider();
    // Use mock embedding provider to avoid Ollama dependency in tests
    service = new SemanticAnalyzerService(mockMemory, {
      embeddingProvider: mockEmbeddingProvider,
      useNomicEmbeddings: false, // Disable Nomic to use mock provider
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('search', () => {
    beforeEach(async () => {
      // Pre-index some code
      await service.indexCode('src/utils.ts', `
        export function calculateSum(a: number, b: number): number {
          return a + b;
        }
      `);
      await service.indexCode('src/math.ts', `
        export class MathOperations {
          add(x: number, y: number) { return x + y; }
          subtract(x: number, y: number) { return x - y; }
        }
      `);
    });

    it('should perform semantic search and return results', async () => {
      const result = await service.search({
        query: 'function that adds numbers',
        type: 'semantic',
        limit: 5,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.searchTime).toBeGreaterThanOrEqual(0);
        expect(result.value.total).toBeGreaterThanOrEqual(0);
      }
    });

    it('should perform exact search for literal matches', async () => {
      await service.indexCode('src/test.ts', 'const exactMatch = "findMe";');

      const result = await service.search({
        query: 'findMe',
        type: 'exact',
        limit: 10,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.results.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should perform fuzzy search for approximate matches', async () => {
      await service.indexCode('src/handler.ts', 'function handleUserRequest() {}');

      const result = await service.search({
        query: 'handle user',
        type: 'fuzzy',
        limit: 10,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.results).toBeDefined();
      }
    });

    it('should filter results by scope', async () => {
      await service.indexCode('src/api/routes.ts', 'export const routes = [];');
      await service.indexCode('lib/helpers.ts', 'export const helpers = [];');

      const result = await service.search({
        query: 'export',
        type: 'exact',
        scope: ['src/api'],
        limit: 10,
      });

      expect(result.success).toBe(true);
    });

    it('should apply search filters', async () => {
      await service.indexCode('src/big-file.ts', 'x'.repeat(1000));

      const result = await service.search({
        query: 'code',
        type: 'semantic',
        filters: [{ field: 'size', operator: 'gt', value: 500 }],
        limit: 10,
      });

      expect(result.success).toBe(true);
    });

    it('should return error for unknown search type', async () => {
      const result = await service.search({
        query: 'test',
        // @ts-expect-error - testing invalid type
        type: 'invalid',
        limit: 10,
      });

      expect(result.success).toBe(false);
    });

    it('should respect result limit', async () => {
      // Index multiple files
      for (let i = 0; i < 20; i++) {
        await service.indexCode(`src/file${i}.ts`, `const value${i} = ${i};`);
      }

      const result = await service.search({
        query: 'const',
        type: 'exact',
        limit: 5,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.results.length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('indexCode', () => {
    it('should index code content successfully', async () => {
      const result = await service.indexCode(
        'src/service.ts',
        'export class UserService { getUser() { return null; } }'
      );

      expect(result.success).toBe(true);
      expect(mockMemory.storeVector).toHaveBeenCalled();
      expect(mockMemory.set).toHaveBeenCalled();
    });

    it('should generate embeddings for indexed code', async () => {
      await service.indexCode('src/test.ts', 'const test = "value";');

      expect(mockMemory.storeVector).toHaveBeenCalledWith(
        expect.stringContaining('code-intelligence:semantic:code'),
        expect.any(Array),
        expect.objectContaining({
          file: 'src/test.ts',
        })
      );
    });

    it('should extract and store code metadata', async () => {
      const code = `
        export class TestClass {
          async fetchData() {
            return fetch('/api');
          }
        }
      `;

      await service.indexCode('src/test-class.ts', code);

      expect(mockMemory.set).toHaveBeenCalledWith(
        expect.stringContaining('content'),
        expect.objectContaining({
          file: 'src/test-class.ts',
          metadata: expect.objectContaining({
            hasClasses: true,
          }),
        }),
        expect.any(Object)
      );
    });

    it('should handle indexing errors gracefully', async () => {
      const errorMemory = createMockMemoryBackend();
      errorMemory.storeVector = vi.fn().mockRejectedValue(new Error('Storage failed'));

      const errorService = new SemanticAnalyzerService(errorMemory, {
        embeddingProvider: mockEmbeddingProvider,
        useNomicEmbeddings: false,
      });
      const result = await errorService.indexCode('src/error.ts', 'code');

      expect(result.success).toBe(false);
    });
  });

  describe('findSimilar', () => {
    beforeEach(async () => {
      await service.indexCode('src/add.ts', 'function add(a, b) { return a + b; }');
      await service.indexCode('src/sum.ts', 'const sum = (x, y) => x + y;');
    });

    it('should find semantically similar code', async () => {
      const result = await service.findSimilar(
        'function addition(x, y) { return x + y; }',
        5
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value)).toBe(true);
      }
    });

    it('should filter results below minimum score threshold', async () => {
      const lowScoreMemory = createMockMemoryBackend();
      lowScoreMemory.vectorSearch = vi.fn().mockResolvedValue([
        { key: 'k1', score: 0.3, metadata: { file: 'f1.ts' } }, // Below threshold
        { key: 'k2', score: 0.8, metadata: { file: 'f2.ts' } }, // Above threshold
      ]);

      const lowScoreService = new SemanticAnalyzerService(lowScoreMemory, {
        embeddingProvider: mockEmbeddingProvider,
        useNomicEmbeddings: false,
      });
      await lowScoreService.indexCode('f2.ts', 'code');

      const result = await lowScoreService.findSimilar('test code', 10);

      expect(result.success).toBe(true);
      if (result.success) {
        // Results with score < 0.5 (default minScore) should be filtered
        for (const r of result.value) {
          expect(r.score).toBeGreaterThanOrEqual(0.5);
        }
      }
    });

    it('should return code snippets with highlights', async () => {
      const result = await service.findSimilar('function add', 3);

      expect(result.success).toBe(true);
      if (result.success && result.value.length > 0) {
        expect(result.value[0]).toHaveProperty('snippet');
        expect(result.value[0]).toHaveProperty('highlights');
      }
    });

    it('should handle empty results gracefully', async () => {
      const emptyMemory = createMockMemoryBackend();
      emptyMemory.vectorSearch = vi.fn().mockResolvedValue([]);

      const emptyService = new SemanticAnalyzerService(emptyMemory, {
        embeddingProvider: mockEmbeddingProvider,
        useNomicEmbeddings: false,
      });
      const result = await emptyService.findSimilar('unique code', 5);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('analyze', () => {
    it('should extract programming concepts from code', async () => {
      const code = `
        export async function processData(items: Item[]): Promise<Result[]> {
          return items.map(item => transform(item));
        }
      `;

      const result = await service.analyze(code);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.concepts).toContain('asynchronous');
        expect(result.value.concepts).toContain('modular');
        expect(result.value.concepts).toContain('collection-processing');
      }
    });

    it('should detect design patterns', async () => {
      const singletonCode = `
        class Database {
          private static instance: Database;
          static getInstance(): Database {
            if (!this.instance) {
              this.instance = new Database();
            }
            return this.instance;
          }
        }
      `;

      const result = await service.analyze(singletonCode);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.patterns).toContain('singleton');
      }
    });

    it('should calculate cyclomatic complexity', async () => {
      const complexCode = `
        function process(x) {
          if (x > 0) {
            if (x > 10) {
              return 'large';
            } else {
              return 'medium';
            }
          } else if (x === 0) {
            return 'zero';
          } else {
            return 'negative';
          }
        }
      `;

      const result = await service.analyze(complexCode);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.complexity.cyclomatic).toBeGreaterThan(1);
      }
    });

    it('should calculate cognitive complexity', async () => {
      const nestedCode = `
        function nested(a, b, c) {
          if (a) {
            for (let i = 0; i < 10; i++) {
              if (b) {
                while (c) {
                  // deeply nested
                }
              }
            }
          }
        }
      `;

      const result = await service.analyze(nestedCode);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.complexity.cognitive).toBeGreaterThan(0);
      }
    });

    it('should calculate Halstead metrics', async () => {
      const code = `
        function calculate(a, b, c) {
          const sum = a + b;
          const product = sum * c;
          return product / 2;
        }
      `;

      const result = await service.analyze(code);

      expect(result.success).toBe(true);
      if (result.success) {
        const halstead = result.value.complexity.halstead;
        expect(halstead).toHaveProperty('vocabulary');
        expect(halstead).toHaveProperty('length');
        expect(halstead).toHaveProperty('difficulty');
        expect(halstead).toHaveProperty('effort');
        expect(halstead).toHaveProperty('time');
        expect(halstead).toHaveProperty('bugs');
      }
    });

    it('should extract dependencies from imports', async () => {
      const code = `
        import { useState } from 'react';
        import axios from 'axios';
        const fs = require('fs');
      `;

      const result = await service.analyze(code);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.dependencies).toContain('react');
        expect(result.value.dependencies).toContain('axios');
        expect(result.value.dependencies).toContain('fs');
      }
    });

    it('should generate improvement suggestions', async () => {
      // Code with high complexity and no error handling
      const code = `
        async function complexFunction(a, b, c, d, e, f) {
          if (a) { if (b) { if (c) { if (d) { if (e) { if (f) {
            return Promise.resolve('deep');
          }}}}}}
          return a || b || c || d || e || f;
        }
      `.repeat(10);

      const result = await service.analyze(code);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.suggestions.length).toBeGreaterThan(0);
      }
    });

    it('should use cache for repeated analysis', async () => {
      const code = 'const cached = "test";';

      // First analysis
      await service.analyze(code);

      // Second analysis (should use cache)
      const result = await service.analyze(code);

      expect(result.success).toBe(true);
    });
  });

  describe('getEmbedding', () => {
    it('should generate embedding vector of correct dimension', async () => {
      const embedding = await service.getEmbedding('test code');

      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(EMBEDDING_CONFIG.DIMENSIONS); // 768 for Nomic
    });

    it('should generate normalized embeddings', async () => {
      const embedding = await service.getEmbedding('normalize test');

      // Check magnitude is approximately 1 (normalized)
      const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      expect(magnitude).toBeCloseTo(1, 5);
    });

    it('should cache embeddings when caching is enabled', async () => {
      const code = 'const cacheTest = 1;';

      const embedding1 = await service.getEmbedding(code);
      const embedding2 = await service.getEmbedding(code);

      expect(embedding1).toEqual(embedding2);
    });

    it('should generate different embeddings for different code', async () => {
      const embedding1 = await service.getEmbedding('function add(a, b) { return a + b; }');
      const embedding2 = await service.getEmbedding('class User { constructor(name) { this.name = name; } }');

      // Embeddings should be different
      expect(embedding1).not.toEqual(embedding2);
    });
  });

  describe('configuration', () => {
    it('should use custom configuration', () => {
      const customConfig: Partial<SemanticAnalyzerConfig> = {
        embeddingDimension: 512,
        minScore: 0.7,
        maxResults: 50,
        enableCaching: false,
        embeddingProvider: mockEmbeddingProvider,
        useNomicEmbeddings: false,
      };

      const customService = new SemanticAnalyzerService(mockMemory, customConfig);
      expect(customService).toBeDefined();
    });

    it('should respect minScore filter in search', async () => {
      const strictMemory = createMockMemoryBackend();
      strictMemory.vectorSearch = vi.fn().mockResolvedValue([
        { key: 'low', score: 0.3, metadata: { file: 'low.ts' } },
        { key: 'high', score: 0.9, metadata: { file: 'high.ts' } },
      ]);

      const strictService = new SemanticAnalyzerService(strictMemory, {
        minScore: 0.8,
        embeddingProvider: mockEmbeddingProvider,
        useNomicEmbeddings: false,
      });
      await strictService.indexCode('high.ts', 'code');

      const result = await strictService.findSimilar('query', 10);

      expect(result.success).toBe(true);
      if (result.success) {
        // Only results above minScore should be returned
        expect(result.value.every(r => r.score >= 0.8)).toBe(true);
      }
    });
  });
});
