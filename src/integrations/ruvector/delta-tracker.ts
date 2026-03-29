/**
 * R3: Delta Event Sourcing for Pattern History
 *
 * Tracks pattern version history as a sequence of delta events.
 * Enables rollback to any previous state and incremental sync between agents.
 * Uses SQLite for persistence via the existing database layer.
 *
 * @module integrations/ruvector/delta-tracker
 */

import { type Database as DatabaseType, type Statement } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as fastJsonPatch from 'fast-json-patch';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * RFC 6902 JSON Patch operation
 */
export interface JsonPatch {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

/**
 * A single delta event representing a change to a pattern
 */
export interface DeltaEvent {
  /** Unique delta ID (UUID) */
  id: string;
  /** Pattern being tracked */
  patternId: string;
  /** Sequential version number (0 = genesis) */
  version: number;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Event type */
  type: 'genesis' | 'update' | 'rollback';
  /** RFC 6902 JSON Patch operations (forward) */
  patch: JsonPatch[];
  /** RFC 6902 JSON Patch operations (reverse, for undo) */
  reversePatch: JsonPatch[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for the DeltaTracker
 */
export interface DeltaTrackerConfig {
  /** Maximum versions to retain per pattern. Default: 100 */
  maxVersionsPerPattern?: number;
  /** Reserved for future LZ4 compression support. Default: false */
  compressDeltas?: boolean;
}

// ============================================================================
// Schema
// ============================================================================

/**
 * DDL for the pattern_deltas table
 */
export const PATTERN_DELTAS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS pattern_deltas (
    id TEXT PRIMARY KEY,
    pattern_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('genesis', 'update', 'rollback')),
    patch TEXT NOT NULL DEFAULT '[]',
    reverse_patch TEXT NOT NULL DEFAULT '[]',
    metadata TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_pattern_deltas_pid_version
    ON pattern_deltas (pattern_id, version);
  CREATE INDEX IF NOT EXISTS idx_pattern_deltas_timestamp
    ON pattern_deltas (timestamp);
`;

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Compute forward and reverse RFC 6902 patches between two objects.
 * Uses fast-json-patch for reliable diff generation.
 */
function computePatches(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { forward: JsonPatch[]; reverse: JsonPatch[] } {
  const forward = fastJsonPatch.compare(before, after) as JsonPatch[];
  const reverse = fastJsonPatch.compare(after, before) as JsonPatch[];
  return { forward, reverse };
}

/**
 * Apply a sequence of JSON Patch operations to an object (immutable).
 * Returns a deep clone with patches applied.
 */
function applyPatches(
  obj: Record<string, unknown>,
  patches: JsonPatch[],
): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
  const result = fastJsonPatch.applyPatch(cloned, patches as fastJsonPatch.Operation[]);
  return result.newDocument as Record<string, unknown>;
}

// ============================================================================
// Database row type
// ============================================================================

interface DeltaRow {
  id: string;
  pattern_id: string;
  version: number;
  timestamp: number;
  type: string;
  patch: string;
  reverse_patch: string;
  metadata: string | null;
}

function rowToEvent(row: DeltaRow): DeltaEvent {
  return {
    id: row.id,
    patternId: row.pattern_id,
    version: row.version,
    timestamp: row.timestamp,
    type: row.type as DeltaEvent['type'],
    patch: JSON.parse(row.patch) as JsonPatch[],
    reversePatch: JSON.parse(row.reverse_patch) as JsonPatch[],
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
  };
}

// ============================================================================
// DeltaTracker
// ============================================================================

/**
 * Tracks pattern version history as delta events with rollback support.
 *
 * @example
 * ```typescript
 * const tracker = new DeltaTracker(db);
 * tracker.initialize();
 *
 * tracker.createGenesis('pat-1', { name: 'Login test', confidence: 0.5 });
 * tracker.recordDelta('pat-1', { name: 'Login test', confidence: 0.5 }, { name: 'Login test', confidence: 0.9 });
 *
 * const state = tracker.rollback('pat-1', 0); // back to genesis
 * ```
 */
export class DeltaTracker {
  private readonly db: DatabaseType;
  private readonly config: Required<DeltaTrackerConfig>;
  private prepared: Map<string, Statement> = new Map();
  private initialized = false;

  constructor(db: DatabaseType, config?: DeltaTrackerConfig) {
    this.db = db;
    this.config = {
      maxVersionsPerPattern: config?.maxVersionsPerPattern ?? 100,
      compressDeltas: config?.compressDeltas ?? false,
    };
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  /**
   * Create the pattern_deltas table and indexes if they do not exist.
   */
  initialize(): void {
    if (this.initialized) return;
    this.db.exec(PATTERN_DELTAS_SCHEMA);
    this.prepareStatements();
    this.initialized = true;
  }

  private prepareStatements(): void {
    this.prepared.set(
      'insert',
      this.db.prepare(`
        INSERT INTO pattern_deltas (id, pattern_id, version, timestamp, type, patch, reverse_patch, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `),
    );

    this.prepared.set(
      'getHistory',
      this.db.prepare(`
        SELECT * FROM pattern_deltas
        WHERE pattern_id = ?
        ORDER BY version ASC
      `),
    );

    this.prepared.set(
      'currentVersion',
      this.db.prepare(`
        SELECT MAX(version) as max_version FROM pattern_deltas
        WHERE pattern_id = ?
      `),
    );

    this.prepared.set(
      'incrementalSync',
      this.db.prepare(`
        SELECT * FROM pattern_deltas
        WHERE timestamp > ?
        ORDER BY timestamp ASC
      `),
    );

    this.prepared.set(
      'countForPattern',
      this.db.prepare(`
        SELECT COUNT(*) as cnt FROM pattern_deltas
        WHERE pattern_id = ?
      `),
    );

    this.prepared.set(
      'deleteOldest',
      this.db.prepare(`
        DELETE FROM pattern_deltas
        WHERE pattern_id = ? AND version IN (
          SELECT version FROM pattern_deltas
          WHERE pattern_id = ?
          ORDER BY version ASC
          LIMIT ?
        )
      `),
    );
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('DeltaTracker not initialized. Call initialize() first.');
    }
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Create a genesis snapshot for a pattern (version 0).
   * The full object is stored in metadata.snapshot; patches are empty.
   */
  createGenesis(patternId: string, snapshot: object, metadata?: Record<string, unknown>): DeltaEvent {
    this.ensureInitialized();

    const existing = this.getCurrentVersion(patternId);
    if (existing >= 0) {
      throw new Error(`Genesis already exists for pattern ${patternId} (current version: ${existing})`);
    }

    const event: DeltaEvent = {
      id: uuidv4(),
      patternId,
      version: 0,
      timestamp: Date.now(),
      type: 'genesis',
      patch: [],
      reversePatch: [],
      metadata: { ...metadata, snapshot },
    };

    this.insertEvent(event);
    return event;
  }

  /**
   * Record a delta between two states of a pattern.
   * Computes forward and reverse patches automatically.
   */
  recordDelta(
    patternId: string,
    before: object,
    after: object,
    metadata?: Record<string, unknown>,
  ): DeltaEvent {
    this.ensureInitialized();

    const currentVersion = this.getCurrentVersion(patternId);
    if (currentVersion < 0) {
      throw new Error(`No genesis found for pattern ${patternId}. Call createGenesis() first.`);
    }

    const { forward, reverse } = computePatches(
      before as Record<string, unknown>,
      after as Record<string, unknown>,
    );

    const event: DeltaEvent = {
      id: uuidv4(),
      patternId,
      version: currentVersion + 1,
      timestamp: Date.now(),
      type: 'update',
      patch: forward,
      reversePatch: reverse,
      metadata,
    };

    this.insertEvent(event);
    this.enforceRetention(patternId);

    return event;
  }

  /**
   * Rollback a pattern to a specific version by applying reverse patches
   * from the current version back to the target version.
   *
   * Returns the reconstructed object at the target version.
   */
  rollback(patternId: string, toVersion: number): object {
    this.ensureInitialized();

    const history = this.getHistory(patternId);
    if (history.length === 0) {
      throw new Error(`No history found for pattern ${patternId}`);
    }

    const currentVersion = history[history.length - 1].version;
    if (toVersion < 0 || toVersion > currentVersion) {
      throw new Error(
        `Invalid rollback version ${toVersion}. Valid range: 0-${currentVersion}`,
      );
    }

    if (toVersion === currentVersion) {
      // Already at target; reconstruct current state
      return this.reconstructState(history, currentVersion);
    }

    // Reconstruct the state at the target version
    const targetState = this.reconstructState(history, toVersion);

    // Record a rollback event from current to target
    const currentState = this.reconstructState(history, currentVersion);
    const { forward, reverse } = computePatches(
      currentState as Record<string, unknown>,
      targetState as Record<string, unknown>,
    );

    const rollbackEvent: DeltaEvent = {
      id: uuidv4(),
      patternId,
      version: currentVersion + 1,
      timestamp: Date.now(),
      type: 'rollback',
      patch: forward,
      reversePatch: reverse,
      metadata: { rolledBackTo: toVersion },
    };

    this.insertEvent(rollbackEvent);
    this.enforceRetention(patternId);

    return targetState;
  }

  /**
   * Get the full delta history for a pattern, ordered by version ascending.
   */
  getHistory(patternId: string): DeltaEvent[] {
    this.ensureInitialized();
    const rows = this.prepared.get('getHistory')!.all(patternId) as DeltaRow[];
    return rows.map(rowToEvent);
  }

  /**
   * Get all delta events created after a given timestamp (for incremental sync).
   */
  incrementalSync(since: number): DeltaEvent[] {
    this.ensureInitialized();
    const rows = this.prepared.get('incrementalSync')!.all(since) as DeltaRow[];
    return rows.map(rowToEvent);
  }

  /**
   * Get the current (highest) version number for a pattern.
   * Returns -1 if no events exist for the pattern.
   */
  getCurrentVersion(patternId: string): number {
    this.ensureInitialized();
    const row = this.prepared.get('currentVersion')!.get(patternId) as { max_version: number | null };
    return row.max_version ?? -1;
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  private insertEvent(event: DeltaEvent): void {
    this.prepared.get('insert')!.run(
      event.id,
      event.patternId,
      event.version,
      event.timestamp,
      event.type,
      JSON.stringify(event.patch),
      JSON.stringify(event.reversePatch),
      event.metadata ? JSON.stringify(event.metadata) : null,
    );
  }

  /**
   * Reconstruct pattern state at a given version by replaying patches
   * from genesis forward.
   */
  private reconstructState(
    history: DeltaEvent[],
    targetVersion: number,
  ): Record<string, unknown> {
    const genesis = history.find((e) => e.type === 'genesis');
    if (!genesis || !genesis.metadata?.snapshot) {
      throw new Error('Cannot reconstruct state: no genesis snapshot found');
    }

    let state = JSON.parse(JSON.stringify(
      genesis.metadata.snapshot as Record<string, unknown>,
    )) as Record<string, unknown>;

    // Apply forward patches from version 1 up to targetVersion
    for (const event of history) {
      if (event.version === 0) continue;
      if (event.version > targetVersion) break;
      state = applyPatches(state, event.patch);
    }

    return state;
  }

  /**
   * Enforce maxVersionsPerPattern retention by deleting oldest deltas.
   * Always keeps the genesis event (version 0).
   */
  private enforceRetention(patternId: string): void {
    const { maxVersionsPerPattern } = this.config;
    const row = this.prepared.get('countForPattern')!.get(patternId) as { cnt: number };
    const count = row.cnt;

    if (count > maxVersionsPerPattern) {
      const excess = count - maxVersionsPerPattern;
      // Delete oldest non-genesis events
      this.db
        .prepare(
          `DELETE FROM pattern_deltas
           WHERE pattern_id = ? AND version != 0 AND id IN (
             SELECT id FROM pattern_deltas
             WHERE pattern_id = ? AND version != 0
             ORDER BY version ASC
             LIMIT ?
           )`,
        )
        .run(patternId, patternId, excess);
    }
  }
}
