/**
 * #1409: `aqe sync pull`
 * - `--full`, `--env` and `--since` after `pull` reached the parent `sync`
 *   command, so a pull was always incremental and from every environment
 *   (and `verify --env` / `status --env` likewise);
 * - every claude-flow memory was rejected (kv_store.namespace NOT NULL) and
 *   every Q-value (rl_q_values.algorithm / agent_id NOT NULL).
 * Pulled rows are insert-only, skip this machine's own environment and
 * ruvector rows, and are never uploaded again by `aqe sync`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Command } from 'commander';
import { createSyncCommands } from '../../../src/cli/commands/sync.js';
import { subcommandOptions } from '../../../src/cli/commands/sync-subcommand-options.js';
import { PostgresReader } from '../../../src/sync/cloud/postgres-reader.js';
import { SQLiteWriter } from '../../../src/sync/writers/sqlite-writer.js';
import { openDatabase } from '../../../src/shared/safe-db.js';
import {
  DEFAULT_PULL_CONFIG, DEFAULT_SYNC_CONFIG, PULLED_Q_ALGORITHM, type CloudWriter, type PullSource,
} from '../../../src/sync/interfaces.js';

const pullSource = (name: string): PullSource => DEFAULT_PULL_CONFIG.sources.find(s => s.name === name)!;
const pushQuery = (name: string): string => DEFAULT_SYNC_CONFIG.sync.sources.find(s => s.name === name)!.query!;

describe('pull/verify/status options reach the subcommand (#1409)', () => {
  /** Parse with the real `aqe sync` definition and capture the resolved options. */
  async function resolved(sub: 'pull' | 'verify' | 'status', argv: string[]): Promise<Record<string, unknown>> {
    const sync = createSyncCommands();
    let captured: Record<string, unknown> = {};
    const command = sync.commands.find(c => c.name() === sub)!;
    command.action((_opts: unknown, cmd: Command) => { captured = subcommandOptions(cmd); });
    await sync.parseAsync(['node', 'sync', sub, ...argv]);
    return captured;
  }

  it('pull --full --env X --since D', async () => {
    const options = await resolved('pull', ['--full', '--env', 'ci-7', '--since', '2026-11-01T00:00:00Z']);
    expect(options).toMatchObject({ full: true, env: 'ci-7', since: '2026-11-01T00:00:00Z' });
  });

  it('pull keeps its own default (all environments) when --env is not given', async () => {
    expect((await resolved('pull', [])).env).toBe('all');
  });

  it('verify --env X and status --env X', async () => {
    expect((await resolved('verify', ['--env', 'ci-7'])).env).toBe('ci-7');
    expect((await resolved('status', ['-e', 'ci-7'])).env).toBe('ci-7');
  });
});

describe('cloud reads for the two pulled tables (#1409)', () => {
  function readerWith(environment: string, rows: Record<string, unknown>[] = []) {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const writer = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes('information_schema')) return [{ column_name: 'last_update' }];
        return rows;
      },
    } as unknown as CloudWriter;
    return { reader: new PostgresReader({ writer, environment, localEnvironment: 'me' }), calls };
  }

  it('skips this machine\'s environment and ruvector rows', async () => {
    const { reader, calls } = readerWith('all');
    await reader.readAll(pullSource('qlearning-patterns'));
    expect(calls[0].sql).toMatch(/WHERE source_env <> \$1 AND state NOT LIKE \$2$/);
    expect(calls[0].params).toEqual(['me', 'ruvector:%']);
  });

  it('adds the requested environment, and keeps the filters for --since', async () => {
    const { reader, calls } = readerWith('rev');
    await reader.readChanged(pullSource('qlearning-patterns'), new Date('2026-01-01T00:00:00Z'));
    const read = calls.find(c => !c.sql.includes('information_schema'))!;
    expect(read.sql).toMatch(/WHERE last_update > \$1 AND source_env = \$2 AND source_env <> \$3 AND state NOT LIKE \$4$/);
    expect(read.params).toEqual(['2026-01-01T00:00:00.000Z', 'rev', 'me', 'ruvector:%']);
  });

  it('fills the local NOT NULL columns and unquotes values stored JSON-quoted (#1407)', async () => {
    const { reader } = readerWith('all', [
      { id: 'u1', state: '"edit:ts"', action: 'coder', q_value: 0.5, visits: 2, last_update: null, source_env: 'laptop', created_at: null },
    ]);
    const [row] = await reader.readAll(pullSource('qlearning-patterns'));
    expect(row).toMatchObject({
      state_key: 'edit:ts', action_key: 'coder', algorithm: PULLED_Q_ALGORITHM, agent_id: 'laptop',
    });
    expect(row).not.toHaveProperty('source_env');
  });

  it('gives each environment\'s claude-flow memories their own namespace', async () => {
    const { reader } = readerWith('all', [{ key: 'k', value: { a: 1 }, source_env: 'laptop', created_at: null }]);
    const [row] = await reader.readAll(pullSource('claude-flow-memory'));
    expect(row).toMatchObject({ key: 'k', namespace: 'claude-flow-cloud:laptop', value: '{"a":1}' });
  });

  it('counts with the same filters', async () => {
    const { reader, calls } = readerWith('all');
    (reader as unknown as { writer: CloudWriter }).writer.beginTransaction = async () => {};
    (reader as unknown as { writer: CloudWriter }).writer.execute = async () => {};
    (reader as unknown as { writer: CloudWriter }).writer.commit = async () => {};
    await reader.count(pullSource('claude-flow-memory'));
    expect(calls[0].sql).toMatch(/COUNT\(\*\).*WHERE source_env <> \$1$/);
  });
});

