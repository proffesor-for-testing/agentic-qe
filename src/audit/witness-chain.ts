/**
 * Witness Chain - Cryptographic Audit Trail for QE Decisions
 * ADR-070: Witness Chain Audit Compliance
 *
 * SHAKE-256 / SHA-256 hash-chained append-only log with optional Ed25519 signing.
 * Tamper-evident: modifying any entry breaks the hash chain, detectable by verify().
 */

import { createHash } from 'crypto';
import { type Database as DatabaseType } from 'better-sqlite3';
import { getUnifiedMemory } from '../kernel/unified-memory.js';
import { type WitnessKeyManager } from './witness-key-manager.js';

// --- Types ---

export type WitnessActionType =
  | 'PATTERN_CREATE' | 'PATTERN_UPDATE' | 'PATTERN_PROMOTE' | 'PATTERN_QUARANTINE'
  | 'DREAM_MERGE' | 'DREAM_DISCARD'
  | 'QUALITY_GATE_PASS' | 'QUALITY_GATE_FAIL'
  | 'ROUTING_DECISION'
  | 'BRANCH_MERGE' | 'HEBBIAN_PENALTY' | 'KEY_ROTATION';

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

export interface VerifyOptions {
  /** Also verify Ed25519 signatures. Requires keyManager on the chain. */
  checkSignatures?: boolean;
}

export interface VerifyResult {
  valid: boolean;
  brokenAt?: number;
  entriesChecked: number;
  signatureFailures?: number;
}

// --- Constants & Hash Functions ---

const GENESIS_PREV_HASH = '0'.repeat(64);

function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex');
}

/** SHAKE-256 (32-byte output) with SHA-256 fallback for older Node.js runtimes. */
function shake256(data: string): string {
  try {
    return createHash('shake256', { outputLength: 32 }).update(data, 'utf-8').digest('hex');
  } catch {
    return sha256(data);
  }
}

function hashWith(algo: string, data: string): string {
  return algo === 'shake256' ? shake256(data) : sha256(data);
}

/** Serialize a WitnessEntry to a deterministic string (original 7-field format). */
function serializeEntry(entry: WitnessEntry): string {
  return JSON.stringify({
    id: entry.id, prev_hash: entry.prev_hash, action_hash: entry.action_hash,
    action_type: entry.action_type, action_data: entry.action_data,
    timestamp: entry.timestamp, actor: entry.actor,
  });
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
    if (!this.db) throw new Error('WitnessChain not initialized');
    const timestamp = new Date().toISOString();
    const actionDataStr = JSON.stringify(actionData);
    const algo = 'shake256';
    const actionHash = shake256(actionDataStr);

    const lastEntry = this.db
      .prepare('SELECT * FROM witness_chain ORDER BY id DESC LIMIT 1')
      .get() as WitnessEntry | undefined;
    const prevHash = lastEntry ? hashWith(algo, serializeEntry(lastEntry)) : GENESIS_PREV_HASH;

    let signature: string | null = null;
    let signerKeyId: string | null = null;
    if (this.keyManager) {
      const sigData = Buffer.from(prevHash + actionHash + actionType + timestamp + actor, 'utf-8');
      const result = this.keyManager.sign(sigData);
      signature = result.signature.toString('hex');
      signerKeyId = result.keyId;
    }

    const ins = this.db.prepare(
      `INSERT INTO witness_chain
       (prev_hash, action_hash, action_type, action_data, timestamp, actor, hash_algo, signature, signer_key_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(prevHash, actionHash, actionType, actionDataStr, timestamp, actor, algo, signature, signerKeyId);

    return {
      id: ins.lastInsertRowid as number, prev_hash: prevHash, action_hash: actionHash,
      action_type: actionType, action_data: actionDataStr, timestamp, actor,
      hash_algo: algo, signature, signer_key_id: signerKeyId,
    };
  }

  /** Verify chain integrity. Supports mixed SHA-256/SHAKE-256 and optional signature checks. */
  verify(options?: VerifyOptions): VerifyResult {
    if (!this.db) throw new Error('WitnessChain not initialized');
    const entries = this.db.prepare('SELECT * FROM witness_chain ORDER BY id ASC').all() as WitnessEntry[];
    if (entries.length === 0) return { valid: true, entriesChecked: 0 };

    let signatureFailures = 0;
    const checkSigs = options?.checkSignatures === true && this.keyManager !== null;

    for (let i = 0; i < entries.length; i++) {
      const current = entries[i];
      const algo = current.hash_algo || 'sha256';

      if (current.action_hash !== hashWith(algo, current.action_data)) {
        return { valid: false, brokenAt: current.id, entriesChecked: i + 1, signatureFailures };
      }
      if (i === 0) {
        if (current.prev_hash !== GENESIS_PREV_HASH) {
          return { valid: false, brokenAt: current.id, entriesChecked: 1, signatureFailures };
        }
      } else {
        const expectedPrevHash = hashWith(algo, serializeEntry(entries[i - 1]));
        if (current.prev_hash !== expectedPrevHash) {
          return { valid: false, brokenAt: current.id, entriesChecked: i + 1, signatureFailures };
        }
      }
      if (checkSigs && current.signature && current.signer_key_id) {
        const sigData = Buffer.from(
          current.prev_hash + current.action_hash + current.action_type + current.timestamp + current.actor, 'utf-8'
        );
        if (!this.keyManager!.verify(Buffer.from(sigData), Buffer.from(current.signature, 'hex'), current.signer_key_id)) {
          signatureFailures++;
        }
      }
    }

    const valid = signatureFailures === 0;
    return {
      valid, entriesChecked: entries.length, signatureFailures,
      ...(signatureFailures > 0 ? { brokenAt: entries[0].id } : {}),
    };
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
    const limit = filter?.limit ? `LIMIT ${filter.limit}` : '';
    const offset = filter?.offset ? `OFFSET ${filter.offset}` : '';
    return this.db.prepare(`SELECT * FROM witness_chain ${where} ORDER BY id ASC ${limit} ${offset}`).all(...params) as WitnessEntry[];
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
  if (!_instance) { _instance = new WitnessChain(); await _instance.initialize(); }
  return _instance;
}

export function createWitnessChain(db: DatabaseType, keyManager?: WitnessKeyManager): WitnessChain {
  return new WitnessChain(db, keyManager);
}

export { GENESIS_PREV_HASH, sha256, shake256, hashWith, serializeEntry };
