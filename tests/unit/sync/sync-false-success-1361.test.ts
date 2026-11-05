/**
 * #1361: sync outcomes that reported success when they should not.
 *
 * 1. `verify()` never connected to the cloud, so every cloud count was 0 and
 *    a VERIFIED (or an exit-0 MISMATCH) came from a writer never opened.
 * 2. (worker: see tests/unit/workers/cloud-sync-status-1361.test.ts)
 * 3. A selection that matched nothing, or sources whose reader could not be
 *    opened, reported COMPLETED.
 * 4. Records the writer could not write were dropped silently.
 *
 * The cloud is a test double at the writer boundary (createPostgresWriter is
 * mocked); no real database is used. The SQLite writer test uses a temp DB.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('../../../src/sync/readers/sqlite-reader.js', () => ({ createSQLiteReader: vi.fn() }));
vi.mock('../../../src/sync/readers/json-reader.js', () => ({ createJSONReader: vi.fn() }));
vi.mock('../../../src/sync/cloud/tunnel-manager.js', () => ({ createConnectionManager: vi.fn(() => ({})) }));
vi.mock('../../../src/sync/cloud/postgres-writer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/sync/cloud/postgres-writer.js')>()),
  createPostgresWriter: vi.fn(),
}));

import { CloudSyncAgent } from '../../../src/sync/sync-agent.js';
import { PullSyncAgent, pullTablesProblem, unknownPullTables } from '../../../src/sync/pull-agent.js';
import { createSQLiteReader } from '../../../src/sync/readers/sqlite-reader.js';
import { createJSONReader } from '../../../src/sync/readers/json-reader.js';
import { createPostgresWriter, PostgresWriter } from '../../../src/sync/cloud/postgres-writer.js';
import { createSQLiteWriter } from '../../../src/sync/writers/sqlite-writer.js';
import type { CloudWriter, SyncSource } from '../../../src/sync/interfaces.js';

const source = (name: string, extra: Partial<SyncSource> = {}): SyncSource => ({
  name, type: 'sqlite', path: `${name}.db`, targetTable: `aqe.${name}`, priority: 'high', mode: 'incremental',
  enabled: true, ...extra,
});

const syncConfig = (sources: SyncSource[], dryRun = false) => ({
  environment: 'test',
  sync: {
    mode: 'full' as const, interval: '1h', batchSize: 1000, conflictResolution: 'newer-wins' as const,
    sourcePriority: {}, sources, dryRun,
  },
});

function reader(records: unknown[] = [{ id: 'a' }, { id: 'b' }], count = records.length) {
  return {
    name: 'r', type: 'sqlite' as const,
    initialize: vi.fn().mockResolvedValue(undefined),
    readAll: vi.fn().mockResolvedValue(records),
    readChanged: vi.fn().mockResolvedValue(records),
    count: vi.fn().mockResolvedValue(count),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function writer(overrides: Partial<Record<keyof CloudWriter, Mock>> = {}) {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockResolvedValue(2),
    execute: vi.fn().mockResolvedValue(undefined),
    // node-postgres returns COUNT(*) as a string.
    query: vi.fn().mockResolvedValue([{ count: '2' }]),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function agentWith(
  sources: SyncSource[], opts: { dryRun?: boolean; readerFails?: string[]; missing?: string[] } = {},
) {
  const make = ({ source: s }: { source: SyncSource }) => {
    const r: ReturnType<typeof reader> & { exists?: () => boolean } = reader();
    if (opts.readerFails?.includes(s.name)) r.initialize.mockRejectedValue(new Error(`SQLite database not found: ${s.path}`));
    // A JSON source whose file is absent: the reader opens, reads nothing, exists() is false.
    if (opts.missing?.includes(s.name)) {
      r.readAll.mockResolvedValue([]);
      r.readChanged.mockResolvedValue([]);
      r.exists = () => false;
    }
    return r;
  };
  (createSQLiteReader as Mock).mockImplementation(make);
  (createJSONReader as Mock).mockImplementation(make);
  const agent = new CloudSyncAgent(syncConfig(sources, opts.dryRun));
  await agent.initialize();
  return agent;
}

describe('verify connects and never claims a match it did not count (#1361 item 1)', () => {
  it('connects to the cloud and verifies matching counts', async () => {
    const w = writer();
    (createPostgresWriter as Mock).mockReturnValue(w);
    const result = await (await agentWith([source('qe')])).verify();
    expect(w.connect).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ verified: true, status: 'verified' });
    expect(result.results[0]).toMatchObject({ localCount: 2, cloudCount: 2, status: 'match' });
    expect(w.close).toHaveBeenCalled();
  });

  it('is unverified, with the reason, when the cloud cannot be reached', async () => {
    (createPostgresWriter as Mock).mockReturnValue(writer({ connect: vi.fn().mockRejectedValue(new Error('Tunnel process exited with code 1')) }));
    const result = await (await agentWith([source('qe'), source('empty-src')])).verify();
    expect(result.verified).toBe(false);
    expect(result.status).toBe('unverified');
    expect(result.error).toMatch(/Could not connect to the cloud database: Tunnel process exited/);
    // Before: cloudCount 0 and an empty source "matched".
    expect(result.results.every(r => r.status === 'unverified' && r.cloudCount === -1)).toBe(true);
  });

  it('reports a mismatch', async () => {
    (createPostgresWriter as Mock).mockReturnValue(writer({ query: vi.fn().mockResolvedValue([{ count: '1' }]) }));
    const result = await (await agentWith([source('qe')])).verify();
    expect(result).toMatchObject({ verified: false, status: 'mismatch' });
    expect(result.results[0]).toMatchObject({ localCount: 2, cloudCount: 1, diff: 1, status: 'mismatch' });
  });

  it('a failed cloud count is unverified, not a match; the rest makes it partial', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ count: '2' }]).mockRejectedValueOnce(new Error('relation does not exist'));
    (createPostgresWriter as Mock).mockReturnValue(writer({ query }));
    const result = await (await agentWith([source('a'), source('b')])).verify();
    expect(result.status).toBe('partial');
    expect(result.verified).toBe(false);
    expect(result.results[1]).toMatchObject({ status: 'unverified', error: expect.stringMatching(/Cloud count failed/) });
  });

  it('a local source that could not be opened is unverified, not skipped', async () => {
    (createPostgresWriter as Mock).mockReturnValue(writer());
    const result = await (await agentWith([source('a'), source('gone')], { readerFails: ['gone'] })).verify();
    expect(result.status).toBe('partial');
    expect(result.results.find(r => r.source === 'gone')).toMatchObject({
      status: 'unverified', localCount: -1, error: expect.stringMatching(/Local source could not be read: SQLite database not found/),
    });
  });

  it.each([
    ['no row', []],
    ['a null count', [{ count: null }]],
    ['an empty-string count', [{ count: '' }]],
    ['a missing count', [{}]],
  ])('%s from COUNT(*) is unverified, not 0', async (_label, rows) => {
    (createPostgresWriter as Mock).mockReturnValue(writer({ query: vi.fn().mockResolvedValue(rows) }));
    // An empty local source would "match" a cloud count of 0.
    (createSQLiteReader as Mock).mockImplementation(() => reader([], 0));
    const agent = new CloudSyncAgent(syncConfig([source('qe')]));
    await agent.initialize();
    const result = await agent.verify();
    expect(result.status).toBe('unverified');
    expect(result.results[0]).toMatchObject({ status: 'unverified', cloudCount: -1, error: expect.stringMatching(/COUNT\(\*\) returned no value/) });
  });

  it('a failed connect leaves no writer behind, so the next call connects again', async () => {
    const failing = writer({ connect: vi.fn().mockRejectedValue(new Error('tunnel failed')) });
    const working = writer();
    (createPostgresWriter as Mock).mockReturnValueOnce(failing).mockReturnValueOnce(working);
    const agent = await agentWith([source('qe')]);
    expect((await agent.verify()).status).toBe('unverified');
    expect(failing.close).toHaveBeenCalled();
    const second = await agent.verify();
    expect(working.connect).toHaveBeenCalledOnce();
    expect(second.status).toBe('verified');
  });

  it('nothing to verify is unverified', async () => {
    const result = await (await agentWith([])).verify();
    expect(result).toMatchObject({ verified: false, status: 'unverified', error: 'No sources selected to verify' });
  });

  it('does not report verified from a dry run (no connection)', async () => {
    (createPostgresWriter as Mock).mockReturnValue(writer());
    const result = await (await agentWith([source('qe')], { dryRun: true })).verify();
    expect(result.status).toBe('unverified');
    expect(createPostgresWriter).not.toHaveBeenCalled();
  });
});

describe('an empty or unreadable selection is not COMPLETED (#1361 item 3)', () => {
  it.each(['syncAll', 'syncIncremental'] as const)('%s with no sources selected fails', async (method) => {
    const agent = await agentWith([], { dryRun: true });
    const report = await agent[method]();
    expect(report.status).toBe('failed');
    expect(report.errors.join('\n')).toMatch(/No sources selected to sync/);
  });

  it('an incremental sync of only full-mode sources fails and says why', async () => {
    const report = await (await agentWith([source('qe', { mode: 'full' })], { dryRun: true })).syncIncremental();
    expect(report.status).toBe('failed');
    expect(report.errors[0]).toMatch(/full-mode sources need --full/);
  });

  it('a source whose reader could not be opened is a failed result', async () => {
    const report = await (await agentWith([source('ok'), source('gone')], { dryRun: true, readerFails: ['gone'] })).syncAll();
    expect(report.status).toBe('partial');
    expect(report.results.find(r => r.source === 'gone')).toMatchObject({
      success: false, error: expect.stringMatching(/Source could not be read: SQLite database not found/),
    });
  });

  it('--full with every SQLite source unreadable and the JSON files missing reads nothing and fails', async () => {
    const sources = [source('db-a', { mode: 'full' }), source('db-b'), source('cf-json', { type: 'json', mode: 'full' })];
    const report = await (await agentWith(sources, { dryRun: true, readerFails: ['db-a', 'db-b'], missing: ['cf-json'] })).syncAll();
    expect(report.status).toBe('failed');
    expect(report.errors).toContain('No source could be read: every selected source failed or its file does not exist');
    expect(report.results.find(r => r.source === 'cf-json')).toMatchObject({ success: true, sourceMissing: true });
  });

  it('every source file missing reads nothing and fails', async () => {
    const report = await (await agentWith([source('j1', { type: 'json' }), source('j2', { type: 'json' })],
      { dryRun: true, missing: ['j1', 'j2'] })).syncIncremental();
    expect(report.status).toBe('failed');
  });

  it('a missing optional JSON source next to a read one still completes, marked not read', async () => {
    const report = await (await agentWith([source('db'), source('cf-json', { type: 'json' })],
      { dryRun: true, missing: ['cf-json'] })).syncAll();
    expect(report.status).toBe('completed');
    expect(report.errors).toEqual([]);
    expect(report.results.find(r => r.source === 'cf-json')).toMatchObject({ sourceMissing: true });
    expect(report.results.find(r => r.source === 'db')?.sourceMissing).toBeUndefined();
  });

  it('every source unreadable (no memory.db) fails the sync', async () => {
    const report = await (await agentWith([source('a'), source('b')], { dryRun: true, readerFails: ['a', 'b'] })).syncIncremental();
    expect(report.status).toBe('failed');
    expect(report.results).toHaveLength(2);
  });
});

describe('records the writer could not write fail the source (#1361 item 4)', () => {
  it('a source whose upserts were all rejected is failed, with how many and why', async () => {
    const upsert = vi.fn(async (_t: string, records: unknown[], opts?: { onSkipped?: (n: number, r: string) => void }) => {
      opts?.onSkipped?.(records.length, 'column "tier" of relation "qe_patterns" does not exist');
      return 0;
    });
    (createPostgresWriter as Mock).mockReturnValue(writer({ upsert }));
    const report = await (await agentWith([source('qe')])).syncAll();
    expect(report.status).toBe('failed');
    expect(report.results[0]).toMatchObject({
      success: false, recordsSynced: 0, recordsSkipped: 2,
      error: '2 of 2 records were not written to aqe.qe: column "tier" of relation "qe_patterns" does not exist',
    });
  });

  it('a partial rejection makes the sync partial when another source synced', async () => {
    const upsert = vi.fn()
      .mockImplementationOnce(async (_t: string, _r: unknown[], o?: { onSkipped?: (n: number, r: string) => void }) => { o?.onSkipped?.(1, 'bad row'); return 1; })
      .mockResolvedValueOnce(2);
    (createPostgresWriter as Mock).mockReturnValue(writer({ upsert }));
    const report = await (await agentWith([source('a'), source('b')])).syncIncremental();
    expect(report.status).toBe('partial');
    expect(report.results[0]).toMatchObject({ success: false, recordsSynced: 1, recordsSkipped: 1 });
  });

  it('PostgresWriter.upsert reports the records it skipped', async () => {
    const pg = new PostgresWriter({ cloud: { project: '', zone: '', instance: '', database: 'd', user: 'u', tunnelPort: 1 }, tunnelManager: {} as never });
    (pg as unknown as { client: unknown }).client = {
      query: vi.fn().mockRejectedValue(new Error('column "tier" does not exist')),
    };
    const onSkipped = vi.fn();
    const written = await pg.upsert('aqe.qe_patterns', [{ id: 'a' }, { id: 'b' }, { id: 'c' }], { onSkipped });
    expect(written).toBe(0);
    expect(onSkipped).toHaveBeenCalledWith(3, 'column "tier" does not exist');
  });

  it('SQLiteWriter.upsert reports records for a table that does not exist locally', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1361-sqlw-'));
    try {
      // An existing local DB without the target table (e.g. an older schema).
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(path.join(dir, 'memory.db'));
      db.exec('CREATE TABLE other (id TEXT)');
      db.close();
      const w = createSQLiteWriter({ dbPath: path.join(dir, 'memory.db') });
      await w.connect();
      const onSkipped = vi.fn();
      expect(await w.upsert('qe_patterns', [{ id: 'a' }], { onSkipped })).toBe(0);
      expect(onSkipped).toHaveBeenCalledWith(1, expect.stringMatching(/does not exist in the local database/));
      await w.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('pull: a --tables filter that matches nothing fails (#1361 item 3)', () => {
  const sources = [
    { name: 'qe-patterns', localTable: 'qe_patterns' },
    { name: 'kv', localTable: 'kv_store' },
  ];

  it('names the unknown tables', () => {
    expect(unknownPullTables(['qe_patterns', 'typo', 'kv'], sources)).toEqual(['typo']);
  });

  it('says a table is disabled rather than unknown', () => {
    const all = [...sources.map(s => ({ ...s, enabled: true })), { name: 'dream', localTable: 'dream_insights', enabled: false }];
    expect(pullTablesProblem(['dream_insights'], all)).toMatch(/^Table\(s\) disabled in the pull configuration: dream_insights/);
    expect(pullTablesProblem(['typo', 'dream'], all)).toMatch(/Unknown table\(s\): typo\. Table\(s\) disabled in the pull configuration: dream/);
    expect(pullTablesProblem(['kv_store'], all)).toBeNull();
    expect(pullTablesProblem([], all)).toMatch(/No tables given/);
  });

  it('a pull whose --tables match nothing is failed, not completed', async () => {
    const agent = new PullSyncAgent({ tables: ['typo'], dryRun: true });
    // Stand in for initialize(): no cloud is touched.
    Object.assign(agent as unknown as Record<string, unknown>, { reader: {}, writer: {} });
    const report = await agent.pullAll();
    expect(report.status).toBe('failed');
    expect(report.errors[0]).toMatch(/Unknown table\(s\): typo/);
  });
});
