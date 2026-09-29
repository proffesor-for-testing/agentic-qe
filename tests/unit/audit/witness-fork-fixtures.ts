/**
 * Fixtures for #753 fork/tamper tests: build witness-chain shapes with the
 * exact row format WitnessChain writes, bypassing append()'s transaction.
 */
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createWitnessChain, hashWith, serializeEntry, shake256, signaturePayload,
  type WitnessChain, type WitnessEntry,
} from '../../../src/audit/witness-chain.js';
import type { WitnessKeyManager } from '../../../src/audit/witness-key-manager.js';

export interface TempStore {
  dir: string;
  dbPath: string;
  db: Database.Database;
  chain: WitnessChain;
  cleanup(): void;
}

/** A fresh file-backed store under the OS temp dir (run tests with TMPDIR=/var/tmp). */
export async function makeStore(keyManager?: WitnessKeyManager): Promise<TempStore> {
  const dir = mkdtempSync(join(tmpdir(), 'aqe-witness-fork-'));
  const dbPath = join(dir, 'memory.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  const chain = createWitnessChain(db, keyManager);
  await chain.initialize();
  return {
    dir, dbPath, db, chain,
    cleanup: () => { if (db.open) db.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}

export function appendN(chain: WitnessChain, n: number, tag = 'p'): WitnessEntry[] {
  const out: WitnessEntry[] = [];
  for (let i = 0; i < n; i++) {
    out.push(chain.append('PATTERN_CREATE', { patternId: `${tag}-${i}`, domain: 'test', confidence: 0.5 }, 'reasoning-bank'));
  }
  return out;
}

export function getRow(db: Database.Database, id: number): WitnessEntry {
  return (db.prepare('SELECT * FROM witness_chain WHERE id = ?').get(id)
    ?? db.prepare('SELECT * FROM witness_chain_archive WHERE id = ?').get(id)) as WitnessEntry;
}

export function rowHash(row: WitnessEntry): string {
  return hashWith(row.hash_algo || 'shake256', serializeEntry(row));
}

/**
 * Insert a row exactly as the pre-3.14.5 append() would have when it read
 * `parentId` as the tail but lost the insert race: valid action_hash, prev_hash
 * = hash of that (older) parent row, optional real signature.
 */
export function insertRaceSibling(
  db: Database.Database, parentId: number, data: Record<string, unknown>, keyManager?: WitnessKeyManager,
): WitnessEntry {
  const parent = getRow(db, parentId);
  const actionData = JSON.stringify(data);
  const row = {
    prev_hash: hashWith('shake256', serializeEntry(parent)),
    action_hash: shake256(actionData),
    action_type: 'PATTERN_CREATE' as const,
    action_data: actionData,
    timestamp: new Date().toISOString(),
    actor: 'reasoning-bank',
  };
  let signature: string | null = null;
  let signerKeyId: string | null = null;
  if (keyManager) {
    const s = keyManager.sign(signaturePayload(row));
    signature = s.signature.toString('hex');
    signerKeyId = s.keyId;
  }
  const info = db.prepare(`INSERT INTO witness_chain
    (prev_hash, action_hash, action_type, action_data, timestamp, actor, hash_algo, signature, signer_key_id)
    VALUES (?, ?, ?, ?, ?, ?, 'shake256', ?, ?)`).run(
    row.prev_hash, row.action_hash, row.action_type, row.action_data, row.timestamp, row.actor, signature, signerKeyId,
  );
  return getRow(db, Number(info.lastInsertRowid));
}

/** Raw-insert an arbitrary (already hashed) row, e.g. a copied foreign row. */
export function insertRaw(db: Database.Database, row: Omit<WitnessEntry, 'id'>): number {
  const info = db.prepare(`INSERT INTO witness_chain
    (prev_hash, action_hash, action_type, action_data, timestamp, actor, hash_algo, signature, signer_key_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    row.prev_hash, row.action_hash, row.action_type, row.action_data, row.timestamp, row.actor,
    row.hash_algo ?? 'shake256', row.signature ?? null, row.signer_key_id ?? null,
  );
  return Number(info.lastInsertRowid);
}

export function counts(db: Database.Database): { live: number; archive: number } {
  return {
    live: (db.prepare('SELECT COUNT(*) AS n FROM witness_chain').get() as { n: number }).n,
    archive: (db.prepare('SELECT COUNT(*) AS n FROM witness_chain_archive').get() as { n: number }).n,
  };
}

/**
 * The #753 shape: n normal rows, a race sibling of the row before the tail,
 * then more normal rows. Returns the fork row id.
 */
export function forkAfter(store: TempStore, keyManager?: WitnessKeyManager, back = 2, tag = 'f'): number {
  const tail = (store.db.prepare('SELECT MAX(id) AS m FROM witness_chain').get() as { m: number }).m;
  const sibling = insertRaceSibling(store.db, tail - (back - 1), { patternId: `${tag}-race`, domain: 'test' }, keyManager);
  return sibling.id;
}
