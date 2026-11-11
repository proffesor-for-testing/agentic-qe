/**
 * #1384: the JSON sync extractors did not match the real store shapes.
 * - `.claude-flow/memory/store.json` is `{entries, version}`: it synced as two
 *   records (`entries`, `version`) instead of one per memory.
 * - `.ruvector/intelligence.json` is `{patterns, memories, trajectories, ...}`:
 *   the default source read `$.qvalues`, which real files lack, and reported
 *   0 records as a success.
 * - A configured jsonPath absent from the file was 0 records, not an error.
 *
 * Real files in a temp directory, with synthetic content in the real shapes;
 * the sources are the DEFAULT_SYNC_CONFIG ones. No cloud (dry run).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createJSONReader } from '../../../src/sync/readers/json-reader.js';
import { CloudSyncAgent } from '../../../src/sync/sync-agent.js';
import { DEFAULT_SYNC_CONFIG, type SyncSource } from '../../../src/sync/interfaces.js';
import { PostgresWriter } from '../../../src/sync/cloud/postgres-writer.js';
import type { JsonbText } from '../../../src/sync/jsonb-text.js';

/** The real cloud writer's value serializer (no connection needed). */
const cloudWriter = () => new PostgresWriter({
  cloud: { project: '', zone: '', instance: '', database: '', user: '', tunnelPort: 0 },
  tunnelManager: { start: async () => ({ host: '', port: 0 }), stop: async () => {}, isActive: () => false, getConnection: () => null },
}) as unknown as { serializeValue(value: unknown, column: string): unknown };

const STORED_AT = '2026-11-01T10:00:00.000Z';

const entry = (key: string, value: string, namespace = 'default') => ({
  key, value, namespace, storedAt: STORED_AT, lastAccessed: STORED_AT, accessCount: 3, expiresAt: '2026-12-01T00:00:00.000Z',
});

const claudeFlowStore = {
  entries: {
    'adr-001': entry('adr-001', 'first'),
    'agent-route': entry('agent-route', '{"agent":"coder"}'),
    'plain-note': entry('plain-note', 'third', 'notes'),
  },
  version: '3.0.0',
};

// ruvector writes last_update in epoch SECONDS (Math.floor(Date.now() / 1000)),
// and a new pattern starts at 0.
const LAST_UPDATE_S = 1793440000;
const intelligence = {
  patterns: {
    'edit:ts|coder': { state: 'edit:ts', action: 'coder', q_value: 0.75, visits: 4, last_update: LAST_UPDATE_S },
    'test:ts|tester': { state: 'test:ts', action: 'tester', q_value: 0.5, visits: 0, last_update: 0 },
  },
  memories: [{ id: 'm1', memory_type: 'file_access', content: 'x', embedding: [0.1, 0.2], metadata: {}, timestamp: 1 }],
  trajectories: [{ id: 't1', state: 's', action: 'a', outcome: 'ok', reward: 1, timestamp: 1 }],
  errors: {}, file_sequences: [], agents: {}, edges: [], stats: { total: 1 },
};

const daemonState = {
  running: false,
  startedAt: STORED_AT,
  workers: {
    map: { runCount: 5, successCount: 4, failureCount: 1, averageDurationMs: 120, lastRun: STORED_AT, lastStartedAt: STORED_AT, nextRun: STORED_AT, isRunning: false },
    audit: { runCount: 2, successCount: 2, failureCount: 0, averageDurationMs: 80, lastRun: STORED_AT, lastStartedAt: STORED_AT, nextRun: STORED_AT, isRunning: false },
  },
  config: {}, savedAt: STORED_AT,
};

const defaultSource = (name: string): SyncSource => {
  const found = DEFAULT_SYNC_CONFIG.sync.sources.find(s => s.name === name);
  if (!found) throw new Error(`no default source ${name}`);
  return found;
};

let dir: string;
const write = (rel: string, data: unknown) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), typeof data === 'string' ? data : JSON.stringify(data));
};
const reader = (source: SyncSource) => createJSONReader({ source, baseDir: dir, environment: 'test' });

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1384-')));
  write('.claude-flow/memory/store.json', claudeFlowStore);
  write('.ruvector/intelligence.json', intelligence);
  write('.claude-flow/daemon-state.json', daemonState);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('claude-flow-memory on the real {entries, version} store (#1384)', () => {
  it('reads one record per entry, never the entries map or the version', async () => {
    const records = await reader(defaultSource('claude-flow-memory')).readAll();
    expect(records.map(r => r.key)).toEqual(['adr-001', 'agent-route', 'plain-note']);
  });

  it('a record value is the stored payload, not the entry wrapper', async () => {
    const records = await reader(defaultSource('claude-flow-memory')).readAll();
    expect(records.map(r => (r.value as JsonbText).text)).toEqual(['"first"', '"{\\"agent\\":\\"coder\\"}"', '"third"']);
  });

  // Each payload reaches the JSONB column as exactly JSON.stringify(payload):
  // the writer's per-value heuristics (timestamps, number arrays) never see it.
  it.each<[string, unknown]>([
    ['a number', 7],
    ['a timestamp-like number', 1793440000000],
    ['a timestamp-like string', '1793440000000'],
    ['the number 1000000000', 1000000000],
    ['the string "42"', '42'],
    ['plain text', 'plain text'],
    ['an ISO date string', STORED_AT],
    ['a mixed array', [1, 'a']],
    ['a nested array', [1, [2, 3]]],
    ['a number array', [0.1, 0.2]],
    ['an object', { n: 1, nested: { list: [1, 'x'] } }],
    ['null', null],
    ['a boolean', false],
  ])('%s keeps its JSON type through the cloud writer', async (_what, payload) => {
    write('.claude-flow/memory/store.json', { entries: { k: { ...entry('k', ''), value: payload } }, version: '3.0.0' });
    const [record] = await reader(defaultSource('claude-flow-memory')).readAll();
    const serialized = cloudWriter().serializeValue(record.value, 'value');
    expect(serialized).toBe(JSON.stringify(payload));
    expect(JSON.parse(serialized as string)).toEqual(payload);
  });

  it('a NUL character, which JSONB rejects, is dropped and nothing else changes', async () => {
    const payload = { text: 'a\u0000b', path: 'C:\\u0000dir' };
    write('.claude-flow/memory/store.json', { entries: { k: { ...entry('k', ''), value: payload } }, version: '3.0.0' });
    const [record] = await reader(defaultSource('claude-flow-memory')).readAll();
    expect(JSON.parse(cloudWriter().serializeValue(record.value, 'value') as string)).toEqual({ text: 'ab', path: 'C:\\u0000dir' });
  });

  it('a record has only the columns of aqe.claude_flow_memory', async () => {
    const [record] = await reader(defaultSource('claude-flow-memory')).readAll();
    expect(Object.keys(record).sort()).toEqual(['category', 'created_at', 'key', 'source_env', 'value']);
    expect(record).toMatchObject({ category: 'adr-analysis', source_env: 'test' });
    // created_at is the sync time, as before: incremental pulls select rows by it.
    expect(record.created_at).not.toBe(STORED_AT);
  });

  it('the older flat store still reads one record per key', async () => {
    write('flat.json', { 'memory-1': { content: 'a' }, 'memory-2': 'b', _meta: {} });
    const records = await reader({ ...defaultSource('claude-flow-memory'), path: 'flat.json' }).readAll();
    expect(records.map(r => [r.key, (r.value as JsonbText).text])).toEqual([['memory-1', '{"content":"a"}'], ['memory-2', '{"data":"b"}']]);
  });
});

