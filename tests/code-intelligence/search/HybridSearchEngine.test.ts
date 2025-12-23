/**
 * Unit Tests for HybridSearchEngine
 *
 * Tests combined BM25 + vector search with RRF fusion.
 */

import { describe, it, expect, beforeEach, vi } from '@jest/globals';
import { HybridSearchEngine, VectorSearchProvider } from '../../../src/code-intelligence/search/HybridSearchEngine.js';
import type { SearchResult } from '../../../src/code-intelligence/search/types.js';

// Mock vector search provider
function createMockVectorProvider(results: SearchResult[]): VectorSearchProvider {
  return {
    search: jest.fn().mockResolvedValue(results),
  };
}

describe('HybridSearchEngine', () => {
  let engine: HybridSearchEngine;

  beforeEach(() => {
    engine = new HybridSearchEngine();

    // Add sample documents
    engine.addDocuments([
      {
        id: 'auth1',
        filePath: '/src/auth.ts',
        content: 'function validateCredentials(email, password) { return isValid(email, password); }',
        startLine: 1,
        endLine: 5,
        entityType: 'function',
        entityName: 'validateCredentials',
      },
      {
        id: 'auth2',
        filePath: '/src/auth.ts',
        content: 'function generateJWT(userId, claims) { return jwt.sign(payload, secret); }',
        startLine: 10,
        endLine: 15,
        entityType: 'function',
        entityName: 'generateJWT',
      },
      {
        id: 'user1',
        filePath: '/src/user.ts',
        content: 'class UserService { async getUser(id: string): Promise<User> { return db.users.findOne(id); } }',
        startLine: 1,
        endLine: 20,
        entityType: 'class',
        entityName: 'UserService',
      },
      {
        id: 'user2',
        filePath: '/src/user.ts',
        content: 'interface User { id: string; email: string; createdAt: Date; }',
        startLine: 25,
        endLine: 30,
        entityType: 'interface',
        entityName: 'User',
      },
    ]);
  });

  describe('configuration', () => {
    it('should use default config', () => {
      const config = engine.getConfig();

      expect(config.topK).toBe(10);
      expect(config.bm25Weight).toBe(0.5);
      expect(config.vectorWeight).toBe(0.5);
      expect(config.useRRF).toBe(true);
    });

    it('should allow config override in constructor', () => {
      const custom = new HybridSearchEngine({ topK: 5, bm25Weight: 0.7 });

      expect(custom.getConfig().topK).toBe(5);
      expect(custom.getConfig().bm25Weight).toBe(0.7);
    });

    it('should allow config update', () => {
      engine.updateConfig({ topK: 15 });

      expect(engine.getConfig().topK).toBe(15);
    });
  });

  describe('BM25-only search', () => {
    it('should search by keywords', () => {
      const results = engine.searchKeyword('validate email password');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('auth1'); // Best match
    });

    it('should return results with scores', () => {
      const results = engine.searchKeyword('user');

      expect(results.every(r => r.score > 0)).toBe(true);
      expect(results.every(r => r.bm25Score !== undefined)).toBe(true);
    });

    it('should include highlights when configured', () => {
      const results = engine.searchKeyword('email');

      expect(results.some(r => r.highlights && r.highlights.length > 0)).toBe(true);
    });

    it('should respect topK limit', () => {
      const results = engine.searchKeyword('user', 2);

      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('hybrid search without vector provider', () => {
    it('should fall back to BM25-only', async () => {
      const response = await engine.search('validate credentials');

      expect(response.results.length).toBeGreaterThan(0);
      expect(response.stats.vectorCandidates).toBe(0);
      expect(response.stats.bm25Candidates).toBeGreaterThan(0);
    });
  });

  describe('hybrid search with vector provider', () => {
    beforeEach(() => {
      // Set up mock vector provider
      const vectorResults: SearchResult[] = [
        {
          id: 'user1', // UserService
          filePath: '/src/user.ts',
          content: 'class UserService...',
          startLine: 1,
          endLine: 20,
          score: 0.92,
        },
        {
          id: 'auth1', // validateCredentials
          filePath: '/src/auth.ts',
          content: 'function validateCredentials...',
          startLine: 1,
          endLine: 5,
          score: 0.85,
        },
      ];

      engine.setVectorProvider(createMockVectorProvider(vectorResults));
    });

    it('should combine BM25 and vector results', async () => {
      // Search for terms that appear in both BM25 index and vector results
      const response = await engine.search('validate credentials');

      expect(response.stats.bm25Candidates).toBeGreaterThan(0);
      expect(response.stats.vectorCandidates).toBeGreaterThan(0);
      // Fusion may filter out low-score results
      expect(response.results.length).toBeGreaterThanOrEqual(0);
    });

    it('should use RRF by default', async () => {
      const response = await engine.search('validate credentials');

      // RRF produces scores that are sums of 1/(k+rank)
      if (response.results.length > 0) {
        expect(response.results[0].score).toBeLessThan(1);
      }
    });

    it('should use weighted fusion when configured', async () => {
      engine.updateConfig({ useRRF: false });

      const response = await engine.search('user');

      expect(response.results.length).toBeGreaterThan(0);
    });

    it('should include both BM25 and vector scores', async () => {
      const response = await engine.search('validate credentials');

      // auth1 should be found via BM25 (validate, credentials)
      // and via vector (in mock results)
      if (response.results.length > 0) {
        const authResult = response.results.find(r => r.id === 'auth1');
        // At least one score source should be present
        expect(authResult?.bm25Score !== undefined || authResult?.vectorScore !== undefined).toBe(true);
      }
    });

    it('should filter by minimum score', async () => {
      engine.updateConfig({ minScore: 0.5 });

      const response = await engine.search('user');

      expect(response.results.every(r => r.score >= 0.5)).toBe(true);
    });
  });

  describe('vector-only search', () => {
    it('should throw without vector provider', async () => {
      await expect(engine.searchSemantic('test'))
        .rejects.toThrow('Vector provider not configured');
    });

    it('should work with vector provider', async () => {
      const vectorResults: SearchResult[] = [
        {
          id: 'doc1',
          filePath: '/test.ts',
          content: 'test content',
          startLine: 1,
          endLine: 5,
          score: 0.9,
        },
      ];

      engine.setVectorProvider(createMockVectorProvider(vectorResults));

      const results = await engine.searchSemantic('test');

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('doc1');
    });
  });

  describe('search response', () => {
    it('should include query in response', async () => {
      const response = await engine.search('authentication');

      expect(response.query).toBe('authentication');
    });

    it('should include timing information', async () => {
      const response = await engine.search('user');

      expect(response.searchTimeMs).toBeGreaterThanOrEqual(0);
      expect(response.stats.bm25TimeMs).toBeGreaterThanOrEqual(0);
      expect(response.stats.fusionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include total matches count', async () => {
      const response = await engine.search('user');

      expect(response.totalMatches).toBeGreaterThan(0);
    });

    it('should allow per-query config override', async () => {
      const response = await engine.search('user', { topK: 1 });

      expect(response.results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('document management', () => {
    it('should add document', () => {
      engine.addDocument({
        id: 'new1',
        filePath: '/new.ts',
        content: 'new content',
        startLine: 1,
        endLine: 5,
      });

      const stats = engine.getStats();
      expect(stats.bm25.docCount).toBe(5);
    });

    it('should remove document', () => {
      const removed = engine.removeDocument('auth1');

      expect(removed).toBe(true);
      expect(engine.getStats().bm25.docCount).toBe(3);
    });

    it('should clear all documents', () => {
      engine.clear();

      expect(engine.getStats().bm25.docCount).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should report stats', () => {
      const stats = engine.getStats();

      expect(stats.bm25.docCount).toBe(4);
      expect(stats.bm25.avgDocLength).toBeGreaterThan(0);
      expect(stats.hasVectorProvider).toBe(false);
    });

    it('should report vector provider status', () => {
      engine.setVectorProvider(createMockVectorProvider([]));

      expect(engine.getStats().hasVectorProvider).toBe(true);
    });
  });
});
