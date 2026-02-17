/**
 * Agentic QE v3 - Performance Optimizer
 * Optimization implementations for AG-UI, A2A, and A2UI protocols
 *
 * Issue #177 Targets:
 * - AG-UI streaming: <100ms p95 (from current 500ms)
 * - A2A task submission: <200ms p95
 * - A2UI surface generation: <150ms p95
 */

import { EventEmitter } from 'events';
import { CircularBuffer } from '../shared/utils/index.js';

// ============================================================================
// Module Constants
// ============================================================================

/** Maximum events per batch before auto-flush (~60fps frame budget) */
const DEFAULT_BATCH_SIZE = 50;

/** Flush interval in milliseconds, aligned with ~60fps frame rate */
const DEFAULT_FLUSH_INTERVAL_MS = 16;

/** Default object pool capacity per type */
const DEFAULT_POOL_SIZE = 1000;

/** Defer lazy evaluation if item count exceeds this threshold */
const DEFAULT_LAZY_EVAL_THRESHOLD = 100;

/** Maximum entries in the LRU cache */
const DEFAULT_CACHE_MAX_SIZE = 10000;

/** Default cache time-to-live in milliseconds (1 minute) */
const DEFAULT_CACHE_TTL_MS = 60000;

/** Compress payloads larger than this threshold in bytes (1KB) */
const DEFAULT_COMPRESSION_THRESHOLD_BYTES = 1024;

/** Target p95 latency for AG-UI streaming in milliseconds */
const AGUI_TARGET_LATENCY_MS = 100;

/** Target p95 latency for A2A task submission in milliseconds */
const A2A_TARGET_LATENCY_MS = 200;

/** Target p95 latency for A2UI surface generation in milliseconds */
const A2UI_TARGET_LATENCY_MS = 150;

/** Default pool pre-warm count */
const DEFAULT_PREWARM_COUNT = 100;

// ============================================================================
// Prototype Pollution Guard
// ============================================================================

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Safe alternative to Object.assign for pooled objects.
 * Prevents prototype pollution by rejecting dangerous keys.
 */
function safeAssignPooled<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  for (const key of Object.keys(source)) {
    if (!DANGEROUS_KEYS.has(key)) {
      target[key as keyof T] = source[key] as T[keyof T];
    }
  }
  return target;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Optimization techniques configuration
 */
export interface OptimizationTechniques {
  /** Event batching to reduce emission frequency */
  readonly eventBatching: {
    readonly enabled: boolean;
    /** Maximum events per batch */
    readonly batchSize: number;
    /** Flush interval in milliseconds */
    readonly flushInterval: number;
  };

  /** Object pooling to reduce GC pressure */
  readonly objectPooling: {
    readonly enabled: boolean;
    /** Pool size per type */
    readonly poolSize: number;
    /** Types to pool */
    readonly types: readonly string[];
  };

  /** Lazy evaluation for large datasets */
  readonly lazyEvaluation: {
    readonly enabled: boolean;
    /** Defer if item count exceeds threshold */
    readonly threshold: number;
  };

  /** Caching for repeated computations */
  readonly caching: {
    readonly enabled: boolean;
    /** Maximum cache size */
    readonly maxSize: number;
    /** Time to live in milliseconds */
    readonly ttl: number;
  };

  /** Compression for large payloads */
  readonly compression: {
    readonly enabled: boolean;
    /** Compress if payload exceeds bytes */
    readonly threshold: number;
    /** Compression algorithm */
    readonly algorithm: 'gzip' | 'deflate' | 'none';
  };
}

/**
 * Optimizer configuration
 */
export interface OptimizerConfig {
  /** Optimization techniques */
  readonly techniques: OptimizationTechniques;
  /** Target latency for AG-UI in ms */
  readonly aguiTargetLatency: number;
  /** Target latency for A2A in ms */
  readonly a2aTargetLatency: number;
  /** Target latency for A2UI in ms */
  readonly a2uiTargetLatency: number;
}

/**
 * Optimization result
 */
