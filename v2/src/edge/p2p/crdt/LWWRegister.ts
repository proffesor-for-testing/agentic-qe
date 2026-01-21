/**
 * LWW-Register (Last-Writer-Wins Register) CRDT Implementation
 *
 * A state-based CRDT that resolves conflicts using timestamps.
 * The most recent write (highest timestamp) wins during merge.
 * Replica ID is used as a tiebreaker for equal timestamps.
 *
 * @module edge/p2p/crdt/LWWRegister
 * @version 1.0.0
 */

import {
  ReplicaId,
  WallTimestamp,
  CRDTType,
  CRDTState,
  CRDTMetadata,
  SerializedVectorClock,
  SerializedLWWRegisterState,
  MergeResult,
  MergeStats,
  ConflictInfo,
  ConflictType,
  ConflictResolution,
  ResolutionStrategy,
  CRDTDelta,
  DeltaOperation,
  DeltaOpType,
  CRDT,
  CRDTError,
  CRDTErrorCode,
} from './types';
import { VectorClock } from './VectorClock';

// ============================================
// LWWRegister Class
// ============================================

/**
 * Last-Writer-Wins Register CRDT.
 *
 * Properties:
 * - Stores a single value with associated timestamp
 * - Conflicts resolved by comparing timestamps
 * - Higher replica ID wins ties (deterministic)
 * - Strongly eventually consistent
 *
 * @example
 * ```typescript
 * const register = new LWWRegister<string>('replica-1', 'name');
 *
 * register.set('Alice');
 * register.set('Bob');
 *
 * console.log(register.value()); // 'Bob'
 *
 * // Merge with remote state
 * register.merge(remoteState);
 * ```
 */
export class LWWRegister<T> implements CRDT<T | undefined, SerializedLWWRegisterState<T>> {
  /** Unique identifier for this register */
  private readonly id: string;

  /** Local replica ID */
  private readonly replicaId: ReplicaId;

  /** Current value */
  private currentValue: T | undefined;

  /** Timestamp of current value */
  private timestamp: WallTimestamp;

  /** Replica that set current value */
  private valueReplica: ReplicaId;

  /** Vector clock for versioning */
  private vectorClock: VectorClock;

  /** Metadata */
  private metadata: CRDTMetadata;

  /** Sequence number for deltas */
  private sequenceNumber: number;

  /** Last delta clock for delta generation */
  private lastDeltaClock: VectorClock;

  /** Custom comparison function for timestamps */
  private readonly compareTimestamp: (a: WallTimestamp, b: WallTimestamp) => number;

  /**
   * Create a new LWW-Register
   *
   * @param replicaId - Local replica identifier
   * @param id - Unique register identifier
   * @param initialValue - Optional initial value
   * @param compareTimestamp - Optional custom timestamp comparison
   */
  constructor(
    replicaId: ReplicaId,
    id: string,
    initialValue?: T,
    compareTimestamp?: (a: WallTimestamp, b: WallTimestamp) => number
  ) {
    this.id = id;
    this.replicaId = replicaId;
    this.currentValue = initialValue;
    this.timestamp = initialValue !== undefined ? Date.now() : 0;
    this.valueReplica = replicaId;
    this.vectorClock = new VectorClock(replicaId);
    this.sequenceNumber = 0;
    this.lastDeltaClock = this.vectorClock.clone();
    this.compareTimestamp = compareTimestamp ?? ((a, b) => a - b);

    const now = Date.now();
    this.metadata = {
      createdAt: now,
      updatedAt: now,
      mergeCount: 0,
      lastModifiedBy: replicaId,
    };

    if (initialValue !== undefined) {
      this.vectorClock.increment();
    }
  }

  // ============================================
  // Core Operations
  // ============================================

  /**
   * Get the current value
   *
   * @returns Current value or undefined if not set
   */
  value(): T | undefined {
    return this.currentValue;
  }

