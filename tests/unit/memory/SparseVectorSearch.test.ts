/**
 * Unit Tests for SparseVectorSearch
 *
 * Tests BM25 scoring, hybrid search, and reciprocal rank fusion
 * with real implementations (no mocks).
 */

import {
  BM25Scorer,
  HybridSearcher,
  reciprocalRankFusion,
  SparseVector,
  BM25Config,
  HybridResult,
} from '../../../src/core/memory/SparseVectorSearch';

describe('BM25Scorer', () => {
  describe('tokenize()', () => {
    it('should tokenize text into lowercase terms', () => {
      const scorer = new BM25Scorer();
      const tokens = scorer.tokenize('Hello World Test');

      expect(tokens).toEqual(['hello', 'world', 'test']);
    });

    it('should remove punctuation and special characters', () => {
      const scorer = new BM25Scorer();
      const tokens = scorer.tokenize('Hello, World! This is a test.');

      expect(tokens).toEqual(['hello', 'world', 'this', 'test']);
    });

    it('should filter out short terms (length <= 2)', () => {
      const scorer = new BM25Scorer();
      const tokens = scorer.tokenize('a is at the go big test');

      expect(tokens).toEqual(['the', 'big', 'test']);
    });

    it('should handle empty string', () => {
      const scorer = new BM25Scorer();
      const tokens = scorer.tokenize('');

      expect(tokens).toEqual([]);
    });

    it('should handle multiple whitespace', () => {
      const scorer = new BM25Scorer();
      const tokens = scorer.tokenize('hello    world     test');

      expect(tokens).toEqual(['hello', 'world', 'test']);
    });
  });

  describe('buildSparseVector()', () => {
    it('should build sparse vector with term frequencies', () => {
      const scorer = new BM25Scorer();
      const vector = scorer.buildSparseVector('test test hello world');

      expect(vector.terms.get('test')).toBe(2);
      expect(vector.terms.get('hello')).toBe(1);
      expect(vector.terms.get('world')).toBe(1);
    });

    it('should calculate correct L2 norm', () => {
      const scorer = new BM25Scorer();
      const vector = scorer.buildSparseVector('test test hello');

      // Expected norm: sqrt(2^2 + 1^2) = sqrt(5) ≈ 2.236
      expect(vector.norm).toBeCloseTo(Math.sqrt(5), 2);
    });

    it('should handle single term', () => {
      const scorer = new BM25Scorer();
      const vector = scorer.buildSparseVector('hello');

      expect(vector.terms.get('hello')).toBe(1);
      expect(vector.norm).toBe(1);
    });

    it('should return empty vector for empty text', () => {
      const scorer = new BM25Scorer();
      const vector = scorer.buildSparseVector('');

      expect(vector.terms.size).toBe(0);
      expect(vector.norm).toBe(0);
    });

    it('should count repeated terms correctly', () => {
      const scorer = new BM25Scorer();
      const vector = scorer.buildSparseVector('the the the test test hello');

      expect(vector.terms.get('the')).toBe(3);
      expect(vector.terms.get('test')).toBe(2);
      expect(vector.terms.get('hello')).toBe(1);
    });
  });

  describe('indexDocument()', () => {
    it('should update term document frequencies', () => {
      const scorer = new BM25Scorer();

      scorer.indexDocument('doc1', 'hello world test');
      scorer.indexDocument('doc2', 'hello universe test');
      scorer.indexDocument('doc3', 'goodbye world');

      // 'hello' appears in 2 docs, 'world' in 2 docs, 'test' in 2 docs
      // We can verify by scoring - terms in more docs get lower IDF
      const query = scorer.buildSparseVector('hello');
      const doc = scorer.buildSparseVector('hello world');

      const score = scorer.score(query, doc, 11);
      expect(score).toBeGreaterThan(0);
    });

    it('should track document count', () => {
      const scorer = new BM25Scorer();

      scorer.indexDocument('doc1', 'test document one');
      scorer.indexDocument('doc2', 'test document two');
      scorer.indexDocument('doc3', 'test document three');

      // Document count affects IDF calculation
      const query = scorer.buildSparseVector('test');
      const doc = scorer.buildSparseVector('test');

      const score = scorer.score(query, doc, 4);
      expect(score).toBeGreaterThan(0);
    });

    it('should update average document length', () => {
      const scorer = new BM25Scorer();

      scorer.indexDocument('doc1', 'short');
      scorer.indexDocument('doc2', 'this is a much longer document');

      // Average length affects length normalization in BM25
      const query = scorer.buildSparseVector('test');
      const doc = scorer.buildSparseVector('test');

      const shortScore = scorer.score(query, doc, 5);
      const longScore = scorer.score(query, doc, 30);

      // Longer documents get penalized
      expect(shortScore).toBeGreaterThan(longScore);
    });
  });

  describe('score()', () => {
    it('should calculate BM25 score for matching terms', () => {
      const scorer = new BM25Scorer();

      scorer.indexDocument('doc1', 'machine learning artificial intelligence');
      scorer.indexDocument('doc2', 'natural language processing');
      scorer.indexDocument('doc3', 'deep learning neural networks');

      const query = scorer.buildSparseVector('machine learning');
      const doc = scorer.buildSparseVector('machine learning deep learning');

      const score = scorer.score(query, doc, 34);
      expect(score).toBeGreaterThan(0);
    });

    it('should return zero for non-matching terms', () => {
      const scorer = new BM25Scorer();

      scorer.indexDocument('doc1', 'hello world');

      const query = scorer.buildSparseVector('python programming');
      const doc = scorer.buildSparseVector('hello world');

      const score = scorer.score(query, doc, 11);
      expect(score).toBe(0);
    });

    it('should rank exact matches higher than partial matches', () => {
      const scorer = new BM25Scorer();

      scorer.indexDocument('doc1', 'test document');
      scorer.indexDocument('doc2', 'another document');
      scorer.indexDocument('doc3', 'final document');

      const query = scorer.buildSparseVector('test document');
      const exactMatch = scorer.buildSparseVector('test document');
      const partialMatch = scorer.buildSparseVector('test other');

      const exactScore = scorer.score(query, exactMatch, 13);
      const partialScore = scorer.score(query, partialMatch, 10);

      expect(exactScore).toBeGreaterThan(partialScore);
    });

    it('should handle custom BM25 parameters', () => {
      const scorer = new BM25Scorer({ k1: 2.0, b: 0.5 });

      scorer.indexDocument('doc1', 'test document');

      const query = scorer.buildSparseVector('test');
      const doc = scorer.buildSparseVector('test test test');

      const score = scorer.score(query, doc, 14);
      expect(score).toBeGreaterThan(0);
    });

    it('should penalize very common terms through IDF', () => {
      const scorer = new BM25Scorer();

      // Index 'common' in many documents
      for (let i = 0; i < 10; i++) {
        scorer.indexDocument(`doc${i}`, 'common term document');
      }

      // Index 'rare' in only one document
      scorer.indexDocument('doc10', 'rare unique term');

      const commonQuery = scorer.buildSparseVector('common');
      const rareQuery = scorer.buildSparseVector('rare');
      const doc = scorer.buildSparseVector('common rare term');

      const commonScore = scorer.score(commonQuery, doc, 16);
      const rareScore = scorer.score(rareQuery, doc, 16);

      // Rare terms should score higher due to higher IDF
      expect(rareScore).toBeGreaterThan(commonScore);
    });
  });
});

