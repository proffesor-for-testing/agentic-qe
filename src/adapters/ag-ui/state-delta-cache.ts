/**
 * State Delta Cache for AG-UI Protocol
 *
 * Pre-computes and caches JSON Patch deltas for common state transitions
 * to reduce latency in AG-UI state synchronization.
 *
 * Features:
 * - LRU cache with configurable size limit
 * - Pre-computed deltas for common agent state transitions
 * - Cache warming on initialization
 * - Fallback to on-demand computation for cache misses
 * - Cache hit/miss metrics for monitoring
 *
 * @module adapters/ag-ui/state-delta-cache
 */

import { createHash } from 'crypto';
import type { JsonPatchOperation } from './event-types.js';
import { computeDiff, deepEqual, type DiffConfig } from './json-patch.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Agent status values for pre-computed transitions
 */
export type AgentStatus = 'idle' | 'running' | 'completed' | 'error' | 'cancelled';

/**
 * Tool execution status values
 */
export type ToolStatus = 'pending' | 'executing' | 'success' | 'failure';

/**
 * Progress milestone percentages
 */
export type ProgressMilestone = 0 | 25 | 50 | 75 | 100;

/**
 * Pre-defined state transition type
 */
export interface StateTransition {
  /** Transition category */
  readonly category: 'agent-status' | 'progress' | 'tool-execution';
  /** Source state value */
  readonly from: unknown;
  /** Target state value */
  readonly to: unknown;
  /** Path in state object */
  readonly path: string;
}

/**
 * Cached delta entry
 */
export interface CachedDelta {
  /** The computed delta operations */
  readonly delta: JsonPatchOperation[];
  /** When this entry was created */
  readonly createdAt: number;
  /** Last access time for LRU eviction */
  lastAccessedAt: number;
  /** Number of times this entry was accessed */
  accessCount: number;
}

/**
 * Cache metrics
 */
export interface CacheMetrics {
  /** Total cache hits */
  readonly hits: number;
  /** Total cache misses */
  readonly misses: number;
  /** Current cache size */
  readonly size: number;
  /** Maximum cache size */
  readonly maxSize: number;
  /** Hit rate percentage */
  readonly hitRate: number;
  /** Number of evictions */
  readonly evictions: number;
  /** Number of pre-computed entries */
  readonly preComputedEntries: number;
}

/**
 * Configuration for the state delta cache
 */
export interface StateDeltaCacheConfig {
  /** Maximum number of cache entries (default: 1000) */
  maxSize?: number;
  /** Whether to warm cache on initialization (default: true) */
  warmOnInit?: boolean;
  /** Custom diff configuration */
  diffConfig?: DiffConfig;
  /** TTL in milliseconds for cache entries (default: unlimited) */
  ttl?: number;
  /** Custom state paths for agent status (default: /agent/status) */
  agentStatusPath?: string;
  /** Custom state paths for progress (default: /progress/percent) */
  progressPath?: string;
  /** Custom state paths for tool status (default: /tool/status) */
  toolStatusPath?: string;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<StateDeltaCacheConfig> = {
  maxSize: 1000,
  warmOnInit: true,
  diffConfig: {},
  ttl: 0, // 0 means unlimited
  agentStatusPath: '/agent/status',
  progressPath: '/progress/percent',
  toolStatusPath: '/tool/status',
};

// ============================================================================
// Pre-computed Transition Definitions
// ============================================================================

/**
 * Agent status transitions
 */
const AGENT_STATUS_TRANSITIONS: Array<[AgentStatus, AgentStatus]> = [
  ['idle', 'running'],
  ['running', 'completed'],
  ['running', 'error'],
  ['running', 'cancelled'],
  ['completed', 'idle'],
  ['error', 'idle'],
  ['cancelled', 'idle'],
];

/**
 * Progress milestone transitions
 */
const PROGRESS_TRANSITIONS: Array<[ProgressMilestone, ProgressMilestone]> = [
  [0, 25],
  [25, 50],
  [50, 75],
  [75, 100],
  [0, 50],
  [50, 100],
  [0, 100],
];

/**
 * Tool execution status transitions
 */
const TOOL_STATUS_TRANSITIONS: Array<[ToolStatus, ToolStatus]> = [
  ['pending', 'executing'],
  ['executing', 'success'],
  ['executing', 'failure'],
  ['success', 'pending'],
  ['failure', 'pending'],
];

// ============================================================================
// State Delta Cache Implementation
// ============================================================================

/**
 * LRU Cache for pre-computed state deltas
 *
 * Reduces latency by caching common state transitions and using
 * pre-computed deltas instead of computing on-demand.
 */
export class StateDeltaCache {
  private readonly config: Required<StateDeltaCacheConfig>;
  private readonly cache: Map<string, CachedDelta>;
  private readonly preComputedKeys: Set<string>;