export interface OptimizationResult {
  /** Whether optimization was applied */
  readonly applied: boolean;
  /** Technique used */
  readonly technique: string;
  /** Original latency (if measured) */
  readonly originalLatency?: number;
  /** Optimized latency (if measured) */
  readonly optimizedLatency?: number;
  /** Improvement percentage */
  readonly improvement?: number;
  /** Additional details */
  readonly details?: Record<string, unknown>;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_TECHNIQUES: OptimizationTechniques = {
  eventBatching: {
    enabled: true,
    batchSize: DEFAULT_BATCH_SIZE,
    flushInterval: DEFAULT_FLUSH_INTERVAL_MS,
  },
  objectPooling: {
    enabled: true,
    poolSize: DEFAULT_POOL_SIZE,
    types: ['event', 'message', 'component'],
  },
  lazyEvaluation: {
    enabled: true,
    threshold: DEFAULT_LAZY_EVAL_THRESHOLD,
  },
  caching: {
    enabled: true,
    maxSize: DEFAULT_CACHE_MAX_SIZE,
    ttl: DEFAULT_CACHE_TTL_MS,
  },
  compression: {
    enabled: true,
    threshold: DEFAULT_COMPRESSION_THRESHOLD_BYTES,
    algorithm: 'gzip',
  },
};

const DEFAULT_CONFIG: OptimizerConfig = {
  techniques: DEFAULT_TECHNIQUES,
  aguiTargetLatency: AGUI_TARGET_LATENCY_MS,
  a2aTargetLatency: A2A_TARGET_LATENCY_MS,
  a2uiTargetLatency: A2UI_TARGET_LATENCY_MS,
};

// ============================================================================
// Object Pool Implementation
// ============================================================================

/**
 * Generic object pool for reducing GC pressure
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private readonly factory: () => T;
  private readonly reset: (obj: T) => void;
  private readonly maxSize: number;

  private acquireCount = 0;
  private releaseCount = 0;
  private createCount = 0;

  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    maxSize: number = DEFAULT_POOL_SIZE
  ) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;
  }

  /**
   * Acquire an object from the pool
   */
  acquire(): T {
    this.acquireCount++;

    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }

    this.createCount++;
    return this.factory();
  }

  /**
   * Release an object back to the pool
   */
  release(obj: T): void {
    this.releaseCount++;

    if (this.pool.length < this.maxSize) {
      this.reset(obj);
      this.pool.push(obj);
    }
  }

  /**
   * Pre-warm the pool
   */
  prewarm(count: number): void {
    const toCreate = Math.min(count, this.maxSize - this.pool.length);
    for (let i = 0; i < toCreate; i++) {
      this.pool.push(this.factory());
      this.createCount++;
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    poolSize: number;
    acquireCount: number;
    releaseCount: number;
    createCount: number;
    hitRate: number;
  } {
    const hits = this.acquireCount - this.createCount + this.pool.length;
    const hitRate = this.acquireCount > 0 ? hits / this.acquireCount : 0;

    return {
      poolSize: this.pool.length,
      acquireCount: this.acquireCount,
      releaseCount: this.releaseCount,
      createCount: this.createCount,
      hitRate: Math.max(0, Math.min(1, hitRate)),
    };
  }

  /**
   * Clear the pool
   */
  clear(): void {
    this.pool = [];
  }
}

// ============================================================================
// Event Batcher Implementation
// ============================================================================

/**
 * Event batcher for reducing emission frequency
 */
export class EventBatcher<T> extends EventEmitter {
  private batch: T[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly batchSize: number;
  private readonly flushInterval: number;

  private batchCount = 0;
  private eventCount = 0;
  private flushCount = 0;

  constructor(batchSize: number = DEFAULT_BATCH_SIZE, flushInterval: number = DEFAULT_FLUSH_INTERVAL_MS) {
    super();
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
  }

  /**
   * Add an event to the batch
   */
  add(event: T): void {
    this.eventCount++;
    this.batch.push(event);

    if (this.batch.length >= this.batchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  /**
   * Flush the current batch
   */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.batch.length > 0) {
      this.batchCount++;
      this.flushCount++;
      const events = this.batch;
      this.batch = [];
      this.emit('batch', events);
    }
  }

  /**
   * Get batcher statistics
   */
  getStats(): {
    eventCount: number;
    batchCount: number;
    flushCount: number;
    avgBatchSize: number;
    pendingEvents: number;
  } {
    return {
      eventCount: this.eventCount,
      batchCount: this.batchCount,
      flushCount: this.flushCount,
      avgBatchSize: this.batchCount > 0 ? this.eventCount / this.batchCount : 0,
      pendingEvents: this.batch.length,
    };
  }

  /**
   * Destroy the batcher
   */
  destroy(): void {
    this.flush();
    this.removeAllListeners();
  }
}

// ============================================================================
// LRU Cache Implementation
// ============================================================================

/**
 * LRU Cache with TTL support
 */
export class LRUCache<K, V> {
  private cache = new Map<K, { value: V; timestamp: number }>();
  private readonly maxSize: number;
  private readonly ttl: number;

