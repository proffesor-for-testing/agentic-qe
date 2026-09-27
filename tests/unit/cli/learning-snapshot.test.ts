/** SQLite snapshot contracts: committed WAL, destination safety, and failure rollback. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFileSync, existsSync, linkSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import Database from 'better-sqlite3';

let backup: typeof import('../../../src/cli/commands/learning-snapshot.js').backupLearningDatabase;
let restore: typeof import('../../../src/cli/commands/learning-snapshot.js').restoreLearningDatabase;
let root: string;
let fixture: string;
const connections: Database.Database[] = [];

function open(file: string): Database.Database {
  const db = new Database(file);
  connections.push(db);
  return db;
}
function create(name: string, value = name, pageSize = 4096, mode = 'WAL') {
  const file = join(fixture, `${name}.db`);
  const db = open(file);
  db.pragma(`page_size=${pageSize}`);
  db.pragma(`journal_mode=${mode}`);
  db.exec('CREATE TABLE evidence(value TEXT);');
  db.prepare('INSERT INTO evidence VALUES (?)').run(value);
  db.pragma('wal_checkpoint(TRUNCATE)');
  return { file, db };
}
function values(db: Database.Database): string[] {
  return (db.prepare('SELECT value FROM evidence ORDER BY rowid').all() as { value: string }[]).map(row => row.value);
}
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'aqe-learning-snapshot-tests-'));
  vi.stubEnv('AQE_PROJECT_ROOT', root);
  vi.stubEnv('TMPDIR', root);
  const module = await import('../../../src/cli/commands/learning-snapshot.js');
  backup = module.backupLearningDatabase;
  restore = module.restoreLearningDatabase;
});
beforeEach(() => { fixture = mkdtempSync(join(root, 'case-')); });
afterEach(() => {
  vi.restoreAllMocks();
  for (const db of connections.splice(0)) if (db.open) db.close();
  rmSync(fixture, { recursive: true, force: true });
});
afterAll(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });

describe('learning SQLite snapshots', () => {
  it.each(['WAL', 'DELETE'])('backs up committed rows while the %s writer stays open', async mode => {
    const source = create('source', 'checkpointed', 4096, mode);
    source.db.prepare('INSERT INTO evidence VALUES (?)').run('committed');
    const result = await backup(source.file, join(fixture, 'backup.db'), { verify: true });
    const image = open(result.backupPath);
    expect(values(image)).toEqual(['checkpointed', 'committed']);
    expect(image.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(image.pragma('journal_mode', { simple: true })).toBe('delete');
    expect(values(source.db)).toEqual(['checkpointed', 'committed']);
    expect(source.db.pragma('journal_mode', { simple: true })).toBe(mode.toLowerCase());
    expect(result.verification.valid).toBe(true);
  });

  it('restores a legacy main-file plus WAL pair and preserves the prior target', async () => {
    const source = create('source', 'checkpointed');
    source.db.prepare('INSERT INTO evidence VALUES (?)').run('in-wal');
    const legacy = join(fixture, 'legacy.db');
    copyFileSync(source.file, legacy);
    copyFileSync(`${source.file}-wal`, `${legacy}-wal`);
    const target = create('target', 'original target');
    const result = await restore(legacy, target.file, { force: true });
    expect(values(target.db)).toEqual(['checkpointed', 'in-wal']);
    expect(values(open(result.safetyBackupPath!))).toEqual(['original target']);
    expect(open(result.safetyBackupPath!).pragma('journal_mode', { simple: true })).toBe('delete');
    expect(target.db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(values(source.db)).toEqual(['checkpointed', 'in-wal']);
  });

  it('allows pinned WAL readers to finish their old snapshot', async () => {
    const source = create('source');
    const target = create('target');
    target.db.exec('BEGIN');
    expect(values(target.db)).toEqual(['target']);
    const result = await restore(source.file, target.file, { force: true });
    expect(values(target.db)).toEqual(['target']);
    expect(values(open(target.file))).toEqual(['source']);
    target.db.exec('COMMIT');
    expect(values(target.db)).toEqual(['source']);
    expect(values(open(result.safetyBackupPath!))).toEqual(['target']);
  });

  it('cannot reconstruct WAL transactions already omitted from a legacy gzip archive', async () => {
    const source = create('source', 'checkpointed');
    source.db.prepare('INSERT INTO evidence VALUES (?)').run('omitted WAL row');
    const legacy = join(fixture, 'legacy.db.gz');
    // Reproduce the old gzip format, which stored only the physical main file.
    writeFileSync(legacy, gzipSync(readFileSync(source.file)));
    const target = join(fixture, 'restored.db');
    await restore(legacy, target);
    expect(values(open(target))).toEqual(['checkpointed']);
    expect(values(source.db)).toEqual(['checkpointed', 'omitted WAL row']);
  });

  it('rejects a held destination writer instead of accepting a zero-page backup', async () => {
    const source = create('source');
    const target = create('target');
    target.db.exec('BEGIN IMMEDIATE');
    target.db.prepare('INSERT INTO evidence VALUES (?)').run('uncommitted');
    await expect(restore(source.file, target.file, { force: true })).rejects.toThrow('Restore failed');
    expect(values(target.db)).toEqual(['target', 'uncommitted']);
    target.db.exec('ROLLBACK');
    expect(values(target.db)).toEqual(['target']);
    const safetyImages = readdirSync(fixture).filter(name => name.includes('.pre-restore-') && name.endsWith('.db'));
    expect(safetyImages).toHaveLength(1);
    const safetyImage = open(join(fixture, safetyImages[0]));
    expect(values(safetyImage)).toEqual(['target']);
    expect(safetyImage.pragma('integrity_check', { simple: true })).toBe('ok');
  });

  it('rolls back an interrupted destination transfer and retains the safety image', async () => {
    const source = create('source');
    const insert = source.db.prepare('INSERT INTO evidence VALUES (?)');
    source.db.transaction(() => { for (let i = 0; i < 300; i++) insert.run(`row-${i}`.padEnd(4096, 'x')); })();
    const target = create('target');
    const original = Database.prototype.backup;
    let transfers = 0;
    vi.spyOn(Database.prototype, 'backup').mockImplementation(function (this: Database.Database, file, options) {
      if (file !== target.file) return original.call(this, file, options);
      return original.call(this, file, { progress: () => {
        if (++transfers > 1) throw new Error('fixture transfer failure');
        return 1;
      } });
    });
    await expect(restore(source.file, target.file, { force: true })).rejects.toThrow('snapshot preserved');
    expect(transfers).toBe(2);
    expect(values(target.db)).toEqual(['target']);
    expect(target.db.pragma('integrity_check', { simple: true })).toBe('ok');
    const safety = readdirSync(fixture).find(name => name.includes('.pre-restore-'))!;
    expect(values(open(join(fixture, safety)))).toEqual(['target']);
  });

  it('fails closed on incompatible WAL page sizes without changing the target', async () => {
    const source = create('source', 'source', 1024);
    const target = create('target');
    await expect(restore(source.file, target.file, { force: true })).rejects.toThrow('Restore failed');
    expect(values(target.db)).toEqual(['target']);
    expect(target.db.pragma('integrity_check', { simple: true })).toBe('ok');
  });

  it('refuses corrupt or missing input and preserves a prior backup artifact', async () => {
    const prior = create('prior');
    prior.db.close();
    const bytes = readFileSync(prior.file);
    const bad = join(fixture, 'bad.db');
    writeFileSync(bad, 'invalid database fixture');
    await expect(backup(bad, prior.file)).rejects.toThrow();
    await expect(backup(join(fixture, 'missing.db'), prior.file)).rejects.toThrow();
    expect(readFileSync(prior.file)).toEqual(bytes);
    expect(readdirSync(fixture).some(name => name.startsWith('.aqe-'))).toBe(false);
  });

  it.each(['corrupt.db', 'corrupt.db.gz', 'missing.db'])('refuses %s before target mutation', async name => {
    const target = create('target');
    const input = join(fixture, name);
    if (!name.startsWith('missing')) writeFileSync(input, 'invalid backup fixture');
    await expect(restore(input, target.file, { force: true })).rejects.toThrow();
    expect(values(target.db)).toEqual(['target']);
    expect(readdirSync(fixture).some(file => file.includes('.pre-restore-'))).toBe(false);
  });

  it('preserves a corrupt existing target for explicit offline recovery', async () => {
    const source = create('source');
    const target = join(fixture, 'corrupt-target.db');
    const bytes = Buffer.from('corrupt original fixture');
    writeFileSync(target, bytes);
    await expect(restore(source.file, target, { force: true })).rejects.toThrow('verified safety backup');
    expect(readFileSync(target)).toEqual(bytes);
  });

  it('refuses an empty SQLite source without replacing the prior artifact', async () => {
    const source = join(fixture, 'empty.db');
    open(source).close();
    const prior = create('prior');
    prior.db.close();
    const bytes = readFileSync(prior.file);
    await expect(backup(source, prior.file)).rejects.toThrow('snapshot');
    expect(readFileSync(prior.file)).toEqual(bytes);
  });

  it('requires force for an existing target', async () => {
    const source = create('source');
    const target = create('target');
    await expect(restore(source.file, target.file)).rejects.toThrow('Use --force');
    expect(values(target.db)).toEqual(['target']);
  });

  it.each(['direct', 'symlink', 'hardlink'])('rejects %s self-backup and self-restore aliases', async kind => {
    const source = create('source');
    const alias = kind === 'direct' ? source.file : join(fixture, 'alias.db');
    if (kind === 'symlink') symlinkSync(source.file, alias);
    if (kind === 'hardlink') linkSync(source.file, alias);
    await expect(backup(source.file, alias)).rejects.toThrow('alias');
    await expect(restore(alias, source.file, { force: true })).rejects.toThrow('alias');
    expect(values(source.db)).toEqual(['source']);
  });

  it.each(['-wal', '-shm'])('protects %s paths and their symlink/hardlink aliases in both directions', async suffix => {
    const source = create('source');
    source.db.prepare('INSERT INTO evidence VALUES (?)').run('committed');
    const sidecar = `${source.file}${suffix}`;
    expect(existsSync(sidecar)).toBe(true);
    const bytes = readFileSync(sidecar);
    const link = join(fixture, 'sidecar-link');
    const hard = join(fixture, 'sidecar-hardlink');
    symlinkSync(sidecar, link);
    linkSync(sidecar, hard);
    for (const alias of [sidecar, link, hard]) {
      await expect(backup(source.file, alias)).rejects.toThrow('alias');
      await expect(restore(alias, source.file, { force: true })).rejects.toThrow('alias');
    }
    expect(readFileSync(sidecar)).toEqual(bytes);
    expect(values(source.db)).toEqual(['source', 'committed']);
  });

  it('does not replace an output artifact with existing SQLite sidecars', async () => {
    const source = create('source');
    const output = create('output');
    output.db.prepare('INSERT INTO evidence VALUES (?)').run('live output');
    await expect(backup(source.file, output.file)).rejects.toThrow('sidecars');
    expect(values(output.db)).toEqual(['output', 'live output']);
  });

  it('atomically replaces a prior standalone backup after verification', async () => {
    const source = create('source');
    const output = create('output');
    output.db.close();
    await backup(source.file, output.file);
    expect(values(open(output.file))).toEqual(['source']);
  });
});
