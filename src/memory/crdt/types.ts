/**
 * CRDT Type Definitions
 *
 * Conflict-free Replicated Data Types for eventually consistent
 * distributed state across agents.
 *
 * @module memory/crdt/types
 * @see ADR-054: A2A Protocol Integration (distributed state)
 * @see Implementation Plan Task 4.2
 */

// =============================================================================
// Core CRDT Types
// =============================================================================

/**
 * Supported CRDT types in the store
 */
export type CRDTType = 'lww-register' | 'g-counter' | 'pn-counter' | 'or-set';

/**
 * Base state for all CRDTs - includes version for delta tracking
 */
export interface CRDTBaseState {
  /** Version counter for delta replication */
  version: number;
  /** Timestamp of last update */
  lastUpdated: number;
}

// =============================================================================
// LWW-Register Types
// =============================================================================

/**
 * Last-Write-Wins Register state
 */
export interface LWWRegisterState<T> extends CRDTBaseState {
  /** Current value (undefined if never set) */
  value: T | undefined;
  /** Timestamp when value was set */
  timestamp: number;
  /** Node ID that set the value */
  nodeId: string;
}

/**
 * LWW-Register interface for storing single values with timestamp-based conflict resolution
 */
export interface LWWRegister<T> {
  /** Get current value */
  get(): T | undefined;

  /** Set value with optional timestamp (defaults to Date.now()) */
  set(value: T, timestamp?: number): void;

  /** Merge with another register (commutative operation) */
  merge(other: LWWRegister<T>): void;

  /** Get state for replication */
  getState(): LWWRegisterState<T>;

  /** Apply state from another replica */
  applyState(state: LWWRegisterState<T>): void;

  /** Get node ID */
  getNodeId(): string;

  /** Get timestamp of current value */
  getTimestamp(): number;
}

// =============================================================================
// G-Counter Types
// =============================================================================

/**
 * Grow-only Counter state (per-node counts)
 */
export interface GCounterState extends CRDTBaseState {
  /** Map of node ID to count */
  counts: Record<string, number>;
}

/**
 * G-Counter interface - only supports increment operations
 */
export interface GCounter {
  /** Get current total count */
  get(): number;

  /** Increment by n (default 1) */
  increment(n?: number): void;

  /** Merge with another counter (commutative operation) */
  merge(other: GCounter): void;

  /** Get state for replication */
  getState(): GCounterState;

  /** Apply state from another replica */
  applyState(state: GCounterState): void;

  /** Get node ID */
  getNodeId(): string;

  /** Get local count for this node */
  getLocalCount(): number;
}

// =============================================================================
// PN-Counter Types
// =============================================================================

/**
 * Positive-Negative Counter state (two G-Counters)
 */
export interface PNCounterState extends CRDTBaseState {
  /** Positive counter state */
  positive: GCounterState;
  /** Negative counter state */
  negative: GCounterState;
}

/**
 * PN-Counter interface - supports both increment and decrement
 */
export interface PNCounter {
  /** Get current count (positive - negative) */
  get(): number;

  /** Increment by n (default 1) */
  increment(n?: number): void;

  /** Decrement by n (default 1) */
  decrement(n?: number): void;

  /** Merge with another counter (commutative operation) */
  merge(other: PNCounter): void;

  /** Get state for replication */
  getState(): PNCounterState;

  /** Apply state from another replica */
  applyState(state: PNCounterState): void;

  /** Get node ID */
  getNodeId(): string;
}

// =============================================================================
// OR-Set Types
// =============================================================================

/**
 * Element with unique tags for OR-Set
 */
export interface ORSetElement<T> {
  /** Element value */
  value: T;
  /** Unique tags associated with this element */
  tags: Set<string>;
}

/**
 * Observed-Remove Set state
 */
export interface ORSetState<T> extends CRDTBaseState {
  /**
   * Map of serialized elements to their unique tags
   * Tags are unique identifiers (nodeId:timestamp:counter)
   */
  elements: Record<string, string[]>;
  /**
   * Map of serialized elements to tombstone tags (removed tags)
   */
  tombstones: Record<string, string[]>;
}

/**
 * OR-Set interface - set with add-wins semantics on concurrent add/remove
 */
export interface ORSet<T> {
  /** Check if element exists */
  has(element: T): boolean;

  /** Get all elements as array */
  values(): T[];

  /** Get size of set */
  size(): number;

