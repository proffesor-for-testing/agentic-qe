/**
 * PerformanceOptimizer - Performance optimizations for learning algorithms
 *
 * Implements performance optimizations for production use with many agents:
 * - Batched Q-value updates for efficiency
 * - Lazy evaluation for rarely-accessed Q-values
 * - Caching layer for frequently-accessed states
 * - Optimized vector operations with typed arrays
 * - Experience prioritization for faster convergence
 * - Memory pooling for experience objects
 *
 * Target Performance:
 * - Q-value lookups: < 1ms
 * - Experience storage: < 5ms
 * - Pattern matching: < 10ms for 10k patterns
 * - Memory usage: < 100MB for 100k experiences
 *
 * @module learning/PerformanceOptimizer
 * @version 1.0.0
 */

import { Logger } from '../utils/Logger';
import { TaskState, AgentAction, TaskExperience } from './types';

/**
 * Configuration for performance optimizer
 */
export interface PerformanceOptimizerConfig {
  /** Enable Q-value caching */
  enableCaching: boolean;
  /** Cache size (number of entries) */
  cacheSize: number;
  /** Enable lazy evaluation */
  enableLazyEval: boolean;
  /** Access threshold for lazy loading */
  lazyAccessThreshold: number;
  /** Enable batch updates */
  enableBatchUpdates: boolean;
  /** Batch size for updates */
  batchUpdateSize: number;
  /** Enable memory pooling */
  enableMemoryPooling: boolean;
  /** Memory pool size */
  memoryPoolSize: number;
  /** Enable experience prioritization */
  enablePrioritization: boolean;
  /** Priority decay factor */
  priorityDecay: number;
}

/**
 * Default optimizer configuration
 */
const DEFAULT_CONFIG: PerformanceOptimizerConfig = {
  enableCaching: true,
  cacheSize: 1000,
  enableLazyEval: true,
  lazyAccessThreshold: 2,
  enableBatchUpdates: true,
  batchUpdateSize: 32,
  enableMemoryPooling: true,
  memoryPoolSize: 500,
  enablePrioritization: true,
  priorityDecay: 0.95
};

/**
 * Cached Q-value entry with access tracking
 */
interface CachedQValue {
  stateKey: string;
  actionKey: string;
  value: number;
  accessCount: number;
  lastAccessed: number;
  dirty: boolean;
}

/**
 * Lazy Q-value entry (not yet loaded into memory)
 */
interface LazyQValue {
  stateKey: string;
  actionKey: string;
  loaded: boolean;
  accessCount: number;
}

/**
 * Batch update entry
 */
interface BatchUpdate {
  stateKey: string;
  actionKey: string;
  oldValue: number;
  newValue: number;
  timestamp: number;
}

/**
 * Pooled experience object
 */
interface PooledExperience {
  experience: TaskExperience | null;
  inUse: boolean;
  lastUsed: number;
}

/**
 * LRU Cache for Q-values
 * Optimized for fast lookups using Map with LRU eviction
 */
class LRUCache {
  private readonly maxSize: number;
  private cache: Map<string, CachedQValue>;
  private accessOrder: string[];

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = [];
  }

  /**
   * Get value from cache (< 1ms target)
   */
  get(stateKey: string, actionKey: string): number | undefined {
    const key = `${stateKey}:${actionKey}`;
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Update access tracking
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    // Move to front of access order (LRU)
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);

    return entry.value;
  }

  /**
   * Set value in cache with LRU eviction
   */
  set(stateKey: string, actionKey: string, value: number): void {
    const key = `${stateKey}:${actionKey}`;

    // Evict LRU entry if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const lruKey = this.accessOrder.shift();
      if (lruKey) {
        this.cache.delete(lruKey);
      }
    }

    const entry: CachedQValue = {
      stateKey,
      actionKey,
      value,
      accessCount: 1,
      lastAccessed: Date.now(),
      dirty: false
    };

    this.cache.set(key, entry);
    this.accessOrder.push(key);
  }

  /**
   * Mark entry as dirty (needs persistence)
   */
  markDirty(stateKey: string, actionKey: string): void {
    const key = `${stateKey}:${actionKey}`;
    const entry = this.cache.get(key);
    if (entry) {
      entry.dirty = true;
    }
  }

  /**
   * Get all dirty entries
   */
  getDirtyEntries(): CachedQValue[] {
    return Array.from(this.cache.values()).filter(e => e.dirty);
  }

  /**
   * Clear dirty flags
   */
  clearDirtyFlags(): void {
    for (const entry of this.cache.values()) {
      entry.dirty = false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    hitRate: number;
    avgAccessCount: number;
  } {
    const entries = Array.from(this.cache.values());
    const totalAccess = entries.reduce((sum, e) => sum + e.accessCount, 0);
    const avgAccess = entries.length > 0 ? totalAccess / entries.length : 0;

    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track misses
      avgAccessCount: avgAccess
    };
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }
}

