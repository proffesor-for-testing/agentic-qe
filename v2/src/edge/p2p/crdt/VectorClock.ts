/**
 * Vector Clock Implementation for Distributed Systems
 *
 * Provides causality tracking across distributed replicas using vector clocks.
 * Enables detection of concurrent operations and proper merge ordering.
 *
 * @module edge/p2p/crdt/VectorClock
 * @version 1.0.0
 */

import {
  ReplicaId,
  LogicalTimestamp,
  WallTimestamp,
  VectorClockState,
  SerializedVectorClock,
  VectorClockComparison,
  MAX_VECTOR_CLOCK_SIZE,
  CRDTError,
  CRDTErrorCode,
} from './types';

// ============================================
// Vector Clock Class
// ============================================

/**
 * Vector clock for tracking causality in distributed systems.
 *
 * A vector clock is a map from replica IDs to logical timestamps.
 * It enables detection of happens-before relationships and concurrent events.
 *
 * @example
 * ```typescript
 * const clock = new VectorClock('replica-1');
 * clock.increment();
 * clock.increment();
 *
 * const otherClock = VectorClock.fromSerialized(remoteClock);
 * const comparison = clock.compare(otherClock);
 *
 * if (comparison === VectorClockComparison.Concurrent) {
 *   // Handle concurrent modifications
 * }
 *
 * clock.merge(otherClock);
 * ```
 */
export class VectorClock {
  /** Internal clock state */
  private entries: Map<ReplicaId, LogicalTimestamp>;

  /** Last modification timestamp */
  private lastModified: WallTimestamp;

  /** Local replica ID */
  private readonly localReplicaId: ReplicaId;

  /**
   * Create a new vector clock
   *
   * @param replicaId - Local replica identifier
   * @param initial - Optional initial entries
   */
  constructor(replicaId: ReplicaId, initial?: Map<ReplicaId, LogicalTimestamp>) {
    this.localReplicaId = replicaId;
    this.entries = initial ? new Map(initial) : new Map();
    this.lastModified = Date.now();

    // Initialize local replica entry if not present
    if (!this.entries.has(replicaId)) {
      this.entries.set(replicaId, 0);
    }
  }

  // ============================================
  // Core Operations
  // ============================================

  /**
   * Increment the clock for the local replica
   *
   * @returns The new timestamp for this replica
   */
  increment(): LogicalTimestamp {
    const current = this.entries.get(this.localReplicaId) ?? 0;
    const next = current + 1;
    this.entries.set(this.localReplicaId, next);
    this.lastModified = Date.now();
    return next;
  }

  /**
   * Increment and return the updated clock (for chaining)
   *
   * @returns This clock instance
   */
  tick(): VectorClock {
    this.increment();
    return this;
  }

  /**
   * Get the timestamp for a specific replica
   *
   * @param replicaId - Replica to query
   * @returns Timestamp or 0 if replica unknown
   */
  get(replicaId: ReplicaId): LogicalTimestamp {
    return this.entries.get(replicaId) ?? 0;
  }

  /**
   * Get the local replica's timestamp
   *
   * @returns Local timestamp
   */
  getLocal(): LogicalTimestamp {
    return this.get(this.localReplicaId);
  }

  /**
   * Set the timestamp for a replica
   *
   * @param replicaId - Replica to update
   * @param timestamp - New timestamp
   */
  set(replicaId: ReplicaId, timestamp: LogicalTimestamp): void {
    if (timestamp < 0) {
      throw new CRDTError(
        'Timestamp must be non-negative',
        CRDTErrorCode.ClockError
      );
    }
    this.entries.set(replicaId, timestamp);
    this.lastModified = Date.now();
  }

