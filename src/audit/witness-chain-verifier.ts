/**
 * Witness Chain verification with break classification (ADR-070, issue #753).
 *
 * Before v3.14.5, two AQE processes appending at once could both read the
 * same tail and write a row whose `prev_hash` points at an older row: an
 * accidental FORK. `verify()` used to stop at the first such break, so the
 * rows after it were never checked and a forked store looked exactly like a
 * tampered one.
 *
 * Every row is now classified:
 *
 * - linked: `prev_hash` is the hash of its predecessor (array-adjacent row,
 *   or row `id - 1` in either table, which covers the archival boundary), and
 *   no id between the two is missing from live ∪ archive.
 * - fork: the row's own `action_hash` recomputes, its `prev_hash` is the exact
 *   hash of an EARLIER row that still exists (live or archive), every id
 *   between that parent and the row still exists (no deleted history), and,
 *   when the row is signed with a key this verifier holds, the Ed25519
 *   signature verifies. The walk records the fork and CONTINUES, checking the
 *   next row against the fork row exactly as before.
 * - tamper: anything else. The walk stops there.
 *
 * A fork alone does not make the chain valid: it is only accepted once a later,
 * normally linked `CHAIN_REANCHOR` entry (written by `aqe audit repair`) lists
 * that exact row (id + prev_hash + action_hash + parent id). Forks that appear
 * after a re-anchor are unacknowledged again. The re-anchor also pins the hash
 * of every dead-end row (a losing race sibling that no later row links to), so
 * editing or deleting one after the repair is reported as tampering.
 *
 * Limits (documented in ADR-070): for UNSIGNED rows the fork class is
 * structural, not cryptographic. A row whose prev_hash is the genesis sentinel
 * mid-chain (the legacy #759 brain-import splice) is reported as tamper: the
 * sentinel proves nothing about this chain and is exactly what a forged or
 * history-deleting edit produces.
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import type { WitnessEntry } from './witness-chain.js';
import type { WitnessKeyManager } from './witness-key-manager.js';
import { GENESIS_PREV_HASH, hashWith, serializeEntry, signaturePayload } from './witness-chain-hash.js';

export const CHAIN_REANCHOR_ACTION = 'CHAIN_REANCHOR';

export interface VerifyOptions {
  /** Also verify Ed25519 signatures of every row. Requires keyManager on the chain. */
  checkSignatures?: boolean;
  /**
   * Also walk `witness_chain_archive` and validate it as part of the same
   * hash chain (archived rows are hash-linked to each other and to the live
   * table exactly like un-archived rows). Off by default: the live-only walk
   * is enough to catch tampering with current data and already correctly
   * bridges the archival boundary; this option adds full historical coverage
   * for a deep CI gate at the cost of reading the (potentially large) archive.
   */
  includeArchive?: boolean;
}

/**
 * - `valid`: no breaks.
 * - `valid-with-forks`: forks exist and every one is acknowledged by a CHAIN_REANCHOR.
 * - `forked`: unacknowledged forks, no tampering. `valid` is false.
 * - `tampered`: a tamper-class break or a signature failure. `valid` is false.
 */
export type ChainStatus = 'valid' | 'valid-with-forks' | 'forked' | 'tampered';

export type TamperReason =
  | 'action-hash-mismatch'
  | 'genesis-link-mismatch'
  | 'unlinked-genesis-prev-hash'
  | 'unlinked-prev-hash'
  | 'id-gap'
  | 'fork-signature-invalid'
  | 'reanchor-signature-invalid'
  | 'reanchored-row-changed'
  | 'signature-invalid';

export interface WitnessForkInfo {
  id: number;
  parentId: number;
  prevHash: string;
  actionHash: string;
  table: 'live' | 'archive';
  acknowledged: boolean;
}