describe('HybridSearcher', () => {
  describe('indexPattern()', () => {
    it('should index pattern for sparse search', () => {
      const searcher = new HybridSearcher();

      searcher.indexPattern('pattern1', 'machine learning algorithms');
      searcher.indexPattern('pattern2', 'natural language processing');

      const results = searcher.searchSparse('machine learning', 10);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('pattern1');
    });

    it('should allow multiple patterns with same terms', () => {
      const searcher = new HybridSearcher();

      searcher.indexPattern('p1', 'test pattern one');
      searcher.indexPattern('p2', 'test pattern two');
      searcher.indexPattern('p3', 'test pattern three');

      const results = searcher.searchSparse('test pattern', 10);

      expect(results.length).toBe(3);
    });
  });

  describe('searchSparse()', () => {
    it('should return top-k results sorted by BM25 score', () => {
      const searcher = new HybridSearcher();

      searcher.indexPattern('p1', 'machine learning deep neural networks');
      searcher.indexPattern('p2', 'machine learning algorithms');
      searcher.indexPattern('p3', 'natural language processing');
      searcher.indexPattern('p4', 'computer vision image recognition');

      const results = searcher.searchSparse('machine learning', 3);

      expect(results.length).toBeLessThanOrEqual(3);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1]?.score || 0);

      // Should rank documents with exact matches higher
      const topIds = results.map(r => r.id);
      expect(topIds).toContain('p1');
      expect(topIds).toContain('p2');
    });

    it('should return empty array when no matches found', () => {
      const searcher = new HybridSearcher();

      searcher.indexPattern('p1', 'hello world');
      searcher.indexPattern('p2', 'goodbye universe');

      const results = searcher.searchSparse('python programming', 10);

      expect(results).toEqual([]);
    });

    it('should limit results to k items', () => {
      const searcher = new HybridSearcher();

      for (let i = 0; i < 20; i++) {
        searcher.indexPattern(`p${i}`, `test pattern number ${i}`);
      }

      const results = searcher.searchSparse('test pattern', 5);

      expect(results.length).toBe(5);
    });

    it('should rank by relevance not just term presence', () => {
      const searcher = new HybridSearcher();

      searcher.indexPattern('exact', 'machine learning models');
      searcher.indexPattern('partial', 'machine and learning are important');
      searcher.indexPattern('single', 'machine tools');

      const results = searcher.searchSparse('machine learning models', 10);

      expect(results[0].id).toBe('exact');
    });

    it('should handle empty query', () => {
      const searcher = new HybridSearcher();

      searcher.indexPattern('p1', 'test document');

      const results = searcher.searchSparse('', 10);

      expect(results).toEqual([]);
    });
  });

  describe('hybridSearch()', () => {
    it('should combine dense and sparse results using RRF', () => {
      const searcher = new HybridSearcher();

      searcher.indexPattern('doc1', 'machine learning algorithms');
      searcher.indexPattern('doc2', 'deep learning neural networks');
      searcher.indexPattern('doc3', 'natural language processing');

      const denseResults = [
        { id: 'doc1', score: 0.95 },
        { id: 'doc3', score: 0.85 },
      ];

      const results = searcher.hybridSearch('machine learning', denseResults, 3);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('denseScore');
      expect(results[0]).toHaveProperty('sparseScore');
      expect(results[0]).toHaveProperty('fusedScore');
    });

    it('should boost items appearing in both dense and sparse results', () => {
      const searcher = new HybridSearcher();

      searcher.indexPattern('doc1', 'machine learning optimization');
      searcher.indexPattern('doc2', 'random unrelated content');
      searcher.indexPattern('doc3', 'machine learning basics');

      const denseResults = [
        { id: 'doc1', score: 0.90 },
        { id: 'doc2', score: 0.85 },
      ];

      const results = searcher.hybridSearch('machine learning', denseResults, 3);

      // doc1 should rank highest as it's in both results
      const doc1Result = results.find(r => r.id === 'doc1');
      expect(doc1Result).toBeDefined();
      expect(doc1Result!.denseScore).toBeGreaterThan(0);
      expect(doc1Result!.sparseScore).toBeGreaterThan(0);
    });

    it('should respect k limit', () => {
      const searcher = new HybridSearcher();

      for (let i = 0; i < 10; i++) {
        searcher.indexPattern(`doc${i}`, `test document ${i}`);
      }

      const denseResults = [
        { id: 'doc1', score: 0.9 },
        { id: 'doc2', score: 0.8 },
      ];

      const results = searcher.hybridSearch('test document', denseResults, 5);

      expect(results.length).toBeLessThanOrEqual(5);
    });
  });
});