  /**
   * Get all replica IDs in the clock
   *
   * @returns Array of replica IDs
   */
  replicas(): ReplicaId[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Get the number of replicas tracked
   *
   * @returns Number of entries
   */
  size(): number {
    return this.entries.size;
  }

  // ============================================
  // Comparison Operations
  // ============================================

  /**
   * Compare this clock with another clock
   *
   * Returns:
   * - Equal: Clocks are identical
   * - Before: This clock happened before other
   * - After: This clock happened after other
   * - Concurrent: Clocks are incomparable (concurrent events)
   *
   * @param other - Clock to compare with
   * @returns Comparison result
   */
  compare(other: VectorClock): VectorClockComparison {
    const allReplicas = new Set([
      ...this.entries.keys(),
      ...other.entries.keys(),
    ]);

    let lessThan = false;
    let greaterThan = false;

    for (const replica of allReplicas) {
      const thisTime = this.get(replica);
      const otherTime = other.get(replica);

      if (thisTime < otherTime) {
        lessThan = true;
      } else if (thisTime > otherTime) {
        greaterThan = true;
      }

      // Early exit if already concurrent
      if (lessThan && greaterThan) {
        return VectorClockComparison.Concurrent;
      }
    }

    if (!lessThan && !greaterThan) {
      return VectorClockComparison.Equal;
    } else if (lessThan && !greaterThan) {
      return VectorClockComparison.Before;
    } else if (!lessThan && greaterThan) {
      return VectorClockComparison.After;
    } else {
      return VectorClockComparison.Concurrent;
    }
  }

  /**
   * Check if this clock happened before another
   *
   * @param other - Clock to compare with
   * @returns True if this happened before other
   */
  happenedBefore(other: VectorClock): boolean {
    return this.compare(other) === VectorClockComparison.Before;
  }

  /**
   * Check if this clock happened after another
   *
   * @param other - Clock to compare with
   * @returns True if this happened after other
   */
  happenedAfter(other: VectorClock): boolean {
    return this.compare(other) === VectorClockComparison.After;
  }

  /**
   * Check if this clock is concurrent with another
   *
   * @param other - Clock to compare with
   * @returns True if clocks are concurrent
   */
  isConcurrent(other: VectorClock): boolean {
    return this.compare(other) === VectorClockComparison.Concurrent;
  }

  /**
   * Check if clocks are equal
   *
   * @param other - Clock to compare with
   * @returns True if clocks are equal
   */
  equals(other: VectorClock): boolean {
    return this.compare(other) === VectorClockComparison.Equal;
  }

  /**
   * Check if this clock descends from another (happened after or equal)
   *
   * @param other - Clock to compare with
   * @returns True if this descends from other
   */
  descendsFrom(other: VectorClock): boolean {
    const comparison = this.compare(other);
    return (
      comparison === VectorClockComparison.After ||
      comparison === VectorClockComparison.Equal
    );
  }

  // ============================================
  // Merge Operations
  // ============================================

  /**
   * Merge with another clock (element-wise maximum)
   *
   * The merge takes the maximum timestamp for each replica,
   * ensuring the merged clock dominates both input clocks.
   *
   * @param other - Clock to merge with
   * @returns This clock (mutated)
   */
  merge(other: VectorClock): VectorClock {
    const allReplicas = new Set([
      ...this.entries.keys(),
      ...other.entries.keys(),
    ]);

    for (const replica of allReplicas) {
      const thisTime = this.get(replica);
      const otherTime = other.get(replica);
      this.entries.set(replica, Math.max(thisTime, otherTime));
    }

    this.lastModified = Date.now();
    this.compact();
    return this;
  }

  /**
   * Create a merged clock without modifying this clock
   *
   * @param other - Clock to merge with
   * @returns New merged clock
   */
  merged(other: VectorClock): VectorClock {
    return this.clone().merge(other);
  }

  /**
   * Update this clock to receive a message from another replica
   *
   * This performs the standard vector clock receive operation:
   * 1. Merge with the message's clock
   * 2. Increment local replica's timestamp
   *
   * @param messageClock - Clock from received message
   * @returns This clock (mutated)
   */
  receive(messageClock: VectorClock): VectorClock {
    this.merge(messageClock);
    this.increment();
    return this;
  }

  // ============================================
  // Compaction
  // ============================================

  /**
   * Compact the clock by removing zero entries for non-local replicas
   *
   * @returns Number of entries removed
   */
  compact(): number {
    if (this.entries.size <= MAX_VECTOR_CLOCK_SIZE) {
      return 0;
    }

    let removed = 0;

    // Sort entries by timestamp (ascending) and remove lowest
    const sortedEntries = Array.from(this.entries.entries())
      .filter(([id]) => id !== this.localReplicaId)
      .sort((a, b) => a[1] - b[1]);

    const toRemove = this.entries.size - MAX_VECTOR_CLOCK_SIZE;
    for (let i = 0; i < toRemove && i < sortedEntries.length; i++) {
      const [id, timestamp] = sortedEntries[i];
      // Only remove if timestamp is 0 or very old
      if (timestamp === 0) {
        this.entries.delete(id);
        removed++;
      }
    }

    return removed;
  }

  // ============================================
  // Serialization
  // ============================================

  /**
   * Convert to serializable format
   *
   * @returns Serialized vector clock
   */
  serialize(): SerializedVectorClock {
    const entries: Record<ReplicaId, LogicalTimestamp> = {};
    for (const [id, timestamp] of this.entries) {
      entries[id] = timestamp;
    }
    return {
      entries,
      lastModified: this.lastModified,
    };
  }

  /**
   * Create a vector clock from serialized data
   *
   * @param serialized - Serialized clock data
   * @param replicaId - Local replica ID
   * @returns New vector clock
   */
  static fromSerialized(
    serialized: SerializedVectorClock,
    replicaId: ReplicaId
  ): VectorClock {
    const entries = new Map<ReplicaId, LogicalTimestamp>();
    for (const [id, timestamp] of Object.entries(serialized.entries)) {
      entries.set(id, timestamp);
    }
    const clock = new VectorClock(replicaId, entries);
    clock.lastModified = serialized.lastModified;
    return clock;
  }

  /**
   * Convert to JSON string
   *
   * @returns JSON representation
   */
  toJSON(): string {
    return JSON.stringify(this.serialize());
  }

  /**
   * Parse from JSON string
   *
   * @param json - JSON string
   * @param replicaId - Local replica ID
   * @returns Parsed vector clock
   */
  static fromJSON(json: string, replicaId: ReplicaId): VectorClock {
    try {
      const parsed = JSON.parse(json) as SerializedVectorClock;
      return VectorClock.fromSerialized(parsed, replicaId);
    } catch (error) {
      throw new CRDTError(
        `Failed to parse vector clock: ${error instanceof Error ? error.message : String(error)}`,
        CRDTErrorCode.DeserializationError
      );
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Create a deep copy of this clock
   *
   * @returns Cloned vector clock
   */
  clone(): VectorClock {
    const cloned = new VectorClock(this.localReplicaId, new Map(this.entries));
    cloned.lastModified = this.lastModified;
    return cloned;
  }

  /**
   * Reset the clock to initial state
   */
  reset(): void {
    this.entries.clear();
    this.entries.set(this.localReplicaId, 0);
    this.lastModified = Date.now();
  }

  /**
   * Get the state of the clock
   *
   * @returns Internal state
   */
  getState(): VectorClockState {
    return {
      entries: new Map(this.entries),
      lastModified: this.lastModified,
    };
  }

  /**
   * Get the local replica ID
   *
   * @returns Replica ID
   */
  getReplicaId(): ReplicaId {
    return this.localReplicaId;
  }

  /**
   * Get the last modification timestamp
   *
   * @returns Wall timestamp
   */
  getLastModified(): WallTimestamp {
    return this.lastModified;
  }

  /**
   * Create a string representation for debugging
   *
   * @returns Debug string
   */
  toString(): string {
    const pairs = Array.from(this.entries.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([id, ts]) => `${id}:${ts}`)
      .join(', ');
    return `VectorClock{${pairs}}`;
  }

  // ============================================
  // Static Factory Methods
  // ============================================

  /**
   * Create an empty vector clock
   *
   * @param replicaId - Local replica ID
   * @returns New empty clock
   */
  static empty(replicaId: ReplicaId): VectorClock {
    return new VectorClock(replicaId);
  }

  /**
   * Create a vector clock with initial timestamp
   *
   * @param replicaId - Local replica ID
   * @param initialTimestamp - Initial timestamp for local replica
   * @returns New clock with initial timestamp
   */
  static withTimestamp(
    replicaId: ReplicaId,
    initialTimestamp: LogicalTimestamp
  ): VectorClock {
    const clock = new VectorClock(replicaId);
    clock.set(replicaId, initialTimestamp);
    return clock;
  }

  /**
   * Create a vector clock from a plain object
   *
   * @param replicaId - Local replica ID
   * @param entries - Object mapping replica IDs to timestamps
   * @returns New clock from entries
   */
  static fromEntries(
    replicaId: ReplicaId,
    entries: Record<ReplicaId, LogicalTimestamp>
  ): VectorClock {
    const map = new Map<ReplicaId, LogicalTimestamp>();
    for (const [id, ts] of Object.entries(entries)) {
      map.set(id, ts);
    }
    return new VectorClock(replicaId, map);
  }

  /**
   * Compute the maximum (join) of multiple clocks
   *
   * @param replicaId - Local replica ID for result
   * @param clocks - Clocks to join
   * @returns Joined clock
   */
  static max(replicaId: ReplicaId, ...clocks: VectorClock[]): VectorClock {
    if (clocks.length === 0) {
      return VectorClock.empty(replicaId);
    }

    const result = clocks[0].clone();
    for (let i = 1; i < clocks.length; i++) {
      result.merge(clocks[i]);
    }
    return result;
  }

  /**
   * Check if a serialized clock is valid
   *
   * @param serialized - Serialized clock to validate
   * @returns True if valid
   */
  static isValid(serialized: unknown): serialized is SerializedVectorClock {
    if (typeof serialized !== 'object' || serialized === null) {
      return false;
    }

    const obj = serialized as Record<string, unknown>;
    if (typeof obj.entries !== 'object' || obj.entries === null) {
      return false;
    }

    if (typeof obj.lastModified !== 'number') {
      return false;
    }

    const entries = obj.entries as Record<string, unknown>;
    for (const value of Object.values(entries)) {
      if (typeof value !== 'number' || value < 0) {
        return false;
      }
    }

    return true;
  }
}
