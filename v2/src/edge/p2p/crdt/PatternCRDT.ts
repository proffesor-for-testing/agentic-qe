/**
 * Pattern CRDT - Specialized CRDT for SharedPattern Objects
 *
 * A composite CRDT that manages SharedPattern objects with different
 * CRDT strategies for different fields:
 * - LWW for scalar fields (content, type, category, domain)
 * - ORSet for collection fields (tags)
 * - GCounter for usage metrics
 *
 * @module edge/p2p/crdt/PatternCRDT
 * @version 1.0.0
 */

import {
  ReplicaId,
  WallTimestamp,
  CRDTType,
  CRDTState,
  CRDTMetadata,
  SerializedVectorClock,
  SerializedPatternCRDTState,
  SerializedLWWRegisterState,
  SerializedORSetState,
  SerializedGCounterState,
  PatternQualityMetrics,
  PatternSharingConfigData,
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
import { GCounter } from './GCounter';
import { LWWRegister } from './LWWRegister';
import { ORSet } from './ORSet';

// ============================================
// Types
// ============================================

/**
 * Input for creating a new pattern
 */
export interface PatternInput {
  /** Pattern ID */
  id: string;

  /** Pattern content */
  content: string;

  /** Pattern type */
  type: string;

  /** Pattern category */
  category: string;

  /** Pattern domain */
  domain: string;

  /** Initial tags */
  tags?: string[];

  /** Metadata entries */
  metadata?: Record<string, unknown>;

  /** Quality metrics */
  quality?: PatternQualityMetrics;

  /** Sharing configuration */
  sharingConfig?: PatternSharingConfigData;
}

/**
 * Extracted pattern data for reading
 */
export interface PatternData {
  /** Pattern ID */
  id: string;

  /** Pattern content */
  content: string;

  /** Pattern type */
  type: string;

  /** Pattern category */
  category: string;

  /** Pattern domain */
  domain: string;

  /** Tags */
  tags: string[];

  /** Metadata */
  metadata: Record<string, unknown>;

  /** Quality metrics */
  quality: PatternQualityMetrics;

  /** Usage count */
  usageCount: number;

  /** Sharing configuration */
  sharingConfig: PatternSharingConfigData;

  /** Last modified timestamp */
  lastModified: WallTimestamp;
}

/**
 * Modification history entry
 */
export interface ModificationEntry {
  /** Field that was modified */
  field: string;

  /** Previous value */
  previousValue: unknown;

  /** New value */
  newValue: unknown;

  /** Replica that made the modification */
  replica: ReplicaId;

  /** Timestamp of modification */
  timestamp: WallTimestamp;
}

// ============================================
// Default Values
// ============================================

const DEFAULT_QUALITY: PatternQualityMetrics = {
  level: 'unverified',
  successRate: 0,
  uniqueUsers: 0,
  avgConfidence: 0,
  feedbackScore: 0,
};

const DEFAULT_SHARING_CONFIG: PatternSharingConfigData = {
  policy: 'public',
  privacyLevel: 'anonymized',
  redistributable: true,
};

// ============================================
// PatternCRDT Class
// ============================================

/**
 * Composite CRDT for SharedPattern objects.
 *
 * Combines multiple CRDT types to provide automatic conflict resolution
 * for pattern data:
 * - Content, type, category, domain use LWW semantics
 * - Tags use OR-Set semantics (add wins)
 * - Usage count uses G-Counter
 * - Metadata fields use LWW
 *
 * @example
 * ```typescript
 * const pattern = new PatternCRDT('replica-1', {
 *   id: 'pattern-1',
 *   content: 'test code...',
 *   type: 'unit-test',
 *   category: 'test',
 *   domain: 'api',
 *   tags: ['typescript', 'jest'],
 * });
 *
 * // Update fields
 * pattern.setContent('updated code...');
 * pattern.addTag('integration');
 * pattern.incrementUsage();
 *
 * // Merge with remote
 * pattern.merge(remoteState);
 *
 * // Get current data
 * const data = pattern.getData();
 * ```
 */
export class PatternCRDT implements CRDT<PatternData, SerializedPatternCRDTState> {
  /** Pattern ID (immutable) */
  private readonly id: string;

  /** Local replica ID */
  private readonly replicaId: ReplicaId;

  // LWW fields
  private content: LWWRegister<string>;
  private type: LWWRegister<string>;
  private category: LWWRegister<string>;
  private domain: LWWRegister<string>;
  private quality: LWWRegister<PatternQualityMetrics>;
  private sharingConfig: LWWRegister<PatternSharingConfigData>;

  // ORSet fields
  private tags: ORSet<string>;

  // GCounter fields
  private usageCount: GCounter;

  // LWW Map for metadata
  private metadata: Map<string, LWWRegister<unknown>>;

  /** Vector clock for overall state */
  private vectorClock: VectorClock;

  /** Metadata */
  private crdtMetadata: CRDTMetadata;

  /** Sequence number for deltas */
  private sequenceNumber: number;

  /** Last delta clock */
  private lastDeltaClock: VectorClock;

  /** Modification history */
  private history: ModificationEntry[];

  /** Maximum history entries */
  private readonly maxHistorySize: number;

  /**
   * Create a new PatternCRDT
   *
   * @param replicaId - Local replica identifier
   * @param input - Pattern input data
   * @param options - Optional configuration
   */
  constructor(
    replicaId: ReplicaId,
    input: PatternInput,
    options?: {
      maxHistorySize?: number;
    }
  ) {
    this.id = input.id;
    this.replicaId = replicaId;
    this.maxHistorySize = options?.maxHistorySize ?? 100;

    // Initialize LWW registers
    this.content = new LWWRegister<string>(replicaId, `${input.id}-content`, input.content);
    this.type = new LWWRegister<string>(replicaId, `${input.id}-type`, input.type);
    this.category = new LWWRegister<string>(replicaId, `${input.id}-category`, input.category);
    this.domain = new LWWRegister<string>(replicaId, `${input.id}-domain`, input.domain);
    this.quality = new LWWRegister<PatternQualityMetrics>(
      replicaId,
      `${input.id}-quality`,
      input.quality ?? DEFAULT_QUALITY
    );
    this.sharingConfig = new LWWRegister<PatternSharingConfigData>(
      replicaId,
      `${input.id}-sharing`,
      input.sharingConfig ?? DEFAULT_SHARING_CONFIG
    );

    // Initialize ORSet for tags
    this.tags = new ORSet<string>(replicaId, `${input.id}-tags`);
    if (input.tags) {
      for (const tag of input.tags) {
        this.tags.add(tag);
      }
    }

    // Initialize GCounter for usage
    this.usageCount = new GCounter(replicaId, `${input.id}-usage`, 0);

    // Initialize metadata map
    this.metadata = new Map();
    if (input.metadata) {
      for (const [key, value] of Object.entries(input.metadata)) {
        this.metadata.set(
          key,
          new LWWRegister<unknown>(replicaId, `${input.id}-meta-${key}`, value)
        );
      }
    }

    // Initialize vector clock
    this.vectorClock = new VectorClock(replicaId);
    this.vectorClock.increment();

    this.sequenceNumber = 0;
    this.lastDeltaClock = this.vectorClock.clone();
    this.history = [];

    const now = Date.now();
    this.crdtMetadata = {
      createdAt: now,
      updatedAt: now,
      mergeCount: 0,
      lastModifiedBy: replicaId,
    };
  }

  // ============================================
  // Getters
  // ============================================

  /**
   * Get the current pattern data
   *
   * @returns Complete pattern data
   */
  value(): PatternData {
    return this.getData();
  }

  /**
   * Get the current pattern data
   *
   * @returns Complete pattern data
   */
  getData(): PatternData {
    const metadataObj: Record<string, unknown> = {};
    for (const [key, register] of this.metadata) {
      metadataObj[key] = register.value();
    }

    return {
      id: this.id,
      content: this.content.value() ?? '',
      type: this.type.value() ?? '',
      category: this.category.value() ?? '',
      domain: this.domain.value() ?? '',
      tags: this.tags.values(),
      metadata: metadataObj,
      quality: this.quality.value() ?? DEFAULT_QUALITY,
      usageCount: this.usageCount.value(),
      sharingConfig: this.sharingConfig.value() ?? DEFAULT_SHARING_CONFIG,
      lastModified: this.vectorClock.getLastModified(),
    };
  }

  /**
   * Get the pattern ID
   *
   * @returns Pattern ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get the content
   *
   * @returns Pattern content
   */
  getContent(): string {
    return this.content.value() ?? '';
  }

  /**
   * Get the type
   *
   * @returns Pattern type
   */
  getType(): string {
    return this.type.value() ?? '';
  }

  /**
   * Get the category
   *
   * @returns Pattern category
   */
  getCategory(): string {
    return this.category.value() ?? '';
  }

  /**
   * Get the domain
   *
   * @returns Pattern domain
   */
  getDomain(): string {
    return this.domain.value() ?? '';
  }

  /**
   * Get all tags
   *
   * @returns Array of tags
   */
  getTags(): string[] {
    return this.tags.values();
  }

  /**
   * Get the usage count
   *
   * @returns Usage count
   */
  getUsageCount(): number {
    return this.usageCount.value();
  }

  /**
   * Get a metadata value
   *
   * @param key - Metadata key
   * @returns Metadata value or undefined
   */
  getMetadata(key: string): unknown {
    return this.metadata.get(key)?.value();
  }

  /**
   * Get the modification history
   *
   * @returns History entries
   */
  getHistory(): ModificationEntry[] {
    return [...this.history];
  }

  // ============================================
  // Setters
  // ============================================

  /**
   * Set the content
   *
   * @param content - New content
   */
  setContent(content: string): void {
    this.recordHistory('content', this.content.value(), content);
    this.content.set(content);
    this.updateState();
  }

  /**
   * Set the type
   *
   * @param type - New type
   */
  setType(type: string): void {
    this.recordHistory('type', this.type.value(), type);
    this.type.set(type);
    this.updateState();
  }

  /**
   * Set the category
   *
   * @param category - New category
   */
  setCategory(category: string): void {
    this.recordHistory('category', this.category.value(), category);
    this.category.set(category);
    this.updateState();
  }

  /**
   * Set the domain
   *
   * @param domain - New domain
   */
  setDomain(domain: string): void {
    this.recordHistory('domain', this.domain.value(), domain);
    this.domain.set(domain);
    this.updateState();
  }

  /**
   * Add a tag
   *
   * @param tag - Tag to add
   * @returns Tag identifier
   */
  addTag(tag: string): string {
    this.recordHistory('tags', this.tags.values(), [...this.tags.values(), tag]);
    const result = this.tags.add(tag);
    this.updateState();
    return result;
  }

  /**
   * Remove a tag
   *
   * @param tag - Tag to remove
   * @returns Number of tags removed
   */
  removeTag(tag: string): number {
    const currentTags = this.tags.values();
    const count = this.tags.remove(tag);
    if (count > 0) {
      this.recordHistory('tags', currentTags, this.tags.values());
      this.updateState();
    }
    return count;
  }

  /**
   * Set a metadata value
   *
   * @param key - Metadata key
   * @param value - Metadata value
   */
  setMetadata(key: string, value: unknown): void {
    const existing = this.metadata.get(key);
    if (existing) {
      this.recordHistory(`metadata.${key}`, existing.value(), value);
      existing.set(value);
    } else {
      this.recordHistory(`metadata.${key}`, undefined, value);
      this.metadata.set(
        key,
        new LWWRegister<unknown>(this.replicaId, `${this.id}-meta-${key}`, value)
      );
    }
    this.updateState();
  }

  /**
   * Remove a metadata entry
   *
   * @param key - Key to remove
   * @returns True if removed
   */
  removeMetadata(key: string): boolean {
    const existing = this.metadata.get(key);
    if (existing) {
      this.recordHistory(`metadata.${key}`, existing.value(), undefined);
      this.metadata.delete(key);
      this.updateState();
      return true;
    }
    return false;
  }

  /**
   * Increment the usage count
   *
   * @param amount - Amount to increment (default 1)
   * @returns New usage count
   */
  incrementUsage(amount = 1): number {
    const result = this.usageCount.increment(amount);
    this.updateState();
    return result;
  }

  /**
   * Set quality metrics
   *
   * @param quality - New quality metrics
   */
  setQuality(quality: PatternQualityMetrics): void {
    this.recordHistory('quality', this.quality.value(), quality);
    this.quality.set(quality);
    this.updateState();
  }

  /**
   * Set sharing configuration
   *
   * @param config - New sharing config
   */
  setSharingConfig(config: PatternSharingConfigData): void {
    this.recordHistory('sharingConfig', this.sharingConfig.value(), config);
    this.sharingConfig.set(config);
    this.updateState();
  }

  // ============================================
  // State Management
  // ============================================

  /**
   * Update internal state after modification
   */
  private updateState(): void {
    this.vectorClock.increment();
    this.sequenceNumber++;
    this.crdtMetadata.updatedAt = Date.now();
    this.crdtMetadata.lastModifiedBy = this.replicaId;
  }

  /**
   * Record a modification in history
   */
  private recordHistory(field: string, prev: unknown, next: unknown): void {
    this.history.push({
      field,
      previousValue: prev,
      newValue: next,
      replica: this.replicaId,
      timestamp: Date.now(),
    });

    // Trim history if too large
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get the serializable state
   *
   * @returns CRDT state
   */
  state(): CRDTState<SerializedPatternCRDTState> {
    const metadataObj: Record<string, SerializedLWWRegisterState<unknown>> = {};
    for (const [key, register] of this.metadata) {
      metadataObj[key] = register.state().value;
    }

    return {
      type: CRDTType.PatternCRDT,
      id: this.id,
      vectorClock: this.vectorClock.serialize(),
      origin: this.replicaId,
      value: {
        id: this.id,
        content: this.content.state().value,
        type: this.type.state().value,
        category: this.category.state().value,
        domain: this.domain.state().value,
        tags: this.tags.state().value,
        metadata: metadataObj,
        quality: this.quality.state().value,
        usageCount: this.usageCount.state().value,
        sharingConfig: this.sharingConfig.state().value,
      },
      metadata: { ...this.crdtMetadata },
      stateVersion: 1,
    };
  }

  /**
   * Restore a PatternCRDT from serialized state
   *
   * @param state - Serialized state
   * @param replicaId - Local replica ID
   * @returns Restored PatternCRDT
   */
  static fromState(
    state: CRDTState<SerializedPatternCRDTState>,
    replicaId: ReplicaId
  ): PatternCRDT {
    if (state.type !== CRDTType.PatternCRDT) {
      throw new CRDTError(
        `Invalid CRDT type: expected ${CRDTType.PatternCRDT}, got ${state.type}`,
        CRDTErrorCode.InvalidType,
        state.id
      );
    }

    const v = state.value;
    const pattern = new PatternCRDT(replicaId, {
      id: v.id,
      content: v.content.value,
      type: v.type.value,
      category: v.category.value,
      domain: v.domain.value,
    });

    // Restore LWW registers with correct timestamps
    pattern.content = LWWRegister.fromState<string>(
      {
        type: CRDTType.LWWRegister,
        id: `${v.id}-content`,
        vectorClock: state.vectorClock,
        origin: state.origin,
        value: v.content,
        metadata: state.metadata,
        stateVersion: 1,
      },
      replicaId
    );

    pattern.type = LWWRegister.fromState<string>(
      {
        type: CRDTType.LWWRegister,
        id: `${v.id}-type`,
        vectorClock: state.vectorClock,
        origin: state.origin,
        value: v.type,
        metadata: state.metadata,
        stateVersion: 1,
      },
      replicaId
    );

    pattern.category = LWWRegister.fromState<string>(
      {
        type: CRDTType.LWWRegister,
        id: `${v.id}-category`,
        vectorClock: state.vectorClock,
        origin: state.origin,
        value: v.category,
        metadata: state.metadata,
        stateVersion: 1,
      },
      replicaId
    );

    pattern.domain = LWWRegister.fromState<string>(
      {
        type: CRDTType.LWWRegister,
        id: `${v.id}-domain`,
        vectorClock: state.vectorClock,
        origin: state.origin,
        value: v.domain,
        metadata: state.metadata,
        stateVersion: 1,
      },
      replicaId
    );

    pattern.quality = LWWRegister.fromState<PatternQualityMetrics>(
      {
        type: CRDTType.LWWRegister,
        id: `${v.id}-quality`,
        vectorClock: state.vectorClock,
        origin: state.origin,
        value: v.quality,
        metadata: state.metadata,
        stateVersion: 1,
      },
      replicaId
    );

    pattern.sharingConfig = LWWRegister.fromState<PatternSharingConfigData>(
      {
        type: CRDTType.LWWRegister,
        id: `${v.id}-sharing`,
        vectorClock: state.vectorClock,
        origin: state.origin,
        value: v.sharingConfig,
        metadata: state.metadata,
        stateVersion: 1,
      },
      replicaId
    );

    // Restore ORSet for tags
    pattern.tags = ORSet.fromState<string>(
      {
        type: CRDTType.ORSet,
        id: `${v.id}-tags`,
        vectorClock: state.vectorClock,
        origin: state.origin,
        value: v.tags,
        metadata: state.metadata,
        stateVersion: 1,
      },
      replicaId
    );

    // Restore GCounter for usage
    pattern.usageCount = GCounter.fromState(
      {
        type: CRDTType.GCounter,
        id: `${v.id}-usage`,
        vectorClock: state.vectorClock,
        origin: state.origin,
        value: v.usageCount,
        metadata: state.metadata,
        stateVersion: 1,
      },
      replicaId
    );

    // Restore metadata
    pattern.metadata.clear();
    for (const [key, lwwState] of Object.entries(v.metadata)) {
      pattern.metadata.set(
        key,
        LWWRegister.fromState<unknown>(
          {
            type: CRDTType.LWWRegister,
            id: `${v.id}-meta-${key}`,
            vectorClock: state.vectorClock,
            origin: state.origin,
            value: lwwState,
            metadata: state.metadata,
            stateVersion: 1,
          },
          replicaId
        )
      );
    }

    // Restore vector clock
    pattern.vectorClock = VectorClock.fromSerialized(state.vectorClock, replicaId);

    // Restore metadata
    pattern.crdtMetadata = { ...state.metadata };

    return pattern;
  }

  // ============================================
  // Merge Operations
  // ============================================

  /**
   * Merge with another PatternCRDT state
   *
   * Each field is merged according to its CRDT type:
   * - LWW fields: last writer wins
   * - ORSet fields: add wins for concurrent add/remove
   * - GCounter fields: max per replica
   *
   * @param other - Other pattern state to merge
   * @returns Merge result
   */
  merge(other: CRDTState<SerializedPatternCRDTState>): MergeResult<SerializedPatternCRDTState> {
    const startTime = Date.now();
    const allConflicts: ConflictInfo[] = [];
    let entriesMerged = 0;
    let localChanged = false;

    if (other.type !== CRDTType.PatternCRDT) {
      throw new CRDTError(
        `Cannot merge different CRDT types`,
        CRDTErrorCode.InvalidType,
        this.id
      );
    }

    if (other.id !== this.id) {
      throw new CRDTError(
        `Cannot merge different patterns`,
        CRDTErrorCode.InvalidState,
        this.id
      );
    }

    const v = other.value;

    // Merge LWW fields
    const contentResult = this.content.merge({
      type: CRDTType.LWWRegister,
      id: `${this.id}-content`,
      vectorClock: other.vectorClock,
      origin: other.origin,
      value: v.content,
      metadata: other.metadata,
      stateVersion: 1,
    });
    if (contentResult.localChanged) localChanged = true;
    allConflicts.push(...contentResult.conflicts);
    entriesMerged++;

    const typeResult = this.type.merge({
      type: CRDTType.LWWRegister,
      id: `${this.id}-type`,
      vectorClock: other.vectorClock,
      origin: other.origin,
      value: v.type,
      metadata: other.metadata,
      stateVersion: 1,
    });
    if (typeResult.localChanged) localChanged = true;
    allConflicts.push(...typeResult.conflicts);
    entriesMerged++;

    const categoryResult = this.category.merge({
      type: CRDTType.LWWRegister,
      id: `${this.id}-category`,
      vectorClock: other.vectorClock,
      origin: other.origin,
      value: v.category,
      metadata: other.metadata,
      stateVersion: 1,
    });
    if (categoryResult.localChanged) localChanged = true;
    allConflicts.push(...categoryResult.conflicts);
    entriesMerged++;

    const domainResult = this.domain.merge({
      type: CRDTType.LWWRegister,
      id: `${this.id}-domain`,
      vectorClock: other.vectorClock,
      origin: other.origin,
      value: v.domain,
      metadata: other.metadata,
      stateVersion: 1,
    });
    if (domainResult.localChanged) localChanged = true;
    allConflicts.push(...domainResult.conflicts);
    entriesMerged++;

    const qualityResult = this.quality.merge({
      type: CRDTType.LWWRegister,
      id: `${this.id}-quality`,
      vectorClock: other.vectorClock,
      origin: other.origin,
      value: v.quality,
      metadata: other.metadata,
      stateVersion: 1,
    });
    if (qualityResult.localChanged) localChanged = true;
    allConflicts.push(...qualityResult.conflicts);
    entriesMerged++;

    const sharingResult = this.sharingConfig.merge({
      type: CRDTType.LWWRegister,
      id: `${this.id}-sharing`,
      vectorClock: other.vectorClock,
      origin: other.origin,
      value: v.sharingConfig,
      metadata: other.metadata,
      stateVersion: 1,
    });
    if (sharingResult.localChanged) localChanged = true;
    allConflicts.push(...sharingResult.conflicts);
    entriesMerged++;

    // Merge ORSet tags
    const tagsResult = this.tags.merge({
      type: CRDTType.ORSet,
      id: `${this.id}-tags`,
      vectorClock: other.vectorClock,
      origin: other.origin,
      value: v.tags,
      metadata: other.metadata,
      stateVersion: 1,
    });
    if (tagsResult.localChanged) localChanged = true;
    allConflicts.push(...tagsResult.conflicts);
    entriesMerged++;

    // Merge GCounter usage
    const usageResult = this.usageCount.merge({
      type: CRDTType.GCounter,
      id: `${this.id}-usage`,
      vectorClock: other.vectorClock,
      origin: other.origin,
      value: v.usageCount,
      metadata: other.metadata,
      stateVersion: 1,
    });
    if (usageResult.localChanged) localChanged = true;
    entriesMerged++;

    // Merge metadata entries
    for (const [key, lwwState] of Object.entries(v.metadata)) {
      const existing = this.metadata.get(key);
      if (existing) {
        const metaResult = existing.merge({
          type: CRDTType.LWWRegister,
          id: `${this.id}-meta-${key}`,
          vectorClock: other.vectorClock,
          origin: other.origin,
          value: lwwState,
          metadata: other.metadata,
          stateVersion: 1,
        });
        if (metaResult.localChanged) localChanged = true;
        allConflicts.push(...metaResult.conflicts);
      } else {
        this.metadata.set(
          key,
          LWWRegister.fromState<unknown>(
            {
              type: CRDTType.LWWRegister,
              id: `${this.id}-meta-${key}`,
              vectorClock: other.vectorClock,
              origin: other.origin,
              value: lwwState,
              metadata: other.metadata,
              stateVersion: 1,
            },
            this.replicaId
          )
        );
        localChanged = true;
      }
      entriesMerged++;
    }

    // Merge vector clock
    const otherClock = VectorClock.fromSerialized(other.vectorClock, this.replicaId);
    this.vectorClock.merge(otherClock);

    // Update metadata
    this.crdtMetadata.mergeCount++;
    this.crdtMetadata.updatedAt = Date.now();
    if (localChanged) {
      this.crdtMetadata.lastModifiedBy = other.origin;
    }

    const stats: MergeStats = {
      duration: Date.now() - startTime,
      entriesMerged,
      autoResolved: allConflicts.length,
      tombstonesProcessed: tagsResult.stats.tombstonesProcessed,
      memoryDelta: entriesMerged * 32,
    };

    return {
      success: true,
      mergedState: this.state(),
      localChanged,
      conflicts: allConflicts,
      stats,
    };
  }

  // ============================================
  // Delta Operations
  // ============================================

  /**
   * Generate a delta update since the last sync
   *
   * @param since - Vector clock of last sync
   * @returns Delta update or null if no changes
   */
  generateDelta(since?: SerializedVectorClock): CRDTDelta<SerializedPatternCRDTState> | null {
    const sinceClock = since
      ? VectorClock.fromSerialized(since, this.replicaId)
      : this.lastDeltaClock;

    if (!this.vectorClock.happenedAfter(sinceClock) &&
        !this.vectorClock.isConcurrent(sinceClock)) {
      return null;
    }

    const operations: DeltaOperation<SerializedPatternCRDTState>[] = [];

    // Generate a full state delta for simplicity
    // In production, you'd want to track individual field changes
    operations.push({
      op: DeltaOpType.Set,
      value: this.state().value,
      replica: this.replicaId,
    });

    const delta: CRDTDelta<SerializedPatternCRDTState> = {
      crdtId: this.id,
      type: CRDTType.PatternCRDT,
      origin: this.replicaId,
      vectorClock: this.vectorClock.serialize(),
      operations,
      sequenceNumber: this.sequenceNumber,
      generatedAt: Date.now(),
    };

    this.lastDeltaClock = this.vectorClock.clone();
    return delta;
  }

  /**
   * Apply a delta update
   *
   * @param delta - Delta to apply
   * @returns True if applied successfully
   */
  applyDelta(delta: CRDTDelta<SerializedPatternCRDTState>): boolean {
    if (delta.type !== CRDTType.PatternCRDT) {
      return false;
    }

    if (delta.crdtId !== this.id) {
      return false;
    }

    let changed = false;

    for (const op of delta.operations) {
      if (op.op === DeltaOpType.Set && op.value) {
        // Apply as full state merge
        const result = this.merge({
          type: CRDTType.PatternCRDT,
          id: this.id,
          vectorClock: delta.vectorClock,
          origin: delta.origin,
          value: op.value,
          metadata: this.crdtMetadata,
          stateVersion: 1,
        });
        if (result.localChanged) {
          changed = true;
        }
      }
    }

    return changed;
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Create a deep copy
   *
   * @returns Cloned PatternCRDT
   */
  clone(): PatternCRDT {
    return PatternCRDT.fromState(this.state(), this.replicaId);
  }

  /**
   * Get the replica ID
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
   * Get CRDT metadata
   *
   * @returns Metadata copy
   */
  getCRDTMetadata(): CRDTMetadata {
    return { ...this.crdtMetadata };
  }

  /**
   * String representation
   *
   * @returns Debug string
   */
  toString(): string {
    return `PatternCRDT{id=${this.id}, type=${this.getType()}, tags=${this.tags.size()}, usage=${this.usageCount.value()}}`;
  }
}
