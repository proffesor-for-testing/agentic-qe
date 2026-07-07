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
import { handleAuditChainVerify } from '../../../../src/cli/commands/audit.js';
import { createWitnessChain } from '../../../../src/audit/witness-chain.js';
import { clearProjectRootCache } from '../../../../src/kernel/project-root.js';

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
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (originalEnv === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = originalEnv;
    clearProjectRootCache();
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
});
