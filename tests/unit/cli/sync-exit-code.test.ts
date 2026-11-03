/**
 * #1345: `aqe sync` and `aqe sync pull` printed "Status: FAILED" and still
 * exited 0, so a script could not tell a failed sync from a good one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const syncToCloud = vi.fn();
const syncIncrementalToCloud = vi.fn();
const pullFromCloud = vi.fn();
const pullIncrementalFromCloud = vi.fn();

vi.mock('../../../src/sync/index.js', () => ({
  createSyncAgent: vi.fn(),
  syncToCloud: (...a: unknown[]) => syncToCloud(...a),
  syncIncrementalToCloud: (...a: unknown[]) => syncIncrementalToCloud(...a),
  pullFromCloud: (...a: unknown[]) => pullFromCloud(...a),
  pullIncrementalFromCloud: (...a: unknown[]) => pullIncrementalFromCloud(...a),
  DEFAULT_SYNC_CONFIG: { sync: { sources: [] } },
}));

vi.mock('ora', () => ({
  default: () => {
    const s = { text: '', start: () => s, stop: () => s, fail: vi.fn(), succeed: vi.fn() };
    return s;
  },
}));

import { createSyncCommands, syncReportExitCode } from '../../../src/cli/commands/sync.js';

const report = (status: string) => ({
  syncId: 's1', status, environment: 'test', mode: 'incremental', startedAt: new Date(),
  completedAt: new Date(), results: [], totalRecordsSynced: 0, totalConflictsResolved: 0,
  totalDurationMs: 1, errors: status === 'completed' ? [] : ['Tunnel process exited with code 1'],
});

describe('aqe sync exit codes (#1345)', () => {
  const run = (...args: string[]) =>
    createSyncCommands().parseAsync(['node', 'sync', ...args]);

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it('maps report status to an exit code', () => {
    expect(syncReportExitCode({ status: 'completed' })).toBe(0);
    expect(syncReportExitCode({ status: 'partial' })).toBe(2);
    expect(syncReportExitCode({ status: 'failed' })).toBe(1);
    expect(syncReportExitCode({ status: 'running' })).toBe(1);
  });

  it.each([
    ['failed', 1],
    ['partial', 2],
    ['completed', 0],
  ])('incremental sync with a %s report exits %i', async (status, code) => {
    syncIncrementalToCloud.mockResolvedValue(report(status));
    await run();
    expect(syncIncrementalToCloud).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(code);
  });

  it('full sync with a failed report exits 1', async () => {
    syncToCloud.mockResolvedValue(report('failed'));
    await run('--full');
    expect(process.exitCode).toBe(1);
  });

  it.each([
    ['failed', 1],
    ['partial', 2],
    ['completed', 0],
  ])('pull with a %s report exits %i', async (status, code) => {
    pullIncrementalFromCloud.mockResolvedValue(report(status));
    await run('pull');
    expect(process.exitCode).toBe(code);
  });
});
