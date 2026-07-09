/**
 * Durable, append-only persistence for flywheel evolve receipts (ADR-118 §4).
 *
 * The generational lineage is only trustworthy if it survives the process: a
 * third party must be able to reload the receipts and re-verify each one
 * (signature + frozen-gate re-execution) offline. This stores every receipt —
 * promoted OR rejected — in an append-only table in the unified `memory.db`.
 *
 * Data safety (unified-memory rule): CREATE TABLE IF NOT EXISTS is additive;
 * writes are INSERT-only (no UPDATE/DELETE/DROP in this API); the caller opens
 * the DB and is responsible for backups. The `db` handle is injected so tests
 * run against an in-memory database.
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import { reconstructLineage, type LineageResult } from './generation.js';
import type { EvolveReceipt } from './receipt.js';
import type { SealedInputs } from '../../validation/gate-reexecute.js';

/** Idempotent, additive migration — creates the receipts table if absent. */
export function ensureReceiptTable(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS flywheel_receipts (
      seq                 INTEGER PRIMARY KEY AUTOINCREMENT,
      generation          INTEGER NOT NULL,
      rule_version        TEXT NOT NULL,
      rule_fingerprint    TEXT NOT NULL,
      sealed_hash         TEXT NOT NULL,
      sealed_json         TEXT NOT NULL,
      verdict             TEXT NOT NULL,
      baseline_policy_id  TEXT NOT NULL,
      candidate_policy_id TEXT NOT NULL,
      signer_key_id       TEXT NOT NULL,
      public_key_pem      TEXT NOT NULL,
      signature           TEXT NOT NULL,
      created_at          TEXT DEFAULT (datetime('now'))
    )
  `);
}

/** Append one receipt (INSERT-only). Returns its assigned seq. */
export function persistReceipt(db: DatabaseType, receipt: EvolveReceipt): number {
  ensureReceiptTable(db);
  const info = db.prepare(`
    INSERT INTO flywheel_receipts
      (generation, rule_version, rule_fingerprint, sealed_hash, sealed_json,
       verdict, baseline_policy_id, candidate_policy_id, signer_key_id,
       public_key_pem, signature)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    receipt.generation,
    receipt.ruleVersion,
    receipt.ruleFingerprint,
    receipt.sealedHash,
    JSON.stringify(receipt.sealed),
    receipt.verdict,
    receipt.baselinePolicyId,
    receipt.candidatePolicyId,
    receipt.signerKeyId,
    receipt.publicKeyPem,
    receipt.signature,
  );
  return Number(info.lastInsertRowid);
}

/** Append many receipts in one transaction (still INSERT-only). */
export function persistReceipts(db: DatabaseType, receipts: EvolveReceipt[]): number {
  ensureReceiptTable(db);
  const tx = db.transaction((rs: EvolveReceipt[]) => {
    for (const r of rs) persistReceipt(db, r);
  });
  tx(receipts);
  return receipts.length;
}

interface ReceiptRow {
  generation: number;
  rule_version: string;
  rule_fingerprint: string;
  sealed_hash: string;
  sealed_json: string;
  verdict: string;
  baseline_policy_id: string;
  candidate_policy_id: string;
  signer_key_id: string;
  public_key_pem: string;
  signature: string;
}

/** Load persisted receipts back into EvolveReceipt objects, ordered by seq. */
export function loadReceipts(db: DatabaseType): EvolveReceipt[] {
  ensureReceiptTable(db);
  const rows = db.prepare(`
    SELECT generation, rule_version, rule_fingerprint, sealed_hash, sealed_json,
           verdict, baseline_policy_id, candidate_policy_id, signer_key_id,
           public_key_pem, signature
      FROM flywheel_receipts
     ORDER BY seq ASC
  `).all() as ReceiptRow[];

  return rows.map((r) => ({
    generation: r.generation,
    ruleVersion: r.rule_version,
    ruleFingerprint: r.rule_fingerprint,
    sealed: JSON.parse(r.sealed_json) as SealedInputs,
    sealedHash: r.sealed_hash,
    verdict: r.verdict === 'promote' ? 'promote' : 'reject',
    baselinePolicyId: r.baseline_policy_id,
    candidatePolicyId: r.candidate_policy_id,
    signerKeyId: r.signer_key_id,
    publicKeyPem: r.public_key_pem,
    signature: r.signature,
  }));
}

/**
 * Reload the persisted lineage and re-verify it end-to-end (signatures +
 * frozen-gate re-execution + compounding chain). This is the offline
 * "trust the re-run, not the log" check applied to what's actually on disk.
 */
export function verifyPersistedLineage(db: DatabaseType): LineageResult {
  return reconstructLineage(loadReceipts(db));
}
