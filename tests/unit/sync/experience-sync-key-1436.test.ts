/**
 * #1436: every `aqe sync --full` inserted each captured experience into
 * aqe.learning_experiences again. The cloud table had no unique key and the
 * upload left out the local id, so the writer ran a plain INSERT.
 *
 * - The upload sends the local id as `local_id`; UNIQUE(local_id, source_env)
 *   (migration 004) is the conflict target, and an upload refuses to run when
 *   the cloud table has no local_id column instead of duplicating again.
 * - A pull keeps the origin id, so pulling twice does not duplicate locally,
 *   and pulled experiences are marked and never uploaded as this machine's rows.
 * - `aqe sync dedupe-experiences` removes the rows duplicated before migration 004.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostgresWriter } from '../../../src/sync/cloud/postgres-writer.js';
import { PostgresReader } from '../../../src/sync/cloud/postgres-reader.js';
import {
  DEFAULT_PULL_CONFIG, DEFAULT_SYNC_CONFIG, PULLED_EXPERIENCE_SOURCE_PREFIX, type CloudWriter,
} from '../../../src/sync/interfaces.js';
import {
  applyExperienceDedupe, backupTableName, planExperienceDedupe, restoreStatement, type DedupeDb,
} from '../../../src/sync/cloud/dedupe-experiences.js';
import type { Command } from 'commander';
import { createSyncCommands } from '../../../src/cli/commands/sync.js';
import { subcommandOptions } from '../../../src/cli/commands/sync-subcommand-options.js';
import { ensureAllBrainTables } from '../../../src/integrations/ruvector/brain-table-ddl.js';
import { openDatabase } from '../../../src/shared/safe-db.js';

const ROOT = path.resolve(__dirname, '../../..');
const pushSource = DEFAULT_SYNC_CONFIG.sync.sources.find(s => s.name === 'root-captured-experiences')!;
const pullSource = DEFAULT_PULL_CONFIG.sources.find(s => s.name === 'learning-experiences')!;

function writerWith(cloudColumns: string[]) {
  const sent: Array<{ sql: string; params?: unknown[] }> = [];
  class Client {
    async connect() {}
    async end() {}
    async query(sql: string, params?: unknown[]) {
      sent.push({ sql, params });
      if (sql.includes('information_schema.columns')) {
        return { rows: cloudColumns.map(c => ({ column_name: c, data_type: 'text', udt_name: 'text' })), rowCount: 0 };
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

const EXPERIENCE = {
  local_id: 'exp-1', agent_id: 'qe-test-generator', task_id: 'gen', task_type: 'test-generation',
  state: '{}', action: '{}', reward: 0.8, next_state: '{}', episode_id: null,
  created_at: '2026-11-14T10:00:00Z', source_env: 'laptop',
};
const CLOUD_COLUMNS = [
  'id', 'agent_id', 'task_id', 'task_type', 'state', 'action', 'reward', 'next_state',
  'episode_id', 'metadata', 'source_env', 'created_at',
];

describe('upload of captured experiences (#1436)', () => {
  it('should_matchRowsOnLocalIdAndEnvironment_when_cloudHasLocalId', async () => {
    const { writer, sent } = writerWith([...CLOUD_COLUMNS, 'local_id']);
    await writer.connect();
    await writer.upsert('aqe.learning_experiences', [EXPERIENCE], { skipIfExists: true });

    const insert = sent.find(q => q.sql.includes('INSERT INTO'))!.sql.replace(/\s+/g, ' ');
    expect(insert).toContain('ON CONFLICT (local_id, source_env) DO UPDATE SET');
    expect(insert).not.toMatch(/ON CONFLICT \(local_id, source_env\) DO UPDATE SET local_id/);
  });

  it('should_refuseInsteadOfDuplicating_when_cloudHasNoLocalIdColumn', async () => {
    const { writer, sent } = writerWith(CLOUD_COLUMNS);
    await writer.connect();

    await expect(writer.upsert('aqe.learning_experiences', [EXPERIENCE], { skipIfExists: true }))
      .rejects.toThrow(/has no local_id column.*migration-004\.sql/);
    expect(sent.some(q => q.sql.includes('INSERT INTO'))).toBe(false);
  });

  it('should_keepPlainInsertForOtherTables_when_theyHaveNoKey', async () => {
    const { writer, sent } = writerWith(['id', 'name', 'source_env']);
    await writer.connect();
    await writer.upsert('aqe.some_table', [{ name: 'x', source_env: 'e' }]);
    expect(sent.find(q => q.sql.includes('INSERT INTO'))!.sql).not.toContain('ON CONFLICT');
  });

  describe('the source query', () => {
    let dir: string;
    let dbPath: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1436-'));
      dbPath = path.join(dir, 'memory.db');
      const db = openDatabase(dbPath);
      ensureAllBrainTables(db);
      const insert = db.prepare(
        'INSERT INTO captured_experiences (id, task, agent, domain, source, started_at) VALUES (?, ?, ?, ?, ?, ?)',
      );
      insert.run('own-1', 'gen', 'qe-test-generator', 'test-generation', 'middleware', '2026-11-14 10:00:00');
      insert.run('from-a', 'gen', 'qe-test-generator', 'test-generation', `${PULLED_EXPERIENCE_SOURCE_PREFIX}env-a`, '2026-11-14 10:00:00');
      insert.run(null, 'pulled before #1436', 'qe-test-generator', 'x', 'middleware', '2026-11-01 00:00:00');
      db.close();
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('should_uploadOnlyThisMachinesExperiencesWithTheirId_when_pulledRowsArePresent', () => {
      const db = openDatabase(dbPath, { readonly: true });
      const rows = db.prepare(pushSource.query!).all() as Array<{ local_id: string; agent_id: string }>;
      db.close();
      expect(rows).toEqual([expect.objectContaining({ local_id: 'own-1', agent_id: 'qe-test-generator' })]);
    });
  });
});

describe('pull of learning experiences (#1436)', () => {
  function readerWith(rows: Record<string, unknown>[]) {
    const writer = {
      query: async (sql: string) => (sql.includes('information_schema') ? [{ column_name: 'created_at' }] : rows),
    } as unknown as CloudWriter;
    return new PostgresReader({ writer, environment: 'all', localEnvironment: 'me' });
  }

  it('should_keepTheOriginIdAndMarkTheRow_when_pullingAnotherEnvironmentsExperience', async () => {
    const reader = readerWith([{ ...EXPERIENCE, id: 42 }]);
    const [row] = await reader.readAll(pullSource);
    expect(row).toMatchObject({
      id: 'exp-1', agent: 'qe-test-generator', task: 'gen', domain: 'test-generation',
      source: `${PULLED_EXPERIENCE_SOURCE_PREFIX}laptop`,
    });
    expect(row).not.toHaveProperty('local_id');
    expect(row).not.toHaveProperty('source_env');
  });

  it('should_giveAStableId_when_theCloudRowWasUploadedWithoutLocalId', async () => {
    // Review of #1436: a NULL id never conflicts in SQLite, so every pull added these rows again.
    const reader = readerWith([{ ...EXPERIENCE, local_id: null, id: 42 }]);
    const [first] = await reader.readAll(pullSource);
    const [second] = await readerWith([{ ...EXPERIENCE, local_id: null, id: 42 }]).readAll(pullSource);
    expect(first.id).toBe('cloud:laptop:42');
    expect(second.id).toBe(first.id);
  });

  it('should_skipOwnEnvironmentAndKeepExistingRows_when_pulling', () => {
    expect(pullSource.excludeOwnEnvironment).toBe(true);
    expect(pullSource.insertOnly).toBe(true);
  });
});

describe('cloud schema (#1436)', () => {
  const schema = fs.readFileSync(path.join(ROOT, 'src/sync/schema/cloud-schema.sql'), 'utf8');
  const migration = fs.readFileSync(path.join(ROOT, 'src/sync/schema/migration-004.sql'), 'utf8');
  const UNIQUE = /CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_experiences_local_id\s+ON aqe\.learning_experiences\(local_id, source_env\)/;

  it('should_defineLocalIdAndItsUniqueIndex_when_schemaIsAppliedFreshOrAgain', () => {
    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS aqe\.learning_experiences \([^;]*local_id TEXT/);
    expect(schema).toContain('ALTER TABLE aqe.learning_experiences ADD COLUMN IF NOT EXISTS local_id TEXT;');
    expect(schema).toMatch(UNIQUE);
  });

  it('should_shipMigration004_when_packaged', () => {
    expect(migration).toContain('ALTER TABLE aqe.learning_experiences ADD COLUMN IF NOT EXISTS local_id TEXT;');
    expect(migration).toMatch(UNIQUE);
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { files: string[] };
    expect(pkg.files).toContain('src/sync/schema/*.sql');
  });
});

/** A DedupeDb that answers the plan queries from fixed counts and records statements. */
function fakeDb(state: {
  hasColumn?: boolean; total?: number; keyed?: number; legacy?: number;
  withTwin?: number; changed?: number; repeats?: number; kept?: number;
  backedUp?: number; deleted?: number; after?: number;
}) {
  const statements: string[] = [];
  const db: DedupeDb = {
    async execute(sql) { statements.push(sql.replace(/\s+/g, ' ').trim()); },
    async query<T>(sql: string): Promise<T[]> {
      const s = sql.replace(/\s+/g, ' ').trim();
      statements.push(s);
      if (s.includes('information_schema.columns')) return [{ n: state.hasColumn === false ? 0 : 1 }] as T[];
      if (s.includes('FILTER (WHERE local_id IS NOT NULL)')) {
        return [{ total: state.total ?? 0, keyed: state.keyed ?? 0, legacy: state.legacy ?? 0 }] as T[];
      }
      if (s.includes('AS with_twin')) {
        return [{
          with_twin: state.withTwin ?? 0, changed: state.changed ?? 0, repeats: state.repeats ?? 0, kept: state.kept ?? 0,
        }] as T[];
      }
      if (s.startsWith('SELECT COUNT(*) AS n FROM aqe.learning_experiences_dedupe_')) return [{ n: state.backedUp }] as T[];
      if (s.startsWith('DELETE FROM')) return Array.from({ length: state.deleted ?? 0 }, (_, i) => ({ id: i })) as T[];
      if (s.startsWith('SELECT COUNT(*) AS n FROM aqe.learning_experiences WHERE')) return [{ n: state.after }] as T[];
      throw new Error(`unexpected query: ${s}`);
    },
  };
  return { db, statements };
}

