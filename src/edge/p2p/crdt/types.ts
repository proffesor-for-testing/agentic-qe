/**
 * CRDT Types for P2P Conflict Resolution
 *
 * Type definitions for Conflict-free Replicated Data Types (CRDTs)
 * enabling automatic conflict resolution in distributed pattern storage.
 *
 * @module edge/p2p/crdt/types
 * @version 1.0.0
 */

// ============================================
// Constants
// ============================================

/**
 * CRDT protocol version
 */
export const CRDT_PROTOCOL_VERSION = '1.0.0';

/**
 * Maximum vector clock entries before compaction
 */
export const MAX_VECTOR_CLOCK_SIZE = 1000;

/**
 * Default tombstone TTL in milliseconds (7 days)
 */
export const DEFAULT_TOMBSTONE_TTL = 7 * 24 * 60 * 60 * 1000;

/**
 * Maximum merge depth for recursive structures
 */
export const MAX_MERGE_DEPTH = 100;

// ============================================
// CRDT Type Enumeration
// ============================================

/**
 * Types of CRDTs supported by the system
 */
export enum CRDTType {
  /** Grow-only counter - can only increment */
  GCounter = 'g-counter',

  /** Positive-Negative counter - supports increment and decrement */
  PNCounter = 'pn-counter',

  /** Last-Writer-Wins Register - timestamp-based resolution */
  LWWRegister = 'lww-register',

  /** Observed-Remove Set - handles concurrent add/remove */
  ORSet = 'or-set',

  /** Multi-Value Register - preserves concurrent writes */
  MVRegister = 'mv-register',

  /** Last-Writer-Wins Map - nested LWW registers */
  LWWMap = 'lww-map',

  /** Pattern CRDT - specialized for SharedPattern objects */
  PatternCRDT = 'pattern-crdt',
}

// ============================================
// Replica and Clock Types
// ============================================

/**
 * Unique identifier for a replica/node in the distributed system
 */
export type ReplicaId = string;

/**
 * Logical timestamp within a replica
 */
export type LogicalTimestamp = number;

/**
 * Wall-clock timestamp with high precision
 */
export type WallTimestamp = number;

/**
 * Vector clock for tracking causality across replicas
 */
export interface VectorClockState {
  /** Map of replica ID to logical timestamp */
  entries: Map<ReplicaId, LogicalTimestamp>;

  /** Last modified timestamp */
  lastModified: WallTimestamp;
}

/**
 * Serializable version of VectorClockState
 */
export interface SerializedVectorClock {
  /** Entries as a plain object */
  entries: Record<ReplicaId, LogicalTimestamp>;

  /** Last modified timestamp */
  lastModified: WallTimestamp;
}

/**
 * Comparison result for vector clocks
 */
export enum VectorClockComparison {
  /** Clocks are equal */
  Equal = 'equal',

  /** First clock happened before second */
  Before = 'before',

  /** First clock happened after second */
  After = 'after',

  /** Clocks are concurrent (incomparable) */
  Concurrent = 'concurrent',
}

// ============================================
// Base CRDT State
// ============================================

/**
 * Base state interface for all CRDTs
 */
export interface CRDTState<T = unknown> {
  /** CRDT type identifier */
  type: CRDTType;

  /** Unique identifier for this CRDT instance */
  id: string;

  /** Vector clock for versioning */
  vectorClock: SerializedVectorClock;

  /** The replica that created this state */
  origin: ReplicaId;

  /** Current value of the CRDT */
  value: T;

  /** Metadata for debugging and auditing */
  metadata: CRDTMetadata;

  /** State version for schema migrations */
  stateVersion: number;
}

/**
 * Metadata attached to CRDT state
 */
export interface CRDTMetadata {
  /** Creation timestamp */
  createdAt: WallTimestamp;

  /** Last update timestamp */
  updatedAt: WallTimestamp;

  /** Number of merges performed */
  mergeCount: number;

  /** Last replica to modify */
  lastModifiedBy: ReplicaId;

  /** Custom tags for categorization */
  tags?: string[];

  /** Additional custom metadata */
  custom?: Record<string, unknown>;
}

// ============================================
// Merge Types
// ============================================

/**
 * Result of a CRDT merge operation
 */
