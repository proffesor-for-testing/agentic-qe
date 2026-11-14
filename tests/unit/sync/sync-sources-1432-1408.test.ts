/**
 * #1432: a record column the cloud table lacks is left out and reported, so
 * routing outcomes upload; the cloud schema adds the local-only columns.
 * #1408: daemon worker stats upload by default; intelligence.json memories
 * only when asked for.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostgresWriter } from '../../../src/sync/cloud/postgres-writer.js';
import { createJSONReader } from '../../../src/sync/readers/json-reader.js';
import { DEFAULT_SYNC_CONFIG, DEFAULT_PULL_CONFIG, type CloudWriter, type SyncSource } from '../../../src/sync/interfaces.js';
import { createPostgresReader } from '../../../src/sync/cloud/postgres-reader.js';
import { CloudSyncAgent } from '../../../src/sync/sync-agent.js';

const ROOT = path.resolve(__dirname, '../../..');
const LOCAL_ONLY = ['model_tier', 'advisor_consultation_json', 'exploration', 'criticality', 'q_weight'];

function writerWith(columns: string[] | Error) {
  const sent: Array<{ sql: string; params?: unknown[] }> = [];
  class Client {
    async connect() {}
    async end() {}
    async query(sql: string, params?: unknown[]) {
      sent.push({ sql, params });
      if (sql.includes('information_schema.columns')) {
        if (columns instanceof Error) throw columns;
        return { rows: columns.map(c => ({ column_name: c, data_type: 'text', udt_name: 'text' })), rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    }
  }
  const connection = { host: 'localhost', port: 1, pid: 1, startedAt: new Date() };
  const tunnelManager = {
    start: vi.fn().mockResolvedValue(connection), stop: vi.fn(),
    isActive: vi.fn().mockReturnValue(true), getConnection: vi.fn().mockReturnValue(connection),
  };
  const writer = new PostgresWriter({
    cloud: { project: 'p', zone: 'z', instance: 'i', database: 'd', user: 'u', tunnelPort: 1 },
    tunnelManager: tunnelManager as never,
    pgModule: { Client },
  });
  return { writer, sent };
}

describe('PostgresWriter leaves out columns the cloud table lacks (#1432)', () => {
  const CLOUD = ['id', 'used_agent', 'source_env', 'created_at'];
  const outcome = { id: 'r1', used_agent: 'coder', model_tier: 'sonnet', q_weight: 0.4, source_env: 'e', created_at: '2026-11-14T10:00:00Z' };

  it('writes the known columns and reports the rest', async () => {
    const { writer, sent } = writerWith(CLOUD);
    const missing: string[][] = [];
    await writer.connect();
    const written = await writer.upsert('aqe.routing_outcomes', [outcome], { onMissingColumns: c => missing.push(c) });

    expect(written).toBe(1);
    expect(missing).toEqual([['model_tier', 'q_weight']]);
    const insert = sent.find(q => q.sql.includes('INSERT INTO'))!;
    expect(insert.sql).not.toMatch(/model_tier|q_weight/);
    expect(insert.params).toEqual(['r1', 'coder', 'e', '2026-11-14T10:00:00Z']);
  });

  it('an append source fills cloud columns that are still NULL and never overwrites a value', async () => {
    // Rows uploaded before migration 003 have NULL in the new columns; the
    // next full sync must fill them, or they stay empty for good.
    const { writer, sent } = writerWith([...CLOUD, 'model_tier', 'q_weight']);
    await writer.connect();
    await writer.upsert('aqe.routing_outcomes', [outcome], { skipIfExists: true });
    const insert = sent.find(q => q.sql.includes('INSERT INTO'))!.sql.replace(/\s+/g, ' ');
    expect(insert).toContain('INSERT INTO aqe.routing_outcomes AS existing');
    expect(insert).toContain('ON CONFLICT (id) DO UPDATE SET');
    expect(insert).toContain('model_tier = COALESCE(existing.model_tier, EXCLUDED.model_tier)');
    expect(insert).toContain('WHERE (existing.used_agent IS NULL AND EXCLUDED.used_agent IS NOT NULL) OR');
    expect(insert).not.toContain('DO NOTHING');
  });

  it('reports nothing when every column exists', async () => {
    const { writer } = writerWith([...CLOUD, 'model_tier', 'q_weight']);
    const onMissingColumns = vi.fn();
    await writer.connect();
    await writer.upsert('aqe.routing_outcomes', [outcome], { onMissingColumns });
    expect(onMissingColumns).not.toHaveBeenCalled();
  });

  it('keeps every column when the table columns cannot be read', async () => {
    const { writer, sent } = writerWith(new Error('permission denied for information_schema'));
    const onMissingColumns = vi.fn();
    await writer.connect();
    await writer.upsert('aqe.routing_outcomes', [outcome], { onMissingColumns });
    expect(onMissingColumns).not.toHaveBeenCalled();
    expect(sent.find(q => q.sql.includes('INSERT INTO'))!.sql).toMatch(/model_tier/);
  });
});

describe('cloud schema has the local routing_outcomes columns (#1432)', () => {
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

  it.each(['src/sync/schema/cloud-schema.sql', 'src/sync/schema/migration-003.sql'])('%s adds them to an existing table', file => {
    const sql = read(file);
    for (const column of LOCAL_ONLY) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE aqe\\.routing_outcomes ADD COLUMN IF NOT EXISTS ${column} `));
    }
  });

  it('ships the schema files in the npm package (aqe sync init reads them)', () => {
    const pkg = JSON.parse(read('package.json')) as { files: string[] };
    expect(pkg.files).toContain('src/sync/schema/*.sql');
  });
});

describe('#1408 sources', () => {
  let dir: string;
  const write = (rel: string, data: unknown) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), JSON.stringify(data));
  };
  const source = (name: string): SyncSource => {
    const found = DEFAULT_SYNC_CONFIG.sync.sources.find(s => s.name === name);
    if (!found) throw new Error(`no default source ${name}`);
    return found;
  };
  const reader = (s: SyncSource) => createJSONReader({ source: s, baseDir: dir, environment: 'test' });

  // Shape of a real .ruvector/intelligence.json memory (64-dim embedding, epoch seconds).
  const memory = { id: 'mem_1768570553', memory_type: 'command', content: 'Running: npm test', embedding: new Array(64).fill(0.125), metadata: {}, timestamp: 1768570553 };

  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1408-')));
    write('.ruvector/intelligence.json', { patterns: {}, memories: [memory], trajectories: [], errors: {}, file_sequences: [], agents: {}, edges: [], stats: {} });
    write('.claude-flow/daemon-state.json', {
      running: false, workers: { map: { runCount: 3, successCount: 2, failureCount: 1, averageDurationMs: 42, lastRun: '2026-11-14T12:11:40.369Z', isRunning: false } },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('uploads worker stats by default and memories only when asked for', () => {
    expect(source('claude-flow-daemon-workers')).toMatchObject({ targetTable: 'aqe.claude_flow_workers', enabled: true });
    expect(source('intelligence-memories')).toMatchObject({ targetTable: 'aqe.intelligence_memories', jsonPath: '$.memories', enabled: false });
  });

  it('reads memories as the cloud intelligence_memories columns', async () => {
    const [record] = await reader(source('intelligence-memories')).readAll();
    expect(Object.keys(record).sort()).toEqual(['content', 'created_at', 'embedding', 'id', 'memory_type', 'metadata', 'source_env', 'timestamp']);
    expect(record).toMatchObject({ memory_type: 'command', content: 'Running: npm test', source_env: 'test' });
    expect(record.id).toMatch(/^mem_1768570553-[0-9a-f]{12}$/);
    expect(record.timestamp).toBe(new Date(1768570553 * 1000).toISOString());
    expect(record.embedding).toHaveLength(64);
  });

  it('keeps distinct memories that share a ruvector id, and uploads an exact repeat once', async () => {
    // ruvector ids are mem_<epoch seconds>: two memories in one second share one.
    const sameSecond = { ...memory, content: 'Reading: src/a.ts', memory_type: 'file_access' };
    write('.ruvector/intelligence.json', { memories: [memory, sameSecond, { ...memory }, 'not a memory'] });
    const r = reader(source('intelligence-memories'));
    const records = await r.readAll();

    expect(records).toHaveLength(2);
    expect(new Set(records.map(m => m.id)).size).toBe(2);
    expect(records.map(m => m.content).sort()).toEqual(['Reading: src/a.ts', 'Running: npm test']);
    expect(r.skippedOnRead()).toEqual({
      count: 2,
      reason: '1 memory repeats an earlier one exactly (every field the same) and was uploaded once; ' +
        '1 entry has no string id or memory_type and was skipped',
    });
  });

  it('gives the same memory a different cloud id in another environment', async () => {
    const here = await reader(source('intelligence-memories')).readAll();
    const there = await createJSONReader({ source: source('intelligence-memories'), baseDir: dir, environment: 'other' }).readAll();
    expect(here[0].id).not.toBe(there[0].id);
    // Stable across runs, so a re-sync updates the row instead of adding one.
    expect((await reader(source('intelligence-memories')).readAll())[0].id).toBe(here[0].id);
  });

  it('keeps memory_type in the fallback intelligence extractor', async () => {
    const records = await reader({ ...source('intelligence-memories'), name: 'intelligence-legacy', jsonPath: undefined }).readAll();
    expect(records.find(r => r.id === 'mem_1768570553')?.memory_type).toBe('command');
  });

  it('reads worker stats as the cloud claude_flow_workers columns', async () => {
    const [record] = await reader(source('claude-flow-daemon-workers')).readAll();
    expect(record).toMatchObject({ worker_type: 'map', run_count: 3, success_count: 2, failure_count: 1, avg_duration_ms: 42, last_run: '2026-11-14T12:11:40.369Z', source_env: 'test' });
    expect(record).not.toHaveProperty('created_at');
    expect(Date.parse(record.captured_at as string)).not.toBeNaN();
  });
});

describe('aqe sync init --dry-run (#1432)', () => {
  it('prints the schema instead of the parent sync taking --dry-run', async () => {
    const { createSyncCommands } = await import('../../../src/cli/commands/sync.js');
    const out: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { out.push(args.join(' ')); });
    try {
      await createSyncCommands().parseAsync(['node', 'sync', 'init', '--dry-run']);
    } finally {
      vi.restoreAllMocks();
    }
    const printed = out.join('\n');
    expect(printed).toMatch(/ALTER TABLE aqe\.routing_outcomes ADD COLUMN IF NOT EXISTS model_tier/);
    expect(printed).toMatch(/Dry run - no changes made/);
  });
});

describe('opt-in sources in aqe sync status (#1408)', () => {
  it('lists a source that is off as off, not as a failed reader', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1408-status-'));
    try {
      const memories = DEFAULT_SYNC_CONFIG.sync.sources.find(s => s.name === 'intelligence-memories')!;
      const agent = new CloudSyncAgent({
        environment: 'e',
        local: { ...DEFAULT_SYNC_CONFIG.local },
        sync: { ...DEFAULT_SYNC_CONFIG.sync, sources: [{ ...memories, path: path.join(dir, 'intelligence.json') }] },
      });
      await agent.initialize();
      const { sources } = await agent.getStatus();
      expect(sources).toEqual([expect.objectContaining({ name: 'intelligence-memories', enabled: false })]);
      expect(sources[0]).not.toHaveProperty('error');
      await agent.close();
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('pulling routing outcomes uploaded before migration 003 (#1432)', () => {
  it('gives a NULL cloud exploration the local default 0', async () => {
    const source = DEFAULT_PULL_CONFIG.sources.find(s => s.name === 'routing-outcomes')!;
    expect(source.defaults).toEqual({ exploration: 0 });
    const rows = [
      { id: 'old', used_agent: 'coder', exploration: null, source_env: 'laptop' },
      { id: 'new', used_agent: 'coder', exploration: 1, source_env: 'laptop' },
    ];
    const writer = { query: vi.fn().mockResolvedValue(rows) } as unknown as CloudWriter;
    const read = await createPostgresReader({ writer, environment: 'all' }).readAll(source);
    expect(read.map(r => [r.id, r.exploration])).toEqual([['old', 0], ['new', 1]]);
  });
});
