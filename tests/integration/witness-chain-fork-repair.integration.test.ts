/**
 * #753 end-to-end: two real processes append concurrently with the
 * pre-v3.14.5 (non-transactional) append and fork the chain. verify() must
 * classify every break as a fork (not tampering) and check every row; repair
 * must re-anchor it; a tamper after the forks must still be caught.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { createWitnessChain, hashWith, serializeEntry, type WitnessEntry } from '../../src/audit/witness-chain.js';
import { repairWitnessChainForks } from '../../src/audit/witness-chain-repair.js';

const WRITER = resolve(__dirname, '../fixtures/witness-chain/legacy-append-writer.mjs');
const PER_WRITER = 1500;

function run(args: string[]): Promise<void> {
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, [WRITER, ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += String(d); });
    child.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`writer exited ${code}: ${err}`))));
  });
}

/** Independent oracle: rows whose prev_hash names an older row than id-1. */
function countForks(db: Database.Database): number {
  const rows = db.prepare('SELECT * FROM witness_chain ORDER BY id').all() as WitnessEntry[];
  const byHash = new Map<string, number>();
  let forks = 0;
  for (const r of rows) {
    const parent = byHash.get(r.prev_hash);
    if (r.id > 1 && parent !== undefined && parent !== r.id - 1) forks++;
    byHash.set(hashWith(r.hash_algo || 'sha256', serializeEntry(r)), r.id);
  }
  return forks;
}

describe('witness chain forks from real concurrent writers (#753)', () => {
  let dir: string;
  let dbPath: string;
  let expectedForks = 0;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'aqe-witness-race-'));
    // The race is timing-dependent; retry on a fresh store until it forks.
    for (let attempt = 0; attempt < 5 && expectedForks === 0; attempt++) {
      dbPath = join(dir, `memory-${attempt}.db`);
      const seed = new Database(dbPath);
      seed.pragma('journal_mode = WAL'); // as the real store is; writers must not race to switch it
      const chain = createWitnessChain(seed);
      await chain.initialize();
      chain.append('PATTERN_CREATE', { patternId: 'seed' }, 'reasoning-bank');
      seed.close();
      await Promise.all([run([dbPath, String(PER_WRITER), 'a']), run([dbPath, String(PER_WRITER), 'b'])]);
      const db = new Database(dbPath, { readonly: true });
      expectedForks = countForks(db);
      db.close();
    }
  }, 120_000);

  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  it('the legacy concurrent append really forks the chain', () => {
    expect(expectedForks).toBeGreaterThan(0);
  });

  it('verify classifies every break as a fork, checks all rows, and repair re-anchors', async () => {
    const db = new Database(dbPath);
    try {
      const chain = createWitnessChain(db);
      await chain.initialize();
      const total = 1 + 2 * PER_WRITER;

      const before = chain.verify({ includeArchive: true });
      expect(before).toMatchObject({ valid: false, status: 'forked', tampered: false, entriesChecked: total });
      expect(before.forks).toHaveLength(expectedForks);

      const repaired = await repairWitnessChainForks(db, { dbPath });
      expect(repaired.action).toBe('reanchored');
      expect(repaired.rowsBefore).toEqual({ live: total, archive: 0 });
      expect(repaired.rowsAfter).toEqual({ live: total + 1, archive: 0 });

      const after = chain.verify({ includeArchive: true });
      expect(after).toMatchObject({ valid: true, status: 'valid-with-forks', tampered: false, entriesChecked: total + 1 });
      expect(after.acknowledgedForks).toEqual(before.forks);

      expect((await repairWitnessChainForks(db, { dbPath })).action).toBe('none');

      // Tamper with a row AFTER the last fork: must still be caught.
      const lastFork = before.forks[before.forks.length - 1];
      db.prepare('UPDATE witness_chain SET action_data = ? WHERE id = ?').run('{"forged":1}', lastFork + 1);
      expect(chain.verify()).toMatchObject({ valid: false, status: 'tampered', tampered: true, tamperedAt: lastFork + 1 });
    } finally {
      db.close();
    }
  });
});