  /**
   * Set a new value with automatic timestamp
   *
   * @param value - New value to set
   * @returns The set value
   */
  set(value: T): T {
    return this.setWithTimestamp(value, Date.now());
  }

  /**
   * Set a new value with explicit timestamp
   *
   * @param value - New value to set
   * @param timestamp - Timestamp for this write
   * @returns The set value
   */
  setWithTimestamp(value: T, timestamp: WallTimestamp): T {
    // For local writes, always accept if timestamp is >= current
    // (same replica can always update its own value)
    // For remote writes (via merge), use shouldUpdate for proper LWW semantics
    const shouldAccept = timestamp >= this.timestamp;

    if (shouldAccept) {
      this.currentValue = value;
      this.timestamp = timestamp;
      this.valueReplica = this.replicaId;
      this.vectorClock.increment();
      this.metadata.updatedAt = Date.now();
      this.metadata.lastModifiedBy = this.replicaId;
      this.sequenceNumber++;
    }

    return this.currentValue as T;
  }

  /**
   * Get the timestamp of the current value
   *
   * @returns Timestamp
   */
  getTimestamp(): WallTimestamp {
    return this.timestamp;
  }

  /**
   * Get the replica that set the current value
   *
   * @returns Replica ID
   */
  getValueReplica(): ReplicaId {
    return this.valueReplica;
  }

  /**
   * Check if register has a value
   *
   * @returns True if value is set
   */
  hasValue(): boolean {
    return this.currentValue !== undefined;
  }

  /**
   * Clear the register value
   *
   * @returns Previous value
   */
  clear(): T | undefined {
    const prev = this.currentValue;
    this.currentValue = undefined;
    this.timestamp = Date.now();
    this.valueReplica = this.replicaId;
    this.vectorClock.increment();
    this.metadata.updatedAt = Date.now();
    this.metadata.lastModifiedBy = this.replicaId;
    this.sequenceNumber++;
    return prev;
  }

  // ============================================
  // State Management
  // ============================================

  /**
   * Get the serializable state of this register
   *
   * @returns CRDT state
   */
  state(): CRDTState<SerializedLWWRegisterState<T>> {
    return {
      type: CRDTType.LWWRegister,
      id: this.id,
      vectorClock: this.vectorClock.serialize(),
      origin: this.replicaId,
      value: {
        value: this.currentValue as T,
        timestamp: this.timestamp,
        replica: this.valueReplica,
      },
      metadata: { ...this.metadata },
      stateVersion: 1,
    };
  }

  /**
   * Restore an LWW-Register from serialized state
   *
   * @param state - Serialized state
   * @param replicaId - Local replica ID
   * @returns Restored register
   */
  static fromState<T>(
    state: CRDTState<SerializedLWWRegisterState<T>>,
    replicaId: ReplicaId
  ): LWWRegister<T> {
    if (state.type !== CRDTType.LWWRegister) {
      throw new CRDTError(
        `Invalid CRDT type: expected ${CRDTType.LWWRegister}, got ${state.type}`,
        CRDTErrorCode.InvalidType,
        state.id
      );
    }

    const register = new LWWRegister<T>(replicaId, state.id);

    // Restore value
    register.currentValue = state.value.value;
    register.timestamp = state.value.timestamp;
    register.valueReplica = state.value.replica;

    // Restore vector clock
    register.vectorClock = VectorClock.fromSerialized(
      state.vectorClock,
      replicaId
    );

    // Restore metadata
    register.metadata = { ...state.metadata };

    return register;
  }

  // ============================================
  // Merge Operations
  // ============================================

  /**
   * Determine if a new write should update the value
   *
   * @param newTimestamp - Timestamp of new value
   * @param newReplica - Replica proposing new value
   * @returns True if should update
   */
  private shouldUpdate(newTimestamp: WallTimestamp, newReplica: ReplicaId): boolean {
    const cmp = this.compareTimestamp(newTimestamp, this.timestamp);

    if (cmp > 0) {
      // New timestamp is higher
      return true;
    } else if (cmp === 0) {
      // Equal timestamps, use replica ID as tiebreaker
      return newReplica > this.valueReplica;
    }

    return false;
  }