  // Metrics
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  constructor(config: StateDeltaCacheConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new Map();
    this.preComputedKeys = new Set();

    if (this.config.warmOnInit) {
      this.warmCache();
    }
  }

  // ============================================================================
  // Cache Operations
  // ============================================================================

  /**
   * Get delta from cache or compute on-demand
   *
   * @param fromState - Source state
   * @param toState - Target state
   * @returns JSON Patch operations to transform fromState to toState
   */
  getDelta(
    fromState: Record<string, unknown>,
    toState: Record<string, unknown>
  ): JsonPatchOperation[] {
    const key = this.computeCacheKey(fromState, toState);

    // Check cache
    const cached = this.cache.get(key);
    if (cached && !this.isExpired(cached)) {
      this.hits++;
      cached.lastAccessedAt = Date.now();
      cached.accessCount++;
      // Move to end for LRU (delete and re-add)
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.delta;
    }

    // Cache miss - compute delta
    this.misses++;
    const delta = computeDiff(fromState, toState, this.config.diffConfig);

    // Store in cache
    this.setDelta(key, delta);

    return delta;
  }

  /**
   * Check if a delta is cached for the given states
   */
  has(
    fromState: Record<string, unknown>,
    toState: Record<string, unknown>
  ): boolean {
    const key = this.computeCacheKey(fromState, toState);
    const cached = this.cache.get(key);
    return cached !== undefined && !this.isExpired(cached);
  }

  /**
   * Pre-compute and store a delta in the cache
   */
  precompute(
    fromState: Record<string, unknown>,
    toState: Record<string, unknown>
  ): JsonPatchOperation[] {
    const key = this.computeCacheKey(fromState, toState);
    const delta = computeDiff(fromState, toState, this.config.diffConfig);
    this.setDelta(key, delta);
    this.preComputedKeys.add(key);
    return delta;
  }

  /**
   * Invalidate a specific cache entry
   */
  invalidate(
    fromState: Record<string, unknown>,
    toState: Record<string, unknown>
  ): boolean {
    const key = this.computeCacheKey(fromState, toState);
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.preComputedKeys.delete(key);
    }
    return deleted;
  }