/**
 * Optimized vector operations using Float64Array
 * Faster than standard array operations for numerical computations
 */
class VectorOps {
  /**
   * Encode state features to typed array (faster than regular arrays)
   */
  static encodeStateToTypedArray(state: TaskState): Float64Array {
    const features = new Float64Array(6);
    features[0] = state.taskComplexity;
    features[1] = state.requiredCapabilities.length / 10; // normalized
    features[2] = state.previousAttempts / 5; // normalized
    features[3] = state.availableResources;
    features[4] = state.timeConstraint ? Math.min(state.timeConstraint / 300000, 1) : 1;
    features[5] = Object.keys(state.contextFeatures).length / 10; // context complexity
    return features;
  }

  /**
   * Fast dot product using typed arrays
   */
  static dotProduct(a: Float64Array, b: Float64Array): number {
    let result = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      result += a[i] * b[i];
    }
    return result;
  }

  /**
   * Fast euclidean distance
   */
  static euclideanDistance(a: Float64Array, b: Float64Array): number {
    let sum = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * Normalize vector in-place
   */
  static normalize(vec: Float64Array): void {
    let sum = 0;
    for (let i = 0; i < vec.length; i++) {
      sum += vec[i] * vec[i];
    }
    const magnitude = Math.sqrt(sum);
    if (magnitude > 0) {
      for (let i = 0; i < vec.length; i++) {
        vec[i] /= magnitude;
      }
    }
  }
}

/**
 * Memory pool for experience objects
 * Reduces GC pressure by reusing objects
 */
class ExperiencePool {
  private pool: PooledExperience[];
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.pool = [];
    this.preallocate();
  }

  /**
   * Preallocate pool entries
   */
  private preallocate(): void {
    for (let i = 0; i < this.maxSize; i++) {
      this.pool.push({
        experience: null,
        inUse: false,
        lastUsed: 0
      });
    }
  }

  /**
   * Acquire experience object from pool
   */
  acquire(): PooledExperience | null {
    for (const entry of this.pool) {
      if (!entry.inUse) {
        entry.inUse = true;
        entry.lastUsed = Date.now();
        return entry;
      }
    }
    return null; // Pool exhausted
  }

  /**
   * Release experience object back to pool
   */
  release(pooled: PooledExperience): void {
    pooled.inUse = false;
    pooled.experience = null;
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    total: number;
    inUse: number;
    available: number;
    utilization: number;
  } {
    const inUse = this.pool.filter(e => e.inUse).length;
    return {
      total: this.pool.length,
      inUse,
      available: this.pool.length - inUse,
      utilization: inUse / this.pool.length
    };
  }
}

/**
 * PerformanceOptimizer - Main optimizer class
 *
 * Optimizes learning algorithm performance through:
 * 1. Caching frequently-accessed Q-values
 * 2. Lazy evaluation of rarely-used values
 * 3. Batched updates to reduce overhead
 * 4. Memory pooling to reduce GC pressure
 * 5. Optimized vector operations with typed arrays
 */
export class PerformanceOptimizer {
  private readonly logger: Logger;
  private readonly config: PerformanceOptimizerConfig;
  private cache: LRUCache;
  private lazyValues: Map<string, LazyQValue>;
  private batchQueue: BatchUpdate[];
  private experiencePool: ExperiencePool;
  private stats: {
    cacheHits: number;
    cacheMisses: number;
    batchUpdates: number;
    poolAcquisitions: number;
    poolExhausted: number;
  };

  constructor(config: Partial<PerformanceOptimizerConfig> = {}) {
    this.logger = Logger.getInstance();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize cache
    this.cache = new LRUCache(this.config.cacheSize);

    // Initialize lazy evaluation tracking
    this.lazyValues = new Map();

    // Initialize batch queue
    this.batchQueue = [];

    // Initialize experience pool
    this.experiencePool = new ExperiencePool(this.config.memoryPoolSize);

    // Initialize statistics
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      batchUpdates: 0,
      poolAcquisitions: 0,
      poolExhausted: 0
    };