describe('intelligence-qlearning on the real intelligence.json (#1384)', () => {
  it('the default source reads a key that real files contain', async () => {
    expect(defaultSource('intelligence-qlearning').jsonPath).toBe('$.patterns');
  });

  it('reads one record per Q-pattern with the aqe.qlearning_patterns columns', async () => {
    const records = await reader(defaultSource('intelligence-qlearning')).readAll();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      state: 'edit:ts', action: 'coder', q_value: 0.75, visits: 4,
      last_update: new Date(LAST_UPDATE_S * 1000).toISOString(), source_env: 'test',
    });
    expect(Object.keys(records[0]).sort()).toEqual(['action', 'created_at', 'last_update', 'q_value', 'source_env', 'state', 'visits']);
  });

  it('last_update is epoch seconds, and a never-updated pattern (0) has no last_update', async () => {
    const records = await reader(defaultSource('intelligence-qlearning')).readAll();
    expect(records.map(r => r.last_update)).toEqual(['2026-10-31T09:46:40.000Z', null]);
  });

  it('a millisecond timestamp still reads as milliseconds', async () => {
    write('.ruvector/intelligence.json', {
      ...intelligence, patterns: { 'a|b': { state: 'a', action: 'b', q_value: 1, visits: 1, last_update: LAST_UPDATE_S * 1000 } },
    });
    const [record] = await reader(defaultSource('intelligence-qlearning')).readAll();
    expect(record.last_update).toBe('2026-10-31T09:46:40.000Z');
  });

  it('an empty patterns map is a real 0, not an error', async () => {
    write('.ruvector/intelligence.json', { ...intelligence, patterns: {} });
    await expect(reader(defaultSource('intelligence-qlearning')).readAll()).resolves.toEqual([]);
  });
});

describe('a configured jsonPath the file does not have (#1384)', () => {
  it('is reported with the path, not read as 0 records', async () => {
    const source = { ...defaultSource('intelligence-qlearning'), jsonPath: '$.qvalues' };
    await expect(reader(source).readAll()).rejects.toThrow(/path \$\.qvalues not found in source intelligence-qlearning/);
  });

  it.each([
    ['a number', '$.stats.total'],
    ['null', '$.nothing'],
  ])('a path that resolves to %s is reported too', async (_what, jsonPath) => {
    write('.ruvector/intelligence.json', { ...intelligence, nothing: null });
    const source = { ...defaultSource('intelligence-qlearning'), jsonPath };
    await expect(reader(source).readAll()).rejects.toThrow(/is not a list or an object/);
  });
});

describe('daemon-state on the real store shape (#1384)', () => {
  it('reads one record per worker with its run counts', async () => {
    const source: SyncSource = {
      name: 'claude-flow-daemon', type: 'json', path: '.claude-flow/daemon-state.json',
      targetTable: 'aqe.claude_flow_workers', priority: 'low', mode: 'full', enabled: true,
    };
    const records = await reader(source).readAll();
    expect(records.map(r => [r.worker_type, r.run_count, r.success_count, r.failure_count, r.avg_duration_ms]))
      .toEqual([['map', 5, 4, 1, 120], ['audit', 2, 2, 0, 80]]);
  });
});

describe('aqe sync --dry-run with the default JSON sources (#1384)', () => {
  it('counts every memory and every Q-pattern, and completes', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    const agent = new CloudSyncAgent({
      environment: 'test',
      sync: {
        ...DEFAULT_SYNC_CONFIG.sync,
        sources: [defaultSource('claude-flow-memory'), defaultSource('intelligence-qlearning')],
        dryRun: true,
      },
    });
    await agent.initialize();
    const report = await agent.syncAll();
    expect(report.status).toBe('completed');
    expect(report.results.map(r => [r.source, r.success, r.recordsSynced])).toEqual([
      ['claude-flow-memory', true, 3],
      ['intelligence-qlearning', true, 2],
    ]);
  });
});
