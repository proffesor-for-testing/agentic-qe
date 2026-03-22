/**
 * QE Dashboard Unit Tests (Task 4.6)
 *
 * Tests for:
 * - WasmVectorStore: add, search, remove, namespace support, stats
 * - Cosine similarity accuracy
 * - PatternExplorer: clustering, domain distribution, dashboard data
 * - Large-scale testing with 1000+ patterns
 *
 * Note: Browser tests are excluded from the default vitest config.
 * Run explicitly with: npx vitest run tests/unit/integrations/browser/qe-dashboard.test.ts
 */

import { describe, it, expect, beforeEach, afterEach} from 'vitest';
import {
  WasmVectorStore,
  cosineSimilarity,
  type SearchResult,
} from '../../../../src/integrations/browser/qe-dashboard/wasm-vector-store';
import {
  PatternExplorer,
  kMeansClustering,
  type Pattern,
} from '../../../../src/integrations/browser/qe-dashboard/pattern-explorer';

// ============================================================================
// Test Helpers
// ============================================================================

/** Create a normalized random vector of given dimension */
function randomVector(dim: number, seed?: number): Float32Array {
  const v = new Float32Array(dim);
  let s = seed ?? Math.random() * 1000;
  for (let i = 0; i < dim; i++) {
    // Simple LCG for deterministic pseudo-random
    s = (s * 1664525 + 1013904223) % 4294967296;
    v[i] = (s / 4294967296) * 2 - 1;
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) v[i] /= norm;
  }
  return v;
}

/** Create a test pattern */
function createPattern(
  id: string,
  domain: string,
  overrides: Partial<Pattern> = {},
): Pattern {
  return {
    id,
    domain,
    description: `Pattern ${id} in ${domain}`,
    confidence: 0.7,
    success: true,
    tags: [domain, 'test'],
    createdAt: Date.now(),
    ...overrides,
  };
}

const DOMAINS = [
  'test-generation',
  'coverage-analysis',
  'defect-intelligence',
  'security-compliance',
  'performance-profiling',
];

// ============================================================================
// WasmVectorStore Tests
// ============================================================================

