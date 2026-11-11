/**
 * #1384: `aqe sync verify` after the store-shape fix.
 * - claude-flow-memory: the cloud still holds the two rows earlier versions
 *   uploaded (`entries`, `version`), so cloud = local + 2 and never matched.
 * - aqe.qlearning_patterns is written by intelligence-qlearning AND
 *   root-rl-q-values, and verify counted the whole table against each source.
 *
 * The cloud is a test double at the writer boundary; readers are doubles.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../../../src/sync/readers/sqlite-reader.js', () => ({ createSQLiteReader: vi.fn() }));
vi.mock('../../../src/sync/readers/json-reader.js', () => ({ createJSONReader: vi.fn() }));
vi.mock('../../../src/sync/cloud/tunnel-manager.js', () => ({ createConnectionManager: vi.fn(() => ({})) }));
vi.mock('../../../src/sync/cloud/postgres-writer.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/sync/cloud/postgres-writer.js')>()),
  createPostgresWriter: vi.fn(),
}));

import { CloudSyncAgent } from '../../../src/sync/sync-agent.js';
import { createSQLiteReader } from '../../../src/sync/readers/sqlite-reader.js';
import { createJSONReader } from '../../../src/sync/readers/json-reader.js';
import { createPostgresWriter } from '../../../src/sync/cloud/postgres-writer.js';
import { DEFAULT_SYNC_CONFIG, type SyncSource } from '../../../src/sync/interfaces.js';

const defaultSource = (name: string): SyncSource => DEFAULT_SYNC_CONFIG.sync.sources.find(s => s.name === name)!;

/** Local records per source name. */
let local: Record<string, unknown[]>;
let failing: Set<string>;

function readerFor({ source }: { source: SyncSource }) {
  const records = local[source.name] ?? [];
  const fail = failing.has(source.name);
  return {
    name: source.name, type: source.type,
    initialize: vi.fn().mockResolvedValue(undefined),
    readAll: fail ? vi.fn().mockRejectedValue(new Error('could not be parsed')) : vi.fn().mockResolvedValue(records),
    readChanged: vi.fn().mockResolvedValue(records),
    count: fail ? vi.fn().mockRejectedValue(new Error('could not be parsed')) : vi.fn().mockResolvedValue(records.length),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

/** A cloud whose COUNT(*) answers from `counts`, keyed by table, honouring a `key <> ALL($2)` exclusion. */
function cloud(rows: Record<string, Array<{ key?: string }>>) {
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    const table = /FROM\s+(\S+)/.exec(sql)![1];
    const excluded = (params[1] as string[] | undefined) ?? [];
    return [{ count: String((rows[table] ?? []).filter(r => !excluded.includes(r.key ?? '')).length) }];
  });
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn(),
    execute: vi.fn().mockResolvedValue(undefined),
    query,
    close: vi.fn().mockResolvedValue(undefined),
  };
}

async function verify(sources: SyncSource[]) {
  (createSQLiteReader as Mock).mockImplementation(readerFor);
  (createJSONReader as Mock).mockImplementation(readerFor);
  const agent = new CloudSyncAgent({ environment: 'test', sync: { ...DEFAULT_SYNC_CONFIG.sync, sources, dryRun: false } });
  await agent.initialize();
  return agent.verify();
}

const keys = (...k: string[]) => k.map(key => ({ key }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  local = {};
  failing = new Set();
});
afterEach(() => vi.restoreAllMocks());

describe('verify ignores the legacy claude-flow rows (#1384)', () => {
  it('the default source names entries and version as legacy keys', () => {
    expect(defaultSource('claude-flow-memory').verifyExcludeKeys).toEqual(['entries', 'version']);
  });

  it('matches when the cloud also holds the old entries/version rows', async () => {
    local['claude-flow-memory'] = keys('a', 'b', 'c');
    const w = cloud({ 'aqe.claude_flow_memory': keys('a', 'b', 'c', 'entries', 'version') });
    (createPostgresWriter as Mock).mockReturnValue(w);
    const result = await verify([defaultSource('claude-flow-memory')]);
    expect(result.status).toBe('verified');
    expect(result.results[0]).toMatchObject({ localCount: 3, cloudCount: 3, status: 'match' });
    expect(w.query.mock.calls[0][1]).toEqual(['test', ['entries', 'version']]);
  });

  it('still reports a real mismatch', async () => {
    local['claude-flow-memory'] = keys('a', 'b', 'c');
    (createPostgresWriter as Mock).mockReturnValue(cloud({ 'aqe.claude_flow_memory': keys('a', 'entries', 'version') }));
    const result = await verify([defaultSource('claude-flow-memory')]);
    expect(result.results[0]).toMatchObject({ localCount: 3, cloudCount: 1, diff: 2, status: 'mismatch' });
  });

  it('a local memory that is itself named entries is left out on both sides', async () => {
    local['claude-flow-memory'] = keys('a', 'entries');
    (createPostgresWriter as Mock).mockReturnValue(cloud({ 'aqe.claude_flow_memory': keys('a', 'entries') }));
    const result = await verify([defaultSource('claude-flow-memory')]);
    expect(result.results[0]).toMatchObject({ localCount: 1, cloudCount: 1, status: 'match' });
  });
});

describe('verify counts a table shared by several sources once (#1384)', () => {
  const qSources = () => [defaultSource('root-rl-q-values'), defaultSource('intelligence-qlearning')];

  it('compares the sum of the local counts with the cloud count, as one result', async () => {
    local['root-rl-q-values'] = [{}, {}, {}];
    local['intelligence-qlearning'] = [{}, {}];
    const w = cloud({ 'aqe.qlearning_patterns': [{}, {}, {}, {}, {}] });
    (createPostgresWriter as Mock).mockReturnValue(w);
    const result = await verify(qSources());
    expect(result.status).toBe('verified');
    expect(result.results).toEqual([expect.objectContaining({
      source: 'root-rl-q-values + intelligence-qlearning', table: 'aqe.qlearning_patterns',
      localCount: 5, cloudCount: 5, status: 'match',
    })]);
    expect(w.query).toHaveBeenCalledOnce();
  });

  it('a shared table with one unreadable source is unverified, not a partial sum', async () => {
    local['root-rl-q-values'] = [{}, {}, {}];
    failing.add('intelligence-qlearning');
    (createPostgresWriter as Mock).mockReturnValue(cloud({ 'aqe.qlearning_patterns': [{}, {}, {}] }));
    const result = await verify(qSources());
    expect(result.results[0]).toMatchObject({
      status: 'unverified', localCount: -1, error: expect.stringMatching(/intelligence-qlearning: .*could not be parsed/),
    });
  });

  it('one source of a shared table verified alone is unverified: the cloud count includes the other', async () => {
    local['intelligence-qlearning'] = [{}, {}];
    (createPostgresWriter as Mock).mockReturnValue(cloud({ 'aqe.qlearning_patterns': [{}, {}, {}, {}, {}] }));
    const result = await verify([defaultSource('intelligence-qlearning')]);
    expect(result.results[0]).toMatchObject({
      source: 'intelligence-qlearning', localCount: 2, status: 'unverified',
      error: expect.stringMatching(/aqe\.qlearning_patterns is also written by root-rl-q-values/),
    });
  });
});
