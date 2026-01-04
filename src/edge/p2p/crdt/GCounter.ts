/**
 * G-Counter (Grow-only Counter) CRDT Implementation
 *
 * A state-based CRDT that only supports increment operations.
 * Each replica maintains its own count, and the total value
 * is the sum of all replica counts.
 *
 * @module edge/p2p/crdt/GCounter
 * @version 1.0.0
 */

import {
  ReplicaId,
  WallTimestamp,
  CRDTType,
  CRDTState,
  CRDTMetadata,
  SerializedVectorClock,
  SerializedGCounterState,
  MergeResult,
  MergeStats,
  ConflictInfo,
  CRDTDelta,
  DeltaOperation,
  DeltaOpType,
  CRDT,
  CRDTError,
  CRDTErrorCode,
} from './types';
import { VectorClock } from './VectorClock';

// ============================================
// GCounter Class
// ============================================

/**
 * Grow-only counter CRDT.
 *
 * Properties:
 * - Only supports increment (no decrement)
 * - Each replica maintains its own count
 * - Value is sum of all replica counts
 * - Merge takes element-wise maximum
 * - Strongly eventually consistent
 *
 * @example
 * ```typescript
 * const counter = new GCounter('replica-1', 'counter-1');
 *
 * counter.increment();
 * counter.increment(5);
 *
 * console.log(counter.value()); // 6
 *
 * // Merge with remote state
 * counter.merge(remoteState);
 * ```
 */
export class GCounter implements CRDT<number, SerializedGCounterState> {
  /** Unique identifier for this counter */
  private readonly id: string;

  /** Local replica ID */
  private readonly replicaId: ReplicaId;

  /** Per-replica counts */
  private counts: Map<ReplicaId, number>;

  /** Vector clock for versioning */
  private vectorClock: VectorClock;

  /** Metadata */
  private metadata: CRDTMetadata;

  /** Sequence number for deltas */
  private sequenceNumber: number;

  /** Last delta clock for delta generation */
  private lastDeltaClock: VectorClock;

  /**
   * Create a new G-Counter
   *
   * @param replicaId - Local replica identifier
   * @param id - Unique counter identifier
   * @param initialValue - Optional initial value for local replica
   */
  constructor(replicaId: ReplicaId, id: string, initialValue = 0) {
    this.id = id;
    this.replicaId = replicaId;
    this.counts = new Map([[replicaId, Math.max(0, initialValue)]]);
    this.vectorClock = new VectorClock(replicaId);
    this.sequenceNumber = 0;
    this.lastDeltaClock = this.vectorClock.clone();

    const now = Date.now();
    this.metadata = {
      createdAt: now,
      updatedAt: now,
      mergeCount: 0,
      lastModifiedBy: replicaId,
    };

    if (initialValue > 0) {
      this.vectorClock.increment();
    }
  }

  // ============================================
  // Core Operations
  // ============================================

  /**
   * Get the current counter value (sum of all replica counts)
   *
   * @returns Current total count
   */
  value(): number {
    let total = 0;
    for (const count of this.counts.values()) {
      total += count;
    }
    return total;
  }

  /**
   * Increment the counter
   *
   * @param amount - Amount to increment by (must be positive)
   * @returns New value
   * @throws CRDTError if amount is negative
   */
  increment(amount = 1): number {
    if (amount < 0) {
      throw new CRDTError(
        'G-Counter can only be incremented by positive values',
        CRDTErrorCode.UnsupportedOperation,
        this.id
      );
    }

    if (amount === 0) {
      return this.value();
    }

    const current = this.counts.get(this.replicaId) ?? 0;
    this.counts.set(this.replicaId, current + amount);
    this.vectorClock.increment();
    this.metadata.updatedAt = Date.now();
    this.metadata.lastModifiedBy = this.replicaId;
    this.sequenceNumber++;

    return this.value();
  }

  /**
   * Get the count for a specific replica
   *
   * @param replicaId - Replica to query
   * @returns Count for that replica (0 if unknown)
   */
  getReplicaCount(replicaId: ReplicaId): number {
    return this.counts.get(replicaId) ?? 0;
  }

  /**
   * Get all replica IDs contributing to this counter
   *
   * @returns Array of replica IDs
   */
  getReplicas(): ReplicaId[] {
    return Array.from(this.counts.keys());
  }

  // ============================================
  // State Management
  // ============================================

  /**
   * Get the serializable state of this counter
   *
   * @returns CRDT state
   */
  state(): CRDTState<SerializedGCounterState> {
    const countsObj: Record<ReplicaId, number> = {};
    for (const [id, count] of this.counts) {
      countsObj[id] = count;
    }

    return {
      type: CRDTType.GCounter,
      id: this.id,
      vectorClock: this.vectorClock.serialize(),
      origin: this.replicaId,
      value: { counts: countsObj },
      metadata: { ...this.metadata },
      stateVersion: 1,
    };
  }

