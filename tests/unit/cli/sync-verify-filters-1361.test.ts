/**
 * #1361: `aqe sync verify` exited 0 on a MISMATCH and on a verify that never
 * reached the cloud; `aqe sync --sources <typo>` and `aqe sync pull --tables
 * <typo>` completed with nothing to do. The sync layer is mocked here; the
 * agent behaviour is in tests/unit/sync/sync-false-success-1361.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const verify = vi.fn();
const syncIncrementalToCloud = vi.fn();
const pullIncrementalFromCloud = vi.fn();

vi.mock('../../../src/sync/index.js', () => ({
  createSyncAgent: vi.fn(() => ({ initialize: vi.fn(), verify, close: vi.fn() })),
  syncToCloud: vi.fn(),
  syncIncrementalToCloud: (...a: unknown[]) => syncIncrementalToCloud(...a),
  pullFromCloud: vi.fn(),
  pullIncrementalFromCloud: (...a: unknown[]) => pullIncrementalFromCloud(...a),
  unknownPullTables: (tables: string[], sources: Array<{ name: string; localTable: string }>) => {
    const known = new Set(sources.flatMap(s => [s.name, s.localTable]));
    return tables.filter(t => !known.has(t));
  },
  DEFAULT_SYNC_CONFIG: { sync: { sources: [{ name: 'root-qe-patterns' }, { name: 'root-kv-store' }] } },
  DEFAULT_PULL_CONFIG: { sources: [{ name: 'qe-patterns', localTable: 'qe_patterns', enabled: true }] },
}));
vi.mock('ora', () => ({
  default: () => {
    const s = { text: '', start: () => s, stop: () => s, fail: vi.fn(), succeed: vi.fn(), info: vi.fn() };
    return s;
  },
}));

import { createSyncCommands, verifyExitCode } from '../../../src/cli/commands/sync.js';

describe('aqe sync verify and filters (#1361)', () => {
  const run = (...args: string[]) => createSyncCommands().parseAsync(['node', 'sync', ...args]);
  let out: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    out = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { out.push(a.join(' ')); });
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { out.push(a.join(' ')); });
  });
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it('maps verify status to an exit code', () => {
    expect(verifyExitCode({ status: 'verified' })).toBe(0);
    expect(verifyExitCode({ status: 'partial' })).toBe(2);
    expect(verifyExitCode({ status: 'mismatch' })).toBe(1);
    expect(verifyExitCode({ status: 'unverified' })).toBe(1);
  });

  it.each([
    ['verified', 0, 'VERIFIED'],
    ['mismatch', 1, 'MISMATCH'],
    ['partial', 2, 'PARTIAL'],
    ['unverified', 1, 'UNVERIFIED'],
  ])('verify with a %s result exits %i and prints %s', async (status, code, label) => {
    verify.mockResolvedValue({
      verified: status === 'verified', status, results: [],
      ...(status === 'unverified' ? { error: 'Could not connect to the cloud database: tunnel failed' } : {}),
    });
    await run('verify');
    expect(process.exitCode).toBe(code);
    expect(out.join('\n')).toContain(label);
    if (status === 'unverified') expect(out.join('\n')).toContain('Could not connect to the cloud database');
  });

  it('--sources with an unknown name exits 1 without syncing', async () => {
    await run('--dry-run', '--sources', 'bogus');
    expect(syncIncrementalToCloud).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(out.join('\n')).toMatch(/Unknown source\(s\): bogus/);
  });

  it('--sources with known names still syncs', async () => {
    syncIncrementalToCloud.mockResolvedValue({
      syncId: 's', status: 'completed', environment: 'e', mode: 'incremental', startedAt: new Date(),
      results: [], totalRecordsSynced: 0, totalConflictsResolved: 0, totalDurationMs: 1, errors: [],
    });
    await run('--dry-run', '--sources', 'root-kv-store');
    expect(syncIncrementalToCloud).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(0);
  });

  it('pull --tables with an unknown name exits 1 before connecting', async () => {
    await run('pull', '--tables', 'typo', '--dry-run');
    expect(pullIncrementalFromCloud).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(out.join('\n')).toMatch(/Unknown table\(s\): typo/);
  });
});
