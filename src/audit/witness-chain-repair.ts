/**
 * Witness Chain fork repair (re-anchor) — ADR-070, issue #753.
 *
 * Stores written before v3.14.5 can contain accidental forks from concurrent
 * `append()` calls. `verify()` classifies them (witness-chain-verifier.ts) but
 * keeps `valid: false` until they are acknowledged, so an existing consumer
 * never sees a previously-broken store silently turn valid.
 *
 * Repair acknowledges them by appending ONE signed (when a key is available)
 * `CHAIN_REANCHOR` entry that lists each unacknowledged fork row (id, parent
 * id, prev_hash, action_hash), pins the hash of every dead-end row (the
 * losing race siblings nothing else links to) and records the tip it verified.
 * It:
 *
 * - refuses when any tamper-class break or signature failure exists;
 * - backs up the database first (`VACUUM INTO <db>.bak-<epoch>`, consistent
 *   under concurrent writers) and checks the backup before writing;
 * - never deletes, moves or rewrites an existing row — history stays as-is
 *   and `verify()` still lists every fork (`status: 'valid-with-forks'`);
 * - re-verifies and appends inside ONE `BEGIN IMMEDIATE` transaction, so no
 *   writer can slip a row in between the check and the acknowledgement;
 * - checks row counts before/after (live +1, archive unchanged);
 * - is idempotent: a second run finds nothing unacknowledged and writes nothing.
 */

import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { type Database as DatabaseType } from 'better-sqlite3';
import { openDatabase } from '../shared/safe-db.js';
import { WitnessChain, type WitnessEntry } from './witness-chain.js';
import type { WitnessKeyManager } from './witness-key-manager.js';
import { sha256, shake256, serializeEntry } from './witness-chain-hash.js';
import {
  ownHash, type ChainStatus, type ReanchorForkRecord, type ReanchorPin, type TamperReason, type VerifyResult,
} from './witness-chain-verifier.js';

export interface WitnessRowCounts { live: number; archive: number }

export interface VerifySummary {
  status: ChainStatus;
  entriesChecked: number;
  forks: number;
  unacknowledgedForks: number;
  tamperedAt?: number;
  tamperReason?: TamperReason;
}

export type RepairAction = 'none' | 'would-reanchor' | 'reanchored' | 'refused';

export interface RepairResult {
  action: RepairAction;
  dryRun: boolean;
  message: string;
  before: VerifySummary;
  after?: VerifySummary;
  rowsBefore: WitnessRowCounts;
  rowsAfter: WitnessRowCounts;
  /** Fork row ids this run acknowledged (or would, on a dry run). */
  forksAcknowledged: number[];
  reanchorId?: number;
  backupPath?: string;
}

export interface RepairOptions {
  /** Path of the database file `db` is opened on — the backup is written next to it. */
  dbPath: string;
  dryRun?: boolean;
  /**
   * Signs the CHAIN_REANCHOR row and verifies fork/re-anchor signatures.
   * Pass a read-only (autoGenerate: false) manager for a dry run.
   */
  keyManager?: WitnessKeyManager | null;
  actor?: string;
}

const VERIFY_OPTIONS = { includeArchive: true } as const;

type TxOutcome =
  | { kind: 'refused'; check: VerifyResult }
  | { kind: 'noop' }
  | { kind: 'reanchored'; entry: WitnessEntry; forks: ReanchorForkRecord[]; txAfter: WitnessRowCounts };

function countRows(db: DatabaseType): WitnessRowCounts {
  const n = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
  return {
    live: n('SELECT COUNT(*) AS n FROM witness_chain'),
    archive: n('SELECT COUNT(*) AS n FROM witness_chain_archive'),
  };
}

function summarize(r: VerifyResult): VerifySummary {
  return {
    status: r.status,
    entriesChecked: r.entriesChecked,
    forks: r.forks.length,
    unacknowledgedForks: r.forks.length - r.acknowledgedForks.length,
    ...(r.tamperedAt !== undefined ? { tamperedAt: r.tamperedAt } : {}),
    ...(r.tamperReason ? { tamperReason: r.tamperReason } : {}),
  };
}

function unacknowledged(r: VerifyResult): ReanchorForkRecord[] {
  return r.forkDetails.filter((f) => !f.acknowledged)
    .map(({ id, parentId, prevHash, actionHash }) => ({ id, parentId, prevHash, actionHash }));
}

/**
 * Dead-end rows: every row except the tip whose hash no row's prev_hash
 * references — the losing sibling of each race. Nothing else vouches for
 * their content, so the re-anchor pins it. (Checked under both hash algos,
 * since a child hashes its parent with the CHILD's algorithm.)
 */