describe('reciprocalRankFusion()', () => {
  it('should merge overlapping results with combined RRF scores', () => {
    const denseResults = [
      { id: 'doc1', score: 0.95 },
      { id: 'doc2', score: 0.85 },
      { id: 'doc3', score: 0.75 },
    ];

    const sparseResults = [
      { id: 'doc2', score: 12.5 },
      { id: 'doc3', score: 10.0 },
      { id: 'doc4', score: 8.5 },
    ];

    const results = reciprocalRankFusion(denseResults, sparseResults);

    // doc2 and doc3 appear in both, should have higher fused scores
    const doc2Result = results.find(r => r.id === 'doc2')!;
    const doc1Result = results.find(r => r.id === 'doc1')!;

    expect(doc2Result.fusedScore).toBeGreaterThan(doc1Result.fusedScore);
    expect(doc2Result.denseScore).toBe(0.85);
    expect(doc2Result.sparseScore).toBe(12.5);
  });

  it('should handle non-overlapping results', () => {
    const denseResults = [
      { id: 'doc1', score: 0.95 },
      { id: 'doc2', score: 0.85 },
    ];

    const sparseResults = [
      { id: 'doc3', score: 12.5 },
      { id: 'doc4', score: 10.0 },
    ];

    const results = reciprocalRankFusion(denseResults, sparseResults);

    expect(results.length).toBe(4);

    const doc1 = results.find(r => r.id === 'doc1')!;
    const doc3 = results.find(r => r.id === 'doc3')!;

    expect(doc1.denseScore).toBe(0.95);
    expect(doc1.sparseScore).toBe(0);
    expect(doc3.denseScore).toBe(0);
    expect(doc3.sparseScore).toBe(12.5);
  });

  it('should calculate RRF scores correctly', () => {
    const denseResults = [
      { id: 'doc1', score: 1.0 },
    ];

    const sparseResults = [
      { id: 'doc2', score: 1.0 },
    ];

    const k = 60;
    const results = reciprocalRankFusion(denseResults, sparseResults, k);

    // RRF score = 1/(k + rank + 1) = 1/61 for rank 0
    expect(results[0].fusedScore).toBeCloseTo(1/61, 5);
  });

  it('should rank by fused score descending', () => {
    const denseResults = [
      { id: 'doc1', score: 0.5 },
      { id: 'doc2', score: 0.4 },
    ];

    const sparseResults = [
      { id: 'doc2', score: 10.0 },
      { id: 'doc3', score: 8.0 },
    ];

    const results = reciprocalRankFusion(denseResults, sparseResults);

    // Verify descending order
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].fusedScore).toBeGreaterThanOrEqual(results[i + 1].fusedScore);
    }

    // doc2 appears in both, should rank first
    expect(results[0].id).toBe('doc2');
  });

  it('should use custom k parameter', () => {
    const denseResults = [{ id: 'doc1', score: 1.0 }];
    const sparseResults: Array<{ id: string; score: number }> = [];

    const k = 100;
    const results = reciprocalRankFusion(denseResults, sparseResults, k);

    // RRF score = 1/(k + rank + 1) = 1/101
    expect(results[0].fusedScore).toBeCloseTo(1/101, 5);
  });

  it('should handle empty dense results', () => {
    const denseResults: Array<{ id: string; score: number }> = [];
    const sparseResults = [
      { id: 'doc1', score: 10.0 },
      { id: 'doc2', score: 8.0 },
    ];

    const results = reciprocalRankFusion(denseResults, sparseResults);

    expect(results.length).toBe(2);
    expect(results[0].denseScore).toBe(0);
    expect(results[0].sparseScore).toBeGreaterThan(0);
  });

  it('should handle empty sparse results', () => {
    const denseResults = [
      { id: 'doc1', score: 0.95 },
      { id: 'doc2', score: 0.85 },
    ];
    const sparseResults: Array<{ id: string; score: number }> = [];

    const results = reciprocalRankFusion(denseResults, sparseResults);

    expect(results.length).toBe(2);
    expect(results[0].sparseScore).toBe(0);
    expect(results[0].denseScore).toBeGreaterThan(0);
  });

  it('should handle both empty results', () => {
    const denseResults: Array<{ id: string; score: number }> = [];
    const sparseResults: Array<{ id: string; score: number }> = [];

    const results = reciprocalRankFusion(denseResults, sparseResults);

    expect(results).toEqual([]);
  });
});