  /**
   * Merge with another LWW-Register state
   *
   * The value with the highest timestamp wins.
   * Equal timestamps are resolved by comparing replica IDs.
   *
   * @param other - Other register state to merge
   * @returns Merge result
   */
  merge(other: CRDTState<SerializedLWWRegisterState<T>>): MergeResult<SerializedLWWRegisterState<T>> {
    const startTime = Date.now();
    const conflicts: ConflictInfo[] = [];

    if (other.type !== CRDTType.LWWRegister) {
      throw new CRDTError(
        `Cannot merge different CRDT types`,
        CRDTErrorCode.InvalidType,
        this.id
      );
    }

    if (other.id !== this.id) {
      throw new CRDTError(
        `Cannot merge different CRDT instances`,
        CRDTErrorCode.InvalidState,
        this.id
      );
    }

    const otherValue = other.value;
    let localChanged = false;

    // Check for concurrent writes (potential conflict)
    const otherClock = VectorClock.fromSerialized(other.vectorClock, this.replicaId);
    if (this.vectorClock.isConcurrent(otherClock)) {
      // Record conflict
      const conflict: ConflictInfo = {
        conflictId: `${this.id}-${Date.now()}`,
        crdtId: this.id,
        conflictType: ConflictType.ConcurrentUpdate,
        field: 'value',
        localValue: this.currentValue,
        remoteValue: otherValue.value,
        localClock: this.vectorClock.serialize(),
        remoteClock: other.vectorClock,
        detectedAt: Date.now(),
      };

      // Determine winner
      const winner = this.shouldUpdate(otherValue.timestamp, otherValue.replica)
        ? 'remote'
        : 'local';

      conflict.resolution = {
        strategy: ResolutionStrategy.LastWriterWins,
        resolvedValue: winner === 'remote' ? otherValue.value : this.currentValue,
        winner: winner === 'remote' ? otherValue.replica : this.valueReplica,
        reason: `LWW: ${winner} has ${winner === 'remote' ? 'later' : 'earlier or equal'} timestamp`,
        automatic: true,
        resolvedAt: Date.now(),
      };

      conflicts.push(conflict);
    }

    // Apply LWW merge
    if (this.shouldUpdate(otherValue.timestamp, otherValue.replica)) {
      this.currentValue = otherValue.value;
      this.timestamp = otherValue.timestamp;
      this.valueReplica = otherValue.replica;
      localChanged = true;
    }

    // Merge vector clocks
    this.vectorClock.merge(otherClock);

    // Update metadata
    this.metadata.mergeCount++;
    this.metadata.updatedAt = Date.now();
    if (localChanged) {
      this.metadata.lastModifiedBy = other.origin;
    }

    const stats: MergeStats = {
      duration: Date.now() - startTime,
      entriesMerged: 1,
      autoResolved: conflicts.length,
      tombstonesProcessed: 0,
      memoryDelta: 0,
    };

    return {
      success: true,
      mergedState: this.state(),
      localChanged,
      conflicts,
      stats,
    };
  }

  // ============================================
  // Delta Operations
  // ============================================

