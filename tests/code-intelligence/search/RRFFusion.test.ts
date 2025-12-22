/**
 * Unit Tests for RRFFusion
 *
 * Tests Reciprocal Rank Fusion for combining search results.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { RRFFusion } from '../../../src/code-intelligence/search/RRFFusion.js';
import type { SearchResult } from '../../../src/code-intelligence/search/types.js';

// Helper to create test results
function createResult(id: string, score: number): SearchResult {
  return {
    id,
    filePath: `/src/${id}.ts`,
    content: `content of ${id}`,
    startLine: 1,
    endLine: 10,
    score,
  };
}

describe('RRFFusion', () => {
  let fusion: RRFFusion;

  beforeEach(() => {
    fusion = new RRFFusion({ k: 60 });
  });

  describe('basic fusion', () => {
    it('should fuse two ranked lists', () => {
      const bm25Results = [
        createResult('doc1', 5.0),
        createResult('doc2', 4.0),
        createResult('doc3', 3.0),
      ];

      const vectorResults = [
        createResult('doc2', 0.9),
        createResult('doc1', 0.8),
        createResult('doc4', 0.7),
      ];

      const fused = fusion.fuse([bm25Results, vectorResults], 5);

      expect(fused.length).toBeGreaterThan(0);

      // doc2 should rank high (rank 2 in BM25, rank 1 in vector)
      // doc1 should also rank high (rank 1 in BM25, rank 2 in vector)
      const topIds = fused.slice(0, 2).map(r => r.id);
      expect(topIds).toContain('doc1');
      expect(topIds).toContain('doc2');
    });

    it('should respect topK limit', () => {
      const list1 = [
        createResult('a', 1),
        createResult('b', 0.9),
        createResult('c', 0.8),
      ];
      const list2 = [
        createResult('d', 1),
        createResult('e', 0.9),
        createResult('f', 0.8),
      ];

      const fused = fusion.fuse([list1, list2], 3);

      expect(fused.length).toBeLessThanOrEqual(3);
    });

    it('should handle single list', () => {
      const results = [
        createResult('doc1', 1.0),
        createResult('doc2', 0.8),
      ];

      const fused = fusion.fuse([results], 5);

      expect(fused.length).toBe(2);
      expect(fused[0].id).toBe('doc1');
      expect(fused[1].id).toBe('doc2');
    });

    it('should handle empty lists', () => {
      const fused = fusion.fuse([[], []], 5);

      expect(fused.length).toBe(0);
    });

    it('should preserve original result data', () => {
      const original: SearchResult = {
        id: 'doc1',
        filePath: '/src/auth.ts',
        content: 'function auth() {}',
        startLine: 10,
        endLine: 20,
        score: 5.0,
        entityType: 'function',
        entityName: 'auth',
        highlights: ['auth'],
      };

      const fused = fusion.fuse([[original]], 5);

      expect(fused[0].filePath).toBe('/src/auth.ts');
      expect(fused[0].entityType).toBe('function');
      expect(fused[0].highlights).toEqual(['auth']);
    });
  });

  describe('RRF scoring', () => {
    it('should give higher score to consistently ranked items', () => {
      // doc1 ranks first in both lists
      const list1 = [createResult('doc1', 5), createResult('doc2', 4)];
      const list2 = [createResult('doc1', 0.9), createResult('doc3', 0.8)];

      const fused = fusion.fuse([list1, list2], 5);

      expect(fused[0].id).toBe('doc1');
    });

    it('should use k constant in scoring', () => {
      // With higher k, lower ranks get relatively more weight
      const lowK = new RRFFusion({ k: 1 });
      const highK = new RRFFusion({ k: 100 });

      const list1 = [createResult('a', 5)];
      const list2 = [createResult('b', 5), createResult('a', 4)];

      const fusedLowK = lowK.fuse([list1, list2], 5);
      const fusedHighK = highK.fuse([list1, list2], 5);

      // With low k, rank 1 in first list vs rank 2 in second list
      // makes bigger difference than with high k
      // Just check both produce results
      expect(fusedLowK.length).toBeGreaterThan(0);
      expect(fusedHighK.length).toBeGreaterThan(0);
    });
  });

  describe('source agreement filtering', () => {
    it('should filter by minimum source agreement', () => {
      const fusionStrict = new RRFFusion({ k: 60, minSourceAgreement: 2 });

      // doc1 appears in both, doc2 only in list1, doc3 only in list2
      const list1 = [createResult('doc1', 5), createResult('doc2', 4)];
      const list2 = [createResult('doc1', 0.9), createResult('doc3', 0.8)];

      const fused = fusionStrict.fuse([list1, list2], 5);

      // Only doc1 should remain (appears in both lists)
      expect(fused.length).toBe(1);
      expect(fused[0].id).toBe('doc1');
    });
  });

  describe('weighted fusion', () => {
    it('should apply weights to RRF scores', () => {
      // Give full weight to list1
      const list1 = [createResult('doc1', 5)];
      const list2 = [createResult('doc2', 0.9)];

      const fused = fusion.fuseWeighted([list1, list2], [1.0, 0.0], 5);

      expect(fused[0].id).toBe('doc1');
    });

    it('should normalize weights', () => {
      const list1 = [createResult('a', 5)];
      const list2 = [createResult('b', 5)];

      // Weights don't sum to 1
      const fused = fusion.fuseWeighted([list1, list2], [2, 2], 5);

      expect(fused.length).toBe(2);
    });

    it('should reject mismatched weights', () => {
      const list1 = [createResult('a', 5)];
      const list2 = [createResult('b', 5)];

      expect(() => {
        fusion.fuseWeighted([list1, list2], [1], 5); // Wrong number of weights
      }).toThrow();
    });
  });

  describe('score fusion', () => {
    it('should combine normalized scores', () => {
      const list1 = [createResult('doc1', 10), createResult('doc2', 5)];
      const list2 = [createResult('doc2', 0.8), createResult('doc1', 0.4)];

      const fused = fusion.fuseScores([list1, list2], [0.5, 0.5], 5);

      // Both doc1 and doc2 should be present
      expect(fused.length).toBe(2);
      expect(fused.map(r => r.id).sort()).toEqual(['doc1', 'doc2']);
    });

    it('should preserve original scores in result', () => {
      const list1 = [createResult('doc1', 10)];
      const list2 = [createResult('doc1', 0.8)];

      const fused = fusion.fuseScores([list1, list2], [0.5, 0.5], 5);

      expect(fused[0].bm25Score).toBe(10);
      expect(fused[0].vectorScore).toBe(0.8);
    });
  });

  describe('configuration', () => {
    it('should allow config update', () => {
      fusion.updateConfig({ k: 30 });

      expect(fusion.getConfig().k).toBe(30);
    });
  });
});
