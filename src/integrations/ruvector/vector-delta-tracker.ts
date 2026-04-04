/**
 * R3: Sparse Vector Delta Event Sourcing (ADR-087, Milestone 1)
 *
 * Tracks pattern embedding version history using sparse delta encoding.
 * Only changed dimensions are stored, giving massive compression for
 * typical pattern updates where few dimensions change.
 *
 * Storage: In-memory (Map-based). SQLite integration deferred to later task.
 *
 * @module integrations/ruvector/vector-delta-tracker
 */

import { isDeltaEventSourcingEnabled } from './feature-flags.js';

// ============================================================================
// Types
// ============================================================================

/** A single changed dimension in a vector update */
export interface SparseChange {
  index: number;
  oldValue: number;
  newValue: number;
}

/** A delta event representing a change to a pattern embedding */
export interface PatternDelta {
  patternId: string;
  version: number;
  timestamp: number;
  deltaType: 'genesis' | 'update' | 'rollback';
  sparseChanges: SparseChange[];
  metadata?: Record<string, unknown>;
  compressedSize?: number;
}

/** A full vector snapshot at a specific version */
export interface DeltaSnapshot {
  patternId: string;
  version: number;
  fullVector: number[];
  timestamp: number;
}

/** Configuration for the VectorDeltaTracker */
export interface VectorDeltaTrackerConfig {
  /** Max deltas to retain per pattern (default: 50) */
  maxHistoryPerPattern: number;
  /** Full snapshot every N deltas (default: 10) */
  snapshotInterval: number;
  /** Buffer deltas before flushing (default: 20) */
  batchSize: number;
  /** Min absolute diff to count as changed (default: 1e-7) */
  epsilon: number;
}

/** Summary statistics */
export interface VectorDeltaTrackerStats {
  totalPatterns: number;
  totalDeltas: number;
  avgDeltasPerPattern: number;
}

const DEFAULT_CONFIG: VectorDeltaTrackerConfig = {
  maxHistoryPerPattern: 50,
  snapshotInterval: 10,
  batchSize: 20,
  epsilon: 1e-7,
};

// ============================================================================
// VectorDeltaTracker
// ============================================================================

/**
 * Tracks pattern embedding version history using sparse delta encoding.
 * Genesis creates a v0 snapshot; subsequent updates store only changed dims.
 * Periodic snapshots enable fast reconstruction via nearest-snapshot + replay.
 */
export class VectorDeltaTracker {
  private readonly config: VectorDeltaTrackerConfig;
  private readonly history: Map<string, PatternDelta[]> = new Map();
  private readonly snapshots: Map<string, DeltaSnapshot[]> = new Map();
  private readonly versions: Map<string, number> = new Map();
  private readonly buffer: PatternDelta[] = [];

