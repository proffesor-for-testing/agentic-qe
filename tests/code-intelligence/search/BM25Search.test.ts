/**
 * Unit Tests for BM25Search
 *
 * Tests keyword-based search with BM25 ranking.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { BM25Search } from '../../../src/code-intelligence/search/BM25Search.js';

describe('BM25Search', () => {
  let search: BM25Search;

  beforeEach(() => {
    search = new BM25Search();
  });

  describe('document indexing', () => {
    it('should add a document', () => {
      search.addDocument({
        id: 'doc1',
        filePath: '/src/utils.ts',
        content: 'function processData(input) { return input; }',
        startLine: 1,
        endLine: 5,
      });

      const stats = search.getStats();
      expect(stats.docCount).toBe(1);
    });

    it('should add multiple documents', () => {
      search.addDocuments([
        { id: 'd1', filePath: '/a.ts', content: 'hello world', startLine: 1, endLine: 1 },
        { id: 'd2', filePath: '/b.ts', content: 'goodbye world', startLine: 1, endLine: 1 },
        { id: 'd3', filePath: '/c.ts', content: 'hello there', startLine: 1, endLine: 1 },
      ]);

      const stats = search.getStats();
      expect(stats.docCount).toBe(3);
    });

    it('should track term frequencies', () => {
      search.addDocument({
        id: 'doc1',
        filePath: '/test.ts',
        content: 'hello hello hello world',
        startLine: 1,
        endLine: 1,
      });

      const stats = search.getStats();
      expect(stats.uniqueTerms).toBeGreaterThan(0);
    });

    it('should remove a document', () => {
      search.addDocument({
        id: 'doc1',
        filePath: '/test.ts',
        content: 'test content',
        startLine: 1,
        endLine: 1,
      });

      const removed = search.removeDocument('doc1');

      expect(removed).toBe(true);
      expect(search.getStats().docCount).toBe(0);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      search.addDocuments([
        {
          id: 'auth1',
          filePath: '/src/auth.ts',
          content: 'function validateUser(email, password) { return isValid; }',
          startLine: 1,
          endLine: 5,
          entityType: 'function',
          entityName: 'validateUser',
        },
        {
          id: 'auth2',
          filePath: '/src/auth.ts',
          content: 'function generateToken(userId) { return jwt.sign(data); }',
          startLine: 10,
          endLine: 15,
          entityType: 'function',
          entityName: 'generateToken',
        },
        {
          id: 'user1',
          filePath: '/src/user.ts',
          content: 'class UserService { async getUser(id) { return user; } }',
          startLine: 1,
          endLine: 20,
          entityType: 'class',
          entityName: 'UserService',
        },
        {
          id: 'user2',
          filePath: '/src/user.ts',
          content: 'interface User { id: string; email: string; password: string; }',
          startLine: 25,
          endLine: 30,
          entityType: 'interface',
          entityName: 'User',
        },
      ]);
    });

    it('should find documents by keyword', () => {
      // Search for "validate" which only appears in auth1
      const results = search.search('validate credentials');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('auth1');
    });

    it('should rank by relevance', () => {
      const results = search.search('password');

      // Both auth1 and user2 contain "password"
      expect(results.length).toBeGreaterThanOrEqual(2);

      // Scores should be in descending order
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should handle camelCase splitting', () => {
      // "validateUser" should be split to "validate" and "user"
      const results = search.search('validate');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('validateUser');
    });

    it('should handle snake_case splitting', () => {
      search.addDocument({
        id: 'snake',
        filePath: '/test.ts',
        content: 'const user_service = createService();',
        startLine: 1,
        endLine: 1,
      });

      const results = search.search('user service');

      expect(results.some(r => r.id === 'snake')).toBe(true);
    });

    it('should respect topK limit', () => {
      const results = search.search('user', 2);

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should include highlights', () => {
      const results = search.search('email password');

      const authResult = results.find(r => r.id === 'auth1');
      expect(authResult?.highlights).toBeDefined();
      expect(authResult?.highlights?.length).toBeGreaterThan(0);
    });

    it('should return empty for no matches', () => {
      const results = search.search('xyznonexistent');

      expect(results.length).toBe(0);
    });

    it('should filter common terms by frequency', () => {
      // Add many documents with common term
      for (let i = 0; i < 10; i++) {
        search.addDocument({
          id: `common${i}`,
          filePath: `/file${i}.ts`,
          content: 'the function returns value',
          startLine: 1,
          endLine: 1,
        });
      }

      // "the" should be filtered as too common
      const results = search.search('the function');

      // Should still find results based on "function"
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('highlights', () => {
    it('should extract matching lines', () => {
      const content = `
        function processUser(data) {
          const user = validate(data);
          return saveUser(user);
        }
      `;

      const highlights = search.getHighlights(content, ['user']);

      expect(highlights.length).toBeGreaterThan(0);
      expect(highlights.some(h => h.toLowerCase().includes('user'))).toBe(true);
    });

    it('should limit highlights to 3', () => {
      const content = `
        user line 1
        user line 2
        user line 3
        user line 4
        user line 5
      `;

      const highlights = search.getHighlights(content, ['user']);

      expect(highlights.length).toBeLessThanOrEqual(3);
    });
  });

  describe('statistics', () => {
    it('should calculate average doc length', () => {
      search.addDocuments([
        { id: 'd1', filePath: '/a.ts', content: 'one two', startLine: 1, endLine: 1 },
        { id: 'd2', filePath: '/b.ts', content: 'one two three four', startLine: 1, endLine: 1 },
      ]);

      const stats = search.getStats();

      expect(stats.avgDocLength).toBe(3); // (2 + 4) / 2
    });

    it('should track unique terms', () => {
      search.addDocuments([
        { id: 'd1', filePath: '/a.ts', content: 'hello world', startLine: 1, endLine: 1 },
        { id: 'd2', filePath: '/b.ts', content: 'hello universe', startLine: 1, endLine: 1 },
      ]);

      const stats = search.getStats();

      expect(stats.uniqueTerms).toBe(3); // hello, world, universe
    });
  });

  describe('clear', () => {
    it('should clear index', () => {
      search.addDocuments([
        { id: 'd1', filePath: '/a.ts', content: 'hello world', startLine: 1, endLine: 1 },
        { id: 'd2', filePath: '/b.ts', content: 'goodbye world', startLine: 1, endLine: 1 },
      ]);

      search.clear();

      const stats = search.getStats();
      expect(stats.docCount).toBe(0);
      expect(stats.uniqueTerms).toBe(0);
    });
  });
});