export interface VerifyResult {
  /** True only for status `valid` or `valid-with-forks`. */
  valid: boolean;
  /**
   * First break that makes the chain invalid, in walk order: the first
   * unacknowledged fork, else the tamper row. Same id pre-#753 verify reported.
   */
  brokenAt?: number;
  /** Rows walked (all rows unless a tamper stopped the walk). */
  entriesChecked: number;
  signatureFailures?: number;
  status: ChainStatus;
  /** True for any tamper-class break or signature failure. Never true for forks alone. */
  tampered: boolean;
  tamperedAt?: number;
  tamperReason?: TamperReason;
  /** Ids of every fork-class row found (acknowledged or not). */
  forks: number[];
  /** Subset of `forks` acknowledged by a verified CHAIN_REANCHOR entry. */
  acknowledgedForks: number[];
  forkDetails: WitnessForkInfo[];
}

/** One fork acknowledgement inside a CHAIN_REANCHOR entry's action_data. */
export interface ReanchorForkRecord {
  id: number;
  parentId: number;
  prevHash: string;
  actionHash: string;
}

/** A row hash frozen by a CHAIN_REANCHOR entry (dead-end rows nothing else links to). */
export interface ReanchorPin {
  id: number;
  hash: string;
}

type SigCheck = 'unsigned' | 'unverifiable' | 'ok' | 'invalid';
type Link = { kind: 'linked' } | { kind: 'fork'; parentId: number } | { kind: 'tamper'; reason: TamperReason };

/** Row hash under the row's own algorithm (how pins are recorded). */
export function ownHash(row: WitnessEntry): string {
  return hashWith(row.hash_algo || 'sha256', serializeEntry(row));
}

/** Stateful single-use walker; see file header for the classification rules. */
export class WitnessChainVerifier {
  private archiveRows: WitnessEntry[] | null = null;
  private readonly parentIndex = new Map<string, Map<string, number>>();
  private readonly acks = new Map<number, ReanchorForkRecord[]>();
  private readonly pins: ReanchorPin[] = [];
  private readonly forks: WitnessForkInfo[] = [];
  private tamper: { id: number; reason: TamperReason } | undefined;
  private signatureFailures = 0;
  private firstSignatureFailure: number | undefined;
  private entriesChecked = 0;
  private archiveExists: boolean | undefined;

  constructor(
    private readonly db: DatabaseType,
    private readonly keyManager: WitnessKeyManager | null,
    private readonly options: VerifyOptions = {},
  ) {}

  run(): VerifyResult {
    const live = tableExists(this.db, 'witness_chain')
      ? this.db.prepare('SELECT * FROM witness_chain ORDER BY id ASC').all() as WitnessEntry[]
      : [];
    if (live.length === 0) {
      return { valid: true, entriesChecked: 0, status: 'valid', tampered: false, forks: [], acknowledgedForks: [], forkDetails: [] };
    }

    // Live table first, then the archive as its own contiguous slice — NOT a
    // merged id-sorted array, which would wrongly treat an archived row as the
    // predecessor of a live row appended (and chained to the live tail) after
    // that row was archived.
    if (this.walk(live, 'live') && this.options.includeArchive) this.walk(this.getArchive(), 'archive');
    if (!this.tamper) this.checkPins();
    return this.result(live[0].id);
  }

  private walk(rows: WitnessEntry[], table: 'live' | 'archive'): boolean {
    for (let i = 0; i < rows.length; i++) {
      const current = rows[i];
      this.entriesChecked++;
      const link = this.classify(current, i > 0 ? rows[i - 1] : undefined);
      if (link.kind === 'tamper') {
        this.tamper = { id: current.id, reason: link.reason };
        return false;
      }
      if (link.kind === 'fork') {
        this.forks.push({
          id: current.id, parentId: link.parentId, prevHash: current.prev_hash,
          actionHash: current.action_hash, table, acknowledged: false,
        });
      } else if (current.action_type === CHAIN_REANCHOR_ACTION) {
        if (this.checkSignature(current) === 'invalid') {
          this.tamper = { id: current.id, reason: 'reanchor-signature-invalid' };
          return false;
        }
        this.registerReanchor(current);
      }
      this.checkAllSignatures(current);
    }
    return true;
  }

