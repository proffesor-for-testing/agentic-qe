/**
 * Pattern Explorer for QE Dashboard (Task 4.6)
 *
 * Provides pattern exploration, similarity clustering, and visualization
 * data preparation for the browser-based QE intelligence dashboard.
 *
 * Features:
 * - Load and index patterns into the vector store
 * - Similarity search across patterns
 * - K-Means clustering for visualization
 * - Domain distribution analysis
 * - Health dashboard data aggregation
 *
 * No browser-specific APIs: works in Node.js for testing.
 *
 * @module integrations/browser/qe-dashboard/pattern-explorer
 */

import {
  WasmVectorStore,
  cosineSimilarity,
  type SearchResult,
} from './wasm-vector-store.js';
import {
  generateEmbedding,
  generateQueryEmbedding,
  kMeansClustering,
} from './clustering.js';

// Re-export kMeansClustering for external consumers
export { kMeansClustering } from './clustering.js';

// ============================================================================
// Types
// ============================================================================

/** A QE pattern for exploration */
export interface Pattern {
  /** Unique pattern identifier */
  id: string;
  /** Domain the pattern belongs to */
  domain: string;
  /** Human-readable description */
  description: string;
  /** Confidence score (0..1) */
  confidence: number;
  /** Embedding vector (optional - will be auto-generated if missing) */
  embedding?: Float32Array;
  /** Tags for filtering */
  tags?: string[];
  /** Timestamp of pattern creation */
  createdAt?: number;
  /** Whether the pattern was successful */
  success?: boolean;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/** A cluster of similar patterns */
export interface PatternCluster {
  /** Cluster index */
  id: number;
  /** Centroid vector of the cluster */
  centroid: Float32Array;
  /** Patterns assigned to this cluster */
  patterns: Pattern[];
  /** Dominant domain in this cluster */
  dominantDomain: string;
  /** Average confidence within the cluster */
  avgConfidence: number;
  /** Intra-cluster cohesion (average similarity to centroid) */
  cohesion: number;
}

/** Statistics about a domain */
export interface DomainStats {
  /** Domain name */
  domain: string;
  /** Number of patterns in this domain */
  patternCount: number;
  /** Average confidence across patterns */
  avgConfidence: number;
  /** Success rate (fraction of successful patterns) */
  successRate: number;
  /** Most recent pattern timestamp */
  latestTimestamp: number;
  /** Top tags in this domain */
  topTags: Array<{ tag: string; count: number }>;
}

/** Aggregated dashboard data */
export interface DashboardData {
  /** Total number of loaded patterns */
  totalPatterns: number;
  /** Number of distinct domains */
  domainCount: number;
  /** Overall average confidence */
  avgConfidence: number;
  /** Overall success rate */
  successRate: number;
  /** Per-domain statistics */
  domainStats: DomainStats[];
  /** Confidence distribution histogram (10 bins) */
  confidenceHistogram: number[];
  /** Recent pattern activity (last 30 days if timestamps present) */
  recentActivity: number;
  /** Vector store statistics */
  storeStats: {
    totalVectors: number;
    dimensions: number;
    wasmActive: boolean;
    memoryBytes: number;
  };
}

// ============================================================================
// PatternExplorer
// ============================================================================

/**
 * Pattern exploration and visualization data preparation.
 *
 * Loads QE patterns into a vector store, provides similarity search,
 * clustering, domain distribution, and aggregated dashboard data.
 *
 * @example
 * ```typescript
 * const explorer = new PatternExplorer();
 * await explorer.initialize();
 *
 * explorer.loadPatterns(patterns);
 *
 * // Find similar patterns
 * const similar = explorer.searchSimilar('authentication testing', 5);
 *
 * // Cluster for visualization
 * const clusters = explorer.clusterPatterns(4);
 *
 * // Dashboard data
 * const dashboard = explorer.getHealthDashboardData();
 * ```
 */
export class PatternExplorer {
  private store: WasmVectorStore;
  private patterns: Map<string, Pattern> = new Map();
  private embeddings: Map<string, Float32Array> = new Map();

  constructor(store?: WasmVectorStore) {
    this.store = store ?? new WasmVectorStore();
  }

  /** Initialize the explorer (loads WASM backend if available) */
  async initialize(): Promise<void> {
    await this.store.initialize();
  }

  /**
   * Load patterns into the explorer
   *
   * Each pattern is embedded (using provided embedding or auto-generated)
   * and indexed in the vector store for similarity search.
   */
  loadPatterns(patterns: Pattern[]): void {
    for (const pattern of patterns) {
      const embedding = pattern.embedding ?? generateEmbedding(pattern);

      this.patterns.set(pattern.id, pattern);
      this.embeddings.set(pattern.id, embedding);

      this.store.add(
        pattern.id,
        embedding,
        {
          domain: pattern.domain,
          confidence: pattern.confidence,
          success: pattern.success,
          tags: pattern.tags,
          createdAt: pattern.createdAt,
        },
        pattern.domain,
      );
    }
  }

  /**
   * Search for patterns similar to a text query
   *
   * @param query - Natural language query string
   * @param k - Number of results to return
   * @returns Array of matched patterns ordered by similarity
   */
  searchSimilar(query: string, k: number): Pattern[] {
    const queryEmb = generateQueryEmbedding(query);
    const results: SearchResult[] = this.store.search(queryEmb, k);

    return results
      .map((r) => this.patterns.get(r.id))
      .filter((p): p is Pattern => p !== undefined);
  }

