/**
 * qe_patterns FTS5 self-heal on open.
 *
 * A real memory.db (schema v13) was found with qe_patterns_fts present but all
 * three sync triggers missing: 39/190 patterns invisible to keyword search and
 * 163 stale index entries. Migration v9 only runs for currentVersion < 9, so
 * the DB never healed. These tests reproduce that state on temp DBs and check
 * that every open path repairs it without touching qe_patterns rows.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import {
  getUnifiedMemory,
  resetUnifiedMemory,
} from '../../../src/kernel/unified-memory.js';
import {
  ensurePatternFtsInSync,
  QE_PATTERNS_FTS_TRIGGERS,
} from '../../../src/kernel/pattern-fts-self-heal.js';
import { QE_PATTERNS_FTS_TRIGGER_DDL } from '../../../src/kernel/unified-memory-schemas.js';
import { createSQLitePatternStore } from '../../../src/learning/sqlite-persistence.js';

const INITIAL = [
  ['p-login', 'Login form validation', 'Validate empty username and password'],
  ['p-page', 'Pagination boundary', 'Check the last page of a listing'],
  ['p-date', 'Date formatting', 'Format timestamps using the user locale'],
  ['p-old', 'Obsolete retry pattern', 'Retry flaky network calls blindly'],
] as const;

function insertPattern(db: Database.Database, id: string, name: string, description: string): void {
  db.prepare(
    `INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description)
     VALUES (?, 'test-template', 'test-generation', 'test-generation', ?, ?)`,
  ).run(id, name, description);
}

function triggerNames(db: Database.Database): string[] {
  return (db.prepare(
    "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'qe_patterns_fts_%' ORDER BY name",
  ).all() as Array<{ name: string }>).map((r) => r.name);
}

function counts(db: Database.Database): { patterns: number; indexed: number } {
  const patterns = (db.prepare('SELECT count(*) AS n FROM qe_patterns').get() as { n: number }).n;
  const indexed = (db.prepare('SELECT count(*) AS n FROM qe_patterns_fts_docsize').get() as { n: number }).n;
  return { patterns, indexed };
}

function matchIds(db: Database.Database, query: string): string[] {
  return (db.prepare(
    `SELECT p.id FROM qe_patterns_fts f JOIN qe_patterns p ON p.rowid = f.rowid
     WHERE qe_patterns_fts MATCH ? ORDER BY p.id`,
  ).all(query) as Array<{ id: string }>).map((r) => r.id);
}

/** FTS5 external-content integrity check (index vs content table). */
function ftsIntegrityOk(db: Database.Database): boolean {
  try {
    db.exec("INSERT INTO qe_patterns_fts(qe_patterns_fts, rank) VALUES('integrity-check', 1)");
    return true;
  } catch {
    return false;
  }
}

/**
 * Reproduce the field state: triggers dropped, then patterns inserted,
 * deleted and renamed while nothing maintained the index.
 */
function breakFtsSync(dbPath: string): void {
  const db = new Database(dbPath);
  for (const t of QE_PATTERNS_FTS_TRIGGERS) db.exec(`DROP TRIGGER IF EXISTS ${t}`);
  insertPattern(db, 'p-invisible', 'Idempotency key replay guard', 'Reject a reused idempotency key');
  db.prepare("DELETE FROM qe_patterns WHERE id = 'p-old'").run();
  db.prepare("UPDATE qe_patterns SET name = 'Session cookie expiry' WHERE id = 'p-date'").run();
  db.close();
}

async function openUnified(dbPath: string): Promise<void> {
  resetUnifiedMemory();
  const um = getUnifiedMemory({ dbPath });
  await um.initialize();
  resetUnifiedMemory(); // closes the connection
}

function healLines(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('qe_patterns FTS5'));
}

