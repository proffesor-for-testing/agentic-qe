/**
 * AG-UI State Manager
 *
 * Manages agent state for AG-UI STATE_SNAPSHOT and STATE_DELTA synchronization.
 * Provides atomic state updates with automatic delta computation.
 *
 * @module adapters/ag-ui/state-manager
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { JsonPatchOperation } from './event-types.js';
import {
  computeDiff,
  applyPatch,
  applyPatchAtomic,
  validatePatch,
  deepEqual,
  getValueAtPath,
  pathExists,
  type PatchResult,
  type DiffConfig,
} from './json-patch.js';
import { StateDeltaCache, type StateDeltaCacheConfig } from './state-delta-cache.js';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * State manager configuration
 */
export interface StateManagerConfig {
  /** Initial state */
  initialState?: Record<string, unknown>;
  /** Whether to auto-increment version on state changes */
  autoVersion?: boolean;
  /** Maximum state history to retain (for rollback) */
  maxHistory?: number;
  /** Whether to emit events on state changes */
  emitEvents?: boolean;
  /** Custom ID generator */
  idGenerator?: () => string;
  /** Custom timestamp generator */
  timestampGenerator?: () => string;
  /** Diff configuration */
  diffConfig?: DiffConfig;
  /** Enable delta caching for optimized diff computation */
  enableCache?: boolean;
  /** Delta cache configuration */
  cacheConfig?: StateDeltaCacheConfig;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<StateManagerConfig> = {
  initialState: {},
  autoVersion: true,
  maxHistory: 10,
  emitEvents: true,
  idGenerator: () => uuidv4(),
  timestampGenerator: () => new Date().toISOString(),
  diffConfig: {},
  enableCache: true,
  cacheConfig: {},
};

/**
 * State change event payload
 */
export interface StateChangeEvent {
  /** Change type */
  type: 'snapshot' | 'delta';
  /** Current version */
  version: number;
  /** Previous version (for delta) */
  previousVersion?: number;
  /** Delta operations (for delta type) */
  delta?: JsonPatchOperation[];
  /** Full state (for snapshot type) */
  state?: Record<string, unknown>;
  /** Timestamp of change */
  timestamp: string;
}

/**
 * State history entry
 */
export interface StateHistoryEntry {
  /** State version */
  version: number;
  /** State snapshot */
  state: Record<string, unknown>;
  /** Timestamp */
  timestamp: string;
  /** Delta from previous state */
  deltaFromPrevious?: JsonPatchOperation[];
}

// ============================================================================
// State Manager Implementation
// ============================================================================

/**
 * AG-UI State Manager
 *
 * Manages bidirectional state synchronization between agent and UI
 * using STATE_SNAPSHOT and STATE_DELTA events.
 */
export class StateManager extends EventEmitter {
  private config: Required<StateManagerConfig>;
  private state: Record<string, unknown>;
  private version: number = 0;
  private history: StateHistoryEntry[] = [];
  private lastSnapshotVersion: number = 0;
  private connectionId: string | null = null;
  private readonly deltaCache: StateDeltaCache | null;

  constructor(config: StateManagerConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = structuredClone(this.config.initialState);

    // Initialize delta cache for optimized diff computation
    this.deltaCache = this.config.enableCache
      ? new StateDeltaCache({
          ...this.config.cacheConfig,
          diffConfig: this.config.diffConfig,
        })
      : null;

    // Store initial state in history
    this.history.push({
      version: 0,
      state: structuredClone(this.state),
      timestamp: this.config.timestampGenerator(),
    });
  }

  // ============================================================================
  // Snapshot Operations
  // ============================================================================

  /**
   * Get the current state as a snapshot
   */
  getSnapshot(): Record<string, unknown> {
    return structuredClone(this.state);
  }

  /**
   * Get the current state version
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Generate a STATE_SNAPSHOT event payload
   */
  generateSnapshotEvent(): {
    type: 'STATE_SNAPSHOT';
    state: Record<string, unknown>;
    version: number;
  } {
    this.lastSnapshotVersion = this.version;
    return {
      type: 'STATE_SNAPSHOT',
      state: this.getSnapshot(),
      version: this.version,
    };
  }