  constructor(config?: Partial<VectorDeltaTrackerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Create v0 genesis. All dimensions stored as changes from zero vector. */
  recordGenesis(
    patternId: string,
    vector: number[],
    metadata?: Record<string, unknown>,
  ): PatternDelta {
    if (this.versions.has(patternId)) {
      throw new Error(
        `Genesis already exists for pattern ${patternId} (version ${this.versions.get(patternId)})`,
      );
    }

    const sparseChanges = this.computeSparseChanges(
      new Array<number>(vector.length).fill(0), vector,
    );
    const delta: PatternDelta = {
      patternId, version: 0, timestamp: Date.now(),
      deltaType: 'genesis', sparseChanges, metadata,
      compressedSize: sparseChanges.length,
    };
    const snapshot: DeltaSnapshot = {
      patternId, version: 0,
      fullVector: [...vector], timestamp: delta.timestamp,
    };

    this.versions.set(patternId, 0);
    this.getOrCreate(this.history, patternId).push(delta);
    this.getOrCreate(this.snapshots, patternId).push(snapshot);
    this.buffer.push(delta);
    return delta;
  }

  /** Record a sparse delta between old and new vectors. */
  recordDelta(
    patternId: string,
    oldVector: number[],
    newVector: number[],
    metadata?: Record<string, unknown>,
  ): PatternDelta {
    const cur = this.versions.get(patternId);
    if (cur === undefined) {
      throw new Error(
        `No genesis found for pattern ${patternId}. Call recordGenesis() first.`,
      );
    }
    const nextVersion = cur + 1;
    const sparseChanges = this.computeSparseChanges(oldVector, newVector);
    const delta: PatternDelta = {
      patternId, version: nextVersion, timestamp: Date.now(),
      deltaType: 'update', sparseChanges, metadata,
      compressedSize: sparseChanges.length,
    };

    this.versions.set(patternId, nextVersion);
    this.getOrCreate(this.history, patternId).push(delta);
    this.buffer.push(delta);

    if (nextVersion % this.config.snapshotInterval === 0) {
      this.getOrCreate(this.snapshots, patternId).push({
        patternId, version: nextVersion,
        fullVector: [...newVector], timestamp: delta.timestamp,
      });
    }
    this.enforceRetention(patternId);
    return delta;
  }

  /** Get delta history for a pattern, newest first. */
  getHistory(patternId: string, limit?: number): PatternDelta[] {
    const deltas = this.history.get(patternId);
    if (!deltas || deltas.length === 0) return [];
    const reversed = [...deltas].reverse();
    return (limit !== undefined && limit > 0) ? reversed.slice(0, limit) : reversed;
  }

  /** Rollback to a version. Returns null if version does not exist. */
  rollback(patternId: string, targetVersion: number): DeltaSnapshot | null {
    const vector = this.reconstructAtVersion(patternId, targetVersion);
    if (vector === null) return null;
    return { patternId, version: targetVersion, fullVector: vector, timestamp: Date.now() };
  }

  /** Current version for a pattern (-1 if unknown). */
  getVersion(patternId: string): number {
    return this.versions.get(patternId) ?? -1;
  }

  /** Rebuild full vector at a version via nearest snapshot + forward replay. */
  reconstructAtVersion(patternId: string, version: number): number[] | null {
    const deltas = this.history.get(patternId);
    if (!deltas || deltas.length === 0) return null;
    const cur = this.versions.get(patternId)!;
    if (version < 0 || version > cur) return null;

    const snaps = this.snapshots.get(patternId) || [];
    let base: DeltaSnapshot | null = null;
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].version <= version) { base = snaps[i]; break; }
    }
    if (!base) return null;

    const vector = [...base.fullVector];
    const start = base.version + 1;
    for (const d of deltas) {
      if (d.version < start) continue;
      if (d.version > version) break;
      this.applySparseForward(vector, d.sparseChanges);
    }
    return vector;
  }

  /** Remove old deltas beyond retention limit. Returns count pruned. */
  pruneHistory(patternId: string, keepVersions?: number): number {
    const maxKeep = keepVersions ?? this.config.maxHistoryPerPattern;
    const deltas = this.history.get(patternId);
    if (!deltas || deltas.length <= maxKeep) return 0;

    const pruneCount = deltas.length - maxKeep;
    const pruned = deltas.slice(0, pruneCount);
    const kept = deltas.slice(pruneCount);

    // Always preserve genesis
    const gi = pruned.findIndex(d => d.deltaType === 'genesis');
    if (gi >= 0) { kept.unshift(pruned[gi]); pruned.splice(gi, 1); }

    this.history.set(patternId, kept);

    // Prune old snapshots (keep genesis + those >= oldest kept version)
    const oldest = kept[0]?.version ?? 0;
    const snaps = this.snapshots.get(patternId);
    if (snaps) {
      this.snapshots.set(patternId, snaps.filter(
        s => s.version === 0 || s.version >= oldest,
      ));
    }
    return pruned.length;
  }

  /** Summary statistics. */
  getStats(): VectorDeltaTrackerStats {
    let totalDeltas = 0;
    for (const d of this.history.values()) totalDeltas += d.length;
    const totalPatterns = this.history.size;
    return {
      totalPatterns, totalDeltas,
      avgDeltasPerPattern: totalPatterns > 0 ? totalDeltas / totalPatterns : 0,
    };
  }

  /** Flush write batch. Returns buffered deltas and clears the buffer. */
  flush(): PatternDelta[] {
    const flushed = [...this.buffer];
    this.buffer.length = 0;
    return flushed;
  }

  /** Number of buffered (unflushed) deltas. */
  getBufferSize(): number { return this.buffer.length; }

  /** Clear all data. */
  clear(): void {
    this.history.clear();
    this.snapshots.clear();
    this.versions.clear();
    this.buffer.length = 0;
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private computeSparseChanges(old: number[], cur: number[]): SparseChange[] {
    const changes: SparseChange[] = [];
    const len = Math.max(old.length, cur.length);
    for (let i = 0; i < len; i++) {
      const ov = i < old.length ? old[i] : 0;
      const nv = i < cur.length ? cur[i] : 0;
      if (Math.abs(ov - nv) > this.config.epsilon) {
        changes.push({ index: i, oldValue: ov, newValue: nv });
      }
    }
    return changes;
  }

  private applySparseForward(vector: number[], changes: SparseChange[]): void {
    for (const c of changes) {
      while (vector.length <= c.index) vector.push(0);
      vector[c.index] = c.newValue;
    }
  }

  private enforceRetention(patternId: string): void {
    this.pruneHistory(patternId, this.config.maxHistoryPerPattern);
  }

  private getOrCreate<T>(map: Map<string, T[]>, key: string): T[] {
    let arr = map.get(key);
    if (!arr) { arr = []; map.set(key, arr); }
    return arr;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a VectorDeltaTracker instance.
 * Returns null if useDeltaEventSourcing feature flag is disabled.
 */
export function createVectorDeltaTracker(
  config?: Partial<VectorDeltaTrackerConfig>,
): VectorDeltaTracker | null {
  if (!isDeltaEventSourcingEnabled()) return null;
  return new VectorDeltaTracker(config);
}
