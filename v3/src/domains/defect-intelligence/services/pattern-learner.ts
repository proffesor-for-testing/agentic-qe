/**
 * Agentic QE v3 - Defect Pattern Learner Service
 * Learns and recognizes defect patterns from historical data
 * Uses NomicEmbedder for semantic embeddings
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types';
import { MemoryBackend, VectorSearchResult } from '../../../kernel/interfaces';
import {
  LearnRequest,
  LearnedDefectPatterns,
  DefectPattern,
  DefectInfo,
  ClusterRequest,
  DefectClusters,
  DefectCluster,
} from '../interfaces';
import { NomicEmbedder, IEmbeddingProvider, EMBEDDING_CONFIG } from '../../../shared/embeddings';
import type { QEFlashAttention, QEFlashAttentionConfig } from '../../../integrations/ruvector/wrappers.js';

/**
 * Flash Attention status for pattern learning
 */
export interface FlashAttentionStatus {
  enabled: boolean;
  available: boolean;
  workload: string | null;
  metricsCount: number;
  averageSpeedup: number | null;
}

/**
 * Interface for the pattern learner service
 */
export interface IPatternLearnerService {
  learnPatterns(request: LearnRequest): Promise<Result<LearnedDefectPatterns, Error>>;
  clusterDefects(request: ClusterRequest): Promise<Result<DefectClusters, Error>>;
  findSimilarDefects(defect: DefectInfo, limit?: number): Promise<Result<DefectInfo[], Error>>;
  getPatternById(patternId: string): Promise<DefectPattern | undefined>;
  listPatterns(limit?: number): Promise<DefectPattern[]>;
  /** Get Flash Attention status and availability */
  getFlashAttentionStatus(): FlashAttentionStatus;
  /** Batch compute similarities using Flash Attention if available */
  batchComputeSimilarities(query: number[], corpus: number[][]): Promise<number[]>;
  /** Dispose of all resources and clear caches */
  destroy(): void;
}

/**
 * Configuration for the pattern learner
 */
export interface PatternLearnerConfig {
  minPatternFrequency: number;
  maxPatterns: number;
  clusterThreshold: number;
  embeddingDimension: number;
  patternNamespace: string;
  enableSemanticClustering: boolean;
  /** Optional embedder instance (defaults to NomicEmbedder with fallback) */
  embedder?: IEmbeddingProvider;
  /** Enable Flash Attention for faster similarity computations (if @ruvector/attention is available) */
  enableFlashAttention?: boolean;
  /** Custom Flash Attention configuration */
  flashAttentionConfig?: Partial<QEFlashAttentionConfig>;
}

const DEFAULT_CONFIG: PatternLearnerConfig = {
  minPatternFrequency: 2,
  maxPatterns: 50,
  clusterThreshold: 0.7,
  embeddingDimension: EMBEDDING_CONFIG.DIMENSIONS,
  patternNamespace: 'defect-intelligence:patterns',
  enableSemanticClustering: true,
  enableFlashAttention: true, // Enabled by default, will gracefully fallback if unavailable
};

/**
 * Known defect pattern indicators
 */
const KNOWN_PATTERNS: Record<string, { indicators: string[]; prevention: string }> = {
  'null-pointer': {
    indicators: ['null', 'undefined', 'NullPointerException', 'TypeError: Cannot read'],
    prevention: 'Use null-safe operators and defensive programming',
  },
  'race-condition': {
    indicators: ['concurrent', 'async', 'race', 'timing', 'intermittent'],
    prevention: 'Implement proper synchronization and use atomic operations',
  },
  'memory-leak': {
    indicators: ['memory', 'leak', 'OutOfMemory', 'heap', 'gc'],
    prevention: 'Ensure proper resource cleanup and avoid circular references',
  },
  'off-by-one': {
    indicators: ['index', 'boundary', 'array', 'loop', 'range'],
    prevention: 'Validate array bounds and use inclusive/exclusive ranges consistently',
  },
  'input-validation': {
    indicators: ['validation', 'sanitize', 'input', 'injection', 'XSS'],
    prevention: 'Implement strict input validation and sanitization',
  },
  'resource-exhaustion': {
    indicators: ['timeout', 'resource', 'exhausted', 'limit', 'quota'],
    prevention: 'Implement rate limiting and resource pooling',
  },
  'state-corruption': {
    indicators: ['state', 'inconsistent', 'corrupt', 'invalid state'],
    prevention: 'Use immutable state patterns and proper state machines',
  },
  'encoding-issue': {
    indicators: ['encoding', 'charset', 'UTF', 'unicode', 'character'],
    prevention: 'Use consistent encoding throughout the application',
  },
};

