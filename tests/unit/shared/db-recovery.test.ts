/**
 * M3.2 — memory.db auto-restore. All tests operate on throwaway temp DBs; the
 * real `.agentic-qe/memory.db` is never touched.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { isDbHealthy, attemptAutoRestore } from '../../../src/shared/db-recovery';

const dirs: string[] = [];

function tempDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-dbrec-'));
  dirs.push(d);
  return d;
}

/** Write a real, healthy SQLite DB with one identifiable row. */
function writeGoodDb(p: string, marker: string): void {
  const db = new Database(p);
  db.exec('CREATE TABLE qe_patterns (id INTEGER PRIMARY KEY, tag TEXT)');
  db.prepare('INSERT INTO qe_patterns (tag) VALUES (?)').run(marker);
  db.close();
}

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('isDbHealthy', () => {
  it('should_returnTrue_forAHealthyDb', () => {
    const d = tempDir();
    const p = path.join(d, 'x.db');
    writeGoodDb(p, 'ok');
    expect(isDbHealthy(p)).toBe(true);
  });

  it('should_returnTrue_forAnAbsentFile_treatedAsFresh', () => {
    expect(isDbHealthy(path.join(tempDir(), 'missing.db'))).toBe(true);
  });

  it('should_returnFalse_forAMalformedFile', () => {
    const p = path.join(tempDir(), 'bad.db');
    fs.writeFileSync(p, 'this is not a sqlite database at all');
    expect(isDbHealthy(p)).toBe(false);
  });
});

describe('attemptAutoRestore', () => {
  it('should_noop_whenDbIsHealthy', () => {
    const d = tempDir();
    const p = path.join(d, 'memory.db');
    writeGoodDb(p, 'live');
    const res = attemptAutoRestore(p, { backupDir: path.join(d, 'backups', 'verified') });
    expect(res.restored).toBe(false);
    expect(res.reason).toBe('healthy');
  });

  it('should_restoreNewestVerifiedBackup_andParkCorruptOriginal', () => {
    const d = tempDir();
    const p = path.join(d, 'memory.db');
    const backupDir = path.join(d, 'backups', 'verified');
    fs.mkdirSync(backupDir, { recursive: true });

    // An older and a newer verified backup; newest must win.
    writeGoodDb(path.join(backupDir, 'memory-100.db'), 'older');
    writeGoodDb(path.join(backupDir, 'memory-200.db'), 'newer');
    // Make the "newer" file genuinely newer by mtime.
    const now = Date.now();
    fs.utimesSync(path.join(backupDir, 'memory-100.db'), new Date(now - 10000), new Date(now - 10000));
    fs.utimesSync(path.join(backupDir, 'memory-200.db'), new Date(now), new Date(now));

    // Corrupt live DB + a stale WAL sidecar.
    fs.writeFileSync(p, 'garbage');
    fs.writeFileSync(p + '-wal', 'stale');

    const res = attemptAutoRestore(p, { backupDir, now: 12345 });

    expect(res.restored).toBe(true);
    expect(res.reason).toBe('restored-from-backup');
    // Corrupt original PARKED, not deleted.
    expect(fs.existsSync(`${p}.corrupt-12345`)).toBe(true);
    expect(fs.existsSync(`${p}.corrupt-12345-wal`)).toBe(true); // stale WAL parked too
    // Restored DB is healthy and carries the NEWEST backup's data.
    expect(isDbHealthy(p)).toBe(true);
    const db = new Database(p, { readonly: true });
    const row = db.prepare('SELECT tag FROM qe_patterns').get() as { tag: string };
    db.close();
    expect(row.tag).toBe('newer');
  });

  it('should_skipACorruptBackup_andUseTheNextHealthyOne', () => {
    const d = tempDir();
    const p = path.join(d, 'memory.db');
    const backupDir = path.join(d, 'backups', 'verified');
    fs.mkdirSync(backupDir, { recursive: true });
    // Newest backup is itself corrupt → must fall through to the healthy older one.
    writeGoodDb(path.join(backupDir, 'memory-100.db'), 'healthy-old');
    fs.writeFileSync(path.join(backupDir, 'memory-200.db'), 'corrupt-newest');
    const now = Date.now();
    fs.utimesSync(path.join(backupDir, 'memory-100.db'), new Date(now - 10000), new Date(now - 10000));
    fs.utimesSync(path.join(backupDir, 'memory-200.db'), new Date(now), new Date(now));

    fs.writeFileSync(p, 'garbage');
    const res = attemptAutoRestore(p, { backupDir });

    expect(res.restored).toBe(true);
    const db = new Database(p, { readonly: true });
    const row = db.prepare('SELECT tag FROM qe_patterns').get() as { tag: string };
    db.close();
    expect(row.tag).toBe('healthy-old');
  });

  it('should_NEVER_parkAHeaderValidDb_evenWithABadShm_F3regression', () => {
    // F3: a healthy WAL db whose -shm is zeroed/inaccessible (virtiofs) must NOT
    // be mistaken for corrupt. isDbHealthy is header-based, so a valid main file
    // is healthy regardless of its sidecars — and a verified backup is present,
    // so the ONLY reason it stays put is the correct health verdict.
    const d = tempDir();
    const p = path.join(d, 'memory.db');
    const backupDir = path.join(d, 'backups', 'verified');
    fs.mkdirSync(backupDir, { recursive: true });
    writeGoodDb(path.join(backupDir, 'memory-1.db'), 'backup');
    writeGoodDb(p, 'LIVE-and-healthy');
    fs.writeFileSync(p + '-shm', Buffer.alloc(32)); // zeroed -shm sidecar

    const res = attemptAutoRestore(p, { backupDir });

    expect(res.restored).toBe(false);
    expect(res.reason).toBe('healthy');
    // The live DB (and its data) is untouched — NOT reverted to the backup.
    const db = new Database(p, { readonly: true });
    expect((db.prepare('SELECT tag FROM qe_patterns').get() as { tag: string }).tag).toBe('LIVE-and-healthy');
    db.close();
  });

  it('should_skipRestore_whenARestoreLockExists', () => {
    const d = tempDir();
    const p = path.join(d, 'memory.db');
    const backupDir = path.join(d, 'backups', 'verified');
    fs.mkdirSync(backupDir, { recursive: true });
    writeGoodDb(path.join(backupDir, 'memory-1.db'), 'backup');
    fs.writeFileSync(p, 'garbage'); // corrupt header
    fs.writeFileSync(`${p}.restore.lock`, '99999'); // a peer is "restoring"

    const res = attemptAutoRestore(p, { backupDir });

    expect(res.restored).toBe(false);
    expect(res.reason).toBe('restore-in-progress');
    // Corrupt original left untouched (peer owns the restore).
    expect(fs.readFileSync(p, 'utf8')).toBe('garbage');
  });

  it('should_beNonDestructive_whenNoVerifiedBackupExists', () => {
    const d = tempDir();
    const p = path.join(d, 'memory.db');
    fs.writeFileSync(p, 'garbage-but-all-i-have');

    const res = attemptAutoRestore(p, { backupDir: path.join(d, 'backups', 'verified') });

    expect(res.restored).toBe(false);
    expect(res.reason).toBe('no-verified-backup');
    // Corrupt file left in place (not parked, not deleted) for manual inspection.
    expect(fs.readFileSync(p, 'utf8')).toBe('garbage-but-all-i-have');
  });
});
