/**
 * Tests for `aqe audit verify --chain=audit` (A13: witness-chain CI gate)
 *
 * Distinct from the existing 29-row governance receipt chain checked by
 * `handleAuditVerify` — this exercises `handleAuditChainVerify`, which
 * verifies the `src/audit/witness-chain.ts` full audit trail.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { handleAuditChainRepair, handleAuditChainVerify } from '../../../../src/cli/commands/audit.js';
import { createWitnessChain, hashWith, serializeEntry, shake256, type WitnessEntry } from '../../../../src/audit/witness-chain.js';
import { _resetDefaultWitnessKeyManagerForTests } from '../../../../src/audit/witness-key-manager.js';
import { clearProjectRootCache } from '../../../../src/kernel/project-root.js';

/** Insert a row the way pre-3.14.5 append() did when it lost the race for `parentId`. */
function insertRaceSibling(db: Database.Database, parentId: number, tag: string): number {
  const parent = db.prepare('SELECT * FROM witness_chain WHERE id = ?').get(parentId) as WitnessEntry;
  const data = JSON.stringify({ patternId: tag });
  return Number(db.prepare(`INSERT INTO witness_chain
    (prev_hash, action_hash, action_type, action_data, timestamp, actor, hash_algo)
    VALUES (?, ?, 'PATTERN_CREATE', ?, ?, 'reasoning-bank', 'shake256')`).run(
    hashWith('shake256', serializeEntry(parent)), shake256(data), data, new Date().toISOString(),
  ).lastInsertRowid);
}