describe('local writes are insert-only and pulled rows are not uploaded again (#1409)', () => {
  let dir: string;
  let dbPath: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-pull-1409-'));
    dbPath = path.join(dir, 'memory.db');
    const db = openDatabase(dbPath);
    db.exec(`
      CREATE TABLE kv_store (key TEXT NOT NULL, namespace TEXT NOT NULL, value TEXT NOT NULL,
        expires_at INTEGER, created_at INTEGER, PRIMARY KEY (namespace, key));
      CREATE TABLE rl_q_values (id TEXT PRIMARY KEY, algorithm TEXT NOT NULL, agent_id TEXT NOT NULL,
        state_key TEXT NOT NULL, action_key TEXT NOT NULL, q_value REAL NOT NULL DEFAULT 0.0,
        visits INTEGER NOT NULL DEFAULT 0, last_reward REAL, domain TEXT, created_at TEXT, updated_at TEXT,
        UNIQUE(algorithm, agent_id, state_key, action_key));
      INSERT INTO kv_store (key, namespace, value) VALUES ('k1', 'claude-flow-cloud:laptop', '"local"');
      INSERT INTO kv_store (key, namespace, value) VALUES ('own', 'test-generation', '{"x":1}');
      INSERT INTO rl_q_values (id, algorithm, agent_id, state_key, action_key, q_value)
        VALUES ('a', 'q-learning', 'aqe-hook-router', 's', 'act', 0.9);
    `);
    db.close();
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('keeps an existing row, inserts new ones, and counts only what it wrote', async () => {
    const writer = new SQLiteWriter({ dbPath });
    await writer.connect();
    const written = await writer.upsert('kv_store', [
      { key: 'k1', namespace: 'claude-flow-cloud:laptop', value: '"cloud"' },
      { key: 'k2', namespace: 'claude-flow-cloud:laptop', value: '"cloud"' },
    ], { insertOnly: true });
    await writer.close();
    expect(written).toBe(1);
    const db = openDatabase(dbPath, { readonly: true });
    expect(db.prepare("SELECT value FROM kv_store WHERE key = 'k1'").pluck().get()).toBe('"local"');
    expect(db.prepare("SELECT value FROM kv_store WHERE key = 'k2'").pluck().get()).toBe('"cloud"');
    db.close();
  });

  it('still reports a row that violates NOT NULL (unlike INSERT OR IGNORE)', async () => {
    const writer = new SQLiteWriter({ dbPath });
    await writer.connect();
    const skipped: string[] = [];
    const written = await writer.upsert('kv_store', [{ key: 'k3', value: '"x"' }], {
      insertOnly: true, onSkipped: (_n, reason) => skipped.push(reason),
    });
    await writer.close();
    expect(written).toBe(0);
    expect(skipped[0]).toMatch(/NOT NULL constraint failed: kv_store.namespace/);
  });

  it('the push queries leave pulled rows out', () => {
    const db = openDatabase(dbPath);
    db.exec(`INSERT INTO rl_q_values (id, algorithm, agent_id, state_key, action_key, q_value)
      VALUES ('b', '${PULLED_Q_ALGORITHM}', 'laptop', 's2', 'act', 0.1)`);
    const kv = db.prepare(pushQuery('root-kv-store')).all() as Array<{ key: string }>;
    const q = db.prepare(pushQuery('root-rl-q-values')).all() as Array<{ state: string }>;
    db.close();
    expect(kv.map(r => r.key)).toEqual(['own']);
    expect(q.map(r => r.state)).toEqual(['s']);
  });
});