  /**
   * Check if a snapshot should be sent (e.g., on reconnection)
   */
  shouldSendSnapshot(clientVersion?: number): boolean {
    // Always send snapshot if no client version provided
    if (clientVersion === undefined) {
      return true;
    }
    // Send snapshot if client version is behind current version
    // (i.e., client missed state changes since last snapshot)
    return clientVersion < this.version;
  }

  // ============================================================================
  // State Mutation Operations
  // ============================================================================

  /**
   * Get the current state (readonly reference)
   */
  getState(): Readonly<Record<string, unknown>> {
    return this.state;
  }

  /**
   * Set the entire state, computing delta from current state
   * Uses delta cache for optimized computation of common transitions
   * Returns the delta operations
   */
  setState(newState: Record<string, unknown>): JsonPatchOperation[] {
    const oldState = this.state;
    // Use cache for optimized delta computation if available
    const delta = this.deltaCache
      ? this.deltaCache.getDelta(oldState, newState)
      : computeDiff(oldState, newState, this.config.diffConfig);

    // Apply changes
    this.state = structuredClone(newState);

    // Update version
    if (this.config.autoVersion && delta.length > 0) {
      this.version++;
    }

    // Store in history
    this.addToHistory(delta);

    // Emit event
    if (this.config.emitEvents && delta.length > 0) {
      const event: StateChangeEvent = {
        type: 'delta',
        version: this.version,
        previousVersion: this.version - 1,
        delta,
        timestamp: this.config.timestampGenerator(),
      };
      this.emit('change', event);
      this.emit('delta', delta, this.version);
    }

    return delta;
  }

  /**
   * Update a specific path in the state
   */
  updatePath(path: string, value: unknown): JsonPatchOperation[] {
    const exists = pathExists(this.state, path);
    const op: JsonPatchOperation = exists
      ? { op: 'replace', path, value }
      : { op: 'add', path, value };

    return this.applyDelta([op]);
  }

  /**
   * Remove a value at a specific path
   */
  removePath(path: string): JsonPatchOperation[] {
    if (!pathExists(this.state, path)) {
      return []; // Nothing to remove
    }

    const op: JsonPatchOperation = { op: 'remove', path };
    return this.applyDelta([op]);
  }

  /**
   * Merge an object into the state at a specific path
   */
  mergePath(
    path: string,
    value: Record<string, unknown>
  ): JsonPatchOperation[] {
    const currentValue = getValueAtPath(this.state, path);
    const ops: JsonPatchOperation[] = [];

    if (typeof currentValue !== 'object' || currentValue === null) {
      // Replace entire path
      ops.push({ op: pathExists(this.state, path) ? 'replace' : 'add', path, value });
    } else {
      // Merge keys
      for (const key of Object.keys(value)) {
        const childPath = path === '' ? `/${key}` : `${path}/${key}`;
        const childExists = key in (currentValue as Record<string, unknown>);
        ops.push({
          op: childExists ? 'replace' : 'add',
          path: childPath,
          value: value[key],
        });
      }
    }

    return this.applyDelta(ops);
  }

  // ============================================================================
  // Delta Operations
  // ============================================================================

  /**
   * Compute delta between current state and provided state
   * Uses delta cache for optimized computation if enabled
   */
  computeDelta(
    oldState: Record<string, unknown>,
    newState: Record<string, unknown>
  ): JsonPatchOperation[] {
    return this.deltaCache
      ? this.deltaCache.getDelta(oldState, newState)
      : computeDiff(oldState, newState, this.config.diffConfig);
  }

