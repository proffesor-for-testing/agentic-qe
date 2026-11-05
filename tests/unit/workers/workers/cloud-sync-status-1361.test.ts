/**
 * #1361 item 2: the cloud-sync worker treated a partial sync as success,
 * because per-source failures are in results[].error, not report.errors.
 * The sync itself is a test double (syncIncrementalToCloud is mocked).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const syncIncrementalToCloud = vi.hoisted(() => vi.fn());
vi.mock('../../../../src/sync/index.js', () => ({ syncIncrementalToCloud }));

import { CloudSyncWorker } from '../../../../src/workers/workers/cloud-sync';

const report = (status: string, results: Array<{ source: string; success: boolean; error?: string; recordsSynced?: number }>) => ({
  syncId: 's', status, environment: 'test', mode: 'incremental', startedAt: new Date(), completedAt: new Date(),
  results: results.map(r => ({ table: `aqe.${r.source}`, recordsSynced: 0, conflictsResolved: 0, recordsSkipped: 0, durationMs: 1, ...r })),
  totalRecordsSynced: results.reduce((n, r) => n + (r.recordsSynced ?? 0), 0),
  totalConflictsResolved: 0, totalDurationMs: 1, errors: [],
});

const context = () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  eventBus: { publish: vi.fn() }, memory: { get: vi.fn(), set: vi.fn(), search: vi.fn() },
  domains: {}, signal: new AbortController().signal,
});

async function run(r: ReturnType<typeof report>) {
  syncIncrementalToCloud.mockResolvedValue(r);
  const worker = new CloudSyncWorker();
  vi.spyOn(worker as unknown as { checkGcloudAvailable(): Promise<boolean> }, 'checkGcloudAvailable').mockResolvedValue(true);
  return (worker as unknown as { doExecute(c: unknown): Promise<{ success: boolean; error?: string; findings: Array<{ type: string; description: string }> }> })
    .doExecute(context());
}

describe('cloud-sync worker uses the report status (#1361)', () => {
  beforeEach(() => vi.stubEnv('GCP_PROJECT', 'test-project'));
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it('a partial sync (one source failed) is not a success, and the source error is a finding', async () => {
    const result = await run(report('partial', [
      { source: 'qe', success: true, recordsSynced: 3 },
      { source: 'kv', success: false, error: '2 of 2 records were not written to aqe.kv' },
    ]));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Cloud sync partial: kv: 2 of 2 records were not written/);
    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'error', description: 'kv: 2 of 2 records were not written to aqe.kv' }));
  });

  it('a failed sync is not a success', async () => {
    const result = await run({ ...report('failed', []), errors: ['No sources selected to sync'] });
    expect(result.success).toBe(false);
  });

  it('a completed sync is a success', async () => {
    const result = await run(report('completed', [{ source: 'qe', success: true, recordsSynced: 3 }]));
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
