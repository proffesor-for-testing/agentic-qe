/**
 * Witness Chain - Cryptographic Audit Trail for QE Decisions
 * ADR-070: Witness Chain Audit Compliance
 *
 * SHAKE-256 / SHA-256 hash-chained append-only log with optional Ed25519 signing.
 * Tamper-evident: modifying any entry breaks the hash chain, detectable by verify().
 */

import { type Database as DatabaseType } from 'better-sqlite3';
import { getUnifiedMemory } from '../kernel/unified-memory.js';
import { type WitnessKeyManager, getDefaultWitnessKeyManager } from './witness-key-manager.js';
import {
  GENESIS_PREV_HASH, sha256, shake256, hashWith, serializeEntry, signaturePayload,
} from './witness-chain-hash.js';
import { verifyWitnessChain, type VerifyOptions, type VerifyResult } from './witness-chain-verifier.js';

export type {
  VerifyOptions, VerifyResult, ChainStatus, TamperReason, WitnessForkInfo, ReanchorForkRecord,
} from './witness-chain-verifier.js';
export { CHAIN_REANCHOR_ACTION } from './witness-chain-verifier.js';

// --- Types ---

export type WitnessActionType =
  | 'PATTERN_CREATE' | 'PATTERN_UPDATE' | 'PATTERN_PROMOTE' | 'PATTERN_QUARANTINE'
  | 'DREAM_MERGE' | 'DREAM_DISCARD'
  | 'QUALITY_GATE_PASS' | 'QUALITY_GATE_FAIL'
  | 'ROUTING_DECISION'
  // A7: provenance of DELIVERED review findings (adversarially-verified survivors)
  // and the ones the verify gate BLOCKED — tamper-evident, optionally Ed25519-signed.
  | 'FINDING_DELIVERED' | 'FINDING_BLOCKED'
  | 'BRANCH_MERGE' | 'BRANCH_DISCARD' | 'HEBBIAN_PENALTY' | 'KEY_ROTATION'
  | 'BRAIN_IMPORT'
  // #753: `aqe audit repair` acknowledgement of pre-3.14.5 concurrent-write forks.
  | 'CHAIN_REANCHOR';

export interface WitnessEntry {
  id: number;
  prev_hash: string;
  action_hash: string;
  action_type: WitnessActionType;
  action_data: string;
  timestamp: string;
  actor: string;
  hash_algo?: string;
  signature?: string | null;
  signer_key_id?: string | null;
}

export interface WitnessFilter {
  action_type?: WitnessActionType;
  since?: string;
  until?: string;
  actor?: string;
  limit?: number;
  offset?: number;
}

// --- WitnessChain ---

/**
 * Hash-chained append-only audit log with optional Ed25519 signing.
 * New entries use SHAKE-256. Existing SHA-256 entries remain valid.
 */
export class WitnessChain {
  private db: DatabaseType | null = null;
  private initialized = false;
  private keyManager: WitnessKeyManager | null = null;

  constructor(private readonly externalDb?: DatabaseType, keyManager?: WitnessKeyManager) {
    this.keyManager = keyManager ?? null;
  }

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

  getDatabase(): DatabaseType | null { return this.db; }
  getKeyManager(): WitnessKeyManager | null { return this.keyManager; }

  private ensureTable(): void {
    if (!this.db) throw new Error('Database not initialized');
    // A read-only connection (e.g. `aqe audit verify`) must not create or
    // migrate the schema; readers treat missing tables as empty instead.
    if (this.db.readonly) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS witness_chain (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prev_hash TEXT NOT NULL, action_hash TEXT NOT NULL, action_type TEXT NOT NULL,
        action_data TEXT, timestamp TEXT NOT NULL, actor TEXT NOT NULL,
        hash_algo TEXT DEFAULT 'sha256', signature TEXT, signer_key_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_witness_action_type ON witness_chain(action_type);
      CREATE INDEX IF NOT EXISTS idx_witness_timestamp ON witness_chain(timestamp);
      CREATE INDEX IF NOT EXISTS idx_witness_actor ON witness_chain(actor);
    `);
    this.addColumnIfMissing('hash_algo', "TEXT DEFAULT 'sha256'");
    this.addColumnIfMissing('signature', 'TEXT');
    this.addColumnIfMissing('signer_key_id', 'TEXT');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS witness_chain_archive (
        id INTEGER PRIMARY KEY,
        prev_hash TEXT NOT NULL, action_hash TEXT NOT NULL, action_type TEXT NOT NULL,
        action_data TEXT, timestamp TEXT NOT NULL, actor TEXT NOT NULL,
        hash_algo TEXT DEFAULT 'sha256', signature TEXT, signer_key_id TEXT,
        archived_at TEXT NOT NULL
      );
    `);
  }