export interface MergeResult<T = unknown> {
  /** Whether the merge was successful */
  success: boolean;

  /** The merged state */
  mergedState: CRDTState<T>;

  /** Whether the local state changed */
  localChanged: boolean;

  /** Conflicts detected during merge */
  conflicts: ConflictInfo[];

  /** Statistics about the merge */
  stats: MergeStats;
}

/**
 * Statistics from a merge operation
 */
export interface MergeStats {
  /** Time taken for merge in milliseconds */
  duration: number;

  /** Number of entries merged */
  entriesMerged: number;

  /** Number of conflicts resolved automatically */
  autoResolved: number;

  /** Number of tombstones processed */
  tombstonesProcessed: number;

  /** Memory delta (bytes) */
  memoryDelta: number;
}

/**
 * Information about a conflict detected during merge
 */
export interface ConflictInfo {
  /** Unique conflict identifier */
  conflictId: string;

  /** CRDT instance ID */
  crdtId: string;

  /** Type of conflict */
  conflictType: ConflictType;

  /** Field or key where conflict occurred */
  field?: string;

  /** Local value at conflict */
  localValue: unknown;

  /** Remote value at conflict */
  remoteValue: unknown;

  /** Local vector clock at conflict */
  localClock: SerializedVectorClock;

  /** Remote vector clock at conflict */
  remoteClock: SerializedVectorClock;

  /** Resolution applied (if auto-resolved) */
  resolution?: ConflictResolution;

  /** Timestamp when conflict was detected */
  detectedAt: WallTimestamp;
}

/**
 * Types of conflicts that can occur
 */
export enum ConflictType {
  /** Concurrent modifications to same field */
  ConcurrentUpdate = 'concurrent_update',

  /** Concurrent add and remove of same element */
  AddRemove = 'add_remove',

  /** Type mismatch between values */
  TypeMismatch = 'type_mismatch',

  /** Schema version incompatibility */
  SchemaVersion = 'schema_version',

  /** Clock divergence beyond threshold */
  ClockDivergence = 'clock_divergence',

  /** Tombstone resurrection */
  TombstoneResurrection = 'tombstone_resurrection',
}

/**
 * Resolution strategy and details for a conflict
 */
export interface ConflictResolution {
  /** Strategy used to resolve */
  strategy: ResolutionStrategy;

  /** The chosen/resolved value */
  resolvedValue: unknown;

  /** Replica that won (if applicable) */
  winner?: ReplicaId;

  /** Reason for the resolution */
  reason: string;

  /** Whether resolution was automatic */
  automatic: boolean;

  /** Timestamp of resolution */
  resolvedAt: WallTimestamp;
}

/**
 * Strategies for resolving conflicts
 */
export enum ResolutionStrategy {
  /** Last writer wins based on timestamp */
  LastWriterWins = 'lww',

  /** First writer wins */
  FirstWriterWins = 'fww',

  /** Prefer higher replica ID (deterministic) */
  HigherReplicaWins = 'higher_replica',

  /** Merge values (for compatible types) */
  Merge = 'merge',

  /** Keep both values (for multi-value types) */
  KeepBoth = 'keep_both',

  /** Prefer local value */
  PreferLocal = 'prefer_local',

  /** Prefer remote value */
  PreferRemote = 'prefer_remote',

  /** Custom resolution function */
  Custom = 'custom',
}

// ============================================
// Delta Types for Incremental Sync
// ============================================

/**
 * Delta update for efficient synchronization
 */
export interface CRDTDelta<T = unknown> {
  /** CRDT instance ID */
  crdtId: string;

  /** CRDT type */
  type: CRDTType;

  /** Origin replica that generated delta */
  origin: ReplicaId;

  /** Vector clock at delta generation */
  vectorClock: SerializedVectorClock;

  /** The delta operations */
  operations: DeltaOperation<T>[];

  /** Sequence number for ordering */
  sequenceNumber: number;

  /** Timestamp of delta generation */
  generatedAt: WallTimestamp;
}

/**
 * Single operation within a delta
 */
export interface DeltaOperation<T = unknown> {
  /** Operation type */
  op: DeltaOpType;

  /** Key or path for the operation */
  key?: string;

  /** Value for the operation */
  value?: T;

