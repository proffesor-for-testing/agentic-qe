/**
 * #753: `repairWitnessChainForks` re-anchors accidental forks without touching
 * existing rows, backs up first, refuses on tampering, and is idempotent.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { repairWitnessChainForks } from '../../../src/audit/witness-chain-repair.js';
import { WitnessKeyManager } from '../../../src/audit/witness-key-manager.js';
import type { WitnessEntry } from '../../../src/audit/witness-chain.js';
import { appendN, counts, forkAfter, getRow, makeStore, type TempStore } from './witness-fork-fixtures.js';

const backups = (s: TempStore): string[] => readdirSync(s.dir).filter((f) => f.includes('.bak-'));
const snapshot = (s: TempStore): WitnessEntry[] => [
  ...s.db.prepare('SELECT * FROM witness_chain ORDER BY id').all(),
  ...s.db.prepare('SELECT * FROM witness_chain_archive ORDER BY id').all(),
] as WitnessEntry[];

describe('repairWitnessChainForks (#753)', () => {
  const stores: TempStore[] = [];
  const forkedStore = async (km?: WitnessKeyManager): Promise<{ s: TempStore; forks: number[] }> => {
    const s = await makeStore(km);
    stores.push(s);
    appendN(s.chain, 5, 'a');
    const f1 = forkAfter(s, km, 2, 'x');
    appendN(s.chain, 4, 'b');
    const f2 = forkAfter(s, km, 3, 'y');
    appendN(s.chain, 3, 'c');
    return { s, forks: [f1, f2] };
  };
  afterEach(() => { for (const s of stores.splice(0)) s.cleanup(); });

  it('dry run reports the forks and writes nothing', async () => {
    const { s, forks } = await forkedStore();
    const rowsBefore = snapshot(s);
    const fileBefore = readFileSync(s.dbPath);

    const r = await repairWitnessChainForks(s.db, { dbPath: s.dbPath, dryRun: true });

    expect(r).toMatchObject({ action: 'would-reanchor', dryRun: true, forksAcknowledged: forks });
    expect(r.before).toMatchObject({ status: 'forked', forks: 2, unacknowledgedForks: 2 });
    expect(r.backupPath).toBeUndefined();
    expect(backups(s)).toEqual([]);
    expect(snapshot(s)).toEqual(rowsBefore);
    expect(readFileSync(s.dbPath).equals(fileBefore)).toBe(true);
    expect(s.chain.verify({ includeArchive: true }).status).toBe('forked');
  });

  it('re-anchors a fork-only chain: verify clean, rows preserved, backup made', async () => {
    const { s, forks } = await forkedStore();
    const before = snapshot(s);
    const countsBefore = counts(s.db);

    const r = await repairWitnessChainForks(s.db, { dbPath: s.dbPath });

    expect(r.action).toBe('reanchored');
    expect(r.forksAcknowledged).toEqual(forks);
    expect(r.after).toMatchObject({ status: 'valid-with-forks', forks: 2, unacknowledgedForks: 0 });
    expect(r.rowsBefore).toEqual(countsBefore);
    expect(r.rowsAfter).toEqual({ live: countsBefore.live + 1, archive: countsBefore.archive });
    expect(counts(s.db)).toEqual(r.rowsAfter);

    // Existing rows untouched; exactly one CHAIN_REANCHOR appended at the tail.
    const after = snapshot(s);
    expect(after.slice(0, before.length)).toEqual(before);
    const reanchor = getRow(s.db, r.reanchorId!);
    expect(reanchor.action_type).toBe('CHAIN_REANCHOR');
    const data = JSON.parse(reanchor.action_data);
    expect(data.forks.map((f: { id: number }) => f.id)).toEqual(forks);
    expect(data.pins.map((p: { id: number }) => p.id)).toEqual(forks.map((f) => f - 1)); // the losing siblings

    const v = s.chain.verify({ includeArchive: true });
    expect(v).toMatchObject({ valid: true, status: 'valid-with-forks', tampered: false, forks, acknowledgedForks: forks });

    // Backup exists, is a consistent SQLite file, and holds the pre-repair chain.
    expect(r.backupPath && existsSync(r.backupPath)).toBe(true);
    const copy = new Database(r.backupPath!, { readonly: true });
    try {
      expect(copy.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(copy.prepare('SELECT * FROM witness_chain ORDER BY id').all()).toEqual(before);
    } finally {
      copy.close();
    }
  });

  it('a second repair is a no-op (no new row, no new backup)', async () => {
    const { s } = await forkedStore();
    await repairWitnessChainForks(s.db, { dbPath: s.dbPath });
    const rows = snapshot(s);
    const bak = backups(s);

    const r = await repairWitnessChainForks(s.db, { dbPath: s.dbPath });

    expect(r.action).toBe('none');
    expect(r.message).toMatch(/already re-anchored/);
    expect(snapshot(s)).toEqual(rows);
    expect(backups(s)).toEqual(bak);
  });

  it('does nothing on a clean chain', async () => {
    const s = await makeStore();
    stores.push(s);
    appendN(s.chain, 4);
    const r = await repairWitnessChainForks(s.db, { dbPath: s.dbPath });
    expect(r).toMatchObject({ action: 'none', forksAcknowledged: [] });
    expect(backups(s)).toEqual([]);
    expect(counts(s.db)).toEqual({ live: 4, archive: 0 });
  });

  it('refuses when the chain is tampered, writing nothing', async () => {
    const s = await makeStore();
    stores.push(s);
    const rows = appendN(s.chain, 5);
    s.db.prepare('UPDATE witness_chain SET action_data = ? WHERE id = ?').run('{"forged":true}', rows[2].id);
    const before = snapshot(s);

    const r = await repairWitnessChainForks(s.db, { dbPath: s.dbPath });

    expect(r.action).toBe('refused');
    expect(r.message).toMatch(/tampering detected at id=3/);
    expect(backups(s)).toEqual([]);
    expect(snapshot(s)).toEqual(before);
  });

  it('refuses on a fork followed by tampering', async () => {
    const { s } = await forkedStore();
    const tail = (s.db.prepare('SELECT MAX(id) AS m FROM witness_chain').get() as { m: number }).m;
    s.db.prepare('UPDATE witness_chain SET prev_hash = ? WHERE id = ?').run('ee'.repeat(32), tail - 1);
    const before = snapshot(s);

    const r = await repairWitnessChainForks(s.db, { dbPath: s.dbPath });

    expect(r).toMatchObject({ action: 'refused', before: { status: 'tampered', tamperedAt: tail - 1, forks: 2 } });
    expect(backups(s)).toEqual([]);
    expect(snapshot(s)).toEqual(before);
  });

  it('detects edits to a re-anchored dead-end sibling after the repair', async () => {
    const { s, forks } = await forkedStore();
    await repairWitnessChainForks(s.db, { dbPath: s.dbPath });
    const sibling = forks[0] - 1;
    const forged = JSON.stringify({ patternId: 'forged' });
    const { shake256 } = await import('../../../src/audit/witness-chain.js');
    // A consistent edit (action_hash recomputed) that no later row's link covers.
    s.db.prepare('UPDATE witness_chain SET action_data = ?, action_hash = ? WHERE id = ?').run(forged, shake256(forged), sibling);

    expect(s.chain.verify()).toMatchObject({
      valid: false, status: 'tampered', tamperedAt: sibling, tamperReason: 'reanchored-row-changed',
    });
  });

  it('re-anchors forks inside the archive', async () => {
    const { s, forks } = await forkedStore();
    s.chain.archiveEntries(new Date(Date.now() + 3600_000).toISOString());
    appendN(s.chain, 2, 'post');
    const countsBefore = counts(s.db);

    const r = await repairWitnessChainForks(s.db, { dbPath: s.dbPath });

    expect(r.action).toBe('reanchored');
    expect(r.forksAcknowledged).toEqual(forks);
    expect(counts(s.db)).toEqual({ live: countsBefore.live + 1, archive: countsBefore.archive });
    expect(s.chain.verify({ includeArchive: true })).toMatchObject({ valid: true, status: 'valid-with-forks' });
  });

  it('signs the CHAIN_REANCHOR entry and rejects a forged re-anchor signature', async () => {
    const km = new WitnessKeyManager();
    const { s } = await forkedStore(km);
    const r = await repairWitnessChainForks(s.db, { dbPath: s.dbPath, keyManager: km });
    const reanchor = getRow(s.db, r.reanchorId!);
    expect(reanchor.signature).toBeTruthy();
    expect(s.chain.verify({ checkSignatures: true })).toMatchObject({ valid: true, status: 'valid-with-forks', signatureFailures: 0 });

    const sig = reanchor.signature!;
    s.db.prepare('UPDATE witness_chain SET signature = ? WHERE id = ?').run((sig[0] === 'a' ? 'b' : 'a') + sig.slice(1), reanchor.id);
    expect(s.chain.verify()).toMatchObject({ status: 'tampered', tamperedAt: reanchor.id, tamperReason: 'reanchor-signature-invalid' });
  });

  it('acknowledges only the new forks on a later repair', async () => {
    const { s, forks } = await forkedStore();
    await repairWitnessChainForks(s.db, { dbPath: s.dbPath });
    appendN(s.chain, 3, 'd');
    const late = forkAfter(s, undefined, 2, 'z');
    expect(s.chain.verify()).toMatchObject({ status: 'forked', acknowledgedForks: forks });

    const r = await repairWitnessChainForks(s.db, { dbPath: s.dbPath });
    expect(r.forksAcknowledged).toEqual([late]);
    expect(s.chain.verify()).toMatchObject({ valid: true, status: 'valid-with-forks', forks: [...forks, late] });
  });
});