  /**
   * Apply a delta (JSON Patch) to the current state
   * Atomic operation with rollback on error
   */
  applyDelta(delta: JsonPatchOperation[]): JsonPatchOperation[] {
    if (delta.length === 0) {
      return [];
    }

    // Validate first
    const validation = validatePatch(delta);
    if (!validation.valid) {
      throw new Error(`Invalid patch: ${validation.error}`);
    }

    // Store original for rollback
    const originalState = this.state;
    const originalVersion = this.version;

    try {
      // Apply atomically
      this.state = applyPatchAtomic(this.state, delta);

      // Update version
      if (this.config.autoVersion) {
        this.version++;
      }

      // Store in history
      this.addToHistory(delta);

      // Emit event
      if (this.config.emitEvents) {
        const event: StateChangeEvent = {
          type: 'delta',
          version: this.version,
          previousVersion: originalVersion,
          delta,
          timestamp: this.config.timestampGenerator(),
        };
        this.emit('change', event);
        this.emit('delta', delta, this.version);
      }

      return delta;
    } catch (error) {
      // Rollback on error
      this.state = originalState;
      this.version = originalVersion;
      throw error;
    }
  }

  /**
   * Generate a STATE_DELTA event payload for the given delta
   */
  generateDeltaEvent(delta: JsonPatchOperation[]): {
    type: 'STATE_DELTA';
    delta: JsonPatchOperation[];
    version: number;
  } {
    return {
      type: 'STATE_DELTA',
      delta,
      version: this.version,
    };
  }

  /**
   * Apply patch from external source (e.g., client updates)
   * Returns PatchResult for error handling
   */
  applyExternalPatch(patch: JsonPatchOperation[]): PatchResult {
    const result = applyPatch(this.state, patch);

    if (result.success) {
      this.state = result.document;
      if (this.config.autoVersion) {
        this.version++;
      }
      this.addToHistory(patch);

      if (this.config.emitEvents) {
        const event: StateChangeEvent = {
          type: 'delta',
          version: this.version,
          delta: patch,
          timestamp: this.config.timestampGenerator(),
        };
        this.emit('change', event);
        this.emit('externalDelta', patch, this.version);
      }
    }

    return result;
  }

  // ============================================================================
  // History and Rollback
  // ============================================================================

  /**
   * Get state history
   */
  getHistory(): readonly StateHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Get state at a specific version
   */
  getStateAtVersion(version: number): Record<string, unknown> | undefined {
    const entry = this.history.find((h) => h.version === version);
    return entry ? structuredClone(entry.state) : undefined;
  }

  /**
   * Rollback to a previous version
   */
  rollback(targetVersion: number): JsonPatchOperation[] {
    const targetEntry = this.history.find((h) => h.version === targetVersion);
    if (!targetEntry) {
      throw new Error(`Version ${targetVersion} not found in history`);
    }

    const delta = computeDiff(
      this.state,
      targetEntry.state,
      this.config.diffConfig
    );
    this.state = structuredClone(targetEntry.state);
    this.version = targetVersion;

    if (this.config.emitEvents) {
      const event: StateChangeEvent = {
        type: 'delta',
        version: this.version,
        delta,
        timestamp: this.config.timestampGenerator(),
      };
      this.emit('change', event);
      this.emit('rollback', targetVersion, delta);
    }

    return delta;
  }

