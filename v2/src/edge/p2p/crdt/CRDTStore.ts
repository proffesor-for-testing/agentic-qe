/**
 * CRDT Store - Storage and Management for Multiple CRDTs
 *
 * Provides a centralized store for managing multiple CRDT instances,
 * applying remote updates, generating deltas for synchronization,
 * and garbage collecting tombstones.
 *
 * @module edge/p2p/crdt/CRDTStore
 * @version 1.0.0
 */

import {
  ReplicaId,
  WallTimestamp,
  CRDTType,
  CRDTState,
  CRDTStoreConfig,
  CRDTStoreStats,
  DEFAULT_STORE_CONFIG,
  CRDTDelta,
  SerializedVectorClock,
  MergeResult,
  GCResult,
  ConflictInfo,
  CRDTEvent,
  CRDTEventType,
  CRDTEventHandler,
  CRDTError,
  CRDTErrorCode,
  SerializedGCounterState,
  SerializedLWWRegisterState,
  SerializedORSetState,
  SerializedPatternCRDTState,
} from './types';
import { VectorClock } from './VectorClock';
import { GCounter } from './GCounter';
import { LWWRegister } from './LWWRegister';
import { ORSet } from './ORSet';
import { PatternCRDT, PatternInput } from './PatternCRDT';

// ============================================
// Types
// ============================================

/**
 * Union type for all CRDT instances
 */
type CRDTInstance =
  | GCounter
  | LWWRegister<unknown>
  | ORSet<unknown>
  | PatternCRDT;

/**
 * Union type for all CRDT states
 */
type CRDTStateUnion =
  | CRDTState<SerializedGCounterState>
  | CRDTState<SerializedLWWRegisterState<unknown>>
  | CRDTState<SerializedORSetState<unknown>>
  | CRDTState<SerializedPatternCRDTState>;

/**
 * Delta buffer entry
 */
interface DeltaBufferEntry {
  delta: CRDTDelta<unknown>;
  timestamp: WallTimestamp;
  applied: boolean;
}

// ============================================
// CRDTStore Class
// ============================================

/**
 * Store for managing multiple CRDT instances.
 *
 * Features:
 * - Create and retrieve CRDTs by ID
 * - Apply remote updates and merge states
 * - Generate delta updates for synchronization
 * - Automatic garbage collection of tombstones
 * - Event emission for monitoring
 * - Conflict tracking
 *
 * @example
 * ```typescript
 * const store = new CRDTStore({
 *   replicaId: 'replica-1',
 *   autoGC: true,
 * });
 *
 * // Create CRDTs
 * const counter = store.createGCounter('page-views');
 * const tags = store.createORSet<string>('user-tags');
 * const pattern = store.createPattern({
 *   id: 'pattern-1',
 *   content: '...',
 *   type: 'test',
 *   category: 'unit',
 *   domain: 'api',
 * });
 *
 * // Apply remote state
 * store.applyState(remoteState);
 *
 * // Generate deltas for sync
 * const deltas = store.generateDeltas(lastSyncClock);
 *
 * // Get stats
 * const stats = store.getStats();
 * ```
 */
export class CRDTStore {
  /** Store configuration */
  private readonly config: CRDTStoreConfig;

  /** CRDT instances by ID */
  private instances: Map<string, CRDTInstance>;

  /** CRDT types by ID */
  private types: Map<string, CRDTType>;

  /** Global vector clock for store */
  private vectorClock: VectorClock;

  /** Delta buffer for pending sync */
  private deltaBuffer: Map<string, DeltaBufferEntry[]>;

  /** Conflict history */
  private conflicts: ConflictInfo[];

  /** Event handlers */
  private eventHandlers: Set<CRDTEventHandler>;

  /** GC interval handle */
  private gcIntervalHandle?: ReturnType<typeof setInterval>;

  /** Last GC timestamp */
  private lastGC?: WallTimestamp;

  /** Last sync timestamp */
  private lastSync?: WallTimestamp;

  /**
   * Create a new CRDT store
   *
   * @param config - Store configuration
   */
  constructor(config: Partial<CRDTStoreConfig> = {}) {
    this.config = { ...DEFAULT_STORE_CONFIG, ...config };

    if (!this.config.replicaId) {
      throw new CRDTError(
        'Replica ID is required for CRDTStore',
        CRDTErrorCode.InvalidState
      );
    }

    this.instances = new Map();
    this.types = new Map();
    this.vectorClock = new VectorClock(this.config.replicaId);
    this.deltaBuffer = new Map();
    this.conflicts = [];
    this.eventHandlers = new Set();

    // Start auto GC if enabled
    if (this.config.autoGC) {
      this.startAutoGC();
    }
  }