// 1104 local experiences, synced twice before migration 004 and once after; one
// experience deleted locally since, uploaded twice before.
const DUPLICATED = { total: 3314, keyed: 1104, legacy: 2210, withTwin: 2208, changed: 0, repeats: 1, kept: 1 };
const NOW = new Date('2026-11-18T09:30:00.123Z');

describe('aqe sync dedupe-experiences (#1436)', () => {
  it('should_reportTheDuplicatesWithoutChangingAnything_when_planning', async () => {
    const { db, statements } = fakeDb(DUPLICATED);
    const plan = await planExperienceDedupe(db, 'laptop');

    expect(plan).toMatchObject({ toDelete: 2209, rowsAfter: 1105, legacyKept: 1 });
    expect(plan.blocked).toBeUndefined();
    expect(statements.some(s => /^(DELETE|CREATE|BEGIN|INSERT|UPDATE)/.test(s))).toBe(false);
  });

  it('should_compareOnlyWithinTheEnvironment_when_classifyingLegacyRows', async () => {
    const { db, statements } = fakeDb(DUPLICATED);
    await planExperienceDedupe(db, 'laptop');
    const classify = statements.find(s => s.includes('AS with_twin'))!;
    expect(classify).toContain('k.source_env = l.source_env AND k.local_id IS NOT NULL');
    expect(classify).toContain('WHERE l.source_env = $1 AND l.local_id IS NULL');
    for (const column of ['agent_id', 'task_id', 'task_type', 'state', 'action', 'reward', 'next_state', 'episode_id', 'created_at']) {
      expect(classify).toContain(`k.${column} IS NOT DISTINCT FROM l.${column}`);
    }
  });

  it('should_block_when_migration004IsNotApplied', async () => {
    const { db, statements } = fakeDb({ hasColumn: false });
    const plan = await planExperienceDedupe(db, 'laptop');
    expect(plan.blocked).toMatch(/no local_id column.*migration-004\.sql/);
    const result = await applyExperienceDedupe(db, 'laptop', { now: NOW });
    expect(result).toMatchObject({ deleted: 0, backupTable: null, blocked: expect.stringMatching(/no local_id column/) });
    expect(statements.some(s => s.startsWith('CREATE') || s.startsWith('DELETE'))).toBe(false);
  });

  it('should_deleteOlderCopiesOfAChangedExperience_when_oneKeyedRowHasTheSameIdentity', async () => {
    // Review of #1436: quality changed locally after the legacy uploads, so no keyed row
    // has the same content, but exactly one has the same agent/task/type/created_at.
    const { db, statements } = fakeDb({ ...DUPLICATED, withTwin: 2148, changed: 60, repeats: 1, kept: 1 });
    const plan = await planExperienceDedupe(db, 'laptop');
    expect(plan).toMatchObject({ legacyChanged: 60, toDelete: 2209, rowsAfter: 1105 });
    const classify = statements.find(s => s.includes('AS with_twin'))!;
    expect(classify).toContain('= 1 AS has_unique_keyed_identity');
    const end = classify.indexOf('= 1 AS has_unique_keyed_identity');
    const identity = classify.slice(classify.lastIndexOf('SELECT COUNT(*)', end), end);
    // Re-review of #1436: two experiences can share agent/task/type/second, so the
    // columns that never change after capture must match too; reward and state may differ.
    for (const column of ['agent_id', 'task_id', 'task_type', 'created_at', 'action', 'next_state', 'episode_id']) {
      expect(identity).toContain(`k.${column} IS NOT DISTINCT FROM l.${column}`);
    }
    for (const column of ['reward', 'state']) {
      expect(identity).not.toContain(`k.${column} IS NOT DISTINCT FROM l.${column}`);
    }
  });

  it('should_block_when_notEveryLocalExperienceHasAKeyedRowYet', async () => {
    // Review of #1436: the background sync uploads a few keyed rows long before a full sync.
    const { db } = fakeDb({ ...DUPLICATED, keyed: 12 });
    const plan = await planExperienceDedupe(db, 'laptop', { localExperiences: 1104 });
    expect(plan.blocked).toMatch(/Only 12 of 1104 local experiences/);
    expect((await planExperienceDedupe(fakeDb(DUPLICATED).db, 'laptop', { localExperiences: 1104 })).blocked).toBeUndefined();
  });

  it('should_block_when_noRowHasBeenUploadedWithItsKeyYet', async () => {
    // Collapsing legacy rows now would leave one copy, and the next full sync
    // would add every experience again next to it.
    const { db } = fakeDb({ total: 2208, keyed: 0, legacy: 2208, withTwin: 0, changed: 0, repeats: 1104, kept: 1104 });
    const plan = await planExperienceDedupe(db, 'laptop');
    expect(plan.blocked).toMatch(/Run aqe sync --full --env laptop first/);
  });

  it('should_requireAnEnvironment_when_planning', async () => {
    const { db } = fakeDb(DUPLICATED);
    await expect(planExperienceDedupe(db, '')).rejects.toThrow(/environment is required/);
  });

  it('should_backUpThenDeleteInOneLockedTransaction_when_applying', async () => {
    const { db, statements } = fakeDb({ ...DUPLICATED, backedUp: 2209, deleted: 2209, after: 1105 });
    const result = await applyExperienceDedupe(db, 'laptop', { now: NOW });

    expect(result).toMatchObject({ deleted: 2209, verifiedRowsAfter: 1105, backupTable: 'aqe.learning_experiences_dedupe_20261118t093000' });
    const order = ['BEGIN', "SET LOCAL lock_timeout = '10s'", "SET LOCAL statement_timeout = '5min'", 'LOCK TABLE', 'CREATE TABLE aqe.learning_experiences_dedupe_', 'DELETE FROM', 'COMMIT']
      .map(prefix => statements.findIndex(s => s.startsWith(prefix)));
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const lock = statements.findIndex(s => s.startsWith('LOCK TABLE'));
    const planQuery = statements.findIndex(s => s.includes('FILTER (WHERE local_id IS NOT NULL)'));
    expect(planQuery).toBeGreaterThan(lock);
    expect(statements.find(s => s.startsWith('DELETE FROM'))).toContain('WHERE id IN (SELECT id FROM aqe.learning_experiences_dedupe_20261118t093000) AND source_env = $1');
    expect(statements).not.toContain('ROLLBACK');
  });

  it.each([
    ['the backup is short', { backedUp: 2000, deleted: 2209, after: 1105 }, /Backup holds 2000 rows/],
    ['fewer rows were deleted', { backedUp: 2209, deleted: 2100, after: 1105 }, /Deleted 2100 rows/],
    ['the remaining count is off', { backedUp: 2209, deleted: 2209, after: 1200 }, /has 1200 rows after the delete/],
  ])('should_rollBack_when_%s', async (_name, counts, message) => {
    const { db, statements } = fakeDb({ ...DUPLICATED, ...counts });
    await expect(applyExperienceDedupe(db, 'laptop', { now: NOW })).rejects.toThrow(message);
    expect(statements).toContain('ROLLBACK');
    expect(statements).not.toContain('COMMIT');
  });

  it('should_changeNothing_when_thereAreNoDuplicates', async () => {
    const { db, statements } = fakeDb({ total: 1104, keyed: 1104, legacy: 0 });
    const result = await applyExperienceDedupe(db, 'laptop', { now: NOW });
    expect(result).toMatchObject({ deleted: 0, backupTable: null });
    expect(statements.some(s => s.startsWith('CREATE') || s.startsWith('DELETE'))).toBe(false);
  });

  it('should_nameTheBackupAfterTheRunTime_when_applying', () => {
    expect(backupTableName(NOW)).toBe('aqe.learning_experiences_dedupe_20261118t093000');
    expect(restoreStatement(backupTableName(NOW))).toBe(
      'INSERT INTO aqe.learning_experiences SELECT * FROM aqe.learning_experiences_dedupe_20261118t093000;',
    );
  });

  it('should_rejectAnInjectedLockTimeout_when_applying', async () => {
    const { db } = fakeDb(DUPLICATED);
    await expect(applyExperienceDedupe(db, 'laptop', { now: NOW, lockTimeout: "1s'; DROP TABLE x; --" }))
      .rejects.toThrow(/Invalid lock timeout/);
  });

  describe('options', () => {
    async function resolved(argv: string[]): Promise<Record<string, unknown>> {
      const sync = createSyncCommands();
      let captured: Record<string, unknown> = {};
      const command = sync.commands.find(c => c.name() === 'dedupe-experiences')!;
      command.action((_opts: unknown, cmd: Command) => { captured = subcommandOptions(cmd); });
      await sync.parseAsync(['node', 'sync', ...argv]);
      return captured;
    }

    it.each([
      [['dedupe-experiences', '--apply', '--dry-run']],
      [['--dry-run', 'dedupe-experiences', '--apply']],
    ])('should_seeTheTypedDryRun_when_givenWithApply %j', async (argv) => {
      // Review of #1436: --dry-run reached only the parent, and --apply deleted anyway.
      expect(await resolved(argv)).toMatchObject({ apply: true, dryRun: true });
    });

    it('should_takeTheParentEnvironment_when_givenBeforeTheSubcommand', async () => {
      expect((await resolved(['--env', 'ci-7', 'dedupe-experiences'])).env).toBe('ci-7');
    });
  });
});
