/**
 * #1407: cloud values are serialized by the column's real type, not its name.
 * #1415: ruvector Q-patterns get a `ruvector:` state prefix, and existing
 * rows of the sync's environment are converted in place, never deleted.
 */
import { describe, it, expect, vi } from 'vitest';
import { columnKind, serializeForKind, toColumnKinds } from '../../../src/sync/cloud/column-types.js';
import { PostgresWriter } from '../../../src/sync/cloud/postgres-writer.js';
import { jsonb } from '../../../src/sync/jsonb-text.js';
import {
  convertBeforeQUpload, convertQPatternRows, convertedPair, pairKey, unquote, MISSING_STORE,
} from '../../../src/sync/q-patterns-cloud-migration.js';
import { toQPatterns, RUVECTOR_STATE_PREFIX } from '../../../src/sync/readers/q-patterns.js';
import type { DataReader, SyncSource } from '../../../src/sync/interfaces.js';

describe('column kinds (#1407)', () => {
  it('maps information_schema types to kinds', () => {
    expect(columnKind('text', 'text')).toBe('text');
    expect(columnKind('character varying', 'varchar')).toBe('text');
    expect(columnKind('jsonb', 'jsonb')).toBe('jsonb');
    expect(columnKind('timestamp with time zone', 'timestamptz')).toBe('timestamp');
    expect(columnKind('USER-DEFINED', 'ruvector')).toBe('vector');
    expect(columnKind('real', 'float4')).toBe('scalar');
  });

  it('keeps a TEXT value exactly, even one that looks like JSON or a timestamp', () => {
    expect(serializeForKind('edit:ts', 'text')).toBe('edit:ts');
    expect(serializeForKind('1793440000000', 'text')).toBe('1793440000000');
    expect(serializeForKind('2026-11-13T10:00:00Z', 'text')).toBe('2026-11-13T10:00:00Z');
    expect(serializeForKind('a\u0000b', 'text')).toBe('ab');
  });

  it('always sends valid JSON to a JSONB column', () => {
    expect(serializeForKind('edit:ts', 'jsonb')).toBe('"edit:ts"');
    expect(serializeForKind('{"a":1}', 'jsonb')).toBe('{"a":1}');
    // Before: an ISO-looking string went raw and was rejected as invalid JSON.
    const iso = serializeForKind('2026-11-13T10:00:00Z', 'jsonb') as string;
    expect(JSON.parse(iso)).toBe('2026-11-13T10:00:00Z');
    expect(serializeForKind({ a: [1, 2] }, 'jsonb')).toBe('{"a":[1,2]}');
    expect(serializeForKind(jsonb({ x: 'y' }), 'jsonb')).toBe('{"x":"y"}');
  });

  it('converts epoch numbers and numeric strings for timestamp columns only', () => {
    expect(serializeForKind(1793440000000, 'timestamp')).toBe('2026-10-31T09:46:40.000Z');
    expect(serializeForKind(1793440000, 'timestamp')).toBe('2026-10-31T09:46:40.000Z');
    expect(serializeForKind('1793440000000', 'timestamp')).toBe('2026-10-31T09:46:40.000Z');
    expect(serializeForKind('', 'timestamp')).toBeNull();
    expect(serializeForKind(1793440000000, 'scalar')).toBe(1793440000000);
  });

  it('formats number arrays for vector columns', () => {
    expect(serializeForKind([0.5, 1], 'vector')).toBe('[0.5,1]');
  });
});

describe('PostgresWriter uses the cloud column types (#1407)', () => {
  function writerWith(columns: Array<[string, string, string]> | Error) {
    const sent: Array<{ sql: string; params?: unknown[] }> = [];
    class Client {
      async connect() {}
      async end() {}
      async query(sql: string, params?: unknown[]) {
        sent.push({ sql, params });
        if (sql.includes('information_schema.columns')) {
          if (columns instanceof Error) throw columns;
          return { rows: columns.map(([c, d, u]) => ({ column_name: c, data_type: d, udt_name: u })), rowCount: 0 };
        }
        return { rows: [], rowCount: 1 };
      }
    }
    const tunnelManager = {
      start: vi.fn().mockResolvedValue({ host: 'localhost', port: 1, pid: 1, startedAt: new Date() }),
      stop: vi.fn(), isActive: vi.fn().mockReturnValue(true),
      getConnection: vi.fn().mockReturnValue({ host: 'localhost', port: 1, pid: 1, startedAt: new Date() }),
    };
    const writer = new PostgresWriter({
      cloud: { project: 'p', zone: 'z', instance: 'i', database: 'd', user: 'u', tunnelPort: 1 },
      tunnelManager: tunnelManager as never,
      pgModule: { Client },
    });
    return { writer, sent };
  }
  const Q_COLUMNS: Array<[string, string, string]> = [
    ['state', 'text', 'text'], ['action', 'text', 'text'], ['q_value', 'real', 'float4'],
    ['last_update', 'timestamp with time zone', 'timestamptz'], ['source_env', 'text', 'text'],
  ];
  const record = { state: 'edit:ts', action: '1793440000000', q_value: 0.5, last_update: 1793440000000, source_env: 'e' };

  it('stores state/action in a TEXT column unquoted and unconverted', async () => {
    const { writer, sent } = writerWith(Q_COLUMNS);
    await writer.connect();
    await writer.upsert('aqe.qlearning_patterns', [record]);
    const insert = sent.find(q => q.sql.includes('INSERT INTO'))!;
    expect(insert.params).toEqual(['edit:ts', '1793440000000', 0.5, '2026-10-31T09:46:40.000Z', 'e']);
    // The types are read once per table per connection.
    await writer.upsert('aqe.qlearning_patterns', [record]);
    expect(sent.filter(q => q.sql.includes('information_schema')).length).toBe(1);
  });

  it('falls back to name-based serialization when the types cannot be read', async () => {
    const { writer, sent } = writerWith(new Error('permission denied'));
    await writer.connect();
    await writer.upsert('aqe.qlearning_patterns', [record]);
    const insert = sent.find(q => q.sql.includes('INSERT INTO'))!;
    expect(insert.params?.[0]).toBe('"edit:ts"');
  });
});