  /**
   * Generate a delta update since the last sync
   *
   * @param since - Vector clock of last sync (optional)
   * @returns Delta update or null if no changes
   */
  generateDelta(since?: SerializedVectorClock): CRDTDelta<SerializedLWWRegisterState<T>> | null {
    const sinceClock = since
      ? VectorClock.fromSerialized(since, this.replicaId)
      : this.lastDeltaClock;

    // Check if there are any changes
    if (!this.vectorClock.happenedAfter(sinceClock) &&
        !this.vectorClock.isConcurrent(sinceClock)) {
      return null;
    }

    const operations: DeltaOperation<SerializedLWWRegisterState<T>>[] = [{
      op: DeltaOpType.Set,
      value: {
        value: this.currentValue as T,
        timestamp: this.timestamp,
        replica: this.valueReplica,
      },
      timestamp: this.timestamp,
      replica: this.valueReplica,
    }];

    const delta: CRDTDelta<SerializedLWWRegisterState<T>> = {
      crdtId: this.id,
      type: CRDTType.LWWRegister,
      origin: this.replicaId,
      vectorClock: this.vectorClock.serialize(),
      operations,
      sequenceNumber: this.sequenceNumber,
      generatedAt: Date.now(),
    };

    // Update last delta clock
    this.lastDeltaClock = this.vectorClock.clone();

    return delta;
  }

  /**
   * Apply a delta update
   *
   * @param delta - Delta to apply
   * @returns True if applied successfully
   */
  applyDelta(delta: CRDTDelta<SerializedLWWRegisterState<T>>): boolean {
    if (delta.type !== CRDTType.LWWRegister) {
      return false;
    }

    if (delta.crdtId !== this.id) {
      return false;
    }

    let changed = false;

    for (const op of delta.operations) {
      if (op.op === DeltaOpType.Set && op.value && op.timestamp && op.replica) {
        if (this.shouldUpdate(op.timestamp, op.replica)) {
          this.currentValue = op.value.value;
          this.timestamp = op.timestamp;
          this.valueReplica = op.replica;
          changed = true;
        }
      }
    }

    if (changed) {
      const deltaClock = VectorClock.fromSerialized(
        delta.vectorClock,
        this.replicaId
      );
      this.vectorClock.merge(deltaClock);
      this.metadata.updatedAt = Date.now();
      this.metadata.lastModifiedBy = delta.origin;
    }

    return changed;
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Create a deep copy of this register
   *
   * @returns Cloned register
   */
  clone(): LWWRegister<T> {
    const cloned = new LWWRegister<T>(this.replicaId, this.id);
    cloned.currentValue = this.currentValue;
    cloned.timestamp = this.timestamp;
    cloned.valueReplica = this.valueReplica;
    cloned.vectorClock = this.vectorClock.clone();
    cloned.metadata = { ...this.metadata };
    cloned.sequenceNumber = this.sequenceNumber;
    cloned.lastDeltaClock = this.lastDeltaClock.clone();
    return cloned;
  }

  /**
   * Get the register ID
   *
   * @returns Register ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get the local replica ID
   *
   * @returns Replica ID
   */
  getReplicaId(): ReplicaId {
    return this.replicaId;
  }

  /**
   * Get the vector clock
   *
   * @returns Vector clock copy
   */
  getVectorClock(): VectorClock {
    return this.vectorClock.clone();
  }

  /**
   * Get metadata
   *
   * @returns Metadata copy
   */
  getMetadata(): CRDTMetadata {
    return { ...this.metadata };
  }

  /**
   * Check if this register equals another
   *
   * @param other - Register to compare
   * @returns True if values and timestamps are equal
   */
  equals(other: LWWRegister<T>): boolean {
    if (this.id !== other.id) {
      return false;
    }

    if (this.timestamp !== other.timestamp) {
      return false;
    }

    if (this.valueReplica !== other.valueReplica) {
      return false;
    }

    // Deep compare values
    return JSON.stringify(this.currentValue) === JSON.stringify(other.currentValue);
  }

  /**
   * String representation for debugging
   *
   * @returns Debug string
   */
  toString(): string {
    const valueStr = this.currentValue !== undefined
      ? JSON.stringify(this.currentValue).slice(0, 50)
      : 'undefined';
    return `LWWRegister{id=${this.id}, value=${valueStr}, ts=${this.timestamp}, replica=${this.valueReplica}}`;
  }
}