  private classify(current: WitnessEntry, arrayAdjacent: WitnessEntry | undefined): Link {
    const algo = current.hash_algo || 'sha256';
    if (current.action_hash !== hashWith(algo, current.action_data)) {
      return { kind: 'tamper', reason: 'action-hash-mismatch' };
    }
    if (current.id === 1) {
      return current.prev_hash === GENESIS_PREV_HASH
        ? { kind: 'linked' } : { kind: 'tamper', reason: 'genesis-link-mismatch' };
    }
    if (arrayAdjacent && current.prev_hash === hashWith(algo, serializeEntry(arrayAdjacent))) {
      // Array-adjacent may skip ids that were archived; it may not skip ids that are gone.
      return this.idsContiguous(arrayAdjacent.id, current.id)
        ? { kind: 'linked' } : { kind: 'tamper', reason: 'id-gap' };
    }
    const predecessor = this.findEntryById(current.id - 1);
    if (predecessor && current.prev_hash === hashWith(algo, serializeEntry(predecessor))) {
      return { kind: 'linked' };
    }

    const parentId = this.lookupParent(algo, current.prev_hash);
    if (parentId !== undefined && parentId < current.id) {
      if (!this.idsContiguous(parentId, current.id)) return { kind: 'tamper', reason: 'id-gap' };
      if (this.checkSignature(current) === 'invalid') return { kind: 'tamper', reason: 'fork-signature-invalid' };
      return { kind: 'fork', parentId };
    }
    return {
      kind: 'tamper',
      reason: current.prev_hash === GENESIS_PREV_HASH ? 'unlinked-genesis-prev-hash' : 'unlinked-prev-hash',
    };
  }

  private findEntryById(id: number): WitnessEntry | undefined {
    return (this.db.prepare('SELECT * FROM witness_chain WHERE id = ?').get(id) as WitnessEntry | undefined)
      ?? (this.hasArchive()
        ? this.db.prepare('SELECT * FROM witness_chain_archive WHERE id = ?').get(id) as WitnessEntry | undefined
        : undefined);
  }

  private getArchive(): WitnessEntry[] {
    if (!this.archiveRows) {
      this.archiveRows = this.hasArchive()
        ? this.db.prepare('SELECT * FROM witness_chain_archive ORDER BY id ASC').all() as WitnessEntry[]
        : [];
    }
    return this.archiveRows;
  }

  /** Stores written before archiving existed (or opened read-only) may lack the archive table. */
  private hasArchive(): boolean {
    if (this.archiveExists === undefined) this.archiveExists = tableExists(this.db, 'witness_chain_archive');
    return this.archiveExists;
  }

  /** hash → id over every row (live + archive), built lazily per hash algo on the first fork candidate. */
  private lookupParent(algo: string, prevHash: string): number | undefined {
    let index = this.parentIndex.get(algo);
    if (!index) {
      index = new Map();
      const live = this.db.prepare('SELECT * FROM witness_chain').iterate() as IterableIterator<WitnessEntry>;
      for (const row of live) index.set(hashWith(algo, serializeEntry(row)), row.id);
      for (const row of this.getArchive()) {
        const h = hashWith(algo, serializeEntry(row));
        if (!index.has(h)) index.set(h, row.id);
      }
      this.parentIndex.set(algo, index);
    }
    return index.get(prevHash);
  }

