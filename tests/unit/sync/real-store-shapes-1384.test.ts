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

const intelligence = {
  patterns: {
    'edit:ts|coder': { state: 'edit:ts', action: 'coder', q_value: 0.75, visits: 4, last_update: 1793440000000 },
    'test:ts|tester': { state: 'test:ts', action: 'tester', q_value: 0.5, visits: 1, last_update: 1793440000000 },
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

  it('a record value is the stored payload as JSON, not the entry wrapper', async () => {
    const records = await reader(defaultSource('claude-flow-memory')).readAll();
    // JSON text passes through; plain text becomes a JSON string (the JSONB column).
    expect(records.map(r => r.value)).toEqual(['"first"', '{"agent":"coder"}', '"third"']);
    expect(records.map(r => JSON.parse(r.value as string))).toEqual(['first', { agent: 'coder' }, 'third']);
  });

  it('a payload that looks like a date stays text, and an object payload stays an object', async () => {
    write('.claude-flow/memory/store.json', {
      entries: { d: { ...entry('d', ''), value: STORED_AT }, o: { ...entry('o', ''), value: { n: 1 } } },
      version: '3.0.0',
    });
    const records = await reader(defaultSource('claude-flow-memory')).readAll();
    expect(records.map(r => r.value)).toEqual([JSON.stringify(STORED_AT), { n: 1 }]);
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
    expect(records.map(r => [r.key, r.value])).toEqual([['memory-1', { content: 'a' }], ['memory-2', { data: 'b' }]]);
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
      last_update: new Date(1793440000000).toISOString(), source_env: 'test',
    });
    expect(Object.keys(records[0]).sort()).toEqual(['action', 'created_at', 'last_update', 'q_value', 'source_env', 'state', 'visits']);
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