  /** Timestamp for LWW operations */
  timestamp?: WallTimestamp;

  /** Tag for ORSet operations */
  tag?: string;

  /** Replica that performed the operation */
  replica: ReplicaId;
}

/**
 * Types of delta operations
 */
export enum DeltaOpType {
  /** Set a value */
  Set = 'set',

  /** Increment a counter */
  Increment = 'increment',

  /** Decrement a counter */
  Decrement = 'decrement',

  /** Add to a set */
  Add = 'add',

  /** Remove from a set */
  Remove = 'remove',

  /** Clear all values */
  Clear = 'clear',
}

// ============================================
// Tombstone Types
// ============================================

/**
 * Tombstone for tracking deletions
 */
export interface Tombstone {
  /** Unique tombstone identifier */
  id: string;

  /** ID of the deleted element */
  elementId: string;

  /** CRDT instance ID */
  crdtId: string;

  /** Replica that created tombstone */
  deletedBy: ReplicaId;

  /** Vector clock at deletion */
  vectorClock: SerializedVectorClock;

  /** Creation timestamp */
  createdAt: WallTimestamp;

  /** Expiration timestamp */
  expiresAt: WallTimestamp;

  /** Whether tombstone has been garbage collected */
  collected: boolean;
}

/**
 * Tombstone garbage collection result
 */
export interface GCResult {
  /** Number of tombstones collected */
  collected: number;

  /** Number of tombstones retained */
  retained: number;

  /** Memory freed in bytes */
  memoryFreed: number;

  /** Time taken in milliseconds */
  duration: number;

  /** Oldest remaining tombstone */
  oldestRemaining?: WallTimestamp;
}

// ============================================
// GCounter Types
// ============================================

/**
 * State for a grow-only counter
 */
export interface GCounterState {
  /** Per-replica counts */
  counts: Map<ReplicaId, number>;
}

/**
 * Serializable GCounter state
 */
export interface SerializedGCounterState {
  /** Per-replica counts as object */
  counts: Record<ReplicaId, number>;
}

// ============================================
// PNCounter Types
// ============================================

/**
 * State for a positive-negative counter
 */
export interface PNCounterState {
  /** Positive counts per replica */
  positive: Map<ReplicaId, number>;

  /** Negative counts per replica */
  negative: Map<ReplicaId, number>;
}

/**
 * Serializable PNCounter state
 */
export interface SerializedPNCounterState {
  /** Positive counts */
  positive: Record<ReplicaId, number>;

  /** Negative counts */
  negative: Record<ReplicaId, number>;
}

// ============================================
// LWWRegister Types
// ============================================

/**
 * State for a last-writer-wins register
 */
export interface LWWRegisterState<T = unknown> {
  /** Current value */
  value: T;

  /** Timestamp of last write */
  timestamp: WallTimestamp;

  /** Replica that performed last write */
  replica: ReplicaId;
}

/**
 * Serializable LWWRegister state
 */
export interface SerializedLWWRegisterState<T = unknown> {
  /** Current value */
  value: T;

  /** Timestamp of last write */
  timestamp: WallTimestamp;

  /** Replica ID */
  replica: ReplicaId;
}

// ============================================
// ORSet Types
// ============================================

/**
 * Tagged element in an ORSet
 */
export interface ORSetElement<T = unknown> {
  /** The value */
  value: T;

  /** Unique tag for this add operation */
  tag: string;

  /** Replica that added */
  addedBy: ReplicaId;

  /** Timestamp of addition */
  addedAt: WallTimestamp;
}

/**
 * State for an observed-remove set
 */
export interface ORSetState<T = unknown> {
  /** Active elements (not removed) */
  elements: Map<string, ORSetElement<T>>;

  /** Tombstones for removed elements */
  tombstones: Map<string, Tombstone>;
}

/**
 * Serializable ORSet state
 */
export interface SerializedORSetState<T = unknown> {
  /** Active elements */
  elements: Array<{
    tag: string;
    value: T;
    addedBy: ReplicaId;
    addedAt: WallTimestamp;
  }>;

  /** Tombstone tags */
  tombstones: string[];
}

// ============================================
// MVRegister Types
// ============================================

/**
 * Versioned value in a multi-value register
 */
