/**
 * Agentic QE v3 - SONA (Self-Optimizing Neural Architecture)
 *
 * SONA provides ultra-fast pattern adaptation for V3 QE.
 * Performance target: <0.05ms pattern adaptation time
 *
 * @module integrations/rl-suite/sona
 */

import { randomUUID } from 'crypto';
import { secureRandom } from '../../shared/utils/crypto-random.js';
import type { RLState, RLAction, DomainName } from './interfaces';
import { HNSWEmbeddingIndex } from '../embeddings/index/HNSWIndex.js';
import type { IEmbedding, EmbeddingNamespace } from '../embeddings/base/types';

// ============================================================================
// SONA Pattern Types
// ============================================================================

/**
 * Pattern types supported by SONA
 */
export type SONAPatternType =
  | 'test-generation'
  | 'defect-prediction'
  | 'coverage-optimization'
  | 'quality-assessment'
  | 'resource-allocation';

/**
 * SONA pattern for storing learned QE patterns
 */
export interface SONAPattern {
  /** Unique pattern identifier */
  id: string;
  /** Pattern type */
  type: SONAPatternType;
  /** Source domain */
  domain: DomainName;
  /** State embedding for similarity search */
  stateEmbedding: number[];
  /** Action taken */
  action: RLAction;
  /** Expected outcome */
  outcome: {
    reward: number;
    success: boolean;
    quality: number;
  };
  /** Pattern confidence (0-1) */
  confidence: number;
  /** Usage count */
  usageCount: number;
  /** Timestamp created */
  createdAt: Date;
  /** Last used timestamp */
  lastUsedAt?: Date;
  /** Pattern metadata */
  metadata?: Record<string, unknown>;
}

/**
 * SONA adaptation result
 */
export interface SONAAdaptationResult {
  /** Whether adaptation was successful */
  success: boolean;
  /** Adapted pattern or null if not found */
  pattern: SONAPattern | null;
  /** Adaptation time in milliseconds */
  adaptationTimeMs: number;
  /** Similarity score (0-1) */
  similarity: number;
  /** Reasoning */
  reasoning: string;
}

/**
 * SONA statistics
 */
export interface SONAStats {
  /** Total patterns stored */
  totalPatterns: number;
  /** Patterns by type */
  patternsByType: Record<SONAPatternType, number>;
  /** Average adaptation time (ms) */
  avgAdaptationTimeMs: number;
  /** Minimum adaptation time (ms) */
  minAdaptationTimeMs: number;
  /** Maximum adaptation time (ms) */
  maxAdaptationTimeMs: number;
  /** Total adaptations */
  totalAdaptations: number;
  /** Cache hit rate */
  cacheHitRate: number;
  /** HNSW index size */
  indexSize: number;
}

/**
 * SONA configuration
 */
export interface SONAConfig {
  /** Maximum patterns to store */
  maxPatterns: number;
  /** Minimum confidence threshold */
  minConfidence: number;
  /** HNSW dimension */
  dimension: number;
  /** HNSW M parameter */
  hnswM: number;
  /** HNSW efConstruction parameter */
  hnswEfConstruction: number;
  /** HNSW efSearch parameter */
  hnswEfSearch: number;
  /** Enable adaptive learning */
  adaptiveLearning: boolean;
  /** Learning rate for confidence updates */
  learningRate: number;
  /** Decay rate for unused patterns */
  decayRate: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_SONA_CONFIG: SONAConfig = {
  maxPatterns: 10000,
  minConfidence: 0.5,
  dimension: 384,
  hnswM: 16,
  hnswEfConstruction: 200,
  hnswEfSearch: 50,
  adaptiveLearning: true,
  learningRate: 0.1,
  decayRate: 0.001,
};

// ============================================================================
// SONA Pattern Cache
// ============================================================================

/**
 * LRU cache for fast pattern lookup
 */
class SONAPatternCache {
  private cache: Map<string, SONAPattern>;
  private maxEntries: number;
  private accessOrder: string[];