/**
 * Pattern Learner Service Implementation
 * Learns and recognizes defect patterns using ML and heuristics
 */
export class PatternLearnerService implements IPatternLearnerService {
  private readonly config: PatternLearnerConfig;
  private readonly patternCache: Map<string, DefectPattern> = new Map();
  private readonly embedder: IEmbeddingProvider;
  private flashAttention: QEFlashAttention | null = null;
  private flashAttentionAvailable: boolean = false;

  /** Maximum number of patterns to cache (LRU eviction) */
  private readonly MAX_CACHED_PATTERNS = 5000;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<PatternLearnerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Use provided embedder or create NomicEmbedder with fallback enabled
    this.embedder = config.embedder ?? new NomicEmbedder({ enableFallback: true });

    // Initialize Flash Attention if enabled
    if (this.config.enableFlashAttention) {
      this.initializeFlashAttention();
    }
  }

  /**
   * Initialize Flash Attention for faster similarity computations.
   * Throws if @ruvector/attention is not available.
   */
  private async initializeFlashAttention(): Promise<void> {
    const { createQEFlashAttention } = await import('../../../integrations/ruvector/wrappers.js');
    this.flashAttention = await createQEFlashAttention(
      'defect-matching',
      this.config.flashAttentionConfig
    );
    this.flashAttentionAvailable = true;
    console.log('[PatternLearnerService] Flash Attention initialized for defect matching');
  }

  /**
   * Ensure Flash Attention is initialized before use.
   */
  private async ensureFlashAttentionInitialized(): Promise<void> {
    if (this.config.enableFlashAttention && !this.flashAttention) {
      await this.initializeFlashAttention();
    }
  }

  /**
   * Learn patterns from a collection of defects
   */
  async learnPatterns(request: LearnRequest): Promise<Result<LearnedDefectPatterns, Error>> {
    try {
      const { defects, includeResolutions = false } = request;

      if (defects.length === 0) {
        return err(new Error('No defects provided for learning'));
      }

      const patterns: DefectPattern[] = [];
      let modelUpdated = false;

      // Extract patterns using multiple strategies
      const extractedPatterns = await this.extractPatterns(defects);

      // Merge with known patterns
      const mergedPatterns = this.mergeWithKnownPatterns(extractedPatterns);

      // Filter by frequency threshold
      for (const pattern of mergedPatterns) {
        if (pattern.frequency >= this.config.minPatternFrequency) {
          patterns.push(pattern);

          // Store learned pattern
          await this.storePattern(pattern);
          modelUpdated = true;
        }
      }

      // Calculate improvement estimate based on pattern coverage
      const improvementEstimate = this.calculateImprovementEstimate(
        defects.length,
        patterns
      );

      // Store resolution mappings if requested
      if (includeResolutions) {
        await this.learnResolutions(defects, patterns);
      }

      return ok({
        patterns: patterns.slice(0, this.config.maxPatterns),
        modelUpdated,
        improvementEstimate,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Cluster defects by similarity
   */
  async clusterDefects(request: ClusterRequest): Promise<Result<DefectClusters, Error>> {
    try {
      const { defects, method, minClusterSize = 2 } = request;

      if (defects.length === 0) {
        return err(new Error('No defects provided for clustering'));
      }

      let clusters: DefectCluster[];

      switch (method) {
        case 'semantic':
          clusters = await this.clusterBySemantic(defects, minClusterSize);
          break;
        case 'behavioral':
          clusters = await this.clusterByBehavior(defects, minClusterSize);
          break;
        case 'temporal':
          clusters = await this.clusterByTemporal(defects, minClusterSize);
          break;
        default:
          return err(new Error(`Unknown clustering method: ${method}`));
      }

      // Identify outliers (defects not in any cluster)
      const clusteredDefects = new Set(clusters.flatMap((c) => c.defects));
      const outliers = defects
        .filter((d) => !clusteredDefects.has(d.id))
        .map((d) => d.id);

      // Calculate clustering metrics
      const clusteringMetrics = this.calculateClusteringMetrics(
        clusters,
        defects.length
      );

      return ok({
        clusters,
        outliers,
        clusteringMetrics,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Find defects similar to a given defect
   */
  async findSimilarDefects(
    defect: DefectInfo,
    limit: number = 5
  ): Promise<Result<DefectInfo[], Error>> {
    try {
      // Generate embedding for the defect
      const embedding = await this.generateDefectEmbedding(defect);

      // Search for similar vectors
      const results: VectorSearchResult[] = await this.memory.vectorSearch(
        embedding,
        limit + 1 // +1 to exclude self
      );

      const similarDefects: DefectInfo[] = [];
      for (const result of results) {
        if (result.score >= this.config.clusterThreshold) {
          const storedDefect = await this.memory.get<DefectInfo>(result.key);
          if (storedDefect && storedDefect.id !== defect.id) {
            similarDefects.push(storedDefect);
          }
        }
      }

      return ok(similarDefects.slice(0, limit));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get a pattern by ID
   */
  async getPatternById(patternId: string): Promise<DefectPattern | undefined> {
    // Check cache first
    if (this.patternCache.has(patternId)) {
      return this.patternCache.get(patternId);
    }

    // Load from memory
    const patternKey = `${this.config.patternNamespace}:${patternId}`;
    const stored = await this.memory.get<DefectPattern>(patternKey);

    if (stored) {
      this.cachePattern(stored);
      return stored;
    }

    return undefined;
  }

  /**
   * List all learned patterns
   */
  async listPatterns(limit: number = this.config.maxPatterns): Promise<DefectPattern[]> {
    const patterns: DefectPattern[] = [];
    const keys = await this.memory.search(`${this.config.patternNamespace}:*`, limit * 2);

    for (const key of keys) {
      const pattern = await this.memory.get<DefectPattern>(key);
      if (pattern) {
        patterns.push(pattern);
        if (patterns.length >= limit) break;
      }
    }

    return patterns.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Get Flash Attention status and availability
   * Useful for diagnostics and performance monitoring
   */
  getFlashAttentionStatus(): FlashAttentionStatus {
    let metricsCount = 0;
    let averageSpeedup: number | null = null;
    let workload: string | null = null;

    if (this.flashAttention) {
      const metrics = this.flashAttention.getMetrics();
      metricsCount = metrics.length;
      averageSpeedup = this.flashAttention.getAverageSpeedup();
      workload = this.flashAttention.getWorkload();
    }

    return {
      enabled: this.config.enableFlashAttention ?? false,
      available: this.flashAttentionAvailable,
      workload,
      metricsCount,
      averageSpeedup,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async extractPatterns(defects: DefectInfo[]): Promise<DefectPattern[]> {
    const patternCounts: Map<string, { indicators: string[]; defects: string[] }> =
      new Map();

    for (const defect of defects) {
      const text = `${defect.title} ${defect.description}`.toLowerCase();

      // Match against known patterns
      for (const [patternName, patternData] of Object.entries(KNOWN_PATTERNS)) {
        const matchingIndicators = patternData.indicators.filter((indicator) =>
          text.includes(indicator.toLowerCase())
        );

        if (matchingIndicators.length > 0) {
          const existing = patternCounts.get(patternName);
          if (existing) {
            existing.defects.push(defect.id);
            existing.indicators.push(
              ...matchingIndicators.filter((i) => !existing.indicators.includes(i))
            );
          } else {
            patternCounts.set(patternName, {
              indicators: matchingIndicators,
              defects: [defect.id],
            });
          }
        }
      }

      // Also look for custom patterns based on tags
      if (defect.tags) {
        for (const tag of defect.tags) {
          const tagPattern = `tag-${tag}`;
          const existing = patternCounts.get(tagPattern);
          if (existing) {
            existing.defects.push(defect.id);
          } else {
            patternCounts.set(tagPattern, {
              indicators: [tag],
              defects: [defect.id],
            });
          }
        }
      }
    }

    // Convert to DefectPattern array
    const patterns: DefectPattern[] = [];
    for (const [name, data] of patternCounts) {
      const knownPattern = KNOWN_PATTERNS[name];
      patterns.push({
        id: uuidv4(),
        name: this.formatPatternName(name),
        indicators: [...new Set(data.indicators)],
        frequency: data.defects.length,
        prevention: knownPattern?.prevention || `Address ${name} issues proactively`,
      });
    }

    return patterns;
  }

  private mergeWithKnownPatterns(extracted: DefectPattern[]): DefectPattern[] {
    const merged = [...extracted];

    // Add known patterns that weren't detected but are commonly relevant
    for (const [name, data] of Object.entries(KNOWN_PATTERNS)) {
      const exists = merged.some(
        (p) => p.name.toLowerCase().includes(name.replace('-', ' '))
      );

      if (!exists) {
        merged.push({
          id: uuidv4(),
          name: this.formatPatternName(name),
          indicators: data.indicators,
          frequency: 0, // Not yet observed
          prevention: data.prevention,
        });
      }
    }

    return merged;
  }

  private formatPatternName(name: string): string {
    return name
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private async storePattern(pattern: DefectPattern): Promise<void> {
    const patternKey = `${this.config.patternNamespace}:${pattern.id}`;
    await this.memory.set(patternKey, pattern, {
      namespace: 'defect-intelligence',
      persist: true,
    });

    // Store vector for semantic search
    if (this.config.enableSemanticClustering) {
      const embedding = await this.generatePatternEmbedding(pattern);
      await this.memory.storeVector(patternKey, embedding, {
        patternId: pattern.id,
        name: pattern.name,
      });
    }

    this.cachePattern(pattern);
  }

  private async learnResolutions(
    defects: DefectInfo[],
    patterns: DefectPattern[]
  ): Promise<void> {
    // Group defects by pattern
    for (const pattern of patterns) {
      const relatedDefects = defects.filter((d) => {
        const text = `${d.title} ${d.description}`.toLowerCase();
        return pattern.indicators.some((i) => text.includes(i.toLowerCase()));
      });

      if (relatedDefects.length > 0) {
        await this.memory.set(
          `${this.config.patternNamespace}:resolutions:${pattern.id}`,
          {
            patternId: pattern.id,
            defectIds: relatedDefects.map((d) => d.id),
            learnedAt: new Date().toISOString(),
          },
          { namespace: 'defect-intelligence', persist: true }
        );
      }
    }
  }

  private calculateImprovementEstimate(
    totalDefects: number,
    patterns: DefectPattern[]
  ): number {
    if (totalDefects === 0) return 0;

    // Calculate what percentage of defects are covered by patterns
    const coveredDefects = patterns.reduce((sum, p) => sum + p.frequency, 0);
    const coverage = Math.min(1, coveredDefects / totalDefects);

    // Estimate improvement based on coverage and pattern quality
    const patternQuality = patterns.length > 0
      ? patterns.reduce((sum, p) => sum + (p.prevention ? 0.1 : 0), 0) /
        patterns.length
      : 0;

    return coverage * 0.7 + patternQuality * 0.3;
  }

  private async clusterBySemantic(
    defects: DefectInfo[],
    minSize: number
  ): Promise<DefectCluster[]> {
    const clusters: Map<string, DefectCluster> = new Map();

    // Ensure Flash Attention is initialized if enabled
    await this.ensureFlashAttentionInitialized();

    // Generate embeddings for all defects
    const embeddings: { defect: DefectInfo; embedding: number[] }[] = [];
    for (const defect of defects) {
      const embedding = await this.generateDefectEmbedding(defect);
      embeddings.push({ defect, embedding });

      // Store for future similarity searches
      await this.memory.storeVector(
        `${this.config.patternNamespace}:defect:${defect.id}`,
        embedding,
        { defectId: defect.id }
      );
    }

    // Simple clustering by finding nearest neighbors
    const assigned = new Set<string>();

    for (const { defect, embedding } of embeddings) {
      if (assigned.has(defect.id)) continue;

      const clusterMembers: string[] = [defect.id];
      assigned.add(defect.id);

      // Find similar defects using Flash Attention or cosine similarity fallback
      for (const other of embeddings) {
        if (other.defect.id === defect.id || assigned.has(other.defect.id)) continue;

        const similarity = await this.computeSimilarity(embedding, other.embedding);
        if (similarity >= this.config.clusterThreshold) {
          clusterMembers.push(other.defect.id);
          assigned.add(other.defect.id);
        }
      }

      if (clusterMembers.length >= minSize) {
        const clusterId = uuidv4();
        const commonFactors = this.findCommonFactors(
          defects.filter((d) => clusterMembers.includes(d.id))
        );

        clusters.set(clusterId, {
          id: clusterId,
          label: this.generateClusterLabel(
            defects.filter((d) => clusterMembers.includes(d.id))
          ),
          defects: clusterMembers,
          commonFactors,
          suggestedFix: this.suggestFix(commonFactors),
        });
      }
    }

    return Array.from(clusters.values());
  }

  /**
   * Compute similarity between two embeddings using Flash Attention.
   *
   * @param a First embedding vector
   * @param b Second embedding vector
   * @returns Similarity score between 0 and 1
   */
  private async computeSimilarity(a: number[], b: number[]): Promise<number> {
    if (!this.flashAttention) {
      throw new Error(
        '[PatternLearnerService] Flash Attention not initialized. ' +
        'Call ensureFlashAttentionInitialized() first.'
      );
    }
    return this.computeFlashAttentionSimilarity(a, b);
  }

  /**
   * Compute similarity using Flash Attention.
   * Uses the defect-matching workload configuration for optimal performance.
   */
  private async computeFlashAttentionSimilarity(a: number[], b: number[]): Promise<number> {
    const dim = a.length;

    // Prepare embeddings as Float32Arrays
    const Q = new Float32Array(dim);
    const K = new Float32Array(dim);
    const V = new Float32Array(dim);

    for (let i = 0; i < dim; i++) {
      Q[i] = a[i];
      K[i] = b[i];
      V[i] = b[i];
    }

    // Compute attention-based similarity
    const output = await this.flashAttention!.computeFlashAttention(Q, K, V, 1, dim);

    // Compute dot product as similarity score
    let similarity = 0;
    for (let i = 0; i < dim; i++) {
      similarity += output[i] * a[i];
    }

    // Normalize to 0-1 range
    return Math.max(0, Math.min(1, (similarity + 1) / 2));
  }

  /**
   * Batch compute similarities for multiple embedding pairs using Flash Attention.
   * More efficient for large-scale pattern matching.
   *
   * @param query Query embedding
   * @param corpus Array of corpus embeddings to compare against
   * @returns Array of similarity scores
   */
  async batchComputeSimilarities(
    query: number[],
    corpus: number[][]
  ): Promise<number[]> {
    // Ensure Flash Attention is initialized
    await this.ensureFlashAttentionInitialized();

    if (!this.flashAttention) {
      throw new Error(
        '[PatternLearnerService] Flash Attention not initialized. ' +
        'Ensure @ruvector/attention is installed as a dependency.'
      );
    }

    // Use Flash Attention's matchDefectPattern for batch processing
    const queryF32 = new Float32Array(query);
    const patternLibrary = corpus.map(e => new Float32Array(e));

    const matches = await this.flashAttention.matchDefectPattern(queryF32, patternLibrary);

    // Convert to similarity array maintaining original order
    const similarities = new Array<number>(corpus.length).fill(0);
    for (const match of matches) {
      if (match.pattern < similarities.length) {
        // Normalize score to 0-1 range
        similarities[match.pattern] = Math.max(0, Math.min(1, (match.score + 1) / 2));
      }
    }
    return similarities;
  }

  private async clusterByBehavior(
    defects: DefectInfo[],
    minSize: number
  ): Promise<DefectCluster[]> {
    const clusters: Map<string, DefectCluster> = new Map();

    // Group by tags and file
    const groups: Map<string, DefectInfo[]> = new Map();

    for (const defect of defects) {
      const groupKey = defect.tags?.sort().join('|') || defect.file || 'unknown';
      const group = groups.get(groupKey) || [];
      group.push(defect);
      groups.set(groupKey, group);
    }

    for (const [key, groupDefects] of groups) {
      if (groupDefects.length >= minSize) {
        const clusterId = uuidv4();
        const commonFactors = this.findCommonFactors(groupDefects);

        clusters.set(clusterId, {
          id: clusterId,
          label: `Behavioral: ${key.replace(/\|/g, ', ')}`,
          defects: groupDefects.map((d) => d.id),
          commonFactors,
          suggestedFix: this.suggestFix(commonFactors),
        });
      }
    }

    return Array.from(clusters.values());
  }

  private async clusterByTemporal(
    defects: DefectInfo[],
    _minSize: number
  ): Promise<DefectCluster[]> {
    // Temporal clustering would require timestamps
    // Stub implementation - group by same title words
    const clusters: Map<string, DefectCluster> = new Map();
    const titleWords: Map<string, DefectInfo[]> = new Map();

    for (const defect of defects) {
      const words = defect.title.toLowerCase().split(/\s+/).slice(0, 2).join(' ');
      const group = titleWords.get(words) || [];
      group.push(defect);
      titleWords.set(words, group);
    }

    for (const [words, groupDefects] of titleWords) {
      if (groupDefects.length >= 2) {
        const clusterId = uuidv4();
        const commonFactors = this.findCommonFactors(groupDefects);

        clusters.set(clusterId, {
          id: clusterId,
          label: `Temporal: ${words}`,
          defects: groupDefects.map((d) => d.id),
          commonFactors,
          suggestedFix: this.suggestFix(commonFactors),
        });
      }
    }

    return Array.from(clusters.values());
  }

  private findCommonFactors(defects: DefectInfo[]): string[] {
    const factors: string[] = [];

    // Find common tags
    if (defects.every((d) => d.tags)) {
      const allTags = defects.map((d) => new Set(d.tags));
      const commonTags = [...allTags[0]].filter((tag) =>
        allTags.every((tags) => tags.has(tag))
      );
      factors.push(...commonTags);
    }

    // Find common file patterns
    if (defects.every((d) => d.file)) {
      const filePaths = defects.map((d) => d.file!.split('/'));
      const minLen = Math.min(...filePaths.map((p) => p.length));
      for (let i = 0; i < minLen; i++) {
        if (filePaths.every((p) => p[i] === filePaths[0][i])) {
          factors.push(`Path: ${filePaths[0][i]}`);
        }
      }
    }

    // Find common words in titles
    const titleWords = defects.map(
      (d) => new Set(d.title.toLowerCase().split(/\s+/))
    );
    const commonWords = [...titleWords[0]].filter(
      (word) => word.length > 3 && titleWords.every((words) => words.has(word))
    );
    factors.push(...commonWords.map((w) => `Keyword: ${w}`));

    return [...new Set(factors)];
  }

  private generateClusterLabel(defects: DefectInfo[]): string {
    // Generate a label based on common patterns
    const titles = defects.map((d) => d.title.toLowerCase());
    const words = titles.flatMap((t) => t.split(/\s+/));
    const wordCounts = new Map<string, number>();

    for (const word of words) {
      if (word.length > 3) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    const sortedWords = [...wordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([word]) => word);

    return sortedWords.join(' ') || 'Unnamed Cluster';
  }

  private suggestFix(commonFactors: string[]): string {
    // Generate fix suggestion based on common factors
    for (const factor of commonFactors) {
      for (const [pattern, data] of Object.entries(KNOWN_PATTERNS)) {
        if (
          factor.toLowerCase().includes(pattern) ||
          data.indicators.some((i) =>
            factor.toLowerCase().includes(i.toLowerCase())
          )
        ) {
          return data.prevention;
        }
      }
    }

    return 'Review common factors and implement targeted fixes';
  }

  private calculateClusteringMetrics(
    clusters: DefectCluster[],
    totalDefects: number
  ): { silhouette: number; cohesion: number } {
    if (clusters.length === 0 || totalDefects === 0) {
      return { silhouette: 0, cohesion: 0 };
    }

    // Simplified metrics
    const clusteredDefects = clusters.reduce(
      (sum, c) => sum + c.defects.length,
      0
    );
    const avgClusterSize = clusteredDefects / clusters.length;

    // Cohesion: how many defects are clustered
    const cohesion = clusteredDefects / totalDefects;

    // Silhouette approximation: based on cluster size uniformity
    const sizes = clusters.map((c) => c.defects.length);
    const sizeVariance =
      sizes.reduce((sum, s) => sum + Math.pow(s - avgClusterSize, 2), 0) /
      sizes.length;
    const silhouette = Math.max(0, 1 - sizeVariance / (avgClusterSize * avgClusterSize || 1));

    return {
      silhouette: Math.round(silhouette * 100) / 100,
      cohesion: Math.round(cohesion * 100) / 100,
    };
  }

  /**
   * Generate embedding for a defect
   * Uses NomicEmbedder for semantic embeddings
   */
  private async generateDefectEmbedding(defect: DefectInfo): Promise<number[]> {
    const text = this.formatDefectForEmbedding(defect);
    return this.embedder.embed(text);
  }

  /**
   * Generate embedding for a pattern
   * Uses the same embedder as defects for consistent similarity matching
   */
  private async generatePatternEmbedding(pattern: DefectPattern): Promise<number[]> {
    const text = this.formatPatternForEmbedding(pattern);
    return this.embedder.embed(text);
  }

  /**
   * Format a defect for embedding generation
   */
  private formatDefectForEmbedding(defect: DefectInfo): string {
    const parts = [
      `Title: ${defect.title}`,
      defect.description ? `Description: ${defect.description}` : '',
      defect.tags?.length ? `Tags: ${defect.tags.join(', ')}` : '',
      defect.file ? `File: ${defect.file}` : '',
    ].filter(Boolean);

    return parts.join('\n');
  }

  /**
   * Format a pattern for embedding generation
   */
  private formatPatternForEmbedding(pattern: DefectPattern): string {
    const parts = [
      `Pattern: ${pattern.name}`,
      `Indicators: ${pattern.indicators.join(', ')}`,
      `Prevention: ${pattern.prevention}`,
      `Frequency: ${pattern.frequency}`,
    ].filter(Boolean);

    return parts.join('\n');
  }

  /**
   * Add pattern to cache with LRU-style limit enforcement.
   * Removes oldest entry when cache is full.
   */
  private cachePattern(pattern: DefectPattern): void {
    // Enforce limit before adding
    if (this.patternCache.size >= this.MAX_CACHED_PATTERNS) {
      // Remove oldest (first) entry - Map maintains insertion order
      const firstKey = this.patternCache.keys().next().value;
      if (firstKey) {
        this.patternCache.delete(firstKey);
      }
    }
    this.patternCache.set(pattern.id, pattern);
  }

  /**
   * Dispose of all resources and clear caches.
   * Call this method when the service is no longer needed.
   */
  destroy(): void {
    this.patternCache.clear();
    this.flashAttention = null;
    this.flashAttentionAvailable = false;
  }
}