  private addColumnIfMissing(column: string, definition: string): void {
    if (!this.db) return;
    const cols = this.db
      .prepare("SELECT name FROM pragma_table_info('witness_chain')")
      .all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE witness_chain ADD COLUMN ${column} ${definition}`);
    }
  }

  /** Append a new SHAKE-256-hashed entry, optionally Ed25519-signed. */
  append(
    actionType: WitnessActionType,
    actionData: Record<string, unknown>,
    actor: string
  ): WitnessEntry {
    const db = this.db;
    if (!db) throw new Error('WitnessChain not initialized');
    const actionDataStr = JSON.stringify(actionData);
    const algo = 'shake256';
    const actionHash = shake256(actionDataStr);

    // BEGIN IMMEDIATE acquires the write lock before reading the tail. Without
    // it, two AQE processes can both hash the same predecessor and fork the
    // audit chain despite SQLite serializing their eventual INSERTs.
    const appendEntry = db.transaction((): WitnessEntry => {
      const timestamp = new Date().toISOString();
      const lastEntry = db
        .prepare('SELECT * FROM witness_chain ORDER BY id DESC LIMIT 1')
        .get() as WitnessEntry | undefined;
      const prevHash = lastEntry ? hashWith(algo, serializeEntry(lastEntry)) : GENESIS_PREV_HASH;

      let signature: string | null = null;
      let signerKeyId: string | null = null;
      if (this.keyManager) {
        const result = this.keyManager.sign(signaturePayload({
          prev_hash: prevHash, action_hash: actionHash, action_type: actionType, timestamp, actor,
        }));
        signature = result.signature.toString('hex');
        signerKeyId = result.keyId;
      }

      const ins = db.prepare(
        `INSERT INTO witness_chain
         (prev_hash, action_hash, action_type, action_data, timestamp, actor, hash_algo, signature, signer_key_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(prevHash, actionHash, actionType, actionDataStr, timestamp, actor, algo, signature, signerKeyId);

      return {
        id: ins.lastInsertRowid as number, prev_hash: prevHash, action_hash: actionHash,
        action_type: actionType, action_data: actionDataStr, timestamp, actor,
        hash_algo: algo, signature, signer_key_id: signerKeyId,
      };
    });
    return appendEntry.immediate();
  }

  /**
   * Verify chain integrity. Supports mixed SHA-256/SHAKE-256 and optional
   * signature checks. Classifies every break as a fork (pre-3.14.5 concurrent
   * append, #753) or tampering, and keeps walking past forks so later rows are
   * still checked; see witness-chain-verifier.ts for the exact rules.
   */
  verify(options?: VerifyOptions): VerifyResult {
    if (!this.db) throw new Error('WitnessChain not initialized');
    return verifyWitnessChain(this.db, this.keyManager, options);
  }

  /** Query entries with optional filters. */
  getEntries(filter?: WitnessFilter): WitnessEntry[] {
    if (!this.db) throw new Error('WitnessChain not initialized');
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter?.action_type) { conditions.push('action_type = ?'); params.push(filter.action_type); }
    if (filter?.since) { conditions.push('timestamp >= ?'); params.push(filter.since); }
    if (filter?.until) { conditions.push('timestamp <= ?'); params.push(filter.until); }
    if (filter?.actor) { conditions.push('actor = ?'); params.push(filter.actor); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const hasLimit = filter?.limit != null;
    const hasOffset = filter?.offset != null;
    // SQLite requires LIMIT before OFFSET; use LIMIT -1 ("all rows") when only offset is given
    const limitClause = hasLimit ? 'LIMIT ?' : (hasOffset ? 'LIMIT ?' : '');
    const offsetClause = hasOffset ? 'OFFSET ?' : '';
    if (hasLimit) { params.push(filter!.limit!); }
    else if (hasOffset) { params.push(-1); }
    if (hasOffset) { params.push(filter!.offset!); }
    return this.db.prepare(`SELECT * FROM witness_chain ${where} ORDER BY id ASC ${limitClause} ${offsetClause}`).all(...params) as WitnessEntry[];
  }

  /** Get all witness entries for a pattern by ID (checks both patternId and pattern_id keys). */
  getPatternLineage(patternId: string): WitnessEntry[] {
    if (!this.db) throw new Error('WitnessChain not initialized');
    return this.db.prepare(
      `SELECT * FROM witness_chain
       WHERE json_extract(action_data, '$.patternId') = ? OR json_extract(action_data, '$.pattern_id') = ?
       ORDER BY id ASC`
    ).all(patternId, patternId) as WitnessEntry[];
  }

  /** Get all witness entries for a specific actor, optionally filtered by time. */
  getActorHistory(actorId: string, since?: string): WitnessEntry[] {
    if (!this.db) throw new Error('WitnessChain not initialized');
    if (since) {
      return this.db.prepare('SELECT * FROM witness_chain WHERE actor = ? AND timestamp >= ? ORDER BY id ASC')
        .all(actorId, since) as WitnessEntry[];
    }
    return this.db.prepare('SELECT * FROM witness_chain WHERE actor = ? ORDER BY id ASC')
      .all(actorId) as WitnessEntry[];
  }

  /** Archive old entries to witness_chain_archive. Never archives genesis (id=1). */
  archiveEntries(olderThan: string): { archived: number } {
    if (!this.db) throw new Error('WitnessChain not initialized');
    const archivedAt = new Date().toISOString();
    const ins = this.db.prepare(
      `INSERT INTO witness_chain_archive
         (id, prev_hash, action_hash, action_type, action_data, timestamp, actor, hash_algo, signature, signer_key_id, archived_at)
       SELECT id, prev_hash, action_hash, action_type, action_data, timestamp, actor, hash_algo, signature, signer_key_id, ?
       FROM witness_chain WHERE timestamp < ? AND id > 1 AND id NOT IN (SELECT id FROM witness_chain_archive)`
    ).run(archivedAt, olderThan);
    const archived = ins.changes;
    if (archived > 0) {
      this.db.prepare('DELETE FROM witness_chain WHERE timestamp < ? AND id > 1').run(olderThan);
    }
    return { archived };
  }

  /** Cross-verify against an RVF native witness chain. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  crossVerifyWithRvf(rvfAdapter: any): { sqliteValid: boolean; rvfValid: boolean; rvfEntries: number; bothValid: boolean } {
    const sqliteResult = this.verify();
    const rvfStatus = rvfAdapter.status();
    const rvfValid = rvfStatus.witnessValid === true;
    const rvfEntries = typeof rvfStatus.witnessEntries === 'number' ? rvfStatus.witnessEntries : 0;
    return { sqliteValid: sqliteResult.valid, rvfValid, rvfEntries, bothValid: sqliteResult.valid && rvfValid };
  }

  getChainLength(): number {
    if (!this.db) throw new Error('WitnessChain not initialized');
    return (this.db.prepare('SELECT COUNT(*) as count FROM witness_chain').get() as { count: number }).count;
  }
}

// --- Singleton / Factory ---

let _instance: WitnessChain | null = null;

export async function getWitnessChain(): Promise<WitnessChain> {
  if (!_instance) {
    // ADR-070 Phase 6.2: sign with the persistent, project-wide default key
    // manager so entries get real signatures that survive process restarts.
    _instance = new WitnessChain(undefined, getDefaultWitnessKeyManager());
    await _instance.initialize();
  }
  return _instance;
}

export function createWitnessChain(db: DatabaseType, keyManager?: WitnessKeyManager): WitnessChain {
  return new WitnessChain(db, keyManager);
}

/**
 * Reset the module-level singleton so the next `getWitnessChain()` builds a
 * fresh instance. Test-only: lets heavy test files release the retained
 * chain (and its accumulated entries + db handle) between runs so per-test
 * memory growth doesn't compound across the file (issue #448 step 3).
 */
export function _resetWitnessChainForTests(): void {
  _instance = null;
}

export { GENESIS_PREV_HASH, sha256, shake256, hashWith, serializeEntry, signaturePayload };