describe('handleAuditChainVerify', () => {
  let tmpProjectRoot: string;
  let dbPath: string;
  const originalEnv = process.env.AQE_PROJECT_ROOT;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpProjectRoot = mkdtempSync(join(tmpdir(), 'audit-chain-verify-'));
    mkdirSync(join(tmpProjectRoot, '.agentic-qe'), { recursive: true });
    dbPath = join(tmpProjectRoot, '.agentic-qe', 'memory.db');
    process.env.AQE_PROJECT_ROOT = tmpProjectRoot;
    clearProjectRootCache();
    _resetDefaultWitnessKeyManagerForTests();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (originalEnv === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = originalEnv;
    clearProjectRootCache();
    _resetDefaultWitnessKeyManagerForTests();
    rmSync(tmpProjectRoot, { recursive: true, force: true });
  });

  it('should report a valid, empty result when no database exists', async () => {
    rmSync(dbPath, { force: true });
    const output = await handleAuditChainVerify({ format: 'json' });

    expect(output.integrity).toBe(true);
    expect(output.chainLength).toBe(0);
    expect(output.message).toContain('No database found');
  });

  it('should report valid for a real, untampered chain', async () => {
    const db = new Database(dbPath);
    const chain = createWitnessChain(db);
    await chain.initialize();
    chain.append('PATTERN_CREATE', { id: 'p1' }, 'reasoning-bank');
    chain.append('PATTERN_UPDATE', { id: 'p1', delta: 0.1 }, 'reasoning-bank');
    chain.append('QUALITY_GATE_PASS', { gate: 'deploy' }, 'quality-gate');
    db.close();

    const output = await handleAuditChainVerify({ format: 'json' });

    expect(output.integrity).toBe(true);
    expect(output.chainLength).toBe(3);
    expect(output.brokenAt).toBe(-1);
    expect(output.lastHash).not.toBe('');
  });

  it('should report broken=false-integrity and the right brokenAt id when a row is tampered', async () => {
    const db = new Database(dbPath);
    const chain = createWitnessChain(db);
    await chain.initialize();
    chain.append('PATTERN_CREATE', { id: 'p1' }, 'reasoning-bank');
    chain.append('PATTERN_UPDATE', { id: 'p1', delta: 0.1 }, 'reasoning-bank');
    db.prepare('UPDATE witness_chain SET action_data = ? WHERE id = 2').run(
      JSON.stringify({ id: 'p1', delta: 0.99, tampered: true })
    );
    db.close();

    const output = await handleAuditChainVerify({ format: 'json' });

    expect(output.integrity).toBe(false);
    expect(output.brokenAt).toBe(2);
  });

  it('should verify correctly across an archival boundary (includeArchive)', async () => {
    const db = new Database(dbPath);
    const chain = createWitnessChain(db);
    await chain.initialize();
    chain.append('PATTERN_CREATE', { id: 'p1' }, 'reasoning-bank');
    chain.append('PATTERN_UPDATE', { id: 'p1' }, 'reasoning-bank');
    chain.append('PATTERN_PROMOTE', { id: 'p1' }, 'reasoning-bank');
    chain.archiveEntries(new Date(Date.now() + 60 * 60 * 1000).toISOString());
    chain.append('QUALITY_GATE_PASS', { gate: 'deploy' }, 'quality-gate');
    db.close();

    const output = await handleAuditChainVerify({ format: 'json' });

    // Would have false-positived as broken before the archival fix.
    expect(output.integrity).toBe(true);
    expect(output.chainLength).toBe(4);
  });

  describe('forked stores (#753)', () => {
    async function seedForked(): Promise<{ forks: number[] }> {
      const db = new Database(dbPath);
      const chain = createWitnessChain(db);
      await chain.initialize();
      for (let i = 0; i < 4; i++) chain.append('PATTERN_CREATE', { patternId: `a-${i}` }, 'reasoning-bank');
      const fork = insertRaceSibling(db, 3, 'race');
      for (let i = 0; i < 3; i++) chain.append('PATTERN_CREATE', { patternId: `b-${i}` }, 'reasoning-bank');
      db.close();
      return { forks: [fork] };
    }

    it('reports accidental forks as not tampered, still integrity=false', async () => {
      const { forks } = await seedForked();
      const output = await handleAuditChainVerify({ format: 'json' });

      expect(output).toMatchObject({
        integrity: false, status: 'forked', tampered: false, forks, acknowledgedForks: [],
        brokenAt: forks[0], chainLength: 8,
      });
      expect(output.message).toMatch(/1 accidental fork\(s\) \(pre-3\.14\.5 concurrent writes, #753\), no tampering detected/);
      expect(output.message).toContain('aqe audit repair --chain audit');
    });

    it('repair makes verify pass, and a later tamper is still caught', async () => {
      const { forks } = await seedForked();

      const dry = await handleAuditChainRepair({ format: 'json', dryRun: true });
      expect(dry).toMatchObject({ action: 'would-reanchor', forksAcknowledged: forks });
      expect(existsSync(join(tmpProjectRoot, '.agentic-qe', 'witness-keys'))).toBe(false);
      expect((await handleAuditChainVerify({ format: 'json' })).integrity).toBe(false);

      const repaired = await handleAuditChainRepair({ format: 'json' });
      expect(repaired).toMatchObject({ action: 'reanchored', forksAcknowledged: forks, after: { status: 'valid-with-forks' } });
      expect(repaired.rowsAfter).toEqual({ live: 9, archive: 0 });
      expect(existsSync(repaired.backupPath!)).toBe(true);

      const after = await handleAuditChainVerify({ format: 'json' });
      expect(after).toMatchObject({
        integrity: true, status: 'valid-with-forks', tampered: false, forks, acknowledgedForks: forks, brokenAt: -1,
      });

      expect(await handleAuditChainRepair({ format: 'json' })).toMatchObject({ action: 'none' });

      const db = new Database(dbPath);
      db.prepare('UPDATE witness_chain SET action_data = ? WHERE id = 7').run('{"tampered":true}');
      db.close();
      const tampered = await handleAuditChainVerify({ format: 'json' });
      expect(tampered).toMatchObject({ integrity: false, status: 'tampered', tampered: true, tamperedAt: 7 });
      expect(await handleAuditChainRepair({ format: 'json' })).toMatchObject({ action: 'refused' });
    });

    it('prints a clear text summary for a forked store', async () => {
      await seedForked();
      await handleAuditChainVerify({ format: 'text' });
      const text = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(text).toContain('FORKED (no tampering detected)');
      expect(text).toContain('1 accidental (pre-3.14.5 concurrent writes, #753), 0 re-anchored');
    });
  });
});