  /**
   * Add entry to history with size limit enforcement
   */
  private addToHistory(delta: JsonPatchOperation[]): void {
    this.history.push({
      version: this.version,
      state: structuredClone(this.state),
      timestamp: this.config.timestampGenerator(),
      deltaFromPrevious: delta,
    });

    // Enforce max history
    while (this.history.length > this.config.maxHistory) {
      this.history.shift();
    }
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Handle new connection (emit snapshot)
   */
  onConnection(connectionId: string): {
    type: 'STATE_SNAPSHOT';
    state: Record<string, unknown>;
    version: number;
  } {
    this.connectionId = connectionId;

    if (this.config.emitEvents) {
      const event: StateChangeEvent = {
        type: 'snapshot',
        version: this.version,
        state: this.getSnapshot(),
        timestamp: this.config.timestampGenerator(),
      };
      this.emit('connection', connectionId, event);
    }

    return this.generateSnapshotEvent();
  }

  /**
   * Handle reconnection (emit snapshot if needed)
   */
  onReconnection(
    connectionId: string,
    lastKnownVersion?: number
  ): { type: 'STATE_SNAPSHOT'; state: Record<string, unknown>; version: number } | null {
    this.connectionId = connectionId;

    // Check if client needs full snapshot (client version is behind current version)
    if (lastKnownVersion === undefined || lastKnownVersion < this.version) {
      if (this.config.emitEvents) {
        const event: StateChangeEvent = {
          type: 'snapshot',
          version: this.version,
          state: this.getSnapshot(),
          timestamp: this.config.timestampGenerator(),
        };
        this.emit('reconnection', connectionId, event);
      }
      return this.generateSnapshotEvent();
    }

    // Client can catch up with deltas (client is at or ahead of current version)
    if (this.config.emitEvents) {
      this.emit('reconnection', connectionId, null);
    }
    return null;
  }

  /**
   * Handle disconnection
   */
  onDisconnection(connectionId: string): void {
    if (this.connectionId === connectionId) {
      this.connectionId = null;
    }

    if (this.config.emitEvents) {
      this.emit('disconnection', connectionId);
    }
  }

  /**
   * Get current connection ID
   */
  getConnectionId(): string | null {
    return this.connectionId;
  }

  // ============================================================================
  // Query Operations
  // ============================================================================

  /**
   * Get value at a specific path
   */
  getValue<T = unknown>(path: string): T | undefined {
    return getValueAtPath(this.state, path) as T | undefined;
  }

  /**
   * Check if path exists in state
   */
  hasPath(path: string): boolean {
    return pathExists(this.state, path);
  }

  /**
   * Check if current state equals the provided state
   */
  equals(otherState: Record<string, unknown>): boolean {
    return deepEqual(this.state, otherState);
  }

  // ============================================================================
  // Reset and Clear
  // ============================================================================

  /**
   * Reset state to initial state
   */
  reset(): JsonPatchOperation[] {
    const delta = computeDiff(
      this.state,
      this.config.initialState,
      this.config.diffConfig
    );

    this.state = structuredClone(this.config.initialState);
    this.version = 0;
    this.history = [
      {
        version: 0,
        state: structuredClone(this.state),
        timestamp: this.config.timestampGenerator(),
      },
    ];
    this.lastSnapshotVersion = 0;

    if (this.config.emitEvents) {
      this.emit('reset', delta);
    }

    return delta;
  }

  /**
   * Clear all state
   */
  clear(): JsonPatchOperation[] {
    return this.setState({});
  }

  /**
   * Clear history only (keep current state)
   */
  clearHistory(): void {
    this.history = [
      {
        version: this.version,
        state: structuredClone(this.state),
        timestamp: this.config.timestampGenerator(),
      },
    ];
  }

  // ============================================================================
  // Cache Operations
  // ============================================================================

  /**
   * Get the delta cache instance (if enabled)
   */
  getDeltaCache(): StateDeltaCache | null {
    return this.deltaCache;
  }

  /**
   * Check if delta caching is enabled
   */
  isCacheEnabled(): boolean {
    return this.deltaCache !== null;
  }

  /**
   * Get cache metrics (if cache is enabled)
   */
  getCacheMetrics(): {
    hits: number;
    misses: number;
    size: number;
    maxSize: number;
    hitRate: number;
    evictions: number;
    preComputedEntries: number;
  } | null {
    return this.deltaCache ? this.deltaCache.getMetrics() : null;
  }

  /**
   * Pre-compute delta for a specific state transition
   * Useful for warming cache with known common transitions
   */
  precomputeTransition(
    fromState: Record<string, unknown>,
    toState: Record<string, unknown>
  ): JsonPatchOperation[] | null {
    return this.deltaCache
      ? this.deltaCache.precompute(fromState, toState)
      : null;
  }

  /**
   * Warm cache with common agent state transitions
   */
  warmCache(): void {
    if (this.deltaCache) {
      this.deltaCache.warmCache();
    }
  }

  /**
   * Clear the delta cache
   */
  clearCache(): void {
    if (this.deltaCache) {
      this.deltaCache.clear();
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new StateManager instance
 */
export function createStateManager(
  config: StateManagerConfig = {}
): StateManager {
  return new StateManager(config);
}

// ============================================================================
// Type Exports
// ============================================================================

export type { PatchResult, DiffConfig };