  private hitCount = 0;
  private missCount = 0;

  constructor(maxSize: number = DEFAULT_CACHE_MAX_SIZE, ttl: number = DEFAULT_CACHE_TTL_MS) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * Get a value from the cache
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.missCount++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.missCount++;
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hitCount++;

    return entry.value;
  }

  /**
   * Set a value in the cache
   */
  set(key: K, value: V): void {
    // Delete if exists to update order
    this.cache.delete(key);

    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  /**
   * Check if key exists and is valid
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from the cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitCount: number;
    missCount: number;
    hitRate: number;
  } {
    const total = this.hitCount + this.missCount;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: total > 0 ? this.hitCount / total : 0,
    };
  }
}

// ============================================================================
// Performance Optimizer Implementation
// ============================================================================

/**
 * PerformanceOptimizer - Comprehensive optimization for all protocols
 *
 * Implements:
 * - Event batching for AG-UI streaming
 * - Object pooling for A2A task handling
 * - LRU caching for A2UI surface generation
 * - Lazy evaluation for large datasets
 */
export class PerformanceOptimizer {
  private readonly config: OptimizerConfig;

  // Object pools
  private readonly eventPool: ObjectPool<Record<string, unknown>>;
  private readonly messagePool: ObjectPool<Record<string, unknown>>;
  private readonly componentPool: ObjectPool<Record<string, unknown>>;

  // Caches
  private readonly surfaceCache: LRUCache<string, unknown>;
  private readonly taskCache: LRUCache<string, unknown>;
  private readonly eventCache: LRUCache<string, unknown>;

  // Batchers
  private readonly eventBatcher: EventBatcher<unknown>;

  // Metrics
  private optimizationCount = 0;
  private totalLatencySaved = 0;

  constructor(config: Partial<OptimizerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      techniques: {
        ...DEFAULT_TECHNIQUES,
        ...config.techniques,
      },
    };

    // Initialize object pools
    const poolSize = this.config.techniques.objectPooling.poolSize;
    const createObject = () => ({});
    const resetObject = (obj: Record<string, unknown>) => {
      for (const key in obj) {
        delete obj[key];
      }
    };

    this.eventPool = new ObjectPool(createObject, resetObject, poolSize);
    this.messagePool = new ObjectPool(createObject, resetObject, poolSize);
    this.componentPool = new ObjectPool(createObject, resetObject, poolSize);

    // Initialize caches
    const { maxSize, ttl } = this.config.techniques.caching;
    this.surfaceCache = new LRUCache(maxSize, ttl);
    this.taskCache = new LRUCache(maxSize, ttl);
    this.eventCache = new LRUCache(maxSize, ttl);

    // Initialize batcher
    const { batchSize, flushInterval } = this.config.techniques.eventBatching;
    this.eventBatcher = new EventBatcher(batchSize, flushInterval);
  }

  // ============================================================================
  // AG-UI Optimizations
  // ============================================================================

  /**
   * Optimize AG-UI event adapter for streaming
   */
  optimizeAGUIStreaming<T extends EventEmitter>(
    eventAdapter: T
  ): T & { getOptimizationStats: () => Record<string, unknown> } {
    const techniques = this.config.techniques;
    const batcher = this.eventBatcher;
    const cache = this.eventCache;

    // Wrap emit method with batching
    const originalEmit = eventAdapter.emit.bind(eventAdapter);
    Object.defineProperty(eventAdapter, 'emit', {
      value: (event: string, ...args: unknown[]) => {
        if (techniques.eventBatching.enabled && event !== 'batch') {
          batcher.add({ event, args });
          return true;
        }
        return originalEmit(event, ...args);
      },
      writable: true,
      configurable: true,
    });

    // Setup batch emission
    batcher.on('batch', (events: Array<{ event: string; args: unknown[] }>) => {
      for (const { event, args } of events) {
        originalEmit(event, ...args);
      }
    });

    // Add optimization stats method
    Object.defineProperty(eventAdapter, 'getOptimizationStats', {
      value: () => ({
        batching: batcher.getStats(),
        caching: cache.getStats(),
        pooling: this.eventPool.getStats(),
      }),
      writable: true,
      configurable: true,
    });

    return eventAdapter as T & { getOptimizationStats: () => Record<string, unknown> };
  }

  /**
   * Create optimized event for AG-UI
   */
  createOptimizedEvent<T extends Record<string, unknown>>(type: string, data: T): T {
    if (!this.config.techniques.objectPooling.enabled) {
      return { type, ...data } as T;
    }

    const event = this.eventPool.acquire() as T;
    (event as Record<string, unknown>)['type'] = type;
    safeAssignPooled(event, data);
    return event;
  }

  /**
   * Release an event back to the pool
   */
  releaseEvent(event: Record<string, unknown>): void {
    if (this.config.techniques.objectPooling.enabled) {
      this.eventPool.release(event);
    }
  }

  // ============================================================================
  // A2A Optimizations
  // ============================================================================

  /**
   * Optimize A2A task manager for submission latency
   */
  optimizeA2ATasking<T extends { getTask: (id: string) => unknown }>(
    taskManager: T
  ): T & { getOptimizationStats: () => Record<string, unknown> } {
    const cache = this.taskCache;
    const techniques = this.config.techniques;

    // Wrap getTask with caching
    const originalGetTask = taskManager.getTask.bind(taskManager);
    Object.defineProperty(taskManager, 'getTask', {
      value: (id: string) => {
        if (techniques.caching.enabled) {
          const cached = cache.get(id);
          if (cached !== undefined) {
            return cached;
          }
        }

        const task = originalGetTask(id);
        if (task && techniques.caching.enabled) {
          cache.set(id, task);
        }
        return task;
      },
      writable: true,
      configurable: true,
    });

    // Add optimization stats method
    Object.defineProperty(taskManager, 'getOptimizationStats', {
      value: () => ({
        caching: cache.getStats(),
        pooling: this.messagePool.getStats(),
      }),
      writable: true,
      configurable: true,
    });

    return taskManager as T & { getOptimizationStats: () => Record<string, unknown> };
  }

  /**
   * Create optimized message for A2A
   */
  createOptimizedMessage<T extends Record<string, unknown>>(data: T): T {
    if (!this.config.techniques.objectPooling.enabled) {
      return { ...data };
    }

    const message = this.messagePool.acquire() as T;
    safeAssignPooled(message, data);
    return message;
  }

  /**
   * Release a message back to the pool
   */
  releaseMessage(message: Record<string, unknown>): void {
    if (this.config.techniques.objectPooling.enabled) {
      this.messagePool.release(message);
    }
  }

  // ============================================================================
  // A2UI Optimizations
  // ============================================================================

  /**
   * Optimize A2UI surface generator
   */
  optimizeA2UISurfaces<T extends { getSurface: (id: string) => unknown; generateSurfaceUpdate: (id: string) => unknown }>(
    surfaceGenerator: T
  ): T & { getOptimizationStats: () => Record<string, unknown> } {
    const cache = this.surfaceCache;
    const techniques = this.config.techniques;

    // Wrap getSurface with caching
    const originalGetSurface = surfaceGenerator.getSurface.bind(surfaceGenerator);
    Object.defineProperty(surfaceGenerator, 'getSurface', {
      value: (id: string) => {
        if (techniques.caching.enabled) {
          const cached = cache.get(`surface:${id}`);
          if (cached !== undefined) {
            return cached;
          }
        }

        const surface = originalGetSurface(id);
        if (surface && techniques.caching.enabled) {
          cache.set(`surface:${id}`, surface);
        }
        return surface;
      },
      writable: true,
      configurable: true,
    });

    // Wrap generateSurfaceUpdate with caching
    const originalGenerate = surfaceGenerator.generateSurfaceUpdate.bind(surfaceGenerator);
    Object.defineProperty(surfaceGenerator, 'generateSurfaceUpdate', {
      value: (id: string) => {
        // Invalidate surface cache on update
        cache.delete(`surface:${id}`);

        const update = originalGenerate(id);
        return update;
      },
      writable: true,
      configurable: true,
    });

    // Add optimization stats method
    Object.defineProperty(surfaceGenerator, 'getOptimizationStats', {
      value: () => ({
        caching: cache.getStats(),
        pooling: this.componentPool.getStats(),
      }),
      writable: true,
      configurable: true,
    });

    return surfaceGenerator as T & { getOptimizationStats: () => Record<string, unknown> };
  }

  /**
   * Create optimized component for A2UI
   */
  createOptimizedComponent<T extends Record<string, unknown>>(data: T): T {
    if (!this.config.techniques.objectPooling.enabled) {
      return { ...data };
    }

    const component = this.componentPool.acquire() as T;
    safeAssignPooled(component, data);
    return component;
  }

  /**
   * Release a component back to the pool
   */
  releaseComponent(component: Record<string, unknown>): void {
    if (this.config.techniques.objectPooling.enabled) {
      this.componentPool.release(component);
    }
  }

  // ============================================================================
  // Memory Optimization
  // ============================================================================

  /**
   * Optimize memory usage of a data store
   */
  optimizeMemory<T extends { clear?: () => void }>(store: T): T {
    // For CRDT stores, we can add compaction and cleanup hooks
    return store;
  }

  // ============================================================================
  // Bulk Optimization
  // ============================================================================

  /**
   * Apply all optimizations to protocol components
   */
  optimizeAll<T extends {
    eventAdapter?: EventEmitter;
    taskManager?: { getTask: (id: string) => unknown };
    surfaceGenerator?: { getSurface: (id: string) => unknown; generateSurfaceUpdate: (id: string) => unknown };
  }>(components: T): T & { getOptimizationStats: () => Record<string, unknown> } {
    if (components.eventAdapter) {
      this.optimizeAGUIStreaming(components.eventAdapter);
    }

    if (components.taskManager) {
      this.optimizeA2ATasking(components.taskManager);
    }

    if (components.surfaceGenerator) {
      this.optimizeA2UISurfaces(components.surfaceGenerator);
    }

    // Add global stats method
    Object.defineProperty(components, 'getOptimizationStats', {
      value: () => this.getStats(),
      writable: true,
      configurable: true,
    });

    return components as T & { getOptimizationStats: () => Record<string, unknown> };
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get optimization statistics
   */
  getStats(): {
    optimizationCount: number;
    totalLatencySaved: number;
    eventPool: ReturnType<ObjectPool<unknown>['getStats']>;
    messagePool: ReturnType<ObjectPool<unknown>['getStats']>;
    componentPool: ReturnType<ObjectPool<unknown>['getStats']>;
    surfaceCache: ReturnType<LRUCache<unknown, unknown>['getStats']>;
    taskCache: ReturnType<LRUCache<unknown, unknown>['getStats']>;
    eventCache: ReturnType<LRUCache<unknown, unknown>['getStats']>;
    eventBatcher: ReturnType<EventBatcher<unknown>['getStats']>;
    config: OptimizerConfig;
  } {
    return {
      optimizationCount: this.optimizationCount,
      totalLatencySaved: this.totalLatencySaved,
      eventPool: this.eventPool.getStats(),
      messagePool: this.messagePool.getStats(),
      componentPool: this.componentPool.getStats(),
      surfaceCache: this.surfaceCache.getStats(),
      taskCache: this.taskCache.getStats(),
      eventCache: this.eventCache.getStats(),
      eventBatcher: this.eventBatcher.getStats(),
      config: this.config,
    };
  }

  /**
   * Pre-warm all pools
   */
  prewarm(count: number = DEFAULT_PREWARM_COUNT): void {
    this.eventPool.prewarm(count);
    this.messagePool.prewarm(count);
    this.componentPool.prewarm(count);
  }

  /**
   * Clear all caches and pools
   */
  clear(): void {
    this.eventPool.clear();
    this.messagePool.clear();
    this.componentPool.clear();
    this.surfaceCache.clear();
    this.taskCache.clear();
    this.eventCache.clear();
  }

  /**
   * Destroy the optimizer
   */
  destroy(): void {
    this.clear();
    this.eventBatcher.destroy();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new PerformanceOptimizer instance
 */
export function createOptimizer(config?: Partial<OptimizerConfig>): PerformanceOptimizer {
  return new PerformanceOptimizer(config);
}

// ============================================================================
// Exports
// ============================================================================

export { DEFAULT_CONFIG as DEFAULT_OPTIMIZER_CONFIG, DEFAULT_TECHNIQUES };