describe('ruvector Q-patterns are prefixed (#1415)', () => {
  it('uploads ruvector states as ruvector:<state>', () => {
    const { records } = toQPatterns([{ state: 'edit:ts', action: 'coder', q_value: 0.5 }], '$.patterns');
    expect(records[0].state).toBe(`${RUVECTOR_STATE_PREFIX}edit:ts`);
  });
});

describe('converting existing cloud rows (#1407/#1415)', () => {
  const ruvector = new Set([pairKey('edit:ts', 'coder'), pairKey('shared', 'agent')]);
  const aqe = new Set([pairKey('shared', 'agent'), pairKey('a|b', 'qe-x')]);

  it('unquotes JSON string literals only', () => {
    expect(unquote('"edit:ts"')).toBe('edit:ts');
    expect(unquote('"a\\"b"')).toBe('a"b');
    expect(unquote('plain')).toBe('plain');
    expect(unquote('"unterminated')).toBe('"unterminated');
  });

  it('prefixes a ruvector-only pair, keeps a shared pair as AQE, leaves prefixed rows alone', () => {
    expect(convertedPair('"edit:ts"', '"coder"', ruvector, aqe)).toEqual({ state: 'ruvector:edit:ts', action: 'coder' });
    expect(convertedPair('"shared"', '"agent"', ruvector, aqe)).toEqual({ state: 'shared', action: 'agent' });
    expect(convertedPair('"a|b"', '"qe-x"', ruvector, aqe)).toEqual({ state: 'a|b', action: 'qe-x' });
    expect(convertedPair('ruvector:edit:ts', 'coder', ruvector, aqe)).toEqual({ state: 'ruvector:edit:ts', action: 'coder' });
  });

  function cloudWith(rows: Array<{ id: string; state: string; action: string }>, failIds: Record<string, unknown> = {}) {
    const statements: Array<{ sql: string; params?: unknown[] }> = [];
    return {
      statements,
      query: vi.fn(async (_sql: string) => rows),
      execute: vi.fn(async (sql: string, params?: unknown[]) => {
        statements.push({ sql, params });
        const fail = failIds[String(params?.[2])];
        if (fail) throw fail;
      }),
    };
  }

  it('rewrites rows in place with UPDATE, scoped to the environment, and never deletes', async () => {
    const cloud = cloudWith([
      { id: '1', state: '"edit:ts"', action: '"coder"' },
      { id: '2', state: '"shared"', action: '"agent"' },
      { id: '3', state: 'a|b', action: 'qe-x' },
    ]);
    const result = await convertQPatternRows(cloud, 'env1', ruvector, aqe);
    expect(result).toEqual({ unquoted: 2, prefixed: 1, conflicts: 0 });
    expect(cloud.statements.map(s => s.params)).toEqual([
      ['ruvector:edit:ts', 'coder', '1', 'env1'],
      ['shared', 'agent', '2', 'env1'],
    ]);
    expect(cloud.statements.every(s => /^UPDATE /.test(s.sql) && s.sql.includes('source_env = $4'))).toBe(true);
    expect(cloud.query).toHaveBeenCalledWith(expect.stringContaining('WHERE source_env = $1'), ['env1', ['edit:ts'], ['coder']]);
  });

  it('counts a rewrite that would collide and leaves that row as it was', async () => {
    const cloud = cloudWith([{ id: '1', state: '"x"', action: '"y"' }], { 1: Object.assign(new Error('dup'), { code: '23505' }) });
    expect(await convertQPatternRows(cloud, 'e', new Set(), new Set())).toEqual({ unquoted: 0, prefixed: 0, conflicts: 1 });
  });

  it('fails on any other database error', async () => {
    const cloud = cloudWith([{ id: '1', state: '"x"', action: '"y"' }], { 1: new Error('connection reset') });
    await expect(convertQPatternRows(cloud, 'e', new Set(), new Set())).rejects.toThrow(/connection reset/);
  });

  it('changes nothing on a second run', async () => {
    const cloud = cloudWith([{ id: '1', state: 'ruvector:edit:ts', action: 'coder' }, { id: '2', state: 'a|b', action: 'qe-x' }]);
    expect(await convertQPatternRows(cloud, 'e', ruvector, aqe)).toEqual({ unquoted: 0, prefixed: 0, conflicts: 0 });
    expect(cloud.execute).not.toHaveBeenCalled();
  });

  function source(name: string, type: 'json' | 'sqlite'): SyncSource {
    return { name, type, path: 'x', targetTable: 'aqe.qlearning_patterns', priority: 'low', mode: 'full', enabled: true };
  }
  function reader(records: unknown[] | Error): DataReader {
    return {
      readAll: async () => { if (records instanceof Error) throw records; return records; },
    } as unknown as DataReader;
  }

  const stores = (map: Record<string, DataReader | typeof MISSING_STORE | null>) =>
    async (s: SyncSource) => map[s.name] ?? null;
  const Q_WRITERS = [source('intelligence-qlearning', 'json'), source('root-rl-q-values', 'sqlite')];

  it('does not prefix when AQE\'s own Q-values cannot be read (a shared pair could not be told apart)', async () => {
    const cloud = cloudWith([{ id: '1', state: '"edit:ts"', action: '"coder"' }]);
    const note = await convertBeforeQUpload(cloud, 'e', Q_WRITERS, stores({
      'intelligence-qlearning': reader([{ state: 'ruvector:edit:ts', action: 'coder' }]),
      'root-rl-q-values': reader(new Error('db locked')),
    }));
    expect(cloud.statements[0].params).toEqual(['edit:ts', 'coder', '1', 'e']);
    expect(note).toMatch(/unquoted 1 existing row/);
  });

  it('does not prefix when the AQE store could not be opened (review of #1431: --sources intelligence-qlearning)', async () => {
    const cloud = cloudWith([{ id: '1', state: 'a|b', action: 'qe-x' }]);
    await convertBeforeQUpload(cloud, 'e', Q_WRITERS, stores({
      'intelligence-qlearning': reader([{ state: 'ruvector:a|b', action: 'qe-x' }]),
      'root-rl-q-values': null,
    }));
    expect(cloud.execute).not.toHaveBeenCalled();
  });

  it('keeps a pair AQE also holds as an AQE row, even when only the ruvector source was selected', async () => {
    // The conversion is given every Q writer and reads the unselected AQE store itself.
    const cloud = cloudWith([{ id: '1', state: 'a|b', action: 'qe-x' }]);
    await convertBeforeQUpload(cloud, 'e', Q_WRITERS, stores({
      'intelligence-qlearning': reader([{ state: 'ruvector:a|b', action: 'qe-x' }]),
      'root-rl-q-values': reader([{ state: 'a|b', action: 'qe-x' }]),
    }));
    expect(cloud.execute).not.toHaveBeenCalled();
  });

  it('treats a missing AQE store as holding no pairs, so ruvector rows are still prefixed', async () => {
    const cloud = cloudWith([{ id: '1', state: '"edit:ts"', action: '"coder"' }]);
    await convertBeforeQUpload(cloud, 'e', Q_WRITERS, stores({
      'intelligence-qlearning': reader([{ state: 'ruvector:edit:ts', action: 'coder' }]),
      'root-rl-q-values': MISSING_STORE,
    }));
    expect(cloud.statements[0].params).toEqual(['ruvector:edit:ts', 'coder', '1', 'e']);
  });

  it('asks the cloud only for rows that can change', async () => {
    const cloud = cloudWith([]);
    await convertQPatternRows(cloud, 'e', ruvector, aqe);
    const [sql, params] = cloud.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/state LIKE '"%' OR action LIKE '"%'/);
    expect(sql).toMatch(/state NOT LIKE 'ruvector:%'/);
    // Only the ruvector-only pair is a prefix candidate; the shared pair is not.
    expect(params).toEqual(['e', ['edit:ts'], ['coder']]);
  });

  it('reads ruvector pairs without their upload prefix', async () => {
    const cloud = cloudWith([{ id: '1', state: '"edit:ts"', action: '"coder"' }]);
    const note = await convertBeforeQUpload(cloud, 'e', Q_WRITERS, stores({
      'intelligence-qlearning': reader([{ state: 'ruvector:edit:ts', action: 'coder' }]),
      'root-rl-q-values': reader([{ state: 'a|b', action: 'qe-x' }]),
    }));
    expect(cloud.statements[0].params).toEqual(['ruvector:edit:ts', 'coder', '1', 'e']);
    expect(note).toMatch(/marked 1 existing ruvector row/);
  });
});