  // ============================================
  // CRDT Creation
  // ============================================

  /**
   * Create a new G-Counter
   *
   * @param id - Counter identifier
   * @param initialValue - Initial value
   * @returns Created counter
   */
  createGCounter(id: string, initialValue = 0): GCounter {
    this.checkCapacity();
    this.checkIdAvailable(id);

    const counter = new GCounter(this.config.replicaId, id, initialValue);
    this.instances.set(id, counter);
    this.types.set(id, CRDTType.GCounter);
    this.vectorClock.increment();

    this.emit({
      type: CRDTEventType.Created,
      crdtId: id,
      crdtType: CRDTType.GCounter,
      timestamp: Date.now(),
      details: { initialValue },
    });

    return counter;
  }

  /**
   * Create a new LWW-Register
   *
   * @param id - Register identifier
   * @param initialValue - Initial value
   * @returns Created register
   */
  createLWWRegister<T>(id: string, initialValue?: T): LWWRegister<T> {
    this.checkCapacity();
    this.checkIdAvailable(id);

    const register = new LWWRegister<T>(this.config.replicaId, id, initialValue);
    this.instances.set(id, register as LWWRegister<unknown>);
    this.types.set(id, CRDTType.LWWRegister);
    this.vectorClock.increment();

    this.emit({
      type: CRDTEventType.Created,
      crdtId: id,
      crdtType: CRDTType.LWWRegister,
      timestamp: Date.now(),
      details: { hasInitialValue: initialValue !== undefined },
    });

    return register;
  }

  /**
   * Create a new OR-Set
   *
   * @param id - Set identifier
   * @returns Created set
   */
  createORSet<T>(id: string): ORSet<T> {
    this.checkCapacity();
    this.checkIdAvailable(id);

    const set = new ORSet<T>(this.config.replicaId, id, {
      tombstoneTtl: this.config.tombstoneTtl,
    });
    this.instances.set(id, set as ORSet<unknown>);
    this.types.set(id, CRDTType.ORSet);
    this.vectorClock.increment();

    this.emit({
      type: CRDTEventType.Created,
      crdtId: id,
      crdtType: CRDTType.ORSet,
      timestamp: Date.now(),
      details: {},
    });

    return set;
  }

  /**
   * Create a new Pattern CRDT
   *
   * @param input - Pattern input data
   * @returns Created PatternCRDT
   */
  createPattern(input: PatternInput): PatternCRDT {
    this.checkCapacity();
    this.checkIdAvailable(input.id);

    const pattern = new PatternCRDT(this.config.replicaId, input);
    this.instances.set(input.id, pattern);
    this.types.set(input.id, CRDTType.PatternCRDT);
    this.vectorClock.increment();

    this.emit({
      type: CRDTEventType.Created,
      crdtId: input.id,
      crdtType: CRDTType.PatternCRDT,
      timestamp: Date.now(),
      details: { type: input.type, category: input.category },
    });

    return pattern;
  }

  // ============================================
  // CRDT Retrieval
  // ============================================

  /**
   * Get a CRDT by ID
   *
   * @param id - CRDT identifier
   * @returns CRDT instance or undefined
   */
  get(id: string): CRDTInstance | undefined {
    return this.instances.get(id);
  }

  /**
   * Get a G-Counter by ID
   *
   * @param id - Counter identifier
   * @returns Counter or undefined
   */
  getGCounter(id: string): GCounter | undefined {
    const instance = this.instances.get(id);
    if (instance && this.types.get(id) === CRDTType.GCounter) {
      return instance as GCounter;
    }
    return undefined;
  }

  /**
   * Get an LWW-Register by ID
   *
   * @param id - Register identifier
   * @returns Register or undefined
   */
  getLWWRegister<T>(id: string): LWWRegister<T> | undefined {
    const instance = this.instances.get(id);
    if (instance && this.types.get(id) === CRDTType.LWWRegister) {
      return instance as LWWRegister<T>;
    }
    return undefined;
  }