  /**
   * Restore a G-Counter from serialized state
   *
   * @param state - Serialized state
   * @param replicaId - Local replica ID
   * @returns Restored counter
   */
  static fromState(
    state: CRDTState<SerializedGCounterState>,
    replicaId: ReplicaId
  ): GCounter {
    if (state.type !== CRDTType.GCounter) {
      throw new CRDTError(
        `Invalid CRDT type: expected ${CRDTType.GCounter}, got ${state.type}`,
        CRDTErrorCode.InvalidType,
        state.id
      );
    }

    const counter = new GCounter(replicaId, state.id, 0);

    // Restore counts
    counter.counts.clear();
    for (const [id, count] of Object.entries(state.value.counts)) {
      counter.counts.set(id, count);
    }

    // Restore vector clock
    counter.vectorClock = VectorClock.fromSerialized(
      state.vectorClock,
      replicaId
    );

    // Restore metadata
    counter.metadata = { ...state.metadata };

    return counter;
  }

  // ============================================
  // Merge Operations
  // ============================================

  /**
   * Merge with another G-Counter state
   *
   * Takes the element-wise maximum of all replica counts.
   *
   * @param other - Other counter state to merge
   * @returns Merge result
   */
  merge(other: CRDTState<SerializedGCounterState>): MergeResult<SerializedGCounterState> {
    const startTime = Date.now();
    const conflicts: ConflictInfo[] = [];
    let entriesMerged = 0;
    let localChanged = false;

    if (other.type !== CRDTType.GCounter) {
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

    // Merge counts (element-wise max)
    for (const [replicaId, remoteCount] of Object.entries(other.value.counts)) {
      const localCount = this.counts.get(replicaId) ?? 0;
      const newCount = Math.max(localCount, remoteCount);

      if (newCount !== localCount) {
        this.counts.set(replicaId, newCount);
        localChanged = true;
      }
      entriesMerged++;
    }

    // Merge vector clocks
    const otherClock = VectorClock.fromSerialized(
      other.vectorClock,
      this.replicaId
    );
    this.vectorClock.merge(otherClock);

    // Update metadata
    this.metadata.mergeCount++;
    this.metadata.updatedAt = Date.now();
    if (localChanged) {
      this.metadata.lastModifiedBy = other.origin;
    }

    const stats: MergeStats = {
      duration: Date.now() - startTime,
      entriesMerged,
      autoResolved: 0,
      tombstonesProcessed: 0,
      memoryDelta: entriesMerged * 16, // Approximate
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
  generateDelta(since?: SerializedVectorClock): CRDTDelta<SerializedGCounterState> | null {
    const sinceClock = since
      ? VectorClock.fromSerialized(since, this.replicaId)
      : this.lastDeltaClock;

    // Check if there are any changes
    if (this.vectorClock.compare(sinceClock) !== 'after' &&
        !this.vectorClock.isConcurrent(sinceClock)) {
      return null;
    }

    const operations: DeltaOperation<SerializedGCounterState>[] = [];

    // Only include local replica's count change
    const localCount = this.counts.get(this.replicaId) ?? 0;
    const previousCount = sinceClock.get(this.replicaId);

    if (localCount > 0) {
      operations.push({
        op: DeltaOpType.Increment,
        key: this.replicaId,
        value: { counts: { [this.replicaId]: localCount } },
        replica: this.replicaId,
      });
    }

    if (operations.length === 0) {
      return null;
    }

    const delta: CRDTDelta<SerializedGCounterState> = {
      crdtId: this.id,
      type: CRDTType.GCounter,
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
  applyDelta(delta: CRDTDelta<SerializedGCounterState>): boolean {
    if (delta.type !== CRDTType.GCounter) {
      return false;
    }

    if (delta.crdtId !== this.id) {
      return false;
    }

    let changed = false;

    for (const op of delta.operations) {
      if (op.op === DeltaOpType.Increment && op.value && op.key) {
        const remoteCount = op.value.counts[op.key] ?? 0;
        const localCount = this.counts.get(op.key) ?? 0;

        if (remoteCount > localCount) {
          this.counts.set(op.key, remoteCount);
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
   * Create a deep copy of this counter
   *
   * @returns Cloned counter
   */
  clone(): GCounter {
    const cloned = new GCounter(this.replicaId, this.id, 0);
    cloned.counts = new Map(this.counts);
    cloned.vectorClock = this.vectorClock.clone();
    cloned.metadata = { ...this.metadata };
    cloned.sequenceNumber = this.sequenceNumber;
    cloned.lastDeltaClock = this.lastDeltaClock.clone();
    return cloned;
  }

  /**
   * Get the counter ID
   *
   * @returns Counter ID
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
   * Check if this counter equals another
   *
   * @param other - Counter to compare
   * @returns True if values are equal
   */
  equals(other: GCounter): boolean {
    if (this.id !== other.id) {
      return false;
    }

    if (this.counts.size !== other.counts.size) {
      return false;
    }

    for (const [id, count] of this.counts) {
      if (other.counts.get(id) !== count) {
        return false;
      }
    }

    return true;
  }

  /**
   * Reset the counter (for testing only)
   *
   * @internal
   */
  reset(): void {
    this.counts.clear();
    this.counts.set(this.replicaId, 0);
    this.vectorClock.reset();
    this.sequenceNumber = 0;
    this.lastDeltaClock = this.vectorClock.clone();
    this.metadata.updatedAt = Date.now();
  }

  /**
   * String representation for debugging
   *
   * @returns Debug string
   */
  toString(): string {
    return `GCounter{id=${this.id}, value=${this.value()}, replicas=${this.counts.size}}`;
  }
}