function deadEndPins(db: DatabaseType, tipId: number): ReanchorPin[] {
  const referenced = new Set<string>();
  const prevs = db.prepare(
    'SELECT prev_hash FROM witness_chain UNION ALL SELECT prev_hash FROM witness_chain_archive',
  ).pluck().iterate() as IterableIterator<string>;
  for (const h of prevs) referenced.add(h);

  const pins: ReanchorPin[] = [];
  const seen = new Set<number>();
  for (const table of ['witness_chain', 'witness_chain_archive']) {
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id ASC`).iterate() as IterableIterator<WitnessEntry>;
    for (const row of rows) {
      if (row.id === tipId || seen.has(row.id)) continue;
      seen.add(row.id);
      const ser = serializeEntry(row);
      if (!referenced.has(shake256(ser)) && !referenced.has(sha256(ser))) pins.push({ id: row.id, hash: ownHash(row) });
    }
  }
  return pins.sort((a, b) => a.id - b.id);
}

function refusal(r: VerifyResult): string {
  return `Refusing to repair: tampering detected at id=${r.tamperedAt} (${r.tamperReason}). ` +
    'Only accidental forks can be re-anchored; restore from a backup and investigate.';
}

function nextBackupPath(dbPath: string): string {
  const base = `${dbPath}.bak-${Math.floor(Date.now() / 1000)}`;
  if (!existsSync(base)) return base;
  let i = 1;
  while (existsSync(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/** Consistent snapshot via VACUUM INTO, then prove it opens clean and holds the chain. */
function backupDatabase(db: DatabaseType, dbPath: string, minRows: number): string {
  const backupPath = nextBackupPath(dbPath);
  db.prepare('VACUUM INTO ?').run(backupPath);
  const copy = openDatabase(backupPath, { readonly: true, fileMustExist: true });
  try {
    const check = copy.pragma('integrity_check', { simple: true });
    if (check !== 'ok') throw new Error(`backup integrity_check failed: ${String(check)}`);
    const counts = countRows(copy);
    if (counts.live + counts.archive < minRows) {
      throw new Error(`backup holds ${counts.live + counts.archive} witness rows, expected >= ${minRows}`);
    }
  } finally {
    copy.close();
  }
  return backupPath;
}

/**
 * Re-anchor a witness chain whose only breaks are accidental forks.
 * `db` must be a writable connection on `options.dbPath`.
 */
export async function repairWitnessChainForks(db: DatabaseType, options: RepairOptions): Promise<RepairResult> {
  const dryRun = options.dryRun === true;
  const chain = new WitnessChain(db, options.keyManager ?? undefined);
  await chain.initialize();

  const rowsBefore = countRows(db);
  const before = chain.verify(VERIFY_OPTIONS);
  const base = { dryRun, before: summarize(before), rowsBefore, rowsAfter: rowsBefore };

  if (before.tampered) {
    return { ...base, action: 'refused', message: refusal(before), forksAcknowledged: [] };
  }
  const pending = unacknowledged(before);
  if (pending.length === 0) {
    const message = before.forks.length > 0
      ? `Nothing to repair: all ${before.forks.length} fork(s) are already re-anchored.`
      : 'Nothing to repair: the audit chain has no forks.';
    return { ...base, action: 'none', message, forksAcknowledged: [] };
  }
  if (dryRun) {
    return {
      ...base, action: 'would-reanchor', forksAcknowledged: pending.map((f) => f.id),
      message: `Dry run: would back up the database and append a CHAIN_REANCHOR entry acknowledging ${pending.length} fork(s). Nothing was written.`,
    };
  }

  const backupPath = backupDatabase(db, options.dbPath, rowsBefore.live + rowsBefore.archive);

  // Re-verify and append under one write lock: nothing can land between them.
  const reanchor = db.transaction((): TxOutcome => {
    const txBefore = countRows(db);
    const check = chain.verify(VERIFY_OPTIONS);
    if (check.tampered) return { kind: 'refused', check };
    const forks = unacknowledged(check);
    if (forks.length === 0) return { kind: 'noop' };

    const tip = db.prepare('SELECT * FROM witness_chain ORDER BY id DESC LIMIT 1').get() as WitnessEntry;
    const entry = chain.append('CHAIN_REANCHOR', {
      reason: 'fork-repair',
      issue: 'https://github.com/proffesor-for-testing/agentic-qe/issues/753',
      note: 'Acknowledges accidental forks from pre-3.14.5 concurrent appends; no rows were changed.',
      forkCount: forks.length,
      forks,
      pins: deadEndPins(db, tip.id),
      verifiedTipId: tip.id,
      verifiedTipHash: ownHash(tip),
      entriesChecked: check.entriesChecked,
      rows: txBefore,
      backup: basename(backupPath),
    }, options.actor ?? 'aqe-audit-repair');

    const txAfter = countRows(db);
    if (txAfter.live !== txBefore.live + 1 || txAfter.archive !== txBefore.archive) {
      throw new Error(`row-count check failed: before ${JSON.stringify(txBefore)}, after ${JSON.stringify(txAfter)}`);
    }
    return { kind: 'reanchored', entry, forks, txAfter };
  }).immediate();

  if (reanchor.kind === 'refused') {
    return { ...base, action: 'refused', message: refusal(reanchor.check), forksAcknowledged: [], backupPath };
  }
  if (reanchor.kind === 'noop') {
    return { ...base, action: 'none', message: 'Nothing to repair (another process re-anchored first).', forksAcknowledged: [], backupPath };
  }

  const after = chain.verify(VERIFY_OPTIONS);
  const ok = after.valid && !after.tampered;
  return {
    ...base,
    action: 'reanchored',
    after: summarize(after),
    rowsAfter: reanchor.txAfter,
    forksAcknowledged: reanchor.forks.map((f) => f.id),
    reanchorId: reanchor.entry.id,
    backupPath,
    message: ok
      ? `Re-anchored ${reanchor.forks.length} fork(s) with CHAIN_REANCHOR id=${reanchor.entry.id}; chain now ${after.status}. Backup: ${backupPath}`
      : `Appended CHAIN_REANCHOR id=${reanchor.entry.id}, but the chain still verifies as ${after.status}. Backup: ${backupPath}`,
  };
}
