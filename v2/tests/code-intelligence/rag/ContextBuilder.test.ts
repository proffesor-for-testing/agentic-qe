/**
 * Unit Tests for ContextBuilder
 *
 * Tests RAG context building and formatting.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ContextBuilder } from '../../../src/code-intelligence/rag/ContextBuilder.js';
import type { RetrievedContext, QueryContext } from '../../../src/code-intelligence/rag/types.js';

describe('ContextBuilder', () => {
  let builder: ContextBuilder;

  // Helper to create mock retrieved context
  function createContext(
    id: string,
    score: number,
    content: string = 'function test() { return true; }'
  ): RetrievedContext {
    return {
      id,
      filePath: `/src/${id}.ts`,
      content,
      startLine: 1,
      endLine: 5,
      score,
      entityType: 'function',
      entityName: id,
      language: 'typescript',
    };
  }

  beforeEach(() => {
    builder = new ContextBuilder();
  });

  describe('basic context building', () => {
    it('should build context from retrieved chunks', () => {
      const queryContext: QueryContext = { query: 'test query' };
      const chunks = [
        createContext('func1', 0.9),
        createContext('func2', 0.8),
      ];

      const result = builder.buildContext(queryContext, chunks);

      expect(result.contextText).toBeDefined();
      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.sources.length).toBe(2);
      expect(result.cached).toBe(false);
    });

    it('should include file paths in context', () => {
      const queryContext: QueryContext = { query: 'test' };
      const chunks = [createContext('myFunc', 0.9)];

      const result = builder.buildContext(queryContext, chunks);

      expect(result.contextText).toContain('/src/myFunc.ts');
    });

    it('should include line numbers in context', () => {
      const queryContext: QueryContext = { query: 'test' };
      const chunks = [createContext('myFunc', 0.9)];

      const result = builder.buildContext(queryContext, chunks);

      expect(result.contextText).toContain('lines 1-5');
    });

    it('should include entity type and name', () => {
      const queryContext: QueryContext = { query: 'test' };
      const chunks = [createContext('myFunc', 0.9)];

      const result = builder.buildContext(queryContext, chunks);

      expect(result.contextText).toContain('function');
      expect(result.contextText).toContain('myFunc');
    });

    it('should format code blocks with language', () => {
      const queryContext: QueryContext = { query: 'test' };
      const chunks = [createContext('myFunc', 0.9)];

      const result = builder.buildContext(queryContext, chunks);

      expect(result.contextText).toContain('```typescript');
      expect(result.contextText).toContain('```');
    });
  });

  describe('score filtering', () => {
    it('should filter chunks below minimum score', () => {
      const queryContext: QueryContext = { query: 'test' };
      const chunks = [
        createContext('high', 0.9),
        createContext('medium', 0.6),
        createContext('low', 0.3), // Below default 0.5 threshold
      ];

      const result = builder.buildContext(queryContext, chunks);

      expect(result.sources.length).toBe(2);
      expect(result.sources.map((s) => s.id)).toContain('high');
      expect(result.sources.map((s) => s.id)).toContain('medium');
      expect(result.sources.map((s) => s.id)).not.toContain('low');
    });

    it('should sort chunks by score', () => {
      const queryContext: QueryContext = { query: 'test' };
      const chunks = [
        createContext('low', 0.6),
        createContext('high', 0.95),
        createContext('medium', 0.8),
      ];

      const result = builder.buildContext(queryContext, chunks);

      expect(result.sources[0].id).toBe('high');
      expect(result.sources[1].id).toBe('medium');
      expect(result.sources[2].id).toBe('low');
    });
  });

  describe('token budget', () => {
    it('should respect max token limit', () => {
      // Create builder with small token limit
      const smallBuilder = new ContextBuilder({ maxContextTokens: 200 });

      const queryContext: QueryContext = { query: 'test' };
      const chunks = [
        createContext('func1', 0.9, 'x'.repeat(500)),
        createContext('func2', 0.8, 'y'.repeat(500)),
      ];

      const result = smallBuilder.buildContext(queryContext, chunks);

      // Should include fewer chunks due to token limit
      expect(result.tokenCount).toBeLessThanOrEqual(300); // Some overhead allowed
    });

    it('should set truncated flag when chunks are excluded', () => {
      const smallBuilder = new ContextBuilder({ maxContextTokens: 100, topK: 1 });

      const queryContext: QueryContext = { query: 'test' };
      const chunks = [
        createContext('func1', 0.9, 'a'.repeat(50)),
        createContext('func2', 0.8, 'b'.repeat(50)),
      ];

      const result = smallBuilder.buildContext(queryContext, chunks);

      // With topK=1, second chunk should be excluded
      expect(result.truncated).toBe(true);
    });
  });

  describe('caching', () => {
    it('should cache context', () => {
      const queryContext: QueryContext = { query: 'test query' };
      const chunks = [createContext('func1', 0.9)];

      // First call - not cached
      const result1 = builder.buildContext(queryContext, chunks);
      expect(result1.cached).toBe(false);

      // Second call with same query - cached
      const result2 = builder.buildContext(queryContext, chunks);
      expect(result2.cached).toBe(true);
    });

    it('should not cache with different queries', () => {
      const chunks = [createContext('func1', 0.9)];

      const result1 = builder.buildContext({ query: 'query 1' }, chunks);
      const result2 = builder.buildContext({ query: 'query 2' }, chunks);

      expect(result1.cached).toBe(false);
      expect(result2.cached).toBe(false);
    });

    it('should clear cache', () => {
      const queryContext: QueryContext = { query: 'test' };
      const chunks = [createContext('func1', 0.9)];

      builder.buildContext(queryContext, chunks);
      builder.clearCache();

      const result = builder.buildContext(queryContext, chunks);
      expect(result.cached).toBe(false);
    });

    it('should disable caching when configured', () => {
      const noCacheBuilder = new ContextBuilder({ enableCaching: false });

      const queryContext: QueryContext = { query: 'test' };
      const chunks = [createContext('func1', 0.9)];

      noCacheBuilder.buildContext(queryContext, chunks);
      const result = noCacheBuilder.buildContext(queryContext, chunks);

      expect(result.cached).toBe(false);
    });
  });

  describe('related code expansion', () => {
    it('should include related contexts', () => {
      const queryContext: QueryContext = { query: 'test' };

      const relatedChunk = createContext('related', 0.7);
      relatedChunk.relationship = 'imports';

      const mainChunk = createContext('main', 0.9);
      mainChunk.relatedContexts = [relatedChunk];

      const result = builder.buildContext(queryContext, [mainChunk]);

      expect(result.contextText).toContain('Related Code');
      expect(result.contextText).toContain('imports');
    });

    it('should use expandWithRelatedCode method', () => {
      const chunks = [createContext('main', 0.9)];

      const relationships = [
        {
          sourceId: 'main',
          relatedChunk: createContext('helper', 0.8),
          relationship: 'calls',
        },
      ];

      const expanded = builder.expandWithRelatedCode(chunks, relationships);

      expect(expanded[0].relatedContexts).toBeDefined();
      expect(expanded[0].relatedContexts?.length).toBe(1);
      expect(expanded[0].relatedContexts?.[0].relationship).toBe('calls');
    });
  });

  describe('summary generation', () => {
    it('should generate simple summary', async () => {
      const chunks = [
        createContext('func1', 0.9),
        createContext('func2', 0.8),
      ];

      const summary = await builder.generateSummary(chunks, 'test query');

      expect(summary).toBeDefined();
      expect(summary).toContain('2'); // Number of chunks
      expect(summary).toContain('function'); // Entity type
    });
  });

  describe('response building', () => {
    it('should build full RAG response', async () => {
      const queryContext: QueryContext = { query: 'test query' };
      const chunks = [createContext('func1', 0.9)];

      const response = await builder.buildResponse(queryContext, chunks, 10);

      expect(response.context).toBeDefined();
      expect(response.metadata.query).toBe('test query');
      expect(response.metadata.totalTimeMs).toBeGreaterThanOrEqual(0);
      expect(response.metadata.chunksRetrieved).toBe(1);
      expect(response.metadata.chunksIncluded).toBe(1);
    });
  });

  describe('configuration', () => {
    it('should use default config', () => {
      const config = builder.getConfig();

      expect(config.maxContextTokens).toBe(4096);
      expect(config.topK).toBe(10);
      expect(config.minRelevanceScore).toBe(0.5);
    });

    it('should allow config update', () => {
      builder.updateConfig({ topK: 5 });

      expect(builder.getConfig().topK).toBe(5);
    });
  });

  describe('cache statistics', () => {
    it('should report cache stats', () => {
      const stats = builder.getCacheStats();

      expect(stats.size).toBeGreaterThanOrEqual(0);
      expect(stats.hitRate).toBeGreaterThanOrEqual(0);
    });
  });
});