  /**
   * Cluster patterns into groups using K-Means
   *
   * @param numClusters - Number of clusters to create
   * @returns Array of PatternCluster with centroid, members, and statistics
   */
  clusterPatterns(numClusters: number): PatternCluster[] {
    const patternList = Array.from(this.patterns.values());
    if (patternList.length === 0) return [];

    const vectors = patternList.map(
      (p) => this.embeddings.get(p.id) ?? generateEmbedding(p),
    );

    const assignments = kMeansClustering(vectors, numClusters);

    return this.buildClusters(patternList, vectors, assignments);
  }

  /** Get distribution statistics per domain */
  getDomainDistribution(): DomainStats[] {
    const domainMap = new Map<string, Pattern[]>();

    for (const pattern of this.patterns.values()) {
      if (!domainMap.has(pattern.domain)) {
        domainMap.set(pattern.domain, []);
      }
      domainMap.get(pattern.domain)!.push(pattern);
    }

    const stats: DomainStats[] = [];

    for (const [domain, patterns] of domainMap) {
      stats.push(this.computeDomainStats(domain, patterns));
    }

    stats.sort((a, b) => b.patternCount - a.patternCount);
    return stats;
  }

  /** Get aggregated health dashboard data */
  getHealthDashboardData(): DashboardData {
    const allPatterns = Array.from(this.patterns.values());
    const totalPatterns = allPatterns.length;

    const avgConfidence = totalPatterns > 0
      ? allPatterns.reduce((sum, p) => sum + p.confidence, 0) / totalPatterns
      : 0;

    const successCount = allPatterns.filter((p) => p.success === true).length;
    const successTotal = allPatterns.filter((p) => p.success !== undefined).length;
    const successRate = successTotal > 0 ? successCount / successTotal : 0;

    const domainStats = this.getDomainDistribution();

    const confidenceHistogram = new Array(10).fill(0);
    for (const p of allPatterns) {
      confidenceHistogram[Math.min(Math.floor(p.confidence * 10), 9)]++;
    }

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentActivity = allPatterns.filter(
      (p) => (p.createdAt || 0) > thirtyDaysAgo,
    ).length;

    const storeInfo = this.store.getStats();

    return {
      totalPatterns,
      domainCount: domainStats.length,
      avgConfidence,
      successRate,
      domainStats,
      confidenceHistogram,
      recentActivity,
      storeStats: {
        totalVectors: storeInfo.totalVectors,
        dimensions: storeInfo.dimensions,
        wasmActive: storeInfo.wasmActive,
        memoryBytes: storeInfo.memoryBytes,
      },
    };
  }

  /** Get a pattern by id */
  getPattern(id: string): Pattern | undefined {
    return this.patterns.get(id);
  }

  /** Get total number of loaded patterns */
  get patternCount(): number {
    return this.patterns.size;
  }

  /** Clear all patterns and reset the explorer */
  clear(): void {
    this.patterns.clear();
    this.embeddings.clear();
    this.store.clear();
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  private buildClusters(
    patternList: Pattern[],
    vectors: Float32Array[],
    assignments: number[],
  ): PatternCluster[] {
    const clusterMap = new Map<number, { patterns: Pattern[]; vectors: Float32Array[] }>();

    for (let i = 0; i < assignments.length; i++) {
      const cid = assignments[i];
      if (!clusterMap.has(cid)) {
        clusterMap.set(cid, { patterns: [], vectors: [] });
      }
      const entry = clusterMap.get(cid)!;
      entry.patterns.push(patternList[i]);
      entry.vectors.push(vectors[i]);
    }

    const clusters: PatternCluster[] = [];
    for (const [id, { patterns, vectors: vecs }] of clusterMap) {
      const centroid = this.computeNormalizedCentroid(vecs);
      const dominantDomain = this.findDominantDomain(patterns);
      const avgConfidence = patterns.reduce((s, p) => s + p.confidence, 0) / patterns.length;

      let cohesionSum = 0;
      for (const v of vecs) {
        cohesionSum += cosineSimilarity(v, centroid);
      }

      clusters.push({
        id,
        centroid,
        patterns,
        dominantDomain,
        avgConfidence,
        cohesion: vecs.length > 0 ? cohesionSum / vecs.length : 0,
      });
    }

    clusters.sort((a, b) => b.patterns.length - a.patterns.length);
    return clusters;
  }

  private computeNormalizedCentroid(vectors: Float32Array[]): Float32Array {
    const dim = vectors[0].length;
    const centroid = new Float32Array(dim);

    for (const v of vectors) {
      for (let d = 0; d < dim; d++) centroid[d] += v[d];
    }
    for (let d = 0; d < dim; d++) centroid[d] /= vectors.length;

    let norm = 0;
    for (let d = 0; d < dim; d++) norm += centroid[d] * centroid[d];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let d = 0; d < dim; d++) centroid[d] /= norm;
    }

    return centroid;
  }

  private findDominantDomain(patterns: Pattern[]): string {
    const counts = new Map<string, number>();
    for (const p of patterns) {
      counts.set(p.domain, (counts.get(p.domain) || 0) + 1);
    }
    let best = '';
    let max = 0;
    for (const [domain, count] of counts) {
      if (count > max) { max = count; best = domain; }
    }
    return best;
  }

  private computeDomainStats(domain: string, patterns: Pattern[]): DomainStats {
    const patternCount = patterns.length;
    const avgConfidence = patterns.reduce((s, p) => s + p.confidence, 0) / patternCount;

    const successCount = patterns.filter((p) => p.success === true).length;
    const successTotal = patterns.filter((p) => p.success !== undefined).length;
    const successRate = successTotal > 0 ? successCount / successTotal : 0;

    const latestTimestamp = patterns.reduce(
      (max, p) => Math.max(max, p.createdAt || 0), 0,
    );

    const tagCounts = new Map<string, number>();
    for (const p of patterns) {
      for (const tag of p.tags || []) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    const topTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { domain, patternCount, avgConfidence, successRate, latestTimestamp, topTags };
  }
}