describe('WasmVectorStore', () => {
  let store: WasmVectorStore;

  beforeEach(async () => {
    store = new WasmVectorStore();
    await store.initialize();
  });

  afterEach(() => {
    // Reset state to prevent leaks between tests
  });

  // --------------------------------------------------------------------------
  // Basic Operations
  // --------------------------------------------------------------------------

  describe('add and retrieve', () => {
    it('should add a vector and report correct size', () => {
      store.add('v1', new Float32Array([1, 0, 0]));
      expect(store.size).toBe(1);
      expect(store.has('v1')).toBe(true);
    });

    it('should add multiple vectors', () => {
      store.add('v1', new Float32Array([1, 0, 0]));
      store.add('v2', new Float32Array([0, 1, 0]));
      store.add('v3', new Float32Array([0, 0, 1]));
      expect(store.size).toBe(3);
    });

    it('should overwrite existing vector with same id', () => {
      store.add('v1', new Float32Array([1, 0, 0]), { version: 1 });
      store.add('v1', new Float32Array([0, 1, 0]), { version: 2 });
      expect(store.size).toBe(1);

      const results = store.search(new Float32Array([0, 1, 0]), 1);
      expect(results[0].id).toBe('v1');
      expect(results[0].metadata.version).toBe(2);
    });

    it('should reject zero-length vectors', () => {
      expect(() => store.add('v1', new Float32Array([]))).toThrow(
        'Cannot add zero-length vector',
      );
    });

    it('should reject dimension mismatches', () => {
      store.add('v1', new Float32Array([1, 0, 0]));
      expect(() => store.add('v2', new Float32Array([1, 0]))).toThrow(
        'Dimension mismatch',
      );
    });

    it('should store metadata correctly', () => {
      store.add('v1', new Float32Array([1, 0, 0]), {
        domain: 'testing',
        score: 0.95,
      });

      const results = store.search(new Float32Array([1, 0, 0]), 1);
      expect(results[0].metadata.domain).toBe('testing');
      expect(results[0].metadata.score).toBe(0.95);
    });
  });

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------

  describe('search', () => {
    it('should return exact match with similarity ~1.0', () => {
      store.add('v1', new Float32Array([1, 0, 0]));
      store.add('v2', new Float32Array([0, 1, 0]));

      const results = store.search(new Float32Array([1, 0, 0]), 1);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('v1');
      expect(results[0].similarity).toBeCloseTo(1.0, 5);
    });

    it('should return orthogonal vectors with similarity ~0', () => {
      store.add('v1', new Float32Array([1, 0, 0]));
      store.add('v2', new Float32Array([0, 1, 0]));

      const results = store.search(new Float32Array([1, 0, 0]), 2);
      expect(results[0].similarity).toBeCloseTo(1.0, 5);
      expect(results[1].similarity).toBeCloseTo(0.0, 5);
    });

    it('should return results sorted by descending similarity', () => {
      store.add('v1', new Float32Array([1, 0, 0]));
      store.add('v2', new Float32Array([0.9, 0.1, 0]));
      store.add('v3', new Float32Array([0.5, 0.5, 0]));

      const results = store.search(new Float32Array([1, 0, 0]), 3);
      expect(results[0].id).toBe('v1');
      for (let i = 1; i < results.length; i++) {
        expect(results[i].similarity).toBeLessThanOrEqual(
          results[i - 1].similarity,
        );
      }
    });

    it('should respect k parameter', () => {
      for (let i = 0; i < 10; i++) {
        store.add(`v${i}`, randomVector(8, i));
      }

      expect(store.search(randomVector(8, 42), 3)).toHaveLength(3);
      expect(store.search(randomVector(8, 42), 5)).toHaveLength(5);
      expect(store.search(randomVector(8, 42), 100)).toHaveLength(10);
    });

    it('should return empty for empty store', () => {
      const results = store.search(new Float32Array([1, 0, 0]), 5);
      expect(results).toHaveLength(0);
    });

    it('should return empty for zero-length query', () => {
      store.add('v1', new Float32Array([1, 0, 0]));
      const results = store.search(new Float32Array([]), 5);
      expect(results).toHaveLength(0);
    });

    it('should throw on dimension mismatch in query', () => {
      store.add('v1', new Float32Array([1, 0, 0]));
      expect(() => store.search(new Float32Array([1, 0]), 1)).toThrow(
        'Query dimension mismatch',
      );
    });
  });

  // --------------------------------------------------------------------------
  // Namespace Support
  // --------------------------------------------------------------------------

  describe('namespace support', () => {
    beforeEach(() => {
      store.add('v1', new Float32Array([1, 0, 0]), {}, 'ns-a');
      store.add('v2', new Float32Array([0, 1, 0]), {}, 'ns-a');
      store.add('v3', new Float32Array([0, 0, 1]), {}, 'ns-b');
    });

    it('should filter search by namespace', () => {
      const resultsA = store.search(new Float32Array([1, 0, 0]), 10, 'ns-a');
      expect(resultsA).toHaveLength(2);
      expect(resultsA.every((r) => r.namespace === 'ns-a')).toBe(true);

      const resultsB = store.search(new Float32Array([1, 0, 0]), 10, 'ns-b');
      expect(resultsB).toHaveLength(1);
      expect(resultsB[0].namespace).toBe('ns-b');
    });

    it('should search all namespaces when none specified', () => {
      const results = store.search(new Float32Array([1, 0, 0]), 10);
      expect(results).toHaveLength(3);
    });

    it('should list ids by namespace', () => {
      expect(store.getIds('ns-a')).toEqual(['v1', 'v2']);
      expect(store.getIds('ns-b')).toEqual(['v3']);
      expect(store.getIds()).toHaveLength(3);
    });

    it('should clear by namespace', () => {
      store.clear('ns-a');
      expect(store.size).toBe(1);
      expect(store.has('v3')).toBe(true);
      expect(store.has('v1')).toBe(false);
    });

    it('should report namespace sizes in stats', () => {
      const stats = store.getStats();
      expect(stats.namespaceCount).toBe(2);
      expect(stats.namespaceSizes['ns-a']).toBe(2);
      expect(stats.namespaceSizes['ns-b']).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Remove
  // --------------------------------------------------------------------------

  describe('remove', () => {
    it('should remove an existing vector', () => {
      store.add('v1', new Float32Array([1, 0, 0]));
      expect(store.remove('v1')).toBe(true);
      expect(store.size).toBe(0);
      expect(store.has('v1')).toBe(false);
    });

    it('should return false when removing non-existent vector', () => {
      expect(store.remove('nonexistent')).toBe(false);
    });

    it('should not appear in search after removal', () => {
      store.add('v1', new Float32Array([1, 0, 0]));
      store.add('v2', new Float32Array([0, 1, 0]));
      store.remove('v1');

      const results = store.search(new Float32Array([1, 0, 0]), 10);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('v2');
    });

    it('should reset dimensions when last vector is removed', () => {
      store.add('v1', new Float32Array([1, 0, 0]));
      store.remove('v1');

      // Should now accept vectors of different dimensions
      store.add('v2', new Float32Array([1, 0]));
      expect(store.size).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------

  describe('getStats', () => {
    it('should report correct stats for empty store', () => {
      const stats = store.getStats();
      expect(stats.totalVectors).toBe(0);
      expect(stats.namespaceCount).toBe(0);
      expect(stats.dimensions).toBe(0);
      expect(stats.wasmActive).toBe(false);
      expect(stats.memoryBytes).toBe(0);
    });

    it('should report correct stats with vectors', () => {
      store.add('v1', new Float32Array([1, 0, 0]), {}, 'ns-a');
      store.add('v2', new Float32Array([0, 1, 0]), {}, 'ns-b');

      const stats = store.getStats();
      expect(stats.totalVectors).toBe(2);
      expect(stats.namespaceCount).toBe(2);
      expect(stats.dimensions).toBe(3);
      expect(stats.memoryBytes).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Clear
  // --------------------------------------------------------------------------

  describe('clear', () => {
    it('should clear all vectors', () => {
      store.add('v1', new Float32Array([1, 0, 0]));
      store.add('v2', new Float32Array([0, 1, 0]));
      store.clear();

      expect(store.size).toBe(0);
      expect(store.getStats().dimensions).toBe(0);
    });
  });
});

// ============================================================================
// Cosine Similarity Tests
// ============================================================================

describe('cosineSimilarity', () => {
  it('should return 1.0 for identical vectors', () => {
    const v = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('should return 0.0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it('should return -1.0 for opposite vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it('should handle non-unit vectors correctly', () => {
    const a = new Float32Array([3, 4]);
    const b = new Float32Array([6, 8]);
    // Same direction, different magnitude
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it('should return 0 for zero vector', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('should throw on dimension mismatch', () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([1, 2, 3]);
    expect(() => cosineSimilarity(a, b)).toThrow('dimension mismatch');
  });

  it('should accept pre-computed norms', () => {
    const a = new Float32Array([3, 4]); // norm = 5
    const b = new Float32Array([6, 8]); // norm = 10
    const sim = cosineSimilarity(a, b, 5, 10);
    expect(sim).toBeCloseTo(1.0, 5);
  });

  it('should produce symmetric results', () => {
    const a = randomVector(16, 1);
    const b = randomVector(16, 2);
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });
});

// ============================================================================
// K-Means Clustering Tests
// ============================================================================

describe('kMeansClustering', () => {
  it('should return empty for empty input', () => {
    expect(kMeansClustering([], 3)).toEqual([]);
  });

  it('should return empty for k=0', () => {
    expect(kMeansClustering([new Float32Array([1, 0])], 0)).toEqual([]);
  });

  it('should assign all to one cluster when k=1', () => {
    const vectors = [
      new Float32Array([1, 0]),
      new Float32Array([0, 1]),
      new Float32Array([0.5, 0.5]),
    ];
    const assignments = kMeansClustering(vectors, 1);
    expect(assignments).toHaveLength(3);
    expect(new Set(assignments).size).toBe(1);
  });

  it('should create at most k clusters', () => {
    const vectors = Array.from({ length: 20 }, (_, i) => randomVector(8, i));
    const assignments = kMeansClustering(vectors, 4);
    expect(assignments).toHaveLength(20);

    const uniqueClusters = new Set(assignments);
    expect(uniqueClusters.size).toBeLessThanOrEqual(4);
  });

  it('should separate clearly distinct groups', () => {
    // Create two well-separated groups
    const group1 = Array.from({ length: 10 }, () => {
      const v = new Float32Array([1, 0, 0]);
      v[1] = (Math.random() - 0.5) * 0.1; // Small noise
      return v;
    });
    const group2 = Array.from({ length: 10 }, () => {
      const v = new Float32Array([0, 1, 0]);
      v[0] = (Math.random() - 0.5) * 0.1;
      return v;
    });
    const vectors = [...group1, ...group2];

    const assignments = kMeansClustering(vectors, 2);

    // Group 1 should be in one cluster, group 2 in another
    const cluster1 = assignments.slice(0, 10);
    const cluster2 = assignments.slice(10, 20);

    // All of group1 should have the same assignment
    expect(new Set(cluster1).size).toBe(1);
    // All of group2 should have the same assignment
    expect(new Set(cluster2).size).toBe(1);
    // The two groups should be in different clusters
    expect(cluster1[0]).not.toBe(cluster2[0]);
  });

  it('should handle k > n by clamping to n clusters', () => {
    const vectors = [new Float32Array([1, 0]), new Float32Array([0, 1])];
    const assignments = kMeansClustering(vectors, 10);
    expect(assignments).toHaveLength(2);
    expect(new Set(assignments).size).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// PatternExplorer Tests
// ============================================================================

describe('PatternExplorer', () => {
  let explorer: PatternExplorer;

  beforeEach(async () => {
    explorer = new PatternExplorer();
    await explorer.initialize();
  });

  // --------------------------------------------------------------------------
  // Load Patterns
  // --------------------------------------------------------------------------

  describe('loadPatterns', () => {
    it('should load patterns and report correct count', () => {
      const patterns = [
        createPattern('p1', 'test-generation'),
        createPattern('p2', 'coverage-analysis'),
      ];
      explorer.loadPatterns(patterns);
      expect(explorer.patternCount).toBe(2);
    });

    it('should retrieve loaded pattern by id', () => {
      explorer.loadPatterns([createPattern('p1', 'test-generation')]);
      const p = explorer.getPattern('p1');
      expect(p).toBeDefined();
      expect(p!.domain).toBe('test-generation');
    });

    it('should use provided embeddings when available', () => {
      const embedding = new Float32Array(32).fill(0.1);
      explorer.loadPatterns([
        createPattern('p1', 'test-generation', { embedding }),
      ]);

      // The pattern should be searchable
      const results = explorer.searchSimilar('test-generation', 1);
      expect(results).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Search Similar
  // --------------------------------------------------------------------------

  describe('searchSimilar', () => {
    it('should find patterns matching a query', () => {
      explorer.loadPatterns([
        createPattern('p1', 'test-generation', {
          description: 'unit testing patterns for authentication',
        }),
        createPattern('p2', 'coverage-analysis', {
          description: 'code coverage measurement tools',
        }),
        createPattern('p3', 'test-generation', {
          description: 'testing authentication flows',
        }),
      ]);

      const results = explorer.searchSimilar('authentication testing', 2);
      expect(results).toHaveLength(2);
      // Results should be Pattern objects
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('domain');
    });

    it('should return up to k results', () => {
      const patterns = Array.from({ length: 20 }, (_, i) =>
        createPattern(`p${i}`, DOMAINS[i % DOMAINS.length]),
      );
      explorer.loadPatterns(patterns);

      expect(explorer.searchSimilar('testing', 5)).toHaveLength(5);
      expect(explorer.searchSimilar('testing', 100)).toHaveLength(20);
    });

    it('should return empty for empty explorer', () => {
      expect(explorer.searchSimilar('query', 5)).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Cluster Patterns
  // --------------------------------------------------------------------------

  describe('clusterPatterns', () => {
    it('should return empty for empty explorer', () => {
      expect(explorer.clusterPatterns(3)).toHaveLength(0);
    });

    it('should create clusters with correct structure', () => {
      const patterns = Array.from({ length: 30 }, (_, i) =>
        createPattern(`p${i}`, DOMAINS[i % DOMAINS.length], {
          confidence: 0.5 + (i % 5) * 0.1,
        }),
      );
      explorer.loadPatterns(patterns);

      const clusters = explorer.clusterPatterns(3);
      expect(clusters.length).toBeGreaterThan(0);
      expect(clusters.length).toBeLessThanOrEqual(3);

      for (const cluster of clusters) {
        expect(cluster).toHaveProperty('id');
        expect(cluster).toHaveProperty('centroid');
        expect(cluster.centroid).toBeInstanceOf(Float32Array);
        expect(cluster.patterns.length).toBeGreaterThan(0);
        expect(cluster.dominantDomain).toBeTruthy();
        expect(cluster.avgConfidence).toBeGreaterThanOrEqual(0);
        expect(cluster.avgConfidence).toBeLessThanOrEqual(1);
        expect(cluster.cohesion).toBeGreaterThanOrEqual(-1);
        expect(cluster.cohesion).toBeLessThanOrEqual(1);
      }
    });

    it('should assign all patterns to clusters', () => {
      const patterns = Array.from({ length: 20 }, (_, i) =>
        createPattern(`p${i}`, DOMAINS[i % DOMAINS.length]),
      );
      explorer.loadPatterns(patterns);

      const clusters = explorer.clusterPatterns(3);
      const totalAssigned = clusters.reduce(
        (sum, c) => sum + c.patterns.length,
        0,
      );
      expect(totalAssigned).toBe(20);
    });

    it('should identify dominant domain per cluster', () => {
      const patterns = Array.from({ length: 10 }, (_, i) =>
        createPattern(`p${i}`, DOMAINS[i % DOMAINS.length]),
      );
      explorer.loadPatterns(patterns);

      const clusters = explorer.clusterPatterns(3);
      for (const cluster of clusters) {
        expect(DOMAINS).toContain(cluster.dominantDomain);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Domain Distribution
  // --------------------------------------------------------------------------

  describe('getDomainDistribution', () => {
    it('should return empty for no patterns', () => {
      expect(explorer.getDomainDistribution()).toHaveLength(0);
    });

    it('should compute correct distribution', () => {
      explorer.loadPatterns([
        createPattern('p1', 'test-generation', {
          confidence: 0.8,
          success: true,
          tags: ['auth', 'unit'],
        }),
        createPattern('p2', 'test-generation', {
          confidence: 0.6,
          success: false,
          tags: ['auth'],
        }),
        createPattern('p3', 'coverage-analysis', {
          confidence: 0.9,
          success: true,
          tags: ['coverage'],
        }),
      ]);

      const dist = explorer.getDomainDistribution();
      expect(dist).toHaveLength(2);

      // Sorted by count descending
      expect(dist[0].domain).toBe('test-generation');
      expect(dist[0].patternCount).toBe(2);
      expect(dist[0].avgConfidence).toBeCloseTo(0.7, 5);
      expect(dist[0].successRate).toBeCloseTo(0.5, 5);
      expect(dist[0].topTags.length).toBeGreaterThan(0);

      expect(dist[1].domain).toBe('coverage-analysis');
      expect(dist[1].patternCount).toBe(1);
      expect(dist[1].avgConfidence).toBeCloseTo(0.9, 5);
      expect(dist[1].successRate).toBeCloseTo(1.0, 5);
    });

    it('should handle patterns without success flag', () => {
      explorer.loadPatterns([
        createPattern('p1', 'test-generation', { success: undefined }),
      ]);

      const dist = explorer.getDomainDistribution();
      expect(dist[0].successRate).toBe(0);
    });

    it('should compute top tags correctly', () => {
      explorer.loadPatterns([
        createPattern('p1', 'test-generation', { tags: ['auth', 'unit'] }),
        createPattern('p2', 'test-generation', { tags: ['auth', 'integration'] }),
        createPattern('p3', 'test-generation', { tags: ['unit'] }),
      ]);

      const dist = explorer.getDomainDistribution();
      const topTags = dist[0].topTags;
      // 'auth' appears 2 times, 'unit' appears 2 times, 'integration' 1 time
      // Plus the 'test-generation' and 'test' tags from createPattern helper
      expect(topTags.length).toBeGreaterThan(0);
      // Should be sorted by count descending
      for (let i = 1; i < topTags.length; i++) {
        expect(topTags[i].count).toBeLessThanOrEqual(topTags[i - 1].count);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Health Dashboard Data
  // --------------------------------------------------------------------------

  describe('getHealthDashboardData', () => {
    it('should return correct structure for empty explorer', () => {
      const data = explorer.getHealthDashboardData();
      expect(data.totalPatterns).toBe(0);
      expect(data.domainCount).toBe(0);
      expect(data.avgConfidence).toBe(0);
      expect(data.successRate).toBe(0);
      expect(data.domainStats).toHaveLength(0);
      expect(data.confidenceHistogram).toHaveLength(10);
      expect(data.confidenceHistogram.every((v) => v === 0)).toBe(true);
      expect(data.recentActivity).toBe(0);
      expect(data.storeStats.totalVectors).toBe(0);
    });

    it('should compute correct dashboard data', () => {
      explorer.loadPatterns([
        createPattern('p1', 'test-generation', {
          confidence: 0.85,
          success: true,
          createdAt: Date.now(),
        }),
        createPattern('p2', 'test-generation', {
          confidence: 0.65,
          success: true,
          createdAt: Date.now(),
        }),
        createPattern('p3', 'coverage-analysis', {
          confidence: 0.55,
          success: false,
          createdAt: Date.now(),
        }),
      ]);

      const data = explorer.getHealthDashboardData();
      expect(data.totalPatterns).toBe(3);
      expect(data.domainCount).toBe(2);
      expect(data.avgConfidence).toBeCloseTo((0.85 + 0.65 + 0.55) / 3, 5);
      expect(data.successRate).toBeCloseTo(2 / 3, 5);
      expect(data.domainStats).toHaveLength(2);
      expect(data.storeStats.totalVectors).toBe(3);
      expect(data.storeStats.dimensions).toBeGreaterThan(0);
    });

    it('should produce correct confidence histogram', () => {
      explorer.loadPatterns([
        createPattern('p1', 'd', { confidence: 0.15 }),
        createPattern('p2', 'd', { confidence: 0.15 }),
        createPattern('p3', 'd', { confidence: 0.55 }),
        createPattern('p4', 'd', { confidence: 0.95 }),
      ]);

      const data = explorer.getHealthDashboardData();
      const hist = data.confidenceHistogram;

      // bin 1 (0.1-0.2): 2 patterns
      expect(hist[1]).toBe(2);
      // bin 5 (0.5-0.6): 1 pattern
      expect(hist[5]).toBe(1);
      // bin 9 (0.9-1.0): 1 pattern
      expect(hist[9]).toBe(1);
      // Sum should equal total
      expect(hist.reduce((a, b) => a + b, 0)).toBe(4);
    });

    it('should count recent activity', () => {
      const now = Date.now();
      const oldTimestamp = now - 60 * 24 * 60 * 60 * 1000; // 60 days ago

      explorer.loadPatterns([
        createPattern('p1', 'd', { createdAt: now }),
        createPattern('p2', 'd', { createdAt: now - 1000 }),
        createPattern('p3', 'd', { createdAt: oldTimestamp }),
      ]);

      const data = explorer.getHealthDashboardData();
      expect(data.recentActivity).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Clear
  // --------------------------------------------------------------------------

  describe('clear', () => {
    it('should reset all state', () => {
      explorer.loadPatterns([
        createPattern('p1', 'test-generation'),
        createPattern('p2', 'coverage-analysis'),
      ]);

      explorer.clear();
      expect(explorer.patternCount).toBe(0);
      expect(explorer.getHealthDashboardData().totalPatterns).toBe(0);
    });
  });
});

// ============================================================================
// Large-Scale Tests (1000+ patterns)
// ============================================================================

describe('Large-scale pattern handling', () => {
  let explorer: PatternExplorer;

  beforeEach(async () => {
    explorer = new PatternExplorer();
    await explorer.initialize();
  });

  it('should handle 1000+ patterns efficiently', () => {
    const patterns: Pattern[] = [];
    for (let i = 0; i < 1200; i++) {
      patterns.push(
        createPattern(`p${i}`, DOMAINS[i % DOMAINS.length], {
          confidence: 0.3 + (i % 7) * 0.1,
          success: i % 3 !== 0,
          tags: [`tag-${i % 10}`, `category-${i % 5}`],
          createdAt: Date.now() - (i % 60) * 24 * 60 * 60 * 1000,
        }),
      );
    }

    explorer.loadPatterns(patterns);
    expect(explorer.patternCount).toBe(1200);

    // Search should work
    const results = explorer.searchSimilar('test generation patterns', 10);
    expect(results).toHaveLength(10);

    // Domain distribution should cover all domains
    const dist = explorer.getDomainDistribution();
    expect(dist).toHaveLength(DOMAINS.length);

    // Each domain should have roughly equal count
    for (const d of dist) {
      expect(d.patternCount).toBeGreaterThan(200);
      expect(d.patternCount).toBeLessThan(300);
    }
  });

  it('should cluster 1000+ patterns within reasonable bounds', () => {
    const patterns: Pattern[] = [];
    for (let i = 0; i < 1000; i++) {
      patterns.push(
        createPattern(`p${i}`, DOMAINS[i % DOMAINS.length], {
          confidence: 0.5 + (i % 5) * 0.1,
        }),
      );
    }

    explorer.loadPatterns(patterns);

    const clusters = explorer.clusterPatterns(5);
    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters.length).toBeLessThanOrEqual(5);

    // All patterns should be assigned
    const total = clusters.reduce((sum, c) => sum + c.patterns.length, 0);
    expect(total).toBe(1000);

    // Each cluster should have at least one pattern
    for (const cluster of clusters) {
      expect(cluster.patterns.length).toBeGreaterThan(0);
    }
  });

  it('should produce complete dashboard data for 1000+ patterns', () => {
    const patterns: Pattern[] = [];
    for (let i = 0; i < 1500; i++) {
      patterns.push(
        createPattern(`p${i}`, DOMAINS[i % DOMAINS.length], {
          confidence: Math.min(0.1 + (i % 10) * 0.1, 0.99),
          success: i % 4 !== 0,
          createdAt: Date.now() - (i % 90) * 24 * 60 * 60 * 1000,
        }),
      );
    }

    explorer.loadPatterns(patterns);

    const data = explorer.getHealthDashboardData();
    expect(data.totalPatterns).toBe(1500);
    expect(data.domainCount).toBe(DOMAINS.length);
    expect(data.avgConfidence).toBeGreaterThan(0);
    expect(data.successRate).toBeGreaterThan(0);
    expect(data.confidenceHistogram.reduce((a, b) => a + b, 0)).toBe(1500);
    expect(data.recentActivity).toBeGreaterThan(0);
    expect(data.storeStats.totalVectors).toBe(1500);
  });

  it('should handle vector store with 2000 vectors', async () => {
    const store = new WasmVectorStore();
    await store.initialize();

    const dim = 32;
    for (let i = 0; i < 2000; i++) {
      store.add(`v${i}`, randomVector(dim, i), { index: i });
    }

    expect(store.size).toBe(2000);

    // Search should still work
    const results = store.search(randomVector(dim, 42), 10);
    expect(results).toHaveLength(10);

    // Stats should be accurate
    const stats = store.getStats();
    expect(stats.totalVectors).toBe(2000);
    expect(stats.dimensions).toBe(dim);
    expect(stats.memoryBytes).toBeGreaterThan(0);
  });
});