  constructor(maxEntries: number = 1000) {
    this.cache = new Map();
    this.maxEntries = maxEntries;
    this.accessOrder = [];
  }

  /**
   * Get pattern from cache
   */
  get(key: string): SONAPattern | null {
    const pattern = this.cache.get(key);
    if (pattern) {
      // Update access order
      const idx = this.accessOrder.indexOf(key);
      if (idx > -1) {
        this.accessOrder.splice(idx, 1);
      }
      this.accessOrder.push(key);
    }
    return pattern ?? null;
  }

  /**
   * Set pattern in cache
   */
  set(key: string, pattern: SONAPattern): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const lru = this.accessOrder.shift();
      if (lru) {
        this.cache.delete(lru);
      }
    }

    this.cache.set(key, pattern);

    // Update access order
    const idx = this.accessOrder.indexOf(key);
    if (idx > -1) {
      this.accessOrder.splice(idx, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache entries
   */
  entries(): IterableIterator<[string, SONAPattern]> {
    return this.cache.entries();
  }
}

// ============================================================================
// SONA Index - HNSW-based Fast Pattern Retrieval
// ============================================================================

/**
 * SONA Index for fast pattern retrieval using HNSW
 */
export class SONAIndex {
  private index: HNSWEmbeddingIndex;
  private patterns: Map<number, SONAPattern>;
  private namespace: EmbeddingNamespace;
  private nextId: number;

  constructor(config: Partial<SONAConfig> = {}) {
    const fullConfig = { ...DEFAULT_SONA_CONFIG, ...config };

    this.index = new HNSWEmbeddingIndex({
      dimension: fullConfig.dimension as 256 | 384 | 512 | 768 | 1024 | 1536,
      M: fullConfig.hnswM,
      efConstruction: fullConfig.hnswEfConstruction,
      efSearch: fullConfig.hnswEfSearch,
      metric: 'cosine',
      quantization: 'none',
    });

    this.patterns = new Map();
    this.namespace = 'code'; // Use code namespace for SONA patterns
    this.nextId = 0;

    // Initialize the index
    this.index.initializeIndex(this.namespace);
  }

  /**
   * Add pattern to index
   */
  addPattern(pattern: SONAPattern): number {
    const id = this.nextId++;

    // Create embedding for HNSW
    const embedding: IEmbedding = {
      vector: pattern.stateEmbedding,
      dimension: pattern.stateEmbedding.length as 256 | 384 | 512 | 768 | 1024 | 1536,
      namespace: this.namespace,
      text: pattern.id,
      timestamp: Date.now(),
      quantization: 'none',
      metadata: {
        patternId: pattern.id,
        patternType: pattern.type,
        domain: pattern.domain,
      },
    };

    this.index.addEmbedding(embedding, id);
    this.patterns.set(id, pattern);

    return id;
  }

  /**
   * Search for similar patterns
   */
  searchPatterns(stateEmbedding: number[], limit: number = 5): Array<{ pattern: SONAPattern; similarity: number }> {
    // Create query embedding
    const queryEmbedding: IEmbedding = {
      vector: stateEmbedding,
      dimension: stateEmbedding.length as 256 | 384 | 512 | 768 | 1024 | 1536,
      namespace: this.namespace,
      text: 'query',
      timestamp: Date.now(),
      quantization: 'none',
    };

    // Search HNSW index
    const results = this.index.search(queryEmbedding, { limit, namespace: this.namespace });

    // Map results to patterns
    return results
      .map((result) => {
        const pattern = this.patterns.get(result.id);
        if (!pattern) return null;

        // Convert distance to similarity (cosine distance to similarity)
        const similarity = 1 - result.distance;

        return { pattern, similarity };
      })
      .filter((item): item is { pattern: SONAPattern; similarity: number } => item !== null);
  }

  /**
   * Get pattern by ID
   */
  getPattern(id: number): SONAPattern | null {
    return this.patterns.get(id) ?? null;
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): SONAPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get patterns by type
   */
  getPatternsByType(type: SONAPatternType): SONAPattern[] {
    return Array.from(this.patterns.values()).filter((p) => p.type === type);
  }

  /**
   * Get patterns by domain
   */
  getPatternsByDomain(domain: DomainName): SONAPattern[] {
    return Array.from(this.patterns.values()).filter((p) => p.domain === domain);
  }

  /**
   * Clear all patterns
   */
  clear(): void {
    this.index.clearIndex(this.namespace);
    this.patterns.clear();
    this.nextId = 0;
    this.index.initializeIndex(this.namespace);
  }

  /**
   * Get index statistics
   */
  getStats(): { size: number; dimension: number } {
    const stats = this.index.getIndexStats(this.namespace);
    return {
      size: stats?.size ?? this.patterns.size,
      dimension: stats?.dimension ?? 384,
    };
  }

  /**
   * Remove pattern by ID
   */
  removePattern(id: number): boolean {
    return this.patterns.delete(id);
  }

  /**
   * Update pattern
   */
  updatePattern(id: number, updates: Partial<SONAPattern>): boolean {
    const pattern = this.patterns.get(id);
    if (!pattern) return false;

    const updated = { ...pattern, ...updates };
    this.patterns.set(id, updated);
    return true;
  }
}

// ============================================================================
// SONA Optimizer - Online Learning
// ============================================================================

/**
 * SONA Optimizer for online learning and pattern adaptation
 */
export class SONAOptimizer {
  private config: SONAConfig;
  private adaptationTimes: number[] = [];
  private totalAdaptations: number = 0;
  private cacheHits: number = 0;

  constructor(config: Partial<SONAConfig> = {}) {
    this.config = { ...DEFAULT_SONA_CONFIG, ...config };
  }

  /**
   * Update pattern confidence based on feedback
   */
  updateConfidence(pattern: SONAPattern, success: boolean, quality: number): SONAPattern {
    // Update confidence using exponential moving average
    const reward = success ? quality : -quality;
    const newConfidence = pattern.confidence + this.config.learningRate * (reward - pattern.confidence);

    return {
      ...pattern,
      confidence: Math.max(0, Math.min(1, newConfidence)),
      usageCount: pattern.usageCount + 1,
      lastUsedAt: new Date(),
    };
  }

  /**
   * Decay confidence for unused patterns
   */
  decayConfidence(pattern: SONAPattern): SONAPattern {
    if (!pattern.lastUsedAt) return pattern;

    const daysSinceLastUse = (Date.now() - pattern.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24);
    const decayAmount = daysSinceLastUse * this.config.decayRate;

    return {
      ...pattern,
      confidence: Math.max(0, pattern.confidence - decayAmount),
    };
  }

  /**
   * Record adaptation time
   */
  recordAdaptation(timeMs: number): void {
    this.adaptationTimes.push(timeMs);
    this.totalAdaptations++;

    // Keep only last 1000 measurements
    if (this.adaptationTimes.length > 1000) {
      this.adaptationTimes.shift();
    }
  }

  /**
   * Record cache hit
   */
  recordCacheHit(): void {
    this.cacheHits++;
  }

  /**
   * Get statistics
   */
  getStats(): { avgAdaptationTimeMs: number; minAdaptationTimeMs: number; maxAdaptationTimeMs: number; totalAdaptations: number; cacheHitRate: number } {
    if (this.adaptationTimes.length === 0) {
      return {
        avgAdaptationTimeMs: 0,
        minAdaptationTimeMs: 0,
        maxAdaptationTimeMs: 0,
        totalAdaptations: this.totalAdaptations,
        cacheHitRate: 0,
      };
    }

    const sum = this.adaptationTimes.reduce((a, b) => a + b, 0);
    const avg = sum / this.adaptationTimes.length;
    const min = Math.min(...this.adaptationTimes);
    const max = Math.max(...this.adaptationTimes);

    return {
      avgAdaptationTimeMs: avg,
      minAdaptationTimeMs: min,
      maxAdaptationTimeMs: max,
      totalAdaptations: this.totalAdaptations,
      cacheHitRate: this.totalAdaptations > 0 ? this.cacheHits / this.totalAdaptations : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.adaptationTimes = [];
    this.totalAdaptations = 0;
    this.cacheHits = 0;
  }

  /**
   * Get configuration
   */
  getConfig(): SONAConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SONAConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// ============================================================================
// Main SONA Class
// ============================================================================

/**
 * SONA (Self-Optimizing Neural Architecture)
 *
 * Provides ultra-fast pattern adaptation for V3 QE with <0.05ms target.
 */
export class SONA {
  private index: SONAIndex;
  private optimizer: SONAOptimizer;
  private cache: SONAPatternCache;
  private config: SONAConfig;

  constructor(config: Partial<SONAConfig> = {}) {
    this.config = { ...DEFAULT_SONA_CONFIG, ...config };
    this.index = new SONAIndex(this.config);
    this.optimizer = new SONAOptimizer(this.config);
    this.cache = new SONAPatternCache(1000);
  }

  /**
   * Adapt pattern based on context - MUST complete in <0.05ms
   *
   * This is the core SONA method that performs ultra-fast pattern adaptation.
   * Performance target: <0.05ms (50 microseconds)
   */
  async adaptPattern(state: RLState, patternType: SONAPatternType, domain: DomainName): Promise<SONAAdaptationResult> {
    const startTime = performance.now();

    try {
      // Create state embedding (normalized features)
      const stateEmbedding = this.createStateEmbedding(state);

      // Check cache first (this is ultra-fast)
      const cacheKey = this.createCacheKey(state, patternType);
      const cachedPattern = this.cache.get(cacheKey);

      if (cachedPattern && cachedPattern.confidence >= this.config.minConfidence) {
        this.optimizer.recordCacheHit();

        const adaptationTimeMs = performance.now() - startTime;
        this.optimizer.recordAdaptation(adaptationTimeMs);

        return {
          success: true,
          pattern: cachedPattern,
          adaptationTimeMs,
          similarity: 1.0,
          reasoning: 'Cache hit - pattern retrieved from cache',
        };
      }

      // Search HNSW index for similar patterns
      const similarPatterns = this.index.searchPatterns(stateEmbedding, 5);

      // Filter by type, domain, and confidence
      const validPatterns = similarPatterns.filter(
        (item) =>
          item.pattern.type === patternType &&
          item.pattern.domain === domain &&
          item.pattern.confidence >= this.config.minConfidence
      );

      if (validPatterns.length === 0) {
        const adaptationTimeMs = performance.now() - startTime;
        this.optimizer.recordAdaptation(adaptationTimeMs);

        return {
          success: false,
          pattern: null,
          adaptationTimeMs,
          similarity: 0,
          reasoning: 'No suitable pattern found',
        };
      }

      // Return best matching pattern
      const bestMatch = validPatterns[0];

      // Update pattern usage
      const updatedPattern = {
        ...bestMatch.pattern,
        usageCount: bestMatch.pattern.usageCount + 1,
        lastUsedAt: new Date(),
      };

      // Store in cache for ultra-fast retrieval
      this.cache.set(cacheKey, updatedPattern);

      const adaptationTimeMs = performance.now() - startTime;
      this.optimizer.recordAdaptation(adaptationTimeMs);

      return {
        success: true,
        pattern: updatedPattern,
        adaptationTimeMs,
        similarity: bestMatch.similarity,
        reasoning: `Pattern adapted from ${validPatterns.length} candidates with ${bestMatch.similarity.toFixed(3)} similarity`,
      };
    } catch (error) {
      const adaptationTimeMs = performance.now() - startTime;
      this.optimizer.recordAdaptation(adaptationTimeMs);

      return {
        success: false,
        pattern: null,
        adaptationTimeMs,
        similarity: 0,
        reasoning: `Adaptation failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Recall pattern for given context
   *
   * Fast lookup that returns the best matching pattern without detailed adaptation.
   */
  recallPattern(context: RLState, patternType: SONAPatternType, domain: DomainName): SONAPattern | null {
    const stateEmbedding = this.createStateEmbedding(context);
    const similarPatterns = this.index.searchPatterns(stateEmbedding, 1);

    for (const item of similarPatterns) {
      if (item.pattern.type === patternType && item.pattern.domain === domain) {
        return item.pattern;
      }
    }

    return null;
  }

  /**
   * Store pattern in memory
   *
   * Persists pattern to both HNSW index and cache.
   */
  storePattern(pattern: SONAPattern): void {
    // Add to HNSW index
    this.index.addPattern(pattern);

    // Add to cache
    const cacheKey = this.createCacheKeyFromPattern(pattern);
    this.cache.set(cacheKey, pattern);
  }

  /**
   * Store multiple patterns in batch
   */
  storePatternsBatch(patterns: SONAPattern[]): void {
    for (const pattern of patterns) {
      this.storePattern(pattern);
    }
  }

  /**
   * Create and store a new pattern from experience
   */
  createPattern(
    state: RLState,
    action: RLAction,
    outcome: SONAPattern['outcome'],
    type: SONAPatternType,
    domain: DomainName,
    metadata?: Record<string, unknown>
  ): SONAPattern {
    const pattern: SONAPattern = {
      id: `sona-${Date.now()}-${randomUUID().slice(0, 7)}`,
      type,
      domain,
      stateEmbedding: this.createStateEmbedding(state),
      action,
      outcome,
      confidence: 0.5, // Start with moderate confidence
      usageCount: 0,
      createdAt: new Date(),
      metadata,
    };

    this.storePattern(pattern);
    return pattern;
  }

  /**
   * Update pattern with feedback
   */
  updatePattern(patternId: string, success: boolean, quality: number): boolean {
    const allPatterns = this.index.getAllPatterns();
    const pattern = allPatterns.find((p) => p.id === patternId);

    if (!pattern) return false;

    const updated = this.optimizer.updateConfidence(pattern, success, quality);

    // Update in index (need to find ID)
    const patternsMap = new Map(allPatterns.map((p, i) => [p.id, i]));
    const id = patternsMap.get(patternId);
    if (id !== undefined) {
      this.index.updatePattern(id, updated);
    }

    // Update cache
    const cacheKey = this.createCacheKeyFromPattern(updated);
    this.cache.set(cacheKey, updated);

    return true;
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): SONAPattern[] {
    return this.index.getAllPatterns();
  }

  /**
   * Get patterns by type
   */
  getPatternsByType(type: SONAPatternType): SONAPattern[] {
    return this.index.getPatternsByType(type);
  }

  /**
   * Get patterns by domain
   */
  getPatternsByDomain(domain: DomainName): SONAPattern[] {
    return this.index.getPatternsByDomain(domain);
  }

  /**
   * Get statistics
   */
  getStats(): SONAStats {
    const allPatterns = this.index.getAllPatterns();
    const optimizerStats = this.optimizer.getStats();
    const indexStats = this.index.getStats();

    const patternsByType: Record<SONAPatternType, number> = {
      'test-generation': 0,
      'defect-prediction': 0,
      'coverage-optimization': 0,
      'quality-assessment': 0,
      'resource-allocation': 0,
    };

    for (const pattern of allPatterns) {
      patternsByType[pattern.type]++;
    }

    return {
      totalPatterns: allPatterns.length,
      patternsByType,
      avgAdaptationTimeMs: optimizerStats.avgAdaptationTimeMs,
      minAdaptationTimeMs: optimizerStats.minAdaptationTimeMs,
      maxAdaptationTimeMs: optimizerStats.maxAdaptationTimeMs,
      totalAdaptations: optimizerStats.totalAdaptations,
      cacheHitRate: optimizerStats.cacheHitRate,
      indexSize: indexStats.size,
    };
  }

  /**
   * Clear all patterns
   */
  clear(): void {
    this.index.clear();
    this.cache.clear();
    this.optimizer.resetStats();
  }

  /**
   * Export all patterns
   */
  exportPatterns(): SONAPattern[] {
    return this.index.getAllPatterns();
  }

  /**
   * Import patterns
   */
  importPatterns(patterns: SONAPattern[]): void {
    this.clear();
    this.storePatternsBatch(patterns);
  }

  /**
   * Get configuration
   */
  getConfig(): SONAConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SONAConfig>): void {
    this.config = { ...this.config, ...updates };
    this.optimizer.updateConfig(updates);
  }

  /**
   * Create state embedding from RL state
   *
   * Normalizes state features for use in HNSW index.
   */
  private createStateEmbedding(state: RLState): number[] {
    // Normalize features to [0, 1] range
    const features = state.features;

    if (features.length === 0) {
      return new Array(384).fill(0); // Return zero embedding if no features
    }

    // Find max for normalization
    const max = Math.max(...features.map(Math.abs));
    if (max === 0) {
      return [...features];
    }

    // Normalize and pad/truncate to dimension
    const normalized = features.map((f) => f / max);
    const dimension = this.config.dimension;

    if (normalized.length >= dimension) {
      return normalized.slice(0, dimension);
    }

    // Pad with zeros
    return [...normalized, ...new Array(dimension - normalized.length).fill(0)];
  }

  /**
   * Create cache key from state and pattern type
   */
  private createCacheKey(state: RLState, patternType: SONAPatternType): string {
    const featureHash = this.hashFeatures(state.features);
    return `${patternType}:${state.id}:${featureHash}`;
  }

  /**
   * Create cache key from pattern
   */
  private createCacheKeyFromPattern(pattern: SONAPattern): string {
    const featureHash = this.hashFeatures(pattern.stateEmbedding);
    return `${pattern.type}:${pattern.id}:${featureHash}`;
  }

  /**
   * Simple hash of features for cache key
   */
  private hashFeatures(features: number[]): string {
    let hash = 0;
    for (let i = 0; i < Math.min(features.length, 10); i++) {
      hash = (hash * 31 + Math.round(features[i] * 100)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Verify performance target
   *
   * Runs benchmarks to verify <0.05ms adaptation target.
   */
  async verifyPerformance(iterations: number = 1000): Promise<{ targetMet: boolean; avgTimeMs: number; minTimeMs: number; maxTimeMs: number; details: Array<{ iteration: number; timeMs: number }> }> {
    const details: Array<{ iteration: number; timeMs: number }> = [];

    // Create test state
    const testState: RLState = {
      id: 'test-state',
      features: new Array(384).fill(0).map(() => secureRandom()),
    };

    // Add some patterns first
    for (let i = 0; i < 100; i++) {
      const pattern: SONAPattern = {
        id: `test-pattern-${i}`,
        type: 'test-generation',
        domain: 'test-generation',
        stateEmbedding: new Array(384).fill(0).map(() => secureRandom()),
        action: { type: 'test-action', value: i },
        outcome: { reward: secureRandom(), success: secureRandom() > 0.5, quality: secureRandom() },
        confidence: secureRandom(),
        usageCount: 0,
        createdAt: new Date(),
      };
      this.storePattern(pattern);
    }

    // Run benchmark iterations
    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      await this.adaptPattern(testState, 'test-generation', 'test-generation');
      const endTime = performance.now();

      details.push({
        iteration: i,
        timeMs: endTime - startTime,
      });
    }

    const times = details.map((d) => d.timeMs);
    const avgTimeMs = times.reduce((a, b) => a + b, 0) / times.length;
    const minTimeMs = Math.min(...times);
    const maxTimeMs = Math.max(...times);

    return {
      targetMet: avgTimeMs < 0.05,
      avgTimeMs,
      minTimeMs,
      maxTimeMs,
      details,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a default SONA instance
 */
export function createSONA(config?: Partial<SONAConfig>): SONA {
  return new SONA(config);
}

/**
 * Create a SONA instance for a specific domain
 */
export function createDomainSONA(domain: DomainName, config?: Partial<SONAConfig>): SONA {
  return new SONA({
    ...config,
    maxPatterns: config?.maxPatterns || 5000,
  });
}

// ============================================================================
// Re-exports
// ============================================================================

export { SONAPatternCache };