describe('qe_patterns FTS5 self-heal', () => {
  let tmpDir: string;
  let dbPath: string;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-fts-heal-'));
    dbPath = path.join(tmpDir, 'memory.db');
    await openUnified(dbPath); // fresh, fully migrated v13 DB
    const db = new Database(dbPath);
    for (const [id, name, description] of INITIAL) insertPattern(db, id, name, description);
    db.close();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    resetUnifiedMemory();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('heals missing triggers and a stale index on UnifiedMemoryManager open', async () => {
    breakFtsSync(dbPath);
    const before = new Database(dbPath);
    expect(triggerNames(before)).toEqual([]);
    expect(counts(before)).toEqual({ patterns: 4, indexed: 4 }); // equal counts, wrong rows
    expect(matchIds(before, 'idempotency')).toEqual([]);          // invisible pattern
    expect(ftsIntegrityOk(before)).toBe(false);
    before.close();

    await openUnified(dbPath);

    const after = new Database(dbPath);
    expect(triggerNames(after)).toEqual([...QE_PATTERNS_FTS_TRIGGERS].sort());
    expect(counts(after)).toEqual({ patterns: 4, indexed: 4 });
    expect(matchIds(after, 'idempotency')).toEqual(['p-invisible']);
    expect(matchIds(after, 'obsolete')).toEqual([]);            // stale entry gone
    expect(matchIds(after, 'session')).toEqual(['p-date']);     // renamed row reindexed
    expect(matchIds(after, 'formatting')).toEqual([]);          // old name gone
    expect(matchIds(after, 'timestamps')).toEqual(['p-date']);  // description kept
    expect(ftsIntegrityOk(after)).toBe(true);
    after.close();

    const lines = healLines(warn);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[UnifiedMemory] Healed');
    expect(lines[0]).toContain('qe_patterns 4');
  });

  it('rebuilds when triggers exist but the index drifted (count mismatch)', () => {
    const db = new Database(dbPath);
    db.exec(`INSERT INTO qe_patterns_fts(qe_patterns_fts, rowid, name, description, pattern_type, qe_domain)
             SELECT 'delete', rowid, name, description, pattern_type, qe_domain FROM qe_patterns WHERE id = 'p-login'`);
    expect(counts(db)).toEqual({ patterns: 4, indexed: 3 });
    const log = vi.fn();

    const result = ensurePatternFtsInSync(db, { log });

    expect(result).toMatchObject({ status: 'healed', recreatedTriggers: [], rebuilt: true, indexedBefore: 3, indexedAfter: 4 });
    expect(matchIds(db, 'login')).toEqual(['p-login']);
    expect(log).toHaveBeenCalledTimes(1);
    db.close();
  });

  it('rebuilds when counts match but indexed rowids differ', () => {
    const db = new Database(dbPath);
    // Unindex p-login, then index a phantom rowid: counts stay 4/4.
    db.exec(`INSERT INTO qe_patterns_fts(qe_patterns_fts, rowid, name, description, pattern_type, qe_domain)
             SELECT 'delete', rowid, name, description, pattern_type, qe_domain FROM qe_patterns WHERE id = 'p-login'`);
    db.exec(`INSERT INTO qe_patterns_fts(rowid, name, description, pattern_type, qe_domain)
             VALUES (999999, 'Phantom', 'ghost entry', 'x', 'y')`);
    expect(counts(db)).toEqual({ patterns: 4, indexed: 4 });

    const result = ensurePatternFtsInSync(db, { log: () => undefined });

    expect(result).toMatchObject({ status: 'healed', rebuilt: true, indexedAfter: 4 });
    expect(matchIds(db, 'login')).toEqual(['p-login']);
    expect(ftsIntegrityOk(db)).toBe(true);
    db.close();
  });

  it('creates qe_patterns_fts when the table itself is missing', () => {
    const db = new Database(dbPath);
    db.exec('DROP TABLE qe_patterns_fts'); // drops dependent shadow tables, not triggers
    for (const t of QE_PATTERNS_FTS_TRIGGERS) db.exec(`DROP TRIGGER IF EXISTS ${t}`);

    const result = ensurePatternFtsInSync(db, { log: () => undefined });

    expect(result.createdTable).toBe(true);
    expect(result.recreatedTriggers.sort()).toEqual([...QE_PATTERNS_FTS_TRIGGERS].sort());
    expect(counts(db)).toEqual({ patterns: 4, indexed: 4 });
    expect(matchIds(db, 'pagination')).toEqual(['p-page']);
    db.close();
  });

  it('is silent and does not rebuild on a healthy DB', async () => {
    await openUnified(dbPath);
    expect(healLines(warn)).toEqual([]);

    const db = new Database(dbPath);
    const execSpy = vi.spyOn(db, 'exec');
    const log = vi.fn();
    const result = ensurePatternFtsInSync(db, { log });
    expect(result).toMatchObject({ status: 'healthy', rebuilt: false, patternsBefore: 4, indexedBefore: 4 });
    expect(execSpy).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    db.close();
  });

  it('skips a read-only connection without writing or throwing', () => {
    breakFtsSync(dbPath);
    const ro = new Database(dbPath, { readonly: true });
    const log = vi.fn();

    const result = ensurePatternFtsInSync(ro, { log });

    expect(result.status).toBe('readonly');
    expect(log).not.toHaveBeenCalled();
    ro.close();
    const check = new Database(dbPath);
    expect(triggerNames(check)).toEqual([]); // nothing written
    check.close();
  });

  it('skips a query_only connection without writing', () => {
    breakFtsSync(dbPath);
    const db = new Database(dbPath);
    db.pragma('query_only = ON');
    expect(ensurePatternFtsInSync(db, { log: () => undefined }).status).toBe('readonly');
    db.pragma('query_only = OFF');
    expect(triggerNames(db)).toEqual([]);
    db.close();
  });

  it('does not throw on a file-level read-only DB (readonly flag false)', () => {
    breakFtsSync(dbPath);
    fs.chmodSync(dbPath, 0o444);
    const db = new Database(dbPath); // SQLite falls back to read-only; db.readonly stays false
    const log = vi.fn();

    const result = ensurePatternFtsInSync(db, { log });

    db.close();
    fs.chmodSync(dbPath, 0o644);
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      expect(result.status).toBe('healed'); // root ignores file mode
    } else {
      expect(result.status).toBe('failed');
      expect(result.error).toMatch(/readonly/i);
      expect(log).toHaveBeenCalledTimes(1);
    }
  });

  it('fails soft when another connection holds the write lock', () => {
    breakFtsSync(dbPath);
    const holder = new Database(dbPath);
    holder.exec('BEGIN IMMEDIATE');
    const db = new Database(dbPath, { timeout: 0 });
    const log = vi.fn();

    const result = ensurePatternFtsInSync(db, { log });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/locked|busy/i);
    expect(log).toHaveBeenCalledTimes(1);
    holder.exec('ROLLBACK');
    // the next open heals
    expect(ensurePatternFtsInSync(db, { log: () => undefined }).status).toBe('healed');
    holder.close();
    db.close();
  });

  it('does not rebuild twice when a concurrent opener heals first', () => {
    breakFtsSync(dbPath);
    const a = new Database(dbPath);
    const b = new Database(dbPath);
    const realTransaction = a.transaction.bind(a);
    // B heals between A's read-only detection and A taking the write lock.
    vi.spyOn(a, 'transaction').mockImplementation(((fn: () => void) => {
      expect(ensurePatternFtsInSync(b, { log: () => undefined }).status).toBe('healed');
      return realTransaction(fn);
    }) as typeof a.transaction);

    const result = ensurePatternFtsInSync(a, { log: () => undefined });

    expect(result).toMatchObject({ status: 'healthy', rebuilt: false, recreatedTriggers: [] });
    expect(counts(a)).toEqual({ patterns: 4, indexed: 4 });
    a.close();
    b.close();
  });

  it('replaces a sync trigger whose body is wrong (same name) and rebuilds', () => {
    // CREATE TRIGGER IF NOT EXISTS never replaces an existing trigger, so a
    // same-named trigger with a broken body would otherwise drift forever.
    const db = new Database(dbPath);
    db.exec('DROP TRIGGER qe_patterns_fts_update');
    db.exec('CREATE TRIGGER qe_patterns_fts_update AFTER UPDATE ON qe_patterns BEGIN SELECT 1; END;');
    db.prepare("UPDATE qe_patterns SET name = 'Cursor paging' WHERE id = 'p-page'").run();
    expect(ftsIntegrityOk(db)).toBe(false);
    const log = vi.fn();

    const result = ensurePatternFtsInSync(db, { log });

    expect(result).toMatchObject({ status: 'healed', rebuilt: true, replacedTriggers: ['qe_patterns_fts_update'] });
    expect(matchIds(db, 'cursor')).toEqual(['p-page']);
    expect(ftsIntegrityOk(db)).toBe(true);
    // the replacement is the canonical body: a later UPDATE stays in sync
    db.prepare("UPDATE qe_patterns SET name = 'Keyset paging' WHERE id = 'p-page'").run();
    expect(matchIds(db, 'keyset')).toEqual(['p-page']);
    expect(ftsIntegrityOk(db)).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain('replaced triggers [qe_patterns_fts_update]');
    // and the next open is quiet
    expect(ensurePatternFtsInSync(db, { log }).status).toBe('healthy');
    db.close();
  });

  it('treats whitespace/IF NOT EXISTS variants of the canonical triggers as healthy', () => {
    // Older code paths created the same triggers from differently indented
    // templates; that must never cause a rebuild on every open.
    const db = new Database(dbPath);
    for (const t of QE_PATTERNS_FTS_TRIGGERS) {
      db.exec(`DROP TRIGGER ${t}`);
      db.exec(QE_PATTERNS_FTS_TRIGGER_DDL[t].replace(/\n\s*/g, '\n            ').replace('IF NOT EXISTS ', ''));
    }
    const execSpy = vi.spyOn(db, 'exec');
    const result = ensurePatternFtsInSync(db, { log: () => undefined });
    expect(result).toMatchObject({ status: 'healthy', rebuilt: false, replacedTriggers: [] });
    expect(execSpy).not.toHaveBeenCalled();
    db.close();
  });

  it('reports nothing as repaired when the heal transaction fails to commit', () => {
    breakFtsSync(dbPath);
    const setup = new Database(dbPath);
    setup.pragma('journal_mode = DELETE'); // rollback journal: COMMIT needs EXCLUSIVE
    setup.close();
    const reader = new Database(dbPath);
    reader.exec('BEGIN');
    reader.prepare('SELECT count(*) FROM qe_patterns').get(); // holds SHARED
    const db = new Database(dbPath, { timeout: 0 });

    const result = ensurePatternFtsInSync(db, { log: () => undefined });

    expect(result.status).toBe('failed');
    expect(result).toMatchObject({ rebuilt: false, createdTable: false, recreatedTriggers: [], replacedTriggers: [], indexedAfter: -1 });
    expect(db.inTransaction).toBe(false);
    reader.exec('COMMIT');
    expect(triggerNames(db)).toEqual([]); // rolled back
    reader.close();
    db.close();
  });

  it('known limit: UPDATE-only drift behind re-created triggers is not detected cheaply', () => {
    // Triggers dropped, a row renamed, triggers re-created WITHOUT a rebuild
    // (e.g. by a CREATE TRIGGER IF NOT EXISTS schema path). Rowid sets still
    // match, so the cheap check passes; only FTS5 integrity-check sees it.
    const db = new Database(dbPath);
    for (const t of QE_PATTERNS_FTS_TRIGGERS) db.exec(`DROP TRIGGER ${t}`);
    db.prepare("UPDATE qe_patterns SET name = 'Session cookie expiry' WHERE id = 'p-date'").run();
    for (const t of QE_PATTERNS_FTS_TRIGGERS) db.exec(QE_PATTERNS_FTS_TRIGGER_DDL[t]);

    expect(ensurePatternFtsInSync(db, { log: () => undefined }).status).toBe('healthy');
    expect(ftsIntegrityOk(db)).toBe(false);
    db.close();
  });

  it('v9 migration populates the index idempotently when FTS rows already exist', async () => {
    // A pre-v9 DB whose QE_PATTERNS_SCHEMA already created + populated the
    // index: the old raw INSERT...SELECT would double-index every row.
    const db = new Database(dbPath);
    db.prepare('UPDATE schema_version SET version = 8 WHERE id = 1').run();
    db.close();

    await openUnified(dbPath);

    const after = new Database(dbPath);
    expect((after.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number }).version).toBeGreaterThanOrEqual(13);
    expect(counts(after)).toEqual({ patterns: 4, indexed: 4 });
    expect(ftsIntegrityOk(after)).toBe(true);
    after.close();
    expect(healLines(warn)).toEqual([]);
  });

  it('v9 migration creates and fills the index on a pre-v9 DB without one', async () => {
    const db = new Database(dbPath);
    db.exec('DROP TABLE qe_patterns_fts');
    db.prepare('UPDATE schema_version SET version = 8 WHERE id = 1').run();
    db.close();

    await openUnified(dbPath);

    const after = new Database(dbPath);
    expect(triggerNames(after)).toEqual([...QE_PATTERNS_FTS_TRIGGERS].sort());
    expect(counts(after)).toEqual({ patterns: 4, indexed: 4 });
    expect(matchIds(after, 'pagination')).toEqual(['p-page']);
    after.close();
    expect(healLines(warn)).toEqual([]); // migration did it; self-heal stayed silent
  });

  it('never throws: a failing connection is logged and reported', () => {
    const db = new Database(dbPath);
    db.close();
    const log = vi.fn();
    const result = ensurePatternFtsInSync(db, { log });
    expect(result.status).toBe('failed');
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain('self-heal skipped');
  });

  it('is a no-op when qe_patterns does not exist', () => {
    const db = new Database(path.join(tmpDir, 'empty.db'));
    expect(ensurePatternFtsInSync(db, { log: () => undefined }).status).toBe('no-patterns');
    db.close();
  });

  it('keeps insert/update/delete in sync after healing', async () => {
    breakFtsSync(dbPath);
    await openUnified(dbPath);

    const db = new Database(dbPath);
    insertPattern(db, 'p-new', 'Contract schema drift', 'Detect provider schema changes');
    db.prepare("UPDATE qe_patterns SET description = 'Walk every page boundary' WHERE id = 'p-page'").run();
    db.prepare("DELETE FROM qe_patterns WHERE id = 'p-login'").run();

    expect(counts(db)).toEqual({ patterns: 4, indexed: 4 });
    expect(matchIds(db, 'contract')).toEqual(['p-new']);
    expect(matchIds(db, 'walk')).toEqual(['p-page']);
    expect(matchIds(db, 'listing')).toEqual([]);
    expect(matchIds(db, 'login')).toEqual([]);
    expect(ftsIntegrityOk(db)).toBe(true);
    db.close();
  });

  it('heals a legacy SQLitePatternStore DB so searchFTS finds the invisible pattern', async () => {
    breakFtsSync(dbPath);
    const store = createSQLitePatternStore({ useUnified: false, dbPath });
    await store.initialize();

    expect(store.searchFTS('idempotency replay').map((r) => r.id)).toEqual(['p-invisible']);
    const lines = healLines(warn);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[SQLitePatternStore] Healed');
    store.close();
  });
});