  /** Add element to set */
  add(element: T): void;

  /** Remove element from set */
  remove(element: T): void;

  /** Merge with another set (commutative operation) */
  merge(other: ORSet<T>): void;

  /** Get state for replication */
  getState(): ORSetState<T>;

  /** Apply state from another replica */
  applyState(state: ORSetState<T>): void;

  /** Get node ID */
  getNodeId(): string;

  /** Clear all elements (removes all with tombstones) */
  clear(): void;
}

// =============================================================================
// CRDT Store Types
// =============================================================================

/**
 * Change event emitted by CRDT store
 */
export interface CRDTChangeEvent {
  /** Key that changed */
  key: string;
  /** Type of CRDT */
  type: CRDTType;
  /** Operation that triggered change */
  operation: 'set' | 'increment' | 'decrement' | 'add' | 'remove' | 'merge';
  /** Timestamp of change */
  timestamp: number;
  /** Node that made the change */
  nodeId: string;
}

/**
 * Full store state for replication
 */
export interface CRDTStoreState {
  /** Version of store state */
  version: number;
  /** Timestamp of state */
  timestamp: number;
  /** Node ID */
  nodeId: string;
  /** LWW Registers */
  registers: Record<string, LWWRegisterState<unknown>>;
  /** G-Counters */
  gCounters: Record<string, GCounterState>;
  /** PN-Counters */
  pnCounters: Record<string, PNCounterState>;
  /** OR-Sets */
  sets: Record<string, ORSetState<unknown>>;
}

/**
 * Delta state for efficient incremental replication
 */
export interface CRDTStoreDelta {
  /** Version range this delta covers (from exclusive, to inclusive) */
  fromVersion: number;
  toVersion: number;
  /** Timestamp when delta was generated */
  timestamp: number;
  /** Node ID that generated delta */
  nodeId: string;
  /** Changed registers */
  registers?: Record<string, LWWRegisterState<unknown>>;
  /** Changed G-Counters */
  gCounters?: Record<string, GCounterState>;
  /** Changed PN-Counters */
  pnCounters?: Record<string, PNCounterState>;
  /** Changed OR-Sets */
  sets?: Record<string, ORSetState<unknown>>;
}

/**
 * CRDT Store configuration
 */
export interface CRDTStoreConfig {
  /** Unique node ID for this store instance */
  nodeId: string;
  /** Enable delta tracking for efficient replication */
  enableDeltaTracking?: boolean;
  /** Maximum deltas to keep in history */
  maxDeltaHistory?: number;
}

/**
 * Event listener callback type
 */
export type CRDTChangeListener = (event: CRDTChangeEvent) => void;

/**
 * Unified CRDT Store interface
 */
export interface CRDTStore {
  // -------------------------------------------------------------------------
  // Register Management
  // -------------------------------------------------------------------------

  /** Get a LWW register by key (creates if not exists) */
  getRegister<T>(key: string): LWWRegister<T>;

  /** Set a register value directly */
  setRegister<T>(key: string, value: T): void;

  /** Check if register exists */
  hasRegister(key: string): boolean;

  /** Delete a register */
  deleteRegister(key: string): boolean;

  // -------------------------------------------------------------------------
  // G-Counter Management
  // -------------------------------------------------------------------------

  /** Get a G-Counter by key (creates if not exists) */
  getGCounter(key: string): GCounter;

  /** Increment a G-Counter directly */
  incrementGCounter(key: string, n?: number): void;

  /** Check if G-Counter exists */
  hasGCounter(key: string): boolean;

  /** Delete a G-Counter */
  deleteGCounter(key: string): boolean;

  // -------------------------------------------------------------------------
  // PN-Counter Management
  // -------------------------------------------------------------------------

  /** Get a PN-Counter by key (creates if not exists) */
  getCounter(key: string): PNCounter;

  /** Increment a PN-Counter directly */
  incrementCounter(key: string, n?: number): void;

  /** Decrement a PN-Counter directly */
  decrementCounter(key: string, n?: number): void;

  /** Check if PN-Counter exists */
  hasCounter(key: string): boolean;

  /** Delete a PN-Counter */
  deleteCounter(key: string): boolean;

  // -------------------------------------------------------------------------
  // OR-Set Management
  // -------------------------------------------------------------------------

  /** Get an OR-Set by key (creates if not exists) */
  getSet<T>(key: string): ORSet<T>;