  /**
   * Invalidate all entries matching a path prefix
   */
  invalidateByPath(pathPrefix: string): number {
    let count = 0;

    // We need to track entries by path, but our key is a hash
    // This is a limitation - for now, we clear the entire cache
    // In production, we'd maintain a secondary index by path
    for (const [key, entry] of this.cache.entries()) {
      // Check if any delta operation targets the given path
      const matchesPath = entry.delta.some(
        (op) =>
          op.path === pathPrefix ||
          op.path.startsWith(pathPrefix + '/')
      );
      if (matchesPath) {
        this.cache.delete(key);
        this.preComputedKeys.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.preComputedKeys.clear();
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  // ============================================================================
  // Cache Warming
  // ============================================================================

  /**
   * Warm the cache with pre-computed common transitions
   */
  warmCache(): void {
    // Agent status transitions
    for (const [from, to] of AGENT_STATUS_TRANSITIONS) {
      this.precomputePathTransition(
        this.config.agentStatusPath,
        from,
        to,
        'agent-status'
      );
    }

    // Progress transitions
    for (const [from, to] of PROGRESS_TRANSITIONS) {
      this.precomputePathTransition(
        this.config.progressPath,
        from,
        to,
        'progress'
      );
    }

    // Tool status transitions
    for (const [from, to] of TOOL_STATUS_TRANSITIONS) {
      this.precomputePathTransition(
        this.config.toolStatusPath,
        from,
        to,
        'tool-execution'
      );
    }
  }

  /**
   * Pre-compute transition for a specific path
   */
  private precomputePathTransition(
    path: string,
    fromValue: unknown,
    toValue: unknown,
    _category: string
  ): void {
    const pathParts = this.parseJsonPointerPath(path);
    const fromState = this.buildStateFromPath(pathParts, fromValue);
    const toState = this.buildStateFromPath(pathParts, toValue);

    this.precompute(fromState, toState);
  }

  /**
   * Parse a JSON Pointer path into segments
   */
  private parseJsonPointerPath(path: string): string[] {
    if (path === '' || path === '/') return [];
    if (!path.startsWith('/')) {
      throw new Error(`Invalid JSON Pointer: ${path}`);
    }
    return path.slice(1).split('/');
  }

  /**
   * Build a state object from path segments and value
   */
  private buildStateFromPath(
    pathParts: string[],
    value: unknown
  ): Record<string, unknown> {
    if (pathParts.length === 0) {
      return typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : {};
    }

    const result: Record<string, unknown> = {};
    let current: Record<string, unknown> = result;

    for (let i = 0; i < pathParts.length - 1; i++) {
      current[pathParts[i]] = {};
      current = current[pathParts[i]] as Record<string, unknown>;
    }

    current[pathParts[pathParts.length - 1]] = value;
    return result;
  }

  // ============================================================================
  // Custom Pre-computation
  // ============================================================================

  /**
   * Pre-compute a status transition at a custom path
   */
  precomputeStatusTransition(
    path: string,
    fromStatus: string,
    toStatus: string
  ): JsonPatchOperation[] {
    const pathParts = this.parseJsonPointerPath(path);
    const fromState = this.buildStateFromPath(pathParts, fromStatus);
    const toState = this.buildStateFromPath(pathParts, toStatus);
    return this.precompute(fromState, toState);
  }

  /**
   * Pre-compute a progress transition at a custom path
   */
  precomputeProgressTransition(
    path: string,
    fromPercent: number,
    toPercent: number
  ): JsonPatchOperation[] {
    const pathParts = this.parseJsonPointerPath(path);
    const fromState = this.buildStateFromPath(pathParts, fromPercent);
    const toState = this.buildStateFromPath(pathParts, toPercent);
    return this.precompute(fromState, toState);
  }

  /**
   * Pre-compute all transitions between a set of values at a path
   */
  precomputeAllTransitions(
    path: string,
    values: unknown[]
  ): number {
    let count = 0;
    const pathParts = this.parseJsonPointerPath(path);

    for (let i = 0; i < values.length; i++) {
      for (let j = 0; j < values.length; j++) {
        if (i !== j) {
          const fromState = this.buildStateFromPath(pathParts, values[i]);
          const toState = this.buildStateFromPath(pathParts, values[j]);

          // Only add if not already equal
          if (!deepEqual(fromState, toState)) {
            this.precompute(fromState, toState);
            count++;
          }
        }
      }
    }

    return count;
  }

  // ============================================================================
  // Metrics
  // ============================================================================

  /**
   * Get current cache metrics
   */
  getMetrics(): CacheMetrics {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate: total > 0 ? (this.hits / total) * 100 : 0,
      evictions: this.evictions,
      preComputedEntries: this.preComputedKeys.size,
    };
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get maximum cache size
   */
  get maxSize(): number {
    return this.config.maxSize;
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * Compute cache key from two states
   * Uses SHA-256 hash of JSON-stringified states
   */
  private computeCacheKey(
    fromState: Record<string, unknown>,
    toState: Record<string, unknown>
  ): string {
    const fromHash = this.hashState(fromState);
    const toHash = this.hashState(toState);
    return `${fromHash}:${toHash}`;
  }

  /**
   * Hash a state object for cache key
   */
  private hashState(state: Record<string, unknown>): string {
    // Ensure consistent key ordering by sorting
    const serialized = JSON.stringify(state, Object.keys(state).sort());
    return createHash('sha256').update(serialized).digest('hex').substring(0, 16);
  }

  /**
   * Set a delta in the cache with LRU eviction
   */
  private setDelta(key: string, delta: JsonPatchOperation[]): void {
    // Evict if at capacity (LRU)
    while (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      delta,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    });
  }

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    // Map maintains insertion order, but we need LRU by access time
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // Prefer evicting non-precomputed entries first
      const isPrecomputed = this.preComputedKeys.has(key);

      if (!isPrecomputed && entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    // If all entries are pre-computed, evict oldest pre-computed
    if (oldestKey === null) {
      for (const [key, entry] of this.cache.entries()) {
        if (entry.lastAccessedAt < oldestTime) {
          oldestTime = entry.lastAccessedAt;
          oldestKey = key;
        }
      }
    }

    if (oldestKey !== null) {
      this.cache.delete(oldestKey);
      this.preComputedKeys.delete(oldestKey);
      this.evictions++;
    }
  }

  /**
   * Check if a cache entry is expired
   */
  private isExpired(entry: CachedDelta): boolean {
    if (this.config.ttl <= 0) {
      return false; // No TTL
    }
    return Date.now() - entry.createdAt > this.config.ttl;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new StateDeltaCache instance
 */
export function createStateDeltaCache(
  config: StateDeltaCacheConfig = {}
): StateDeltaCache {
  return new StateDeltaCache(config);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get all pre-defined agent status values
 */
export function getAgentStatusValues(): readonly AgentStatus[] {
  return ['idle', 'running', 'completed', 'error', 'cancelled'] as const;
}

/**
 * Get all pre-defined progress milestones
 */
export function getProgressMilestones(): readonly ProgressMilestone[] {
  return [0, 25, 50, 75, 100] as const;
}

/**
 * Get all pre-defined tool status values
 */
export function getToolStatusValues(): readonly ToolStatus[] {
  return ['pending', 'executing', 'success', 'failure'] as const;
}
