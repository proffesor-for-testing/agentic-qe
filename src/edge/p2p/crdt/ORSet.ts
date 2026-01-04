/**
 * OR-Set (Observed-Remove Set) CRDT Implementation
 *
 * A state-based CRDT set that handles concurrent add/remove operations.
 * Each add operation creates a unique tag, and remove operates on tags.
 * This ensures that adds observed before removes survive the merge.
 *
 * @module edge/p2p/crdt/ORSet
 * @version 1.0.0
 */

import {
  ReplicaId,
  WallTimestamp,
  CRDTType,
  CRDTState,
  CRDTMetadata,
  SerializedVectorClock,
  ORSetElement,
  SerializedORSetState,
  Tombstone,
  MergeResult,
  MergeStats,
  ConflictInfo,
  ConflictType,
  ResolutionStrategy,
  CRDTDelta,
  DeltaOperation,
  DeltaOpType,
  CRDT,
  CRDTError,
  CRDTErrorCode,
  DEFAULT_TOMBSTONE_TTL,
} from './types';
import { VectorClock } from './VectorClock';

// ============================================
// Utility Functions
// ============================================

/**
 * Generate a unique tag for add operations
 *
 * @param replicaId - Replica performing the add
 * @returns Unique tag string
 */
function generateTag(replicaId: ReplicaId): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${replicaId}-${timestamp}-${random}`;
}

/**
 * Hash a value for deduplication checking
 *
 * @param value - Value to hash
 * @returns Hash string
 */
function hashValue<T>(value: T): string {
  return JSON.stringify(value);
}

// ============================================
// ORSet Class
// ============================================

/**
 * Observed-Remove Set CRDT.
 *
 * Properties:
 * - Add operations create unique tags
 * - Remove operations target specific tags
 * - Concurrent add wins over remove (add-wins semantics)
 * - Supports arbitrary value types
 * - Strongly eventually consistent
 *
 * @example
 * ```typescript
 * const set = new ORSet<string>('replica-1', 'tags');
 *
 * set.add('typescript');
 * set.add('testing');
 * set.remove('testing');
 *
 * console.log(set.values()); // ['typescript']
 *
 * // Merge with remote state
 * set.merge(remoteState);
 * ```
 */
export class ORSet<T> implements CRDT<Set<T>, SerializedORSetState<T>> {
  /** Unique identifier for this set */
  private readonly id: string;

  /** Local replica ID */
  private readonly replicaId: ReplicaId;

  /** Active elements (tag -> element) */
  private elements: Map<string, ORSetElement<T>>;

  /** Tombstones for removed elements */
  private tombstones: Map<string, Tombstone>;

  /** Vector clock for versioning */
  private vectorClock: VectorClock;

  /** Metadata */
  private metadata: CRDTMetadata;

  /** Sequence number for deltas */
  private sequenceNumber: number;

  /** Last delta clock for delta generation */
  private lastDeltaClock: VectorClock;

  /** Tombstone TTL in milliseconds */
  private readonly tombstoneTtl: number;

  /** Value comparison function */
  private readonly compareValues: (a: T, b: T) => boolean;

  /**
   * Create a new OR-Set
   *
   * @param replicaId - Local replica identifier
   * @param id - Unique set identifier
   * @param options - Optional configuration
   */
  constructor(
    replicaId: ReplicaId,
    id: string,
    options?: {
      tombstoneTtl?: number;
      compareValues?: (a: T, b: T) => boolean;
    }
  ) {
    this.id = id;
    this.replicaId = replicaId;
    this.elements = new Map();
    this.tombstones = new Map();
    this.vectorClock = new VectorClock(replicaId);
    this.sequenceNumber = 0;
    this.lastDeltaClock = this.vectorClock.clone();
    this.tombstoneTtl = options?.tombstoneTtl ?? DEFAULT_TOMBSTONE_TTL;
    this.compareValues = options?.compareValues ?? ((a, b) => hashValue(a) === hashValue(b));

    const now = Date.now();
    this.metadata = {
      createdAt: now,
      updatedAt: now,
      mergeCount: 0,
      lastModifiedBy: replicaId,
    };
  }

  // ============================================
  // Core Operations
  // ============================================

  /**
   * Get the current set value
   *
   * @returns Set of current values
   */
  value(): Set<T> {
    const result = new Set<T>();
    for (const element of this.elements.values()) {
      result.add(element.value);
    }
    return result;
  }

  /**
   * Get all values as an array
   *
   * @returns Array of values
   */
  values(): T[] {
    return Array.from(this.value());
  }

  /**
   * Add a value to the set
   *
   * @param value - Value to add
   * @returns The generated tag
   */
  add(value: T): string {
    const tag = generateTag(this.replicaId);
    const now = Date.now();

    const element: ORSetElement<T> = {
      value,
      tag,
      addedBy: this.replicaId,
      addedAt: now,
    };

    this.elements.set(tag, element);
    this.vectorClock.increment();
    this.metadata.updatedAt = now;
    this.metadata.lastModifiedBy = this.replicaId;
    this.sequenceNumber++;

    return tag;
  }

  /**
   * Remove a value from the set
   *
   * This removes all instances of the value by tombstoning all matching tags.
   *
   * @param value - Value to remove
   * @returns Number of elements removed
   */
  remove(value: T): number {
    const tagsToRemove: string[] = [];

    // Find all tags with this value
    for (const [tag, element] of this.elements) {
      if (this.compareValues(element.value, value)) {
        tagsToRemove.push(tag);
      }
    }

    if (tagsToRemove.length === 0) {
      return 0;
    }

    const now = Date.now();

    // Remove elements and create tombstones
    for (const tag of tagsToRemove) {
      this.elements.delete(tag);

      const tombstone: Tombstone = {
        id: `ts-${tag}`,
        elementId: tag,
        crdtId: this.id,
        deletedBy: this.replicaId,
        vectorClock: this.vectorClock.serialize(),
        createdAt: now,
        expiresAt: now + this.tombstoneTtl,
        collected: false,
      };

      this.tombstones.set(tag, tombstone);
    }

    this.vectorClock.increment();
    this.metadata.updatedAt = now;
    this.metadata.lastModifiedBy = this.replicaId;
    this.sequenceNumber++;

    return tagsToRemove.length;
  }

  /**
   * Remove a specific element by tag
   *
   * @param tag - Tag to remove
   * @returns True if removed
   */
  removeByTag(tag: string): boolean {
    if (!this.elements.has(tag)) {
      return false;
    }

    const now = Date.now();
    this.elements.delete(tag);

    const tombstone: Tombstone = {
      id: `ts-${tag}`,
      elementId: tag,
      crdtId: this.id,
      deletedBy: this.replicaId,
      vectorClock: this.vectorClock.serialize(),
      createdAt: now,
      expiresAt: now + this.tombstoneTtl,
      collected: false,
    };

    this.tombstones.set(tag, tombstone);
    this.vectorClock.increment();
    this.metadata.updatedAt = now;
    this.metadata.lastModifiedBy = this.replicaId;
    this.sequenceNumber++;

    return true;
  }

  /**
   * Check if a value is in the set
   *
   * @param value - Value to check
   * @returns True if present
   */
  has(value: T): boolean {
    for (const element of this.elements.values()) {
      if (this.compareValues(element.value, value)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a tag exists
   *
   * @param tag - Tag to check
   * @returns True if tag exists
   */
  hasTag(tag: string): boolean {
    return this.elements.has(tag);
  }

  /**
   * Get the element for a tag
   *
   * @param tag - Tag to look up
   * @returns Element or undefined
   */
  getByTag(tag: string): ORSetElement<T> | undefined {
    return this.elements.get(tag);
  }

  /**
   * Get the number of elements
   *
   * @returns Size of the set
   */
  size(): number {
    return this.elements.size;
  }

  /**
   * Check if set is empty
   *
   * @returns True if empty
   */
  isEmpty(): boolean {
    return this.elements.size === 0;
  }

  /**
   * Clear all elements
   */
  clear(): void {
    const now = Date.now();

    // Create tombstones for all elements
    for (const tag of this.elements.keys()) {
      const tombstone: Tombstone = {
        id: `ts-${tag}`,
        elementId: tag,
        crdtId: this.id,
        deletedBy: this.replicaId,
        vectorClock: this.vectorClock.serialize(),
        createdAt: now,
        expiresAt: now + this.tombstoneTtl,
        collected: false,
      };
      this.tombstones.set(tag, tombstone);
    }

    this.elements.clear();
    this.vectorClock.increment();
    this.metadata.updatedAt = now;
    this.metadata.lastModifiedBy = this.replicaId;
    this.sequenceNumber++;
  }

  // ============================================
  // State Management
  // ============================================

  /**
   * Get the serializable state of this set
   *
   * @returns CRDT state
   */
  state(): CRDTState<SerializedORSetState<T>> {
    const elements = Array.from(this.elements.values()).map(el => ({
      tag: el.tag,
      value: el.value,
      addedBy: el.addedBy,
      addedAt: el.addedAt,
    }));

    const tombstones = Array.from(this.tombstones.keys());

    return {
      type: CRDTType.ORSet,
      id: this.id,
      vectorClock: this.vectorClock.serialize(),
      origin: this.replicaId,
      value: { elements, tombstones },
      metadata: { ...this.metadata },
      stateVersion: 1,
    };
  }

  /**
   * Restore an OR-Set from serialized state
   *
   * @param state - Serialized state
   * @param replicaId - Local replica ID
   * @returns Restored set
   */
  static fromState<T>(
    state: CRDTState<SerializedORSetState<T>>,
    replicaId: ReplicaId
  ): ORSet<T> {
    if (state.type !== CRDTType.ORSet) {
      throw new CRDTError(
        `Invalid CRDT type: expected ${CRDTType.ORSet}, got ${state.type}`,
        CRDTErrorCode.InvalidType,
        state.id
      );
    }

    const set = new ORSet<T>(replicaId, state.id);

    // Restore elements
    for (const el of state.value.elements) {
      const element: ORSetElement<T> = {
        value: el.value,
        tag: el.tag,
        addedBy: el.addedBy,
        addedAt: el.addedAt,
      };
      set.elements.set(el.tag, element);
    }

    // Restore tombstones
    const now = Date.now();
    for (const tag of state.value.tombstones) {
      const tombstone: Tombstone = {
        id: `ts-${tag}`,
        elementId: tag,
        crdtId: state.id,
        deletedBy: state.origin,
        vectorClock: state.vectorClock,
        createdAt: now,
        expiresAt: now + DEFAULT_TOMBSTONE_TTL,
        collected: false,
      };
      set.tombstones.set(tag, tombstone);
    }

    // Restore vector clock
    set.vectorClock = VectorClock.fromSerialized(state.vectorClock, replicaId);

    // Restore metadata
    set.metadata = { ...state.metadata };

    return set;
  }

  // ============================================
  // Merge Operations
  // ============================================

  /**
   * Merge with another OR-Set state
   *
   * Add-wins semantics: if an element is added in one replica
   * and removed in another concurrently, the add wins.
   *
   * @param other - Other set state to merge
   * @returns Merge result
   */
  merge(other: CRDTState<SerializedORSetState<T>>): MergeResult<SerializedORSetState<T>> {
    const startTime = Date.now();
    const conflicts: ConflictInfo[] = [];
    let entriesMerged = 0;
    let localChanged = false;

    if (other.type !== CRDTType.ORSet) {
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

    const otherClock = VectorClock.fromSerialized(other.vectorClock, this.replicaId);
    const remoteElements = new Map<string, ORSetElement<T>>();
    const remoteTombstones = new Set(other.value.tombstones);

    // Build map of remote elements
    for (const el of other.value.elements) {
      remoteElements.set(el.tag, {
        value: el.value,
        tag: el.tag,
        addedBy: el.addedBy,
        addedAt: el.addedAt,
      });
    }

    // Add remote elements not in our tombstones
    for (const [tag, element] of remoteElements) {
      if (!this.tombstones.has(tag) && !this.elements.has(tag)) {
        this.elements.set(tag, element);
        localChanged = true;
        entriesMerged++;
      } else if (this.tombstones.has(tag) && this.vectorClock.isConcurrent(otherClock)) {
        // Concurrent add/remove - record conflict (add wins)
        const conflict: ConflictInfo = {
          conflictId: `${this.id}-${tag}-${Date.now()}`,
          crdtId: this.id,
          conflictType: ConflictType.AddRemove,
          field: tag,
          localValue: null,
          remoteValue: element.value,
          localClock: this.vectorClock.serialize(),
          remoteClock: other.vectorClock,
          resolution: {
            strategy: ResolutionStrategy.KeepBoth,
            resolvedValue: element.value,
            reason: 'OR-Set add-wins semantics',
            automatic: true,
            resolvedAt: Date.now(),
          },
          detectedAt: Date.now(),
        };
        conflicts.push(conflict);

        // Add wins - remove tombstone and add element
        this.tombstones.delete(tag);
        this.elements.set(tag, element);
        localChanged = true;
        entriesMerged++;
      }
    }

    // Apply remote tombstones
    for (const tag of remoteTombstones) {
      if (this.elements.has(tag)) {
        // Check if this is a concurrent add/remove
        if (this.vectorClock.isConcurrent(otherClock)) {
          // Local add wins, keep element
          const conflict: ConflictInfo = {
            conflictId: `${this.id}-${tag}-${Date.now()}`,
            crdtId: this.id,
            conflictType: ConflictType.AddRemove,
            field: tag,
            localValue: this.elements.get(tag)?.value,
            remoteValue: null,
            localClock: this.vectorClock.serialize(),
            remoteClock: other.vectorClock,
            resolution: {
              strategy: ResolutionStrategy.PreferLocal,
              resolvedValue: this.elements.get(tag)?.value,
              reason: 'OR-Set add-wins semantics: local add beats remote remove',
              automatic: true,
              resolvedAt: Date.now(),
            },
            detectedAt: Date.now(),
          };
          conflicts.push(conflict);
        } else if (otherClock.happenedAfter(this.vectorClock)) {
          // Remote happened after, apply tombstone
          const element = this.elements.get(tag);
          this.elements.delete(tag);

          const tombstone: Tombstone = {
            id: `ts-${tag}`,
            elementId: tag,
            crdtId: this.id,
            deletedBy: other.origin,
            vectorClock: other.vectorClock,
            createdAt: Date.now(),
            expiresAt: Date.now() + this.tombstoneTtl,
            collected: false,
          };
          this.tombstones.set(tag, tombstone);
          localChanged = true;
        }
      } else if (!this.tombstones.has(tag)) {
        // Add tombstone we didn't have
        const tombstone: Tombstone = {
          id: `ts-${tag}`,
          elementId: tag,
          crdtId: this.id,
          deletedBy: other.origin,
          vectorClock: other.vectorClock,
          createdAt: Date.now(),
          expiresAt: Date.now() + this.tombstoneTtl,
          collected: false,
        };
        this.tombstones.set(tag, tombstone);
      }
    }

    // Merge vector clocks
    this.vectorClock.merge(otherClock);

    // Update metadata
    this.metadata.mergeCount++;
    this.metadata.updatedAt = Date.now();
    if (localChanged) {
      this.metadata.lastModifiedBy = other.origin;
    }

    // Garbage collect expired tombstones
    this.gcTombstones();

    const stats: MergeStats = {
      duration: Date.now() - startTime,
      entriesMerged,
      autoResolved: conflicts.length,
      tombstonesProcessed: remoteTombstones.size,
      memoryDelta: entriesMerged * 64, // Approximate
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
  generateDelta(since?: SerializedVectorClock): CRDTDelta<SerializedORSetState<T>> | null {
    const sinceClock = since
      ? VectorClock.fromSerialized(since, this.replicaId)
      : this.lastDeltaClock;

    // Check if there are any changes
    if (!this.vectorClock.happenedAfter(sinceClock) &&
        !this.vectorClock.isConcurrent(sinceClock)) {
      return null;
    }

    const operations: DeltaOperation<SerializedORSetState<T>>[] = [];

    // Include recent adds
    for (const element of this.elements.values()) {
      if (element.addedBy === this.replicaId) {
        operations.push({
          op: DeltaOpType.Add,
          key: element.tag,
          value: {
            elements: [{
              tag: element.tag,
              value: element.value,
              addedBy: element.addedBy,
              addedAt: element.addedAt,
            }],
            tombstones: [],
          },
          tag: element.tag,
          replica: element.addedBy,
        });
      }
    }

    // Include recent removes
    for (const [tag, tombstone] of this.tombstones) {
      if (tombstone.deletedBy === this.replicaId) {
        operations.push({
          op: DeltaOpType.Remove,
          key: tag,
          tag,
          replica: tombstone.deletedBy,
        });
      }
    }

    if (operations.length === 0) {
      return null;
    }

    const delta: CRDTDelta<SerializedORSetState<T>> = {
      crdtId: this.id,
      type: CRDTType.ORSet,
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
  applyDelta(delta: CRDTDelta<SerializedORSetState<T>>): boolean {
    if (delta.type !== CRDTType.ORSet) {
      return false;
    }

    if (delta.crdtId !== this.id) {
      return false;
    }

    let changed = false;
    const now = Date.now();

    for (const op of delta.operations) {
      if (op.op === DeltaOpType.Add && op.value && op.tag) {
        const el = op.value.elements[0];
        if (el && !this.elements.has(op.tag) && !this.tombstones.has(op.tag)) {
          this.elements.set(op.tag, {
            value: el.value,
            tag: el.tag,
            addedBy: el.addedBy,
            addedAt: el.addedAt,
          });
          changed = true;
        }
      } else if (op.op === DeltaOpType.Remove && op.tag) {
        if (this.elements.has(op.tag)) {
          this.elements.delete(op.tag);
          const tombstone: Tombstone = {
            id: `ts-${op.tag}`,
            elementId: op.tag,
            crdtId: this.id,
            deletedBy: op.replica,
            vectorClock: delta.vectorClock,
            createdAt: now,
            expiresAt: now + this.tombstoneTtl,
            collected: false,
          };
          this.tombstones.set(op.tag, tombstone);
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
      this.metadata.updatedAt = now;
      this.metadata.lastModifiedBy = delta.origin;
    }

    return changed;
  }

  // ============================================
  // Garbage Collection
  // ============================================

  /**
   * Garbage collect expired tombstones
   *
   * @returns Number of tombstones collected
   */
  gcTombstones(): number {
    const now = Date.now();
    let collected = 0;

    for (const [tag, tombstone] of this.tombstones) {
      if (tombstone.expiresAt <= now) {
        this.tombstones.delete(tag);
        collected++;
      }
    }

    return collected;
  }

  /**
   * Get tombstone count
   *
   * @returns Number of tombstones
   */
  getTombstoneCount(): number {
    return this.tombstones.size;
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Create a deep copy of this set
   *
   * @returns Cloned set
   */
  clone(): ORSet<T> {
    const cloned = new ORSet<T>(this.replicaId, this.id, {
      tombstoneTtl: this.tombstoneTtl,
      compareValues: this.compareValues,
    });

    cloned.elements = new Map(this.elements);
    cloned.tombstones = new Map(this.tombstones);
    cloned.vectorClock = this.vectorClock.clone();
    cloned.metadata = { ...this.metadata };
    cloned.sequenceNumber = this.sequenceNumber;
    cloned.lastDeltaClock = this.lastDeltaClock.clone();

    return cloned;
  }

  /**
   * Get the set ID
   *
   * @returns Set ID
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
   * Iterate over elements
   */
  *[Symbol.iterator](): Iterator<T> {
    for (const element of this.elements.values()) {
      yield element.value;
    }
  }

  /**
   * String representation for debugging
   *
   * @returns Debug string
   */
  toString(): string {
    const values = this.values().map(v => JSON.stringify(v)).slice(0, 5);
    const more = this.size() > 5 ? `... +${this.size() - 5}` : '';
    return `ORSet{id=${this.id}, values=[${values.join(', ')}${more}], tombstones=${this.tombstones.size}}`;
  }
}