export interface MVRegisterValue<T = unknown> {
  /** The value */
  value: T;

  /** Vector clock for this value */
  vectorClock: SerializedVectorClock;

  /** Replica that set this value */
  replica: ReplicaId;
}

/**
 * State for a multi-value register
 */
export interface MVRegisterState<T = unknown> {
  /** All concurrent values */
  values: MVRegisterValue<T>[];
}

// ============================================
// Pattern CRDT Types
// ============================================

/**
 * Fields in a SharedPattern that use different CRDT strategies
 */
export interface PatternCRDTFields {
  /** Pattern ID (immutable) */
  id: string;

  /** Content (LWW) */
  content: LWWRegisterState<string>;

  /** Type (LWW) */
  type: LWWRegisterState<string>;

  /** Category (LWW) */
  category: LWWRegisterState<string>;

  /** Domain (LWW) */
  domain: LWWRegisterState<string>;

  /** Tags (ORSet) */
  tags: ORSetState<string>;

  /** Metadata (LWW Map) */
  metadata: Map<string, LWWRegisterState<unknown>>;

  /** Quality metrics (LWW) */
  quality: LWWRegisterState<PatternQualityMetrics>;

  /** Usage count (GCounter) */
  usageCount: GCounterState;

  /** Sharing config (LWW) */
  sharingConfig: LWWRegisterState<PatternSharingConfigData>;
}

/**
 * Quality metrics for patterns (from sharing types)
 */
export interface PatternQualityMetrics {
  /** Quality level */
  level: string;

  /** Success rate (0-1) */
  successRate: number;

  /** Unique users count */
  uniqueUsers: number;

  /** Average confidence */
  avgConfidence: number;

  /** Feedback score */
  feedbackScore: number;
}

/**
 * Sharing configuration data
 */
export interface PatternSharingConfigData {
  /** Policy name */
  policy: string;

  /** Privacy level */
  privacyLevel: string;

  /** Allowed peers */
  allowedPeers?: string[];

  /** Whether redistributable */
  redistributable: boolean;
}

/**
 * Serialized PatternCRDT state
 */
export interface SerializedPatternCRDTState {
  /** Pattern ID */
  id: string;

  /** LWW fields */
  content: SerializedLWWRegisterState<string>;
  type: SerializedLWWRegisterState<string>;
  category: SerializedLWWRegisterState<string>;
  domain: SerializedLWWRegisterState<string>;

  /** ORSet fields */
  tags: SerializedORSetState<string>;

  /** LWW Map metadata */
  metadata: Record<string, SerializedLWWRegisterState<unknown>>;

  /** Quality (LWW) */
  quality: SerializedLWWRegisterState<PatternQualityMetrics>;

  /** Usage count (GCounter) */
  usageCount: SerializedGCounterState;

  /** Sharing config (LWW) */
  sharingConfig: SerializedLWWRegisterState<PatternSharingConfigData>;
}

// ============================================
// Store Types
// ============================================

/**
 * Configuration for a CRDT store
 */
export interface CRDTStoreConfig {
  /** Local replica ID */
  replicaId: ReplicaId;

  /** Maximum number of CRDT instances */
  maxInstances: number;

  /** Tombstone TTL in milliseconds */
  tombstoneTtl: number;

  /** Enable automatic garbage collection */
  autoGC: boolean;

  /** GC interval in milliseconds */
  gcInterval: number;

  /** Enable delta generation for sync */
  enableDeltas: boolean;

  /** Maximum delta buffer size */
  maxDeltaBuffer: number;

  /** Enable conflict tracking */
  trackConflicts: boolean;

  /** Maximum conflicts to retain */
  maxConflicts: number;
}

/**
 * Default store configuration
 */
export const DEFAULT_STORE_CONFIG: CRDTStoreConfig = {
  replicaId: '',
  maxInstances: 10000,
  tombstoneTtl: DEFAULT_TOMBSTONE_TTL,
  autoGC: true,
  gcInterval: 60000, // 1 minute
  enableDeltas: true,
  maxDeltaBuffer: 1000,
  trackConflicts: true,
  maxConflicts: 100,
};

/**
 * Store statistics
 */
export interface CRDTStoreStats {
  /** Total CRDT instances */
  totalInstances: number;