  /**
   * Get an OR-Set by ID
   *
   * @param id - Set identifier
   * @returns Set or undefined
   */
  getORSet<T>(id: string): ORSet<T> | undefined {
    const instance = this.instances.get(id);
    if (instance && this.types.get(id) === CRDTType.ORSet) {
      return instance as ORSet<T>;
    }
    return undefined;
  }

  /**
   * Get a PatternCRDT by ID
   *
   * @param id - Pattern identifier
   * @returns Pattern or undefined
   */
  getPattern(id: string): PatternCRDT | undefined {
    const instance = this.instances.get(id);
    if (instance && this.types.get(id) === CRDTType.PatternCRDT) {
      return instance as PatternCRDT;
    }
    return undefined;
  }

  /**
   * Check if a CRDT exists
   *
   * @param id - CRDT identifier
   * @returns True if exists
   */
  has(id: string): boolean {
    return this.instances.has(id);
  }

  /**
   * Get all CRDT IDs
   *
   * @returns Array of IDs
   */
  getIds(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * Get IDs by type
   *
   * @param type - CRDT type to filter by
   * @returns Array of matching IDs
   */
  getIdsByType(type: CRDTType): string[] {
    const ids: string[] = [];
    for (const [id, t] of this.types) {
      if (t === type) {
        ids.push(id);
      }
    }
    return ids;
  }

  /**
   * Get the type of a CRDT
   *
   * @param id - CRDT identifier
   * @returns CRDT type or undefined
   */
  getType(id: string): CRDTType | undefined {
    return this.types.get(id);
  }

  // ============================================
  // State Application
  // ============================================

  /**
   * Apply a remote CRDT state
   *
   * If the CRDT doesn't exist locally, it will be created.
   * If it exists, the states will be merged.
   *
   * @param state - Remote CRDT state
   * @returns Merge result
   */
  applyState(state: CRDTStateUnion): MergeResult<unknown> {
    const startTime = Date.now();
    let result: MergeResult<unknown>;

    const existing = this.instances.get(state.id);

    if (existing) {
      // Merge with existing
      result = this.mergeExisting(state);
    } else {
      // Create new from state
      result = this.createFromState(state);
    }

    // Track conflicts
    if (this.config.trackConflicts) {
      this.addConflicts(result.conflicts);
    }

    // Emit event
    if (result.localChanged) {
      this.emit({
        type: CRDTEventType.Merge,
        crdtId: state.id,
        crdtType: state.type,
        timestamp: Date.now(),
        details: {
          origin: state.origin,
          conflicts: result.conflicts.length,
          duration: Date.now() - startTime,
        },
      });
    }

    this.vectorClock.increment();
    return result;
  }

  /**
   * Merge state with existing CRDT
   */
  private mergeExisting(state: CRDTStateUnion): MergeResult<unknown> {
    const instance = this.instances.get(state.id)!;
    const type = this.types.get(state.id)!;

    if (type !== state.type) {
      throw new CRDTError(
        `Type mismatch: local is ${type}, remote is ${state.type}`,
        CRDTErrorCode.InvalidType,
        state.id
      );
    }

    switch (type) {
      case CRDTType.GCounter:
        return (instance as GCounter).merge(
          state as CRDTState<SerializedGCounterState>
        );

      case CRDTType.LWWRegister:
        return (instance as LWWRegister<unknown>).merge(
          state as CRDTState<SerializedLWWRegisterState<unknown>>
        );

      case CRDTType.ORSet:
        return (instance as ORSet<unknown>).merge(
          state as CRDTState<SerializedORSetState<unknown>>
        );

      case CRDTType.PatternCRDT:
        return (instance as PatternCRDT).merge(
          state as CRDTState<SerializedPatternCRDTState>
        );

      default:
        throw new CRDTError(
          `Unknown CRDT type: ${type}`,
          CRDTErrorCode.InvalidType,
          state.id
        );
    }
  }

  /**
   * Create a new CRDT from remote state
   */
  private createFromState(state: CRDTStateUnion): MergeResult<unknown> {
    this.checkCapacity();

    let instance: CRDTInstance;

    switch (state.type) {
      case CRDTType.GCounter:
        instance = GCounter.fromState(
          state as CRDTState<SerializedGCounterState>,
          this.config.replicaId
        );
        break;

      case CRDTType.LWWRegister:
        instance = LWWRegister.fromState<unknown>(
          state as CRDTState<SerializedLWWRegisterState<unknown>>,
          this.config.replicaId
        );
        break;

      case CRDTType.ORSet:
        instance = ORSet.fromState<unknown>(
          state as CRDTState<SerializedORSetState<unknown>>,
          this.config.replicaId
        );
        break;

      case CRDTType.PatternCRDT:
        instance = PatternCRDT.fromState(
          state as CRDTState<SerializedPatternCRDTState>,
          this.config.replicaId
        );
        break;

      default:
        throw new CRDTError(
          `Unknown CRDT type: ${state.type}`,
          CRDTErrorCode.InvalidType,
          state.id
        );
    }

    this.instances.set(state.id, instance);
    this.types.set(state.id, state.type);

    this.emit({
      type: CRDTEventType.Created,
      crdtId: state.id,
      crdtType: state.type,
      timestamp: Date.now(),
      details: { fromRemote: true, origin: state.origin },
    });

    return {
      success: true,
      mergedState: state,
      localChanged: true,
      conflicts: [],
      stats: {
        duration: 0,
        entriesMerged: 1,
        autoResolved: 0,
        tombstonesProcessed: 0,
        memoryDelta: 0,
      },
    };
  }

  /**
   * Apply a delta update
   *
   * @param delta - Delta to apply
   * @returns True if applied successfully
   */
  applyDelta(delta: CRDTDelta<unknown>): boolean {
    const instance = this.instances.get(delta.crdtId);

    if (!instance) {
      // Buffer delta for later if CRDT doesn't exist yet
      if (this.config.enableDeltas) {
        this.bufferDelta(delta);
      }
      return false;
    }

    const type = this.types.get(delta.crdtId);
    if (type !== delta.type) {
      return false;
    }

    let applied = false;

    switch (type) {
      case CRDTType.GCounter:
        applied = (instance as GCounter).applyDelta(
          delta as CRDTDelta<SerializedGCounterState>
        );
        break;

      case CRDTType.LWWRegister:
        applied = (instance as LWWRegister<unknown>).applyDelta(
          delta as CRDTDelta<SerializedLWWRegisterState<unknown>>
        );
        break;

      case CRDTType.ORSet:
        applied = (instance as ORSet<unknown>).applyDelta(
          delta as CRDTDelta<SerializedORSetState<unknown>>
        );
        break;

      case CRDTType.PatternCRDT:
        applied = (instance as PatternCRDT).applyDelta(
          delta as CRDTDelta<SerializedPatternCRDTState>
        );
        break;
    }

    if (applied) {
      this.vectorClock.increment();
      this.emit({
        type: CRDTEventType.Update,
        crdtId: delta.crdtId,
        crdtType: delta.type,
        timestamp: Date.now(),
        details: { deltaOrigin: delta.origin },
      });
    }

    return applied;
  }

  // ============================================
  // Delta Generation
  // ============================================

  /**
   * Generate deltas for all CRDTs since a given clock
   *
   * @param since - Vector clock of last sync
   * @returns Array of deltas
   */
  generateDeltas(since?: SerializedVectorClock): CRDTDelta<unknown>[] {
    const deltas: CRDTDelta<unknown>[] = [];

    for (const [id, instance] of this.instances) {
      const type = this.types.get(id)!;
      let delta: CRDTDelta<unknown> | null = null;

      switch (type) {
        case CRDTType.GCounter:
          delta = (instance as GCounter).generateDelta(since);
          break;

        case CRDTType.LWWRegister:
          delta = (instance as LWWRegister<unknown>).generateDelta(since);
          break;

        case CRDTType.ORSet:
          delta = (instance as ORSet<unknown>).generateDelta(since);
          break;

        case CRDTType.PatternCRDT:
          delta = (instance as PatternCRDT).generateDelta(since);
          break;
      }

      if (delta) {
        deltas.push(delta);
        this.emit({
          type: CRDTEventType.DeltaGenerated,
          crdtId: id,
          crdtType: type,
          timestamp: Date.now(),
          details: { sequenceNumber: delta.sequenceNumber },
        });
      }
    }

    this.lastSync = Date.now();
    return deltas;
  }

  /**
   * Get all states for full sync
   *
   * @returns Array of all CRDT states
   */
  getAllStates(): CRDTStateUnion[] {
    const states: CRDTStateUnion[] = [];

    for (const [id, instance] of this.instances) {
      const type = this.types.get(id)!;

      switch (type) {
        case CRDTType.GCounter:
          states.push((instance as GCounter).state());
          break;

        case CRDTType.LWWRegister:
          states.push((instance as LWWRegister<unknown>).state());
          break;

        case CRDTType.ORSet:
          states.push((instance as ORSet<unknown>).state());
          break;

        case CRDTType.PatternCRDT:
          states.push((instance as PatternCRDT).state());
          break;
      }
    }

    return states;
  }

  // ============================================
  // Delta Buffering
  // ============================================

  /**
   * Buffer a delta for later application
   */
  private bufferDelta(delta: CRDTDelta<unknown>): void {
    if (!this.deltaBuffer.has(delta.crdtId)) {
      this.deltaBuffer.set(delta.crdtId, []);
    }

    const buffer = this.deltaBuffer.get(delta.crdtId)!;

    // Check buffer size limit
    if (buffer.length >= this.config.maxDeltaBuffer) {
      buffer.shift(); // Remove oldest
    }

    buffer.push({
      delta,
      timestamp: Date.now(),
      applied: false,
    });
  }

  /**
   * Apply buffered deltas for a CRDT
   *
   * @param id - CRDT identifier
   * @returns Number of deltas applied
   */
  applyBufferedDeltas(id: string): number {
    const buffer = this.deltaBuffer.get(id);
    if (!buffer || buffer.length === 0) {
      return 0;
    }

    let applied = 0;
    for (const entry of buffer) {
      if (!entry.applied && this.applyDelta(entry.delta)) {
        entry.applied = true;
        applied++;
      }
    }

    // Clean up applied deltas
    this.deltaBuffer.set(
      id,
      buffer.filter(e => !e.applied)
    );

    return applied;
  }

  // ============================================
  // Garbage Collection
  // ============================================

  /**
   * Run garbage collection on all ORSets
   *
   * @returns GC result
   */
  gc(): GCResult {
    const startTime = Date.now();
    let totalCollected = 0;
    let totalRetained = 0;

    for (const [id, instance] of this.instances) {
      if (this.types.get(id) === CRDTType.ORSet) {
        const orset = instance as ORSet<unknown>;
        const collected = orset.gcTombstones();
        totalCollected += collected;
        totalRetained += orset.getTombstoneCount();
      }
    }

    // Clean up old conflicts
    const conflictCutoff = Date.now() - this.config.tombstoneTtl;
    this.conflicts = this.conflicts.filter(c => c.detectedAt > conflictCutoff);

    // Clean up old buffered deltas
    for (const [id, buffer] of this.deltaBuffer) {
      const freshDeltas = buffer.filter(
        e => e.timestamp > conflictCutoff
      );
      if (freshDeltas.length !== buffer.length) {
        this.deltaBuffer.set(id, freshDeltas);
      }
    }

    this.lastGC = Date.now();

    const result: GCResult = {
      collected: totalCollected,
      retained: totalRetained,
      memoryFreed: totalCollected * 64, // Approximate
      duration: Date.now() - startTime,
    };

    this.emit({
      type: CRDTEventType.GarbageCollected,
      crdtId: '*',
      crdtType: CRDTType.ORSet,
      timestamp: Date.now(),
      details: result,
    });

    return result;
  }

  /**
   * Start automatic garbage collection
   */
  private startAutoGC(): void {
    if (this.gcIntervalHandle) {
      return;
    }

    this.gcIntervalHandle = setInterval(() => {
      this.gc();
    }, this.config.gcInterval);
  }

  /**
   * Stop automatic garbage collection
   */
  stopAutoGC(): void {
    if (this.gcIntervalHandle) {
      clearInterval(this.gcIntervalHandle);
      this.gcIntervalHandle = undefined;
    }
  }

  // ============================================
  // Conflict Tracking
  // ============================================

  /**
   * Add conflicts to history
   */
  private addConflicts(conflicts: ConflictInfo[]): void {
    for (const conflict of conflicts) {
      this.conflicts.push(conflict);

      // Trim if too many
      if (this.conflicts.length > this.config.maxConflicts) {
        this.conflicts.shift();
      }

      this.emit({
        type: CRDTEventType.Conflict,
        crdtId: conflict.crdtId,
        crdtType: CRDTType.LWWRegister, // Generic
        timestamp: Date.now(),
        details: conflict,
      });
    }
  }

  /**
   * Get recent conflicts
   *
   * @param limit - Maximum conflicts to return
   * @returns Array of conflicts
   */
  getConflicts(limit?: number): ConflictInfo[] {
    const l = limit ?? this.conflicts.length;
    return this.conflicts.slice(-l);
  }

  /**
   * Clear conflict history
   */
  clearConflicts(): void {
    this.conflicts = [];
  }

  // ============================================
  // CRDT Deletion
  // ============================================

  /**
   * Delete a CRDT from the store
   *
   * @param id - CRDT identifier
   * @returns True if deleted
   */
  delete(id: string): boolean {
    const instance = this.instances.get(id);
    if (!instance) {
      return false;
    }

    const type = this.types.get(id)!;
    this.instances.delete(id);
    this.types.delete(id);
    this.deltaBuffer.delete(id);
    this.vectorClock.increment();

    this.emit({
      type: CRDTEventType.Deleted,
      crdtId: id,
      crdtType: type,
      timestamp: Date.now(),
      details: {},
    });

    return true;
  }

  /**
   * Clear all CRDTs from the store
   */
  clear(): void {
    const ids = Array.from(this.instances.keys());
    for (const id of ids) {
      this.delete(id);
    }
  }

  // ============================================
  // Events
  // ============================================

  /**
   * Add an event handler
   *
   * @param handler - Event handler function
   */
  on(handler: CRDTEventHandler): void {
    this.eventHandlers.add(handler);
  }

  /**
   * Remove an event handler
   *
   * @param handler - Handler to remove
   */
  off(handler: CRDTEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  /**
   * Emit an event
   */
  private emit(event: CRDTEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('CRDT event handler error:', error);
      }
    }
  }

