/**
 * Witness Chain - Cryptographic Audit Trail for QE Decisions
 * ADR-070: Witness Chain Audit Compliance
 *
 * Implements a SHA-256 hash-chained append-only log for audit compliance.
 * Every quality gate decision, pattern mutation, and dream cycle action
 * is recorded with cryptographic integrity guarantees.
 *
 * The chain is tamper-evident: modifying any entry breaks the hash chain,
 * detectable by verify().
 */

import { createHash } from 'crypto';
import { type Database as DatabaseType } from 'better-sqlite3';
import { getUnifiedMemory } from '../kernel/unified-memory.js';
import { toErrorMessage } from '../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Actions that can be recorded in the witness chain
 */
export type WitnessActionType =
  | 'PATTERN_CREATE'
  | 'PATTERN_UPDATE'
  | 'PATTERN_PROMOTE'
  | 'PATTERN_QUARANTINE'
  | 'DREAM_MERGE'
  | 'DREAM_DISCARD'
  | 'QUALITY_GATE_PASS'
  | 'QUALITY_GATE_FAIL'
  | 'ROUTING_DECISION';

/**
 * A single entry in the witness chain
 */
export interface WitnessEntry {
  /** Auto-incrementing ID */
  id: number;
  /** SHA-256 hash of the previous entry (64 hex chars, all zeros for genesis) */
  prev_hash: string;
  /** SHA-256 hash of the action data */
  action_hash: string;
  /** Type of action recorded */
  action_type: WitnessActionType;
  /** JSON-serialized action data */
  action_data: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Actor identifier (agent ID, system, dream engine, etc.) */
  actor: string;
}

/**
 * Filter options for querying witness entries
 */
export interface WitnessFilter {
  /** Filter by action type */
  action_type?: WitnessActionType;
  /** Filter entries after this timestamp (inclusive) */
  since?: string;
  /** Filter entries before this timestamp (inclusive) */
  until?: string;
  /** Filter by actor */
  actor?: string;
  /** Maximum number of entries to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Result of chain integrity verification
 */
export interface VerifyResult {
  /** Whether the entire chain is valid */
  valid: boolean;
  /** The entry ID where the chain broke (undefined if valid) */
  brokenAt?: number;
  /** Total entries checked */
  entriesChecked: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Genesis previous hash: 64 zero characters */
const GENESIS_PREV_HASH = '0'.repeat(64);

// ============================================================================
// WitnessChain Implementation
// ============================================================================

/**
 * SHA-256 hash-chained append-only audit log.
 *
 * Each entry's prev_hash is the SHA-256 of the serialized previous entry,
 * creating an immutable chain. Any modification to a past entry will cause
 * verify() to detect the break.
 */
export class WitnessChain {
  private db: DatabaseType | null = null;
  private initialized = false;

  /**
   * Create a WitnessChain instance.
   *
   * @param externalDb - Optional external database connection (for testing
   *   with in-memory SQLite). When omitted, uses UnifiedMemoryManager.
   */
  constructor(private readonly externalDb?: DatabaseType) {}