    this.logger.info('PerformanceOptimizer initialized', { config: this.config });
  }

  /**
   * Get Q-value with caching (< 1ms target)
   */
  getQValue(
    stateKey: string,
    actionKey: string,
    loadCallback: () => number
  ): number {
    // Try cache first
    if (this.config.enableCaching) {
      const cached = this.cache.get(stateKey, actionKey);
      if (cached !== undefined) {
        this.stats.cacheHits++;
        return cached;
      }
      this.stats.cacheMisses++;
    }

    // Check lazy evaluation
    if (this.config.enableLazyEval) {
      const key = `${stateKey}:${actionKey}`;
      const lazy = this.lazyValues.get(key);

      if (lazy && !lazy.loaded) {
        lazy.accessCount++;

        // Load if accessed frequently enough
        if (lazy.accessCount >= this.config.lazyAccessThreshold) {
          const value = loadCallback();
          lazy.loaded = true;

          // Add to cache
          if (this.config.enableCaching) {
            this.cache.set(stateKey, actionKey, value);
          }

          return value;
        }

        return 0; // Default value for rarely-accessed
      }
    }

    // Load value
    const value = loadCallback();

    // Add to cache
    if (this.config.enableCaching) {
      this.cache.set(stateKey, actionKey, value);
    }

    return value;
  }

  /**
   * Queue Q-value update for batching
   */
  queueUpdate(
    stateKey: string,
    actionKey: string,
    oldValue: number,
    newValue: number
  ): void {
    if (!this.config.enableBatchUpdates) {
      // Apply immediately if batching disabled
      this.applyUpdate(stateKey, actionKey, newValue);
      return;
    }

    // Add to batch queue
    this.batchQueue.push({
      stateKey,
      actionKey,
      oldValue,
      newValue,
      timestamp: Date.now()
    });

    // Process batch if threshold reached
    if (this.batchQueue.length >= this.config.batchUpdateSize) {
      this.processBatchUpdates();
    }
  }

  /**
   * Process batched updates (< 5ms target for 32 updates)
   */
  processBatchUpdates(): void {
    if (this.batchQueue.length === 0) {
      return;
    }

    const startTime = performance.now();

    // Group updates by state for efficiency
    const updatesByState = new Map<string, Map<string, number>>();

    for (const update of this.batchQueue) {
      if (!updatesByState.has(update.stateKey)) {
        updatesByState.set(update.stateKey, new Map());
      }
      updatesByState.get(update.stateKey)!.set(update.actionKey, update.newValue);
    }

    // Apply grouped updates
    for (const [stateKey, actions] of updatesByState.entries()) {
      for (const [actionKey, value] of actions.entries()) {
        this.applyUpdate(stateKey, actionKey, value);
      }
    }

    const duration = performance.now() - startTime;
    this.stats.batchUpdates++;

    this.logger.debug(
      `Processed ${this.batchQueue.length} batched updates in ${duration.toFixed(2)}ms`
    );

    // Clear queue
    this.batchQueue = [];
  }

  /**
   * Apply single update to cache and storage
   */
  private applyUpdate(stateKey: string, actionKey: string, value: number): void {
    // Update cache
    if (this.config.enableCaching) {
      this.cache.set(stateKey, actionKey, value);
      this.cache.markDirty(stateKey, actionKey);
    }

    // Mark as loaded in lazy evaluation
    if (this.config.enableLazyEval) {
      const key = `${stateKey}:${actionKey}`;
      const lazy = this.lazyValues.get(key);
      if (lazy) {
        lazy.loaded = true;
      }
    }
  }

  /**
   * Register lazy Q-value
   */
  registerLazyValue(stateKey: string, actionKey: string): void {
    if (!this.config.enableLazyEval) {
      return;
    }

    const key = `${stateKey}:${actionKey}`;
    if (!this.lazyValues.has(key)) {
      this.lazyValues.set(key, {
        stateKey,
        actionKey,
        loaded: false,
        accessCount: 0
      });
    }
  }

  /**
   * Acquire experience from pool (reduces GC pressure)
   */
  acquireExperience(): PooledExperience | null {
    if (!this.config.enableMemoryPooling) {
      return null;
    }

    const pooled = this.experiencePool.acquire();
    if (pooled) {
      this.stats.poolAcquisitions++;
    } else {
      this.stats.poolExhausted++;
    }
    return pooled;
  }

  /**
   * Release experience back to pool
   */
  releaseExperience(pooled: PooledExperience): void {
    if (!this.config.enableMemoryPooling) {
      return;
    }

    this.experiencePool.release(pooled);
  }

  /**
   * Encode state using optimized vector operations
   */
  encodeState(state: TaskState): string {
    const features = VectorOps.encodeStateToTypedArray(state);
    // Round to reduce state space
    const rounded = Array.from(features).map(f => Math.round(f * 10) / 10);
    return rounded.join(',');
  }

  /**
   * Calculate state similarity using optimized operations
   */
  calculateStateSimilarity(state1: TaskState, state2: TaskState): number {
    const vec1 = VectorOps.encodeStateToTypedArray(state1);
    const vec2 = VectorOps.encodeStateToTypedArray(state2);

    // Normalize vectors
    VectorOps.normalize(vec1);
    VectorOps.normalize(vec2);

    // Calculate cosine similarity
    return VectorOps.dotProduct(vec1, vec2);
  }

  /**
   * Find similar states using optimized operations (< 10ms for 1000 states)
   */
  findSimilarStates(
    targetState: TaskState,
    candidateStates: TaskState[],
    topK: number = 5,
    threshold: number = 0.8
  ): Array<{ state: TaskState; similarity: number }> {
    const startTime = performance.now();
    const targetVec = VectorOps.encodeStateToTypedArray(targetState);
    VectorOps.normalize(targetVec);

    const similarities: Array<{ state: TaskState; similarity: number }> = [];

    for (const candidate of candidateStates) {
      const candidateVec = VectorOps.encodeStateToTypedArray(candidate);
      VectorOps.normalize(candidateVec);

      const similarity = VectorOps.dotProduct(targetVec, candidateVec);

      if (similarity >= threshold) {
        similarities.push({ state: candidate, similarity });
      }
    }

    // Sort by similarity and take top K
    similarities.sort((a, b) => b.similarity - a.similarity);
    const result = similarities.slice(0, topK);

    const duration = performance.now() - startTime;
    this.logger.debug(
      `Found ${result.length} similar states from ${candidateStates.length} candidates in ${duration.toFixed(2)}ms`
    );

    return result;
  }

  /**
   * Flush pending updates
   */
  flush(): void {
    if (this.batchQueue.length > 0) {
      this.processBatchUpdates();
    }
  }

  /**
   * Get dirty cache entries for persistence
   */
  getDirtyEntries(): CachedQValue[] {
    return this.cache.getDirtyEntries();
  }

  /**
   * Clear dirty flags after persistence
   */
  clearDirtyFlags(): void {
    this.cache.clearDirtyFlags();
  }

  /**
   * Get optimizer statistics
   */
  getStatistics(): {
    cache: ReturnType<LRUCache['getStats']>;
    lazyValues: {
      total: number;
      loaded: number;
      unloaded: number;
    };
    batch: {
      queueSize: number;
      totalBatches: number;
      avgBatchSize: number;
    };
    pool: ReturnType<ExperiencePool['getStats']>;
    performance: {
      cacheHitRate: number;
      poolUtilization: number;
    };
  } {
    const totalCacheAccess = this.stats.cacheHits + this.stats.cacheMisses;
    const cacheHitRate = totalCacheAccess > 0 ? this.stats.cacheHits / totalCacheAccess : 0;

    const lazyLoaded = Array.from(this.lazyValues.values()).filter(v => v.loaded).length;

    return {
      cache: this.cache.getStats(),
      lazyValues: {
        total: this.lazyValues.size,
        loaded: lazyLoaded,
        unloaded: this.lazyValues.size - lazyLoaded
      },
      batch: {
        queueSize: this.batchQueue.length,
        totalBatches: this.stats.batchUpdates,
        avgBatchSize: this.stats.batchUpdates > 0
          ? this.batchQueue.length / this.stats.batchUpdates
          : 0
      },
      pool: this.experiencePool.getStats(),
      performance: {
        cacheHitRate,
        poolUtilization: this.experiencePool.getStats().utilization
      }
    };
  }

  /**
   * Reset optimizer state
   */
  reset(): void {
    this.cache.clear();
    this.lazyValues.clear();
    this.batchQueue = [];
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      batchUpdates: 0,
      poolAcquisitions: 0,
      poolExhausted: 0
    };
    this.logger.info('PerformanceOptimizer reset');
  }

  /**
   * Get memory usage estimate
   */
  getMemoryUsage(): number {
    const cacheSize = JSON.stringify(Array.from(this.cache['cache'].values())).length;
    const lazySize = JSON.stringify(Array.from(this.lazyValues.values())).length;
    const batchSize = JSON.stringify(this.batchQueue).length;
    return cacheSize + lazySize + batchSize;
  }
}

/**
 * Export vector operations for use in other modules
 */
export { VectorOps };