  /** Instances by type */
  byType: Record<CRDTType, number>;

  /** Total tombstones */
  totalTombstones: number;

  /** Pending deltas */
  pendingDeltas: number;

  /** Total conflicts recorded */
  totalConflicts: number;

  /** Memory usage estimate in bytes */
  memoryUsage: number;

  /** Last GC timestamp */
  lastGC?: WallTimestamp;

  /** Last sync timestamp */
  lastSync?: WallTimestamp;
}

// ============================================
// Event Types
// ============================================

/**
 * CRDT event types
 */
export enum CRDTEventType {
  /** Value was updated */
  Update = 'update',

  /** Merge was performed */
  Merge = 'merge',

  /** Conflict was detected */
  Conflict = 'conflict',

  /** Conflict was resolved */
  ConflictResolved = 'conflict_resolved',

  /** GC was performed */
  GarbageCollected = 'gc',

  /** Delta was generated */
  DeltaGenerated = 'delta',

  /** Instance was created */
  Created = 'created',

  /** Instance was deleted */
  Deleted = 'deleted',
}

/**
 * CRDT event payload
 */
export interface CRDTEvent {
  /** Event type */
  type: CRDTEventType;

  /** CRDT instance ID */
  crdtId: string;

  /** CRDT type */
  crdtType: CRDTType;

  /** Event timestamp */
  timestamp: WallTimestamp;

  /** Event details */
  details: unknown;
}

/**
 * Event handler type
 */
export type CRDTEventHandler = (event: CRDTEvent) => void;

// ============================================
// Error Types
// ============================================

/**
 * CRDT error codes
 */
export enum CRDTErrorCode {
  /** Invalid CRDT type */
  InvalidType = 'INVALID_TYPE',

  /** CRDT not found */
  NotFound = 'NOT_FOUND',

  /** Merge failed */
  MergeFailed = 'MERGE_FAILED',

  /** Serialization error */
  SerializationError = 'SERIALIZATION_ERROR',

  /** Deserialization error */
  DeserializationError = 'DESERIALIZATION_ERROR',

  /** Invalid state */
  InvalidState = 'INVALID_STATE',

  /** Store full */
  StoreFull = 'STORE_FULL',

  /** Clock error */
  ClockError = 'CLOCK_ERROR',

  /** Schema mismatch */
  SchemaMismatch = 'SCHEMA_MISMATCH',

  /** Operation not supported */
  UnsupportedOperation = 'UNSUPPORTED_OPERATION',
}

/**
 * CRDT-specific error class
 */
export class CRDTError extends Error {
  constructor(
    message: string,
    public readonly code: CRDTErrorCode,
    public readonly crdtId?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'CRDTError';
  }
}

// ============================================
// Utility Types
// ============================================

/**
 * CRDT interface that all implementations must follow
 */
export interface CRDT<T, S> {
  /** Get current value */
  value(): T;

  /** Get serializable state */
  state(): CRDTState<S>;

  /** Merge with another state */
  merge(other: CRDTState<S>): MergeResult<S>;

  /** Generate delta since last sync */
  generateDelta(since?: SerializedVectorClock): CRDTDelta<S> | null;

  /** Apply delta update */
  applyDelta(delta: CRDTDelta<S>): boolean;

  /** Clone the CRDT */
  clone(): CRDT<T, S>;
}

/**
 * Factory for creating CRDTs
 */
export interface CRDTFactory {
  /** Create a new CRDT instance */
  create<T, S>(
    type: CRDTType,
    id: string,
    replicaId: ReplicaId,
    initialValue?: T
  ): CRDT<T, S>;

  /** Restore CRDT from serialized state */
  restore<T, S>(state: CRDTState<S>): CRDT<T, S>;
}

/**
 * Serialization utilities interface
 */
export interface CRDTSerializer {
  /** Serialize CRDT state to JSON */
  serialize<S>(state: CRDTState<S>): string;

  /** Deserialize CRDT state from JSON */
  deserialize<S>(json: string): CRDTState<S>;

  /** Serialize delta to binary */
  serializeDelta<S>(delta: CRDTDelta<S>): Uint8Array;

  /** Deserialize delta from binary */
  deserializeDelta<S>(data: Uint8Array): CRDTDelta<S>;
}