  /** Add element to set directly */
  addToSet<T>(key: string, element: T): void;

  /** Remove element from set directly */
  removeFromSet<T>(key: string, element: T): void;

  /** Check if OR-Set exists */
  hasSet(key: string): boolean;

  /** Delete an OR-Set */
  deleteSet(key: string): boolean;

  // -------------------------------------------------------------------------
  // Store Operations
  // -------------------------------------------------------------------------

  /** Merge entire store with another store */
  merge(other: CRDTStore): void;

  /** Get full store state for replication */
  getState(): CRDTStoreState;

  /** Apply full state from another replica */
  applyState(state: CRDTStoreState): void;

  /** Get delta since version (for efficient sync) */
  getDelta(sinceVersion: number): CRDTStoreDelta | null;

  /** Apply delta from another replica */
  applyDelta(delta: CRDTStoreDelta): void;

  /** Get current version */
  getVersion(): number;

  /** Get node ID */
  getNodeId(): string;

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  /** Subscribe to change events */
  on(event: 'change', callback: CRDTChangeListener): () => void;

  /** Remove all listeners */
  removeAllListeners(): void;

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  /** Get all keys by type */
  keys(type?: CRDTType): string[];

  /** Clear all data */
  clear(): void;

  /** Get statistics */
  getStats(): CRDTStoreStats;
}

/**
 * Store statistics
 */
export interface CRDTStoreStats {
  /** Total number of CRDTs */
  total: number;
  /** Number of registers */
  registers: number;
  /** Number of G-Counters */
  gCounters: number;
  /** Number of PN-Counters */
  pnCounters: number;
  /** Number of OR-Sets */
  sets: number;
  /** Current version */
  version: number;
  /** Node ID */
  nodeId: string;
  /** Deltas in history */
  deltaHistorySize: number;
}

// =============================================================================
// Convergence Tracker Types
// =============================================================================

/**
 * Node state snapshot for convergence tracking
 */
export interface NodeStateSnapshot {
  /** Node ID */
  nodeId: string;
  /** State version */
  version: number;
  /** Timestamp when recorded */
  timestamp: number;
  /** Hash of state (for quick comparison) */
  stateHash: string;
}

/**
 * Convergence status
 */
export interface ConvergenceStatus {
  /** Whether all tracked nodes have converged */
  converged: boolean;
  /** Total number of tracked nodes */
  nodeCount: number;
  /** Number of nodes that are synced */
  syncedNodes: number;
  /** List of node IDs that are behind */
  laggingNodes: string[];
  /** Timestamp of last convergence (null if never converged) */
  lastConvergenceTime: number | null;
  /** Maximum version across all nodes */
  maxVersion: number;
  /** Minimum version across all nodes */
  minVersion: number;
}

/**
 * Convergence tracker configuration
 */
export interface ConvergenceTrackerConfig {
  /** How long to keep node state history (ms) */
  historyRetentionMs?: number;
  /** Consider node stale after this time (ms) */
  staleThresholdMs?: number;
}

/**
 * Convergence tracker interface
 */
export interface ConvergenceTracker {
  /** Record node state */
  recordNodeState(nodeId: string, state: CRDTStoreState): void;

  /** Check if all tracked nodes have converged */
  hasConverged(): boolean;

  /** Get detailed convergence status */
  getStatus(): ConvergenceStatus;

  /** Get list of lagging nodes */
  getLaggingNodes(): string[];

  /** Get time since last convergence (ms, null if never converged) */
  getTimeSinceConvergence(): number | null;

  /** Remove node from tracking */
  removeNode(nodeId: string): void;

  /** Clear all tracked state */
  clear(): void;

  /** Get all tracked node IDs */
  getTrackedNodes(): string[];

  /** Check if a node is being tracked */
  isTracking(nodeId: string): boolean;

  /** Get node's last recorded version */
  getNodeVersion(nodeId: string): number | null;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Serialization options for CRDT state
 */
export interface SerializationOptions {
  /** Include timestamps in output */
  includeTimestamps?: boolean;
  /** Pretty print JSON */
  prettyPrint?: boolean;
}

/**
 * Result of a merge operation
 */
export interface MergeResult {
  /** Whether the merge changed local state */
  changed: boolean;
  /** Number of CRDTs affected */
  affected: number;
  /** Keys that were updated */
  updatedKeys: string[];
}
