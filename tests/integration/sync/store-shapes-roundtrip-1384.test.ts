/**
 * #1384: claude-flow memories and ruvector Q-patterns, read from files in the
 * real store shapes, written through the real PostgresWriter into a real
 * PostgreSQL, and read back with their types intact.
 *
 * Skipped when POSTGRES_URL is not set (see postgres-integration.test.ts).
 * The tables are created as in src/sync/schema/cloud-schema.sql (embedding as
 * TEXT: stock PostgreSQL has no ruvector type); rows are scoped to a unique
 * source_env and deleted afterwards.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createJSONReader } from '../../../src/sync/readers/json-reader.js';
import { PostgresWriter } from '../../../src/sync/cloud/postgres-writer.js';
import { DEFAULT_SYNC_CONFIG, type SyncSource } from '../../../src/sync/interfaces.js';

const POSTGRES_URL = process.env.POSTGRES_URL;
const describeWithPg = POSTGRES_URL ? describe : describe.skip;

const ENV = `it-1384-${process.pid}-${Date.now()}`;
const LAST_UPDATE_S = 1793440000;

const PAYLOADS: Record<string, unknown> = {
  number: 7,
  'timestamp-like-number': 1793440000000,
  'timestamp-like-string': '1793440000000',
  billion: 1000000000,
  'string-42': '42',
  'plain-text': 'plain text',
  'iso-string': '2026-11-01T10:00:00.000Z',
  'mixed-array': [1, 'a'],
  'nested-array': [1, [2, 3]],
  object: { n: 1, nested: { list: [1, 'x'] } },
  'json-null': null,
  boolean: false,
  'lone-surrogate': 'bad \ud800 end',
};
/** What PostgreSQL holds for a payload: lone surrogates become U+FFFD. */
const STORED: Record<string, unknown> = { ...PAYLOADS, 'lone-surrogate': 'bad \ufffd end' };

const defaultSource = (name: string): SyncSource => DEFAULT_SYNC_CONFIG.sync.sources.find(s => s.name === name)!;

describeWithPg('store shapes round trip through PostgresWriter (#1384)', () => {
  let dir: string;
  let writer: PostgresWriter;

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const url = new URL(POSTGRES_URL!);
    process.env.PGPASSWORD = decodeURIComponent(url.password);
    const connection = { host: url.hostname, port: Number(url.port || 5432) };
    writer = new PostgresWriter({
      cloud: { project: '', zone: '', instance: '', database: url.pathname.slice(1), user: decodeURIComponent(url.username), tunnelPort: connection.port },
      tunnelManager: { start: async () => connection, stop: async () => {}, isActive: () => true, getConnection: () => connection },
    });
    await writer.connect();
    await writer.execute('CREATE SCHEMA IF NOT EXISTS aqe');
    await writer.execute(`CREATE TABLE IF NOT EXISTS aqe.claude_flow_memory (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), key TEXT NOT NULL, value JSONB NOT NULL, category TEXT,
      embedding TEXT, source_env TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(key, source_env))`);
    await writer.execute(`CREATE TABLE IF NOT EXISTS aqe.qlearning_patterns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), state TEXT NOT NULL, action TEXT NOT NULL, q_value REAL NOT NULL,
      visits INTEGER DEFAULT 0, last_update TIMESTAMPTZ, source_env TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(state, action, source_env))`);

    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1384-it-'));
    fs.mkdirSync(path.join(dir, '.claude-flow/memory'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.ruvector'), { recursive: true });
    const entries = Object.fromEntries(Object.entries(PAYLOADS).map(([key, value]) => [key, {
      key, value, namespace: 'default', storedAt: '2026-11-01T10:00:00.000Z', lastAccessed: '2026-11-01T10:00:00.000Z', accessCount: 1,
    }]));
    fs.writeFileSync(path.join(dir, '.claude-flow/memory/store.json'), JSON.stringify({ entries, version: '3.0.0' }));
    fs.writeFileSync(path.join(dir, '.ruvector/intelligence.json'), JSON.stringify({
      patterns: {
        // Older ruvector pretrain entries: no action, no q_value. Skipped.
        'edit:.py': { coder: 0.5, tester: 1 },
        // ruvector `hooks pretrain` adds `source`, which is not a cloud column.
        'edit:.ts|coder': { state: 'edit:.ts', action: 'coder', q_value: 0.75, visits: 4, last_update: LAST_UPDATE_S, source: 'pretrain' },
        'test:.ts|tester': { state: 'test:.ts', action: 'tester', q_value: 0.5, visits: 0, last_update: 0 },
      },
      memories: [], trajectories: [], errors: {}, file_sequences: [], agents: {}, edges: [], stats: {},
    }));
  });

  afterAll(async () => {
    if (writer) {
      await writer.execute('DELETE FROM aqe.claude_flow_memory WHERE source_env = $1', [ENV]);
      await writer.execute('DELETE FROM aqe.qlearning_patterns WHERE source_env = $1', [ENV]);
      await writer.close();
    }
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const read = (name: string) => createJSONReader({ source: defaultSource(name), baseDir: dir, environment: ENV }).readAll();

  it('every claude-flow payload is written, twice, as one row with its JSON type intact', async () => {
    const records = await read('claude-flow-memory');
    const expected = Object.keys(PAYLOADS).length;
    expect(await writer.upsert('aqe.claude_flow_memory', records)).toBe(expected);
    expect(await writer.upsert('aqe.claude_flow_memory', records)).toBe(expected);

    const rows = await writer.query<{ key: string; value: unknown; type: string }>(
      'SELECT key, value, jsonb_typeof(value) AS type FROM aqe.claude_flow_memory WHERE source_env = $1', [ENV]);
    expect(rows).toHaveLength(expected);
    const typeOf = (v: unknown) => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : typeof v;
    for (const row of rows) {
      expect({ key: row.key, value: row.value, type: row.type })
        .toEqual({ key: row.key, value: STORED[row.key], type: typeOf(PAYLOADS[row.key]) });
    }
  });

  it('Q-patterns (pretrain first, legacy entries skipped) are written, twice, one row each, last_update in seconds', async () => {
    const records = await read('intelligence-qlearning');
    expect(records).toHaveLength(2);
    expect(await writer.upsert('aqe.qlearning_patterns', records)).toBe(2);
    expect(await writer.upsert('aqe.qlearning_patterns', records)).toBe(2);

    const rows = await writer.query<{ action: string; last_update: Date | null }>(
      'SELECT action, last_update FROM aqe.qlearning_patterns WHERE source_env = $1 ORDER BY q_value DESC', [ENV]);
    // The writer stores TEXT state/action JSON-quoted (#1407); this changes
    // deliberately when #1407 is fixed.
    expect(rows.map(r => [r.action, r.last_update?.toISOString() ?? null]))
      .toEqual([['"coder"', new Date(LAST_UPDATE_S * 1000).toISOString()], ['"tester"', null]]);
  });
});