  /**
   * True when every id strictly between `from` and `to` exists in live ∪
   * archive. AUTOINCREMENT ids are never reused and a rolled-back insert does
   * not consume one, so a missing id means a row was deleted.
   */
  private idsContiguous(from: number, to: number): boolean {
    const expected = to - from - 1;
    if (expected <= 0) return true;
    const row = (this.hasArchive()
      ? this.db.prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT id FROM witness_chain WHERE id > ? AND id < ?
           UNION SELECT id FROM witness_chain_archive WHERE id > ? AND id < ?)`,
      ).get(from, to, from, to)
      : this.db.prepare('SELECT COUNT(*) AS n FROM witness_chain WHERE id > ? AND id < ?').get(from, to)) as { n: number };
    return row.n === expected;
  }

  /**
   * Signature status of one row against the keys this verifier holds. A row
   * signed by a key it does not hold is `unverifiable` (e.g. a key from before
   * persistent key storage) — classified on structure alone, like unsigned rows.
   */
  private checkSignature(entry: WitnessEntry): SigCheck {
    if (!entry.signature || !entry.signer_key_id) return 'unsigned';
    if (!this.keyManager || !this.keyManager.hasKey(entry.signer_key_id)) return 'unverifiable';
    return this.keyManager.verify(signaturePayload(entry), Buffer.from(entry.signature, 'hex'), entry.signer_key_id)
      ? 'ok' : 'invalid';
  }

  /** Legacy `checkSignatures` option: every signed row must verify (unknown key = failure). */
  private checkAllSignatures(entry: WitnessEntry): void {
    if (this.options.checkSignatures !== true || !this.keyManager) return;
    if (!entry.signature || !entry.signer_key_id) return;
    const ok = this.keyManager.verify(signaturePayload(entry), Buffer.from(entry.signature, 'hex'), entry.signer_key_id);
    if (!ok) {
      this.signatureFailures++;
      this.firstSignatureFailure ??= entry.id;
    }
  }

  private registerReanchor(entry: WitnessEntry): void {
    let data: { forks?: unknown; pins?: unknown };
    try { data = JSON.parse(entry.action_data) ?? {}; } catch { return; }
    if (Array.isArray(data.forks)) {
      for (const f of data.forks as Partial<ReanchorForkRecord>[]) {
        if (typeof f?.id !== 'number' || f.id >= entry.id) continue;
        if (typeof f.parentId !== 'number' || typeof f.prevHash !== 'string' || typeof f.actionHash !== 'string') continue;
        const list = this.acks.get(f.id) ?? [];
        list.push({ id: f.id, parentId: f.parentId, prevHash: f.prevHash, actionHash: f.actionHash });
        this.acks.set(f.id, list);
      }
    }
    if (Array.isArray(data.pins)) {
      for (const p of data.pins as Partial<ReanchorPin>[]) {
        if (typeof p?.id === 'number' && typeof p.hash === 'string') this.pins.push({ id: p.id, hash: p.hash });
      }
    }
  }

  /** Rows frozen by a verified re-anchor must still exist with the same hash. */
  private checkPins(): void {
    for (const pin of this.pins) {
      const row = this.findEntryById(pin.id);
      if (!row || ownHash(row) !== pin.hash) {
        this.tamper = { id: pin.id, reason: 'reanchored-row-changed' };
        return;
      }
    }
  }

  private result(firstLiveId: number): VerifyResult {
    for (const fork of this.forks) {
      fork.acknowledged = (this.acks.get(fork.id) ?? []).some((a) =>
        a.parentId === fork.parentId && a.prevHash === fork.prevHash && a.actionHash === fork.actionHash);
    }
    const unacknowledged = this.forks.filter((f) => !f.acknowledged);
    const tampered = this.tamper !== undefined || this.signatureFailures > 0;
    const status: ChainStatus = tampered ? 'tampered'
      : unacknowledged.length > 0 ? 'forked'
        : this.forks.length > 0 ? 'valid-with-forks' : 'valid';
    const valid = status === 'valid' || status === 'valid-with-forks';

    // Legacy: a signature failure alone reported brokenAt = first live id.
    const brokenAt = unacknowledged[0]?.id ?? this.tamper?.id
      ?? (this.signatureFailures > 0 ? firstLiveId : undefined);

    return {
      valid,
      entriesChecked: this.entriesChecked,
      signatureFailures: this.signatureFailures,
      status,
      tampered,
      forks: this.forks.map((f) => f.id),
      acknowledgedForks: this.forks.filter((f) => f.acknowledged).map((f) => f.id),
      forkDetails: this.forks,
      ...(brokenAt !== undefined && !valid ? { brokenAt } : {}),
      ...(tampered ? {
        tamperedAt: this.tamper?.id ?? this.firstSignatureFailure,
        tamperReason: this.tamper?.reason ?? 'signature-invalid',
      } : {}),
    };
  }
}

export function verifyWitnessChain(
  db: DatabaseType,
  keyManager: WitnessKeyManager | null,
  options?: VerifyOptions,
): VerifyResult {
  return new WitnessChainVerifier(db, keyManager, options).run();
}

/** True when `name` is a table in the connected database. */
export function tableExists(db: DatabaseType, name: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}