  // ============================================
  // Validation
  // ============================================

  /**
   * Check if store has capacity for new CRDT
   */
  private checkCapacity(): void {
    if (this.instances.size >= this.config.maxInstances) {
      throw new CRDTError(
        `Store is full (max ${this.config.maxInstances} instances)`,
        CRDTErrorCode.StoreFull
      );
    }
  }

  /**
   * Check if ID is available
   */
  private checkIdAvailable(id: string): void {
    if (this.instances.has(id)) {
      throw new CRDTError(
        `CRDT with ID '${id}' already exists`,
        CRDTErrorCode.InvalidState,
        id
      );
    }
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get store statistics
   *
   * @returns Store stats
   */
  getStats(): CRDTStoreStats {
    const byType: Record<CRDTType, number> = {
      [CRDTType.GCounter]: 0,
      [CRDTType.PNCounter]: 0,
      [CRDTType.LWWRegister]: 0,
      [CRDTType.ORSet]: 0,
      [CRDTType.MVRegister]: 0,
      [CRDTType.LWWMap]: 0,
      [CRDTType.PatternCRDT]: 0,
    };

    let totalTombstones = 0;
    let pendingDeltas = 0;

    for (const [id, instance] of this.instances) {
      const type = this.types.get(id)!;
      byType[type]++;

      if (type === CRDTType.ORSet) {
        totalTombstones += (instance as ORSet<unknown>).getTombstoneCount();
      }
    }

    for (const buffer of this.deltaBuffer.values()) {
      pendingDeltas += buffer.filter(e => !e.applied).length;
    }

    return {
      totalInstances: this.instances.size,
      byType,
      totalTombstones,
      pendingDeltas,
      totalConflicts: this.conflicts.length,
      memoryUsage: this.estimateMemoryUsage(),
      lastGC: this.lastGC,
      lastSync: this.lastSync,
    };
  }

  /**
   * Estimate memory usage in bytes
   */
  private estimateMemoryUsage(): number {
    let total = 0;

    for (const [id, instance] of this.instances) {
      const type = this.types.get(id)!;

      switch (type) {
        case CRDTType.GCounter:
          total += 64 * (instance as GCounter).getReplicas().length;
          break;

        case CRDTType.LWWRegister:
          total += 128; // Base + value estimate
          break;

        case CRDTType.ORSet:
          total += 64 * (instance as ORSet<unknown>).size();
          total += 32 * (instance as ORSet<unknown>).getTombstoneCount();
          break;

        case CRDTType.PatternCRDT:
          total += 1024; // Rough estimate
          break;
      }
    }

    return total;
  }

  /**
   * Get the replica ID
   *
   * @returns Replica ID
   */
  getReplicaId(): ReplicaId {
    return this.config.replicaId;
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
   * Dispose the store
   */
  dispose(): void {
    this.stopAutoGC();
    this.clear();
    this.eventHandlers.clear();
    this.conflicts = [];
    this.deltaBuffer.clear();
  }
}