  /**
   * Initialize the witness chain.
   * Creates the witness_chain table if it does not exist.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.externalDb) {
      this.db = this.externalDb;
    } else {
      const unified = getUnifiedMemory();
      await unified.initialize();
      this.db = unified.getDatabase();
    }

    this.ensureTable();
    this.initialized = true;
  }

  /**
   * Create the witness_chain table (additive, does not touch other tables).
   */
  private ensureTable(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS witness_chain (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prev_hash TEXT NOT NULL,
        action_hash TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_data TEXT,
        timestamp TEXT NOT NULL,
        actor TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_witness_action_type ON witness_chain(action_type);
      CREATE INDEX IF NOT EXISTS idx_witness_timestamp ON witness_chain(timestamp);
    `);
  }

  /**
   * Append a new entry to the witness chain.
   *
   * @param actionType - The type of action being recorded
   * @param actionData - Arbitrary data describing the action
   * @param actor - Who performed the action
   * @returns The newly created WitnessEntry
   */
  append(
    actionType: WitnessActionType,
    actionData: Record<string, unknown>,
    actor: string
  ): WitnessEntry {
    if (!this.db) throw new Error('WitnessChain not initialized');

    const timestamp = new Date().toISOString();
    const actionDataStr = JSON.stringify(actionData);
    const actionHash = sha256(actionDataStr);

    // Get the previous entry's hash
    const lastEntry = this.db
      .prepare('SELECT * FROM witness_chain ORDER BY id DESC LIMIT 1')
      .get() as WitnessEntry | undefined;

    const prevHash = lastEntry ? sha256(serializeEntry(lastEntry)) : GENESIS_PREV_HASH;

    const result = this.db
      .prepare(
        `INSERT INTO witness_chain (prev_hash, action_hash, action_type, action_data, timestamp, actor)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(prevHash, actionHash, actionType, actionDataStr, timestamp, actor);

    const entry: WitnessEntry = {
      id: result.lastInsertRowid as number,
      prev_hash: prevHash,
      action_hash: actionHash,
      action_type: actionType,
      action_data: actionDataStr,
      timestamp,
      actor,
    };

    return entry;
  }

  /**
   * Verify the integrity of the entire witness chain.
   *
   * Walks through every entry in order and checks that each entry's
   * prev_hash matches the SHA-256 of the previous entry's serialized form.
   *
   * @returns Verification result with validity status and break point
   */
  verify(): VerifyResult {
    if (!this.db) throw new Error('WitnessChain not initialized');

    const entries = this.db
      .prepare('SELECT * FROM witness_chain ORDER BY id ASC')
      .all() as WitnessEntry[];

    if (entries.length === 0) {
      return { valid: true, entriesChecked: 0 };
    }

    // Check genesis entry
    if (entries[0].prev_hash !== GENESIS_PREV_HASH) {
      return { valid: false, brokenAt: entries[0].id, entriesChecked: 1 };
    }

    // Check action_hash for first entry
    if (entries[0].action_hash !== sha256(entries[0].action_data)) {
      return { valid: false, brokenAt: entries[0].id, entriesChecked: 1 };
    }

    // Walk the chain
    for (let i = 1; i < entries.length; i++) {
      const current = entries[i];
      const previous = entries[i - 1];

      // Verify action_hash
      if (current.action_hash !== sha256(current.action_data)) {
        return { valid: false, brokenAt: current.id, entriesChecked: i + 1 };
      }

      // Verify prev_hash links to previous entry
      const expectedPrevHash = sha256(serializeEntry(previous));
      if (current.prev_hash !== expectedPrevHash) {
        return { valid: false, brokenAt: current.id, entriesChecked: i + 1 };
      }
    }

    return { valid: true, entriesChecked: entries.length };
  }

  /**
   * Query witness chain entries with optional filters.
   *
   * @param filter - Optional filter criteria
   * @returns Array of matching WitnessEntry records
   */
  getEntries(filter?: WitnessFilter): WitnessEntry[] {
    if (!this.db) throw new Error('WitnessChain not initialized');

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter?.action_type) {
      conditions.push('action_type = ?');
      params.push(filter.action_type);
    }
    if (filter?.since) {
      conditions.push('timestamp >= ?');
      params.push(filter.since);
    }
    if (filter?.until) {
      conditions.push('timestamp <= ?');
      params.push(filter.until);
    }
    if (filter?.actor) {
      conditions.push('actor = ?');
      params.push(filter.actor);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter?.limit ? `LIMIT ${filter.limit}` : '';
    const offset = filter?.offset ? `OFFSET ${filter.offset}` : '';

    const sql = `SELECT * FROM witness_chain ${where} ORDER BY id ASC ${limit} ${offset}`;
    return this.db.prepare(sql).all(...params) as WitnessEntry[];
  }

  /**
   * Cross-verify our SQLite witness chain against an RVF native witness.
   *
   * Calls rvfAdapter.status() to get witnessValid and witnessEntries,
   * then compares with our own verify() result.
   *
   * @param rvfAdapter - An RvfNativeAdapter instance with a status() method
   * @returns Cross-verification result from both chains
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  crossVerifyWithRvf(rvfAdapter: any): {
    sqliteValid: boolean;
    rvfValid: boolean;
    rvfEntries: number;
    bothValid: boolean;
  } {
    const sqliteResult = this.verify();
    const rvfStatus = rvfAdapter.status();
    const rvfValid = rvfStatus.witnessValid === true;
    const rvfEntries = typeof rvfStatus.witnessEntries === 'number' ? rvfStatus.witnessEntries : 0;

    return {
      sqliteValid: sqliteResult.valid,
      rvfValid,
      rvfEntries,
      bothValid: sqliteResult.valid && rvfValid,
    };
  }

  /**
   * Get the total number of entries in the chain.
   */
  getChainLength(): number {
    if (!this.db) throw new Error('WitnessChain not initialized');

    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM witness_chain')
      .get() as { count: number };
    return row.count;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compute SHA-256 hex digest of a string.
 */
function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex');
}

/**
 * Serialize a WitnessEntry to a deterministic string for hashing.
 * Uses a fixed field order to ensure consistency.
 */
function serializeEntry(entry: WitnessEntry): string {
  return JSON.stringify({
    id: entry.id,
    prev_hash: entry.prev_hash,
    action_hash: entry.action_hash,
    action_type: entry.action_type,
    action_data: entry.action_data,
    timestamp: entry.timestamp,
    actor: entry.actor,
  });
}

// ============================================================================
// Singleton / Factory
// ============================================================================

let _instance: WitnessChain | null = null;

/**
 * Get or create the singleton WitnessChain instance.
 * Uses UnifiedMemoryManager for storage.
 */
export async function getWitnessChain(): Promise<WitnessChain> {
  if (!_instance) {
    _instance = new WitnessChain();
    await _instance.initialize();
  }
  return _instance;
}

/**
 * Create a WitnessChain with an external database (for testing).
 */
export function createWitnessChain(db: DatabaseType): WitnessChain {
  return new WitnessChain(db);
}

// Re-export for convenience
export { GENESIS_PREV_HASH };
