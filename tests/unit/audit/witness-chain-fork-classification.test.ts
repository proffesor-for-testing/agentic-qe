/**
 * #753: verify() classifies each break as an accidental fork (pre-3.14.5
 * concurrent append) or tampering, keeps walking past forks, and never
 * reports tampering as benign.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { GENESIS_PREV_HASH, shake256 } from '../../../src/audit/witness-chain.js';
import { WitnessKeyManager } from '../../../src/audit/witness-key-manager.js';
import {
  appendN, forkAfter, getRow, insertRaceSibling, insertRaw, makeStore, rowHash, type TempStore,
} from './witness-fork-fixtures.js';

describe('WitnessChain.verify fork classification (#753)', () => {
  const stores: TempStore[] = [];
  const store = async (km?: WitnessKeyManager): Promise<TempStore> => {
    const s = await makeStore(km);
    stores.push(s);
    return s;
  };
  afterEach(() => { for (const s of stores.splice(0)) s.cleanup(); });

  it('reports a clean chain as valid with no forks', async () => {
    const s = await store();
    appendN(s.chain, 5);
    expect(s.chain.verify()).toMatchObject({
      valid: true, status: 'valid', tampered: false, forks: [], acknowledgedForks: [], entriesChecked: 5,
    });
  });

  it('classifies race siblings as forks, keeps walking, and reports no tampering', async () => {
    const s = await store();
    appendN(s.chain, 5, 'a');
    const fork1 = forkAfter(s, undefined, 2, 'x');
    appendN(s.chain, 5, 'b');
    const fork2 = forkAfter(s, undefined, 4, 'y'); // high-rate shape: parent 4 rows back
    appendN(s.chain, 3, 'c');

    const r = s.chain.verify();
    expect(r.valid).toBe(false);
    expect(r.status).toBe('forked');
    expect(r.tampered).toBe(false);
    expect(r.tamperedAt).toBeUndefined();
    expect(r.forks).toEqual([fork1, fork2]);
    expect(r.acknowledgedForks).toEqual([]);
    expect(r.brokenAt).toBe(fork1); // same id pre-#753 verify stopped at
    expect(r.entriesChecked).toBe(15); // every row checked, not just up to the first fork
    expect(r.forkDetails[1]).toMatchObject({ id: fork2, parentId: fork2 - 4, table: 'live', acknowledged: false });
  });

  it('still detects content tampering AFTER a fork (the key regression)', async () => {
    const s = await store();
    appendN(s.chain, 4);
    const fork = forkAfter(s);
    const later = appendN(s.chain, 4, 'late');
    s.db.prepare('UPDATE witness_chain SET action_data = ? WHERE id = ?')
      .run(JSON.stringify({ patternId: 'forged' }), later[2].id);

    const r = s.chain.verify();
    expect(r.valid).toBe(false);
    expect(r.status).toBe('tampered');
    expect(r.tampered).toBe(true);
    expect(r.tamperedAt).toBe(later[2].id);
    expect(r.tamperReason).toBe('action-hash-mismatch');
    expect(r.forks).toEqual([fork]);
    expect(r.brokenAt).toBe(fork);
  });

  it('flags a prev_hash that points at no existing row as tampering', async () => {
    const s = await store();
    const rows = appendN(s.chain, 6);
    s.db.prepare('UPDATE witness_chain SET prev_hash = ? WHERE id = ?').run('ab'.repeat(32), rows[3].id);
    expect(s.chain.verify()).toMatchObject({
      valid: false, status: 'tampered', tampered: true, tamperedAt: rows[3].id, tamperReason: 'unlinked-prev-hash',
    });
  });

  it('flags a deleted row as tampering', async () => {
    const s = await store();
    const rows = appendN(s.chain, 6);
    s.db.prepare('DELETE FROM witness_chain WHERE id = ?').run(rows[2].id);
    expect(s.chain.verify()).toMatchObject({ status: 'tampered', tamperedAt: rows[3].id, tamperReason: 'unlinked-prev-hash' });
  });

  it('does not let a fork-shaped relink hide deleted rows (id gap)', async () => {
    const s = await store();
    const rows = appendN(s.chain, 8);
    // Delete rows 4-5 and point row 6 at row 3: a "fork" that would erase history.
    s.db.prepare('DELETE FROM witness_chain WHERE id IN (?, ?)').run(rows[3].id, rows[4].id);
    s.db.prepare('UPDATE witness_chain SET prev_hash = ? WHERE id = ?').run(rowHash(getRow(s.db, rows[2].id)), rows[5].id);
    expect(s.chain.verify()).toMatchObject({ status: 'tampered', tamperedAt: rows[5].id, tamperReason: 'id-gap' });
  });

  it('flags deleting the losing race sibling (a dead end) as tampering', async () => {
    const s = await store();
    appendN(s.chain, 4);
    const fork = forkAfter(s); // parent = fork-2; the dead-end sibling is fork-1
    appendN(s.chain, 2);
    s.db.prepare('DELETE FROM witness_chain WHERE id = ?').run(fork - 1);
    // The fork row now looks array-adjacent to its parent, but an id is missing.
    expect(s.chain.verify()).toMatchObject({ status: 'tampered', tamperedAt: fork, tamperReason: 'id-gap' });
  });

  it('flags a deleted tail row once a later row is appended', async () => {
    const s = await store();
    const rows = appendN(s.chain, 4);
    s.db.prepare('DELETE FROM witness_chain WHERE id = ?').run(rows[3].id);
    const next = s.chain.append('PATTERN_CREATE', { patternId: 'after-delete' }, 'x');
    expect(next.id).toBe(rows[3].id + 1);
    expect(s.chain.verify()).toMatchObject({ status: 'tampered', tamperedAt: next.id, tamperReason: 'id-gap' });
  });

  it('does not accept a link to a LATER row as a fork', async () => {
    const s = await store();
    const rows = appendN(s.chain, 6);
    s.db.prepare('UPDATE witness_chain SET prev_hash = ? WHERE id = ?').run(rowHash(getRow(s.db, rows[4].id)), rows[2].id);
    expect(s.chain.verify()).toMatchObject({ status: 'tampered', tamperedAt: rows[2].id, tamperReason: 'unlinked-prev-hash' });
  });

  it('reports the legacy #759 brain-import splice as tampering, not as benign', async () => {
    const s = await store();
    appendN(s.chain, 4);
    // Pre-#766 import: the source chain's rows copied with their own prev_hash,
    // so the first imported row claims the genesis sentinel mid-chain.
    const source = await store();
    const foreign = appendN(source.chain, 3, 'foreign');
    const firstImported = insertRaw(s.db, { ...foreign[0] });
    insertRaw(s.db, { ...foreign[1] });
    appendN(s.chain, 2, 'after');

    const r = s.chain.verify();
    expect(foreign[0].prev_hash).toBe(GENESIS_PREV_HASH);
    expect(r).toMatchObject({ valid: false, status: 'tampered', tamperedAt: firstImported, tamperReason: 'unlinked-genesis-prev-hash' });
  });

  it('flags a genesis row with a non-genesis prev_hash', async () => {
    const s = await store();
    appendN(s.chain, 2);
    s.db.prepare('UPDATE witness_chain SET prev_hash = ? WHERE id = 1').run('cd'.repeat(32));
    expect(s.chain.verify()).toMatchObject({ status: 'tampered', tamperedAt: 1, tamperReason: 'genesis-link-mismatch' });
  });

  describe('signed chains', () => {
    it('accepts a correctly signed fork row', async () => {
      const km = new WitnessKeyManager();
      const s = await store(km);
      appendN(s.chain, 4);
      const fork = forkAfter(s, km);
      appendN(s.chain, 2);
      expect(s.chain.verify({ checkSignatures: true })).toMatchObject({
        status: 'forked', tampered: false, forks: [fork], signatureFailures: 0,
      });
    });

    it('treats a fork row with a bad signature as tampering even without checkSignatures', async () => {
      const km = new WitnessKeyManager();
      const s = await store(km);
      appendN(s.chain, 4);
      const fork = forkAfter(s, km);
      appendN(s.chain, 2);
      const sig = getRow(s.db, fork).signature!;
      const flipped = (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1);
      s.db.prepare('UPDATE witness_chain SET signature = ? WHERE id = ?').run(flipped, fork);

      expect(s.chain.verify()).toMatchObject({
        valid: false, status: 'tampered', tamperedAt: fork, tamperReason: 'fork-signature-invalid', forks: [],
      });
    });

    it('treats a re-signed prev_hash rewrite by a foreign key as unverifiable, not proven benign', async () => {
      const km = new WitnessKeyManager();
      const attacker = new WitnessKeyManager();
      const s = await store(km);
      appendN(s.chain, 4);
      const fork = forkAfter(s, attacker);
      // The verifier does not hold the attacker's key: structure-only, and the
      // legacy full signature sweep still fails the row.
      expect(s.chain.verify()).toMatchObject({ status: 'forked', forks: [fork] });
      expect(s.chain.verify({ checkSignatures: true })).toMatchObject({
        valid: false, status: 'tampered', tampered: true, tamperReason: 'signature-invalid', signatureFailures: 1,
      });
    });

    it('counts a signature failure on an ordinary row as tampering', async () => {
      const km = new WitnessKeyManager();
      const s = await store(km);
      const rows = appendN(s.chain, 3);
      s.db.prepare('UPDATE witness_chain SET signature = ? WHERE id = ?').run('00'.repeat(64), rows[1].id);
      expect(s.chain.verify({ checkSignatures: true })).toMatchObject({
        valid: false, status: 'tampered', tampered: true, tamperedAt: rows[1].id, signatureFailures: 1,
      });
    });
  });

  describe('archived segments', () => {
    const future = (): string => new Date(Date.now() + 3600_000).toISOString();

    it('finds forks inside the archive with includeArchive', async () => {
      const s = await store();
      appendN(s.chain, 4);
      const fork = forkAfter(s);
      appendN(s.chain, 2);
      s.chain.archiveEntries(future());
      appendN(s.chain, 2, 'post');

      expect(s.chain.verify()).toMatchObject({ valid: true, status: 'valid', forks: [] });
      const deep = s.chain.verify({ includeArchive: true });
      expect(deep).toMatchObject({ valid: false, status: 'forked', tampered: false, forks: [fork], entriesChecked: 9 });
      expect(deep.forkDetails[0].table).toBe('archive');
    });

    it('detects tampering in the archive after an archived fork', async () => {
      const s = await store();
      appendN(s.chain, 4);
      const fork = forkAfter(s);
      const later = appendN(s.chain, 3);
      s.chain.archiveEntries(future());
      s.db.prepare('UPDATE witness_chain_archive SET action_data = ? WHERE id = ?').run('{"x":1}', later[1].id);

      expect(s.chain.verify({ includeArchive: true })).toMatchObject({
        status: 'tampered', tamperedAt: later[1].id, forks: [fork],
      });
    });

    it('resolves a live fork whose parent was archived', async () => {
      const s = await store();
      appendN(s.chain, 5);
      const until = Date.now() + 3;
      while (Date.now() < until) { /* next millisecond, so the cut below is strict */ }
      const fork = forkAfter(s);
      // Archive everything before the fork row, including its parent.
      s.chain.archiveEntries(getRow(s.db, fork).timestamp);
      expect(getRow(s.db, fork - 2)).toBeDefined();
      expect(s.db.prepare('SELECT COUNT(*) AS n FROM witness_chain').get()).toEqual({ n: 2 });
      expect(s.chain.verify()).toMatchObject({ status: 'forked', tampered: false, forks: [fork] });
    });
  });

  describe('CHAIN_REANCHOR acknowledgement', () => {
    it('accepts forks listed by a later normally-linked CHAIN_REANCHOR', async () => {
      const s = await store();
      appendN(s.chain, 4);
      const fork = forkAfter(s);
      appendN(s.chain, 2);
      const d = s.chain.verify().forkDetails[0];
      s.chain.append('CHAIN_REANCHOR', { forks: [{ id: d.id, parentId: d.parentId, prevHash: d.prevHash, actionHash: d.actionHash }] }, 'test');

      expect(s.chain.verify()).toMatchObject({
        valid: true, status: 'valid-with-forks', tampered: false, forks: [fork], acknowledgedForks: [fork],
      });
    });

    it('ignores an acknowledgement whose recorded link does not match the row', async () => {
      const s = await store();
      appendN(s.chain, 4);
      const fork = forkAfter(s);
      const d = s.chain.verify().forkDetails[0];
      s.chain.append('CHAIN_REANCHOR', { forks: [{ id: d.id, parentId: d.parentId, prevHash: 'ff'.repeat(32), actionHash: d.actionHash }] }, 'test');
      expect(s.chain.verify()).toMatchObject({ valid: false, status: 'forked', forks: [fork], acknowledgedForks: [] });
    });

    it('does not acknowledge forks that appear after the re-anchor', async () => {
      const s = await store();
      appendN(s.chain, 4);
      const early = forkAfter(s);
      const d = s.chain.verify().forkDetails[0];
      s.chain.append('CHAIN_REANCHOR', { forks: [{ id: d.id, parentId: d.parentId, prevHash: d.prevHash, actionHash: d.actionHash }] }, 'test');
      appendN(s.chain, 3);
      const late = forkAfter(s);

      expect(s.chain.verify()).toMatchObject({
        valid: false, status: 'forked', forks: [early, late], acknowledgedForks: [early], brokenAt: late,
      });
    });

    it('does not let a re-anchor that is itself fork-linked acknowledge anything', async () => {
      const s = await store();
      appendN(s.chain, 4);
      const fork = forkAfter(s);
      const d = s.chain.verify().forkDetails[0];
      // A CHAIN_REANCHOR inserted as a race sibling (not linked to the tail).
      const tail = (s.db.prepare('SELECT MAX(id) AS m FROM witness_chain').get() as { m: number }).m;
      const data = JSON.stringify({ forks: [{ id: d.id, parentId: d.parentId, prevHash: d.prevHash, actionHash: d.actionHash }] });
      insertRaw(s.db, {
        prev_hash: rowHash(getRow(s.db, tail - 1)), action_hash: shake256(data), action_type: 'CHAIN_REANCHOR',
        action_data: data, timestamp: new Date().toISOString(), actor: 'x', hash_algo: 'shake256',
      });
      expect(s.chain.verify()).toMatchObject({ status: 'forked', acknowledgedForks: [] });
      expect(s.chain.verify().forks).toContain(fork);
    });
  });

  it('keeps the empty-chain result shape', async () => {
    const s = await store();
    expect(s.chain.verify()).toMatchObject({ valid: true, entriesChecked: 0, status: 'valid', tampered: false, forks: [] });
  });

  it('classifies real #753-shaped siblings (two siblings of one parent, same millisecond)', async () => {
    const s = await store();
    appendN(s.chain, 3);
    const parent = 3;
    const a = insertRaceSibling(s.db, parent, { patternId: 'A' });
    const b = insertRaceSibling(s.db, parent, { patternId: 'B' });
    appendN(s.chain, 2);
    expect(a.id).toBe(4);
    const r = s.chain.verify();
    expect(r).toMatchObject({ status: 'forked', tampered: false, forks: [b.id], entriesChecked: 7 });
    expect(r.forkDetails[0].parentId).toBe(parent);
  });
});
