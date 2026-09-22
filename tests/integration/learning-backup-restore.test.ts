/** Real CLI backup/restore must preserve committed SQLite WAL contents. */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtures: string[] = [];
const connections: Database.Database[] = [];
function cli(project: string, args: string[], temp: string, rootArgs: string[] = []) {
  mkdirSync(project, { recursive: true });
  return spawnSync(process.execPath, [
    '--import', pathToFileURL(join(repo, 'node_modules/tsx/dist/loader.mjs')).href,
    join(repo, 'src/cli/index.ts'), ...rootArgs, 'learning', ...args,
  ], {
    cwd: project, encoding: 'utf8', timeout: 20_000,
    env: { PATH: process.env.PATH, TMPDIR: temp, AQE_PROJECT_ROOT: project, AQE_MEMORY_BACKEND: 'sqlite', AQE_SESSION_CACHE: 'off' },
  });
}
function assertSuccess(run: ReturnType<typeof cli>) {
  expect(run.error, run.stderr).toBeUndefined();
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout);
}
function open(file: string) {
  const db = new Database(file, { fileMustExist: true });
  connections.push(db);
  return db;
}
function count(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM qe_patterns').get() as { n: number }).n;
}
afterEach(() => {
  for (const db of connections.splice(0)) if (db.open) db.close();
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe('learning backup and restore public CLI', () => {
  it.each([false, true])('preserves all committed rows with a live WAL writer (compress=%s)', (compress) => {
    const fixture = mkdtempSync(join(tmpdir(), 'aqe-cli-backup-'));
    fixtures.push(fixture);
    const source = join(fixture, 'source');
    const initialized = cli(source, ['info'], fixture);
    expect(initialized.status, initialized.stderr).toBe(0);
    const sourcePath = join(source, '.agentic-qe/memory.db');
    const writer = open(sourcePath);
    expect(writer.pragma('journal_mode', { simple: true })).toBe('wal');
    const insert = writer.prepare('INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name) VALUES (?, ?, ?, ?, ?)');
    insert.run('checkpointed', 'test-template', 'test-generation', 'unit', 'checkpointed fixture');
    writer.pragma('wal_checkpoint(TRUNCATE)');
    writer.transaction(() => {
      for (let i = 0; i < 100; i++) insert.run(`committed-${i}`, 'test-template', 'test-generation', 'unit', `fixture ${i}`);
    })();
    expect(count(writer)).toBe(101);
    const output = join(fixture, 'backup.db');
    const backup = assertSuccess(cli(source, ['backup', '--output', output, '--verify', '--json', ...(compress ? ['--compress'] : [])], fixture));
    // A backup artifact must be portable by itself, without a companion WAL.
    const archive = join(fixture, 'archive');
    mkdirSync(archive);
    const transported = join(archive, compress ? 'transported.db.gz' : 'transported.db');
    copyFileSync(backup.backupPath, transported);
    // A WAL header also needs sidecar creation, which readonly archive media
    // cannot allow. Check the header even on hosts that bypass permissions.
    if (!compress) expect([...readFileSync(transported).subarray(18, 20)]).toEqual([1, 1]);
    const restoredProject = join(fixture, 'restored');
    chmodSync(transported, 0o444);
    chmodSync(archive, 0o555);
    try {
      assertSuccess(cli(restoredProject, ['restore', '--input', transported, '--verify', '--force', '--json'], fixture));
      expect(readdirSync(archive)).toEqual([compress ? 'transported.db.gz' : 'transported.db']);
    } finally {
      chmodSync(archive, 0o755);
      chmodSync(transported, 0o644);
    }
    const restored = open(join(restoredProject, '.agentic-qe/memory.db'));
    expect(count(restored)).toBe(101);
    expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(backup.verification.valid).toBe(true);
    expect(count(writer)).toBe(101);
    expect(writer.pragma('integrity_check', { simple: true })).toBe('ok');
  });

  it.each([
    { rootArgs: [], separators: [] },
    { rootArgs: ['--'], separators: [] },
    { rootArgs: [], separators: ['--'] },
  ])('does not create a missing source database before backup ($rootArgs/$separators)', ({ rootArgs, separators }) => {
    const fixture = mkdtempSync(join(tmpdir(), 'aqe-cli-missing-backup-'));
    fixtures.push(fixture);
    const project = join(fixture, 'project');
    // Options after `--` are positional, so exercise valid no-option dispatch.
    const run = cli(project, [...separators, 'backup'], fixture, rootArgs);
    expect(run.status, run.stderr).toBe(1);
    expect(run.stderr).toContain('No learning database found');
    expect(existsSync(join(project, '.agentic-qe/memory.db'))).toBe(false);
    expect(existsSync(join(project, 'backups'))).toBe(false);
  });

  it('refuses an invalid archive without initializing or migrating the destination', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'aqe-cli-invalid-restore-'));
    fixtures.push(fixture);
    const project = join(fixture, 'project');
    mkdirSync(join(project, '.agentic-qe'), { recursive: true });
    const dbPath = join(project, '.agentic-qe/memory.db');
    const old = new Database(dbPath);
    old.exec("CREATE TABLE marker(value TEXT); INSERT INTO marker VALUES ('preserve');");
    old.close();
    const before = readFileSync(dbPath);
    const input = join(fixture, 'invalid.db.gz');
    writeFileSync(input, 'invalid gzip fixture');
    const run = cli(project, ['restore', '--input', input, '--force', '--verify', '--json'], fixture);
    expect(run.status, run.stderr).toBe(1);
    expect(readFileSync(dbPath)).toEqual(before);
    expect(run.stderr).not.toContain('[UnifiedMemory]');
  });

  it('restores an absent destination without requiring force or bootstrapping it first', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'aqe-cli-new-restore-'));
    fixtures.push(fixture);
    const input = join(fixture, 'input.db');
    const source = new Database(input);
    source.exec("CREATE TABLE marker(value TEXT); INSERT INTO marker VALUES ('restored');");
    source.close();
    const project = join(fixture, 'project');
    const result = assertSuccess(cli(project, ['restore', '--input', input, '--verify', '--json'], fixture));
    expect(result.safetyBackupPath).toBeUndefined();
    const target = open(join(project, '.agentic-qe/memory.db'));
    expect(target.prepare('SELECT value FROM marker').pluck().get()).toBe('restored');
    expect(target.prepare("SELECT count(*) FROM sqlite_master WHERE type='table'").pluck().get()).toBe(1);
  });

  it('does not create a destination database when the input archive is invalid', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'aqe-cli-invalid-new-restore-'));
    fixtures.push(fixture);
    const input = join(fixture, 'invalid.db.gz');
    writeFileSync(input, 'invalid gzip fixture');
    const project = join(fixture, 'project');
    const run = cli(project, ['restore', '--input', input, '--json'], fixture);
    expect(run.status, run.stderr).toBe(1);
    expect(existsSync(join(project, '.agentic-qe/memory.db'))).toBe(false);
    expect(run.stderr).not.toContain('[UnifiedMemory]');
  });

  it('preserves corrupt destination bytes rather than auto-restoring or deleting them', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'aqe-cli-corrupt-target-'));
    fixtures.push(fixture);
    const input = join(fixture, 'input.db');
    const source = new Database(input);
    source.exec('CREATE TABLE marker(value TEXT);');
    source.close();
    const project = join(fixture, 'project');
    mkdirSync(join(project, '.agentic-qe'), { recursive: true });
    const dbPath = join(project, '.agentic-qe/memory.db');
    const bytes = Buffer.from('corrupt original fixture');
    writeFileSync(dbPath, bytes);
    const run = cli(project, ['restore', '--input', input, '--force', '--verify', '--json'], fixture);
    expect(run.status, run.stderr).toBe(1);
    expect(run.stderr).toContain('verified safety backup');
    expect(readFileSync(dbPath)).toEqual(bytes);
    expect(run.stderr).not.toContain('[UnifiedMemory]');
  });

});
