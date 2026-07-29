/**
 * safe-db.ts WAL env override (bind-mount corruption mitigation).
 *
 * WAL is the safe default on a normal filesystem, but on a macOS virtiofs bind
 * mount it corrupts the DB. AQE_DISABLE_WAL / AQE_JOURNAL_MODE let such an
 * environment opt out without changing the default for everyone else.
 *
 * Uses a file-backed temp DB because an in-memory DB always reports journal_mode
 * 'memory' regardless of the pragma.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { openDatabase } from '../../../src/shared/safe-db.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('openDatabase — WAL env override (ADR/bind-mount fix)', () => {
  let dir: string;
  let dbPath: string;
  const saved = { disable: process.env.AQE_DISABLE_WAL, mode: process.env.AQE_JOURNAL_MODE };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'safedb-'));
    dbPath = join(dir, 'test.db');
    delete process.env.AQE_DISABLE_WAL;
    delete process.env.AQE_JOURNAL_MODE;
  });

  afterEach(() => {
    if (saved.disable === undefined) delete process.env.AQE_DISABLE_WAL;
    else process.env.AQE_DISABLE_WAL = saved.disable;
    if (saved.mode === undefined) delete process.env.AQE_JOURNAL_MODE;
    else process.env.AQE_JOURNAL_MODE = saved.mode;
    rmSync(dir, { recursive: true, force: true });
  });

  function journalModeOf(): string {
    const db = openDatabase(dbPath);
    const mode = (db.pragma('journal_mode', { simple: true }) as string).toLowerCase();
    db.close();
    return mode;
  }

  it('should_default_to_wal_when_no_env_override', () => {
    expect(journalModeOf()).toBe('wal');
  });

  it('should_use_delete_when_AQE_DISABLE_WAL_is_1', () => {
    process.env.AQE_DISABLE_WAL = '1';
    expect(journalModeOf()).toBe('delete');
  });

  it('should_honor_explicit_AQE_JOURNAL_MODE_truncate', () => {
    process.env.AQE_JOURNAL_MODE = 'truncate';
    expect(journalModeOf()).toBe('truncate');
  });

  it('should_ignore_unrelated_AQE_JOURNAL_MODE_and_keep_wal', () => {
    process.env.AQE_JOURNAL_MODE = 'nonsense';
    expect(journalModeOf()).toBe('wal');
  });

  /**
   * THE SIX-DAY-OUTAGE REGRESSION (2026-07-23 .. 2026-07-29).
   *
   * A WAL->DELETE switch needs an EXCLUSIVE lock, and busy_timeout does not help
   * against a long-lived reader. A stale `npm exec agentic-qe mcp` (npx cache, NOT
   * the `aqe-mcp` in .mcp.json) held memory.db + -wal open for days, so the pragma
   * threw SQLITE_BUSY on every writable open and capture froze for six days.
   *
   * The fix is NOT "swallow the error and write anyway": AQE_DISABLE_WAL=1 means
   * the operator has declared WAL unsafe on this mount, so writing in WAL would
   * trade a loud outage for silent corruption. We fail closed, with a message that
   * names the real holder-finding command.
   */
  function seedWalDbWithBlocker() {
    const seed = openDatabase(dbPath);
    seed.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    seed.exec("INSERT INTO t (v) VALUES ('x')");
    expect((seed.pragma('journal_mode', { simple: true }) as string).toLowerCase()).toBe('wal');
    const blocker = openDatabase(dbPath);
    blocker.exec('BEGIN');
    blocker.prepare('SELECT COUNT(*) AS c FROM t').get();
    return { seed, blocker };
  }

  it('should_fail_closed_when_journal_switch_is_blocked_by_another_reader', () => {
    const { seed, blocker } = seedWalDbWithBlocker();
    process.env.AQE_DISABLE_WAL = '1';

    // Refuses the open rather than writing in the mode declared unsafe.
    expect(() => openDatabase(dbPath, { busyTimeout: 200 })).toThrow(/another process holds the database open/);

    blocker.exec('ROLLBACK');
    blocker.close();
    seed.close();
  });

  it('should_name_the_holder_finding_command_in_the_error', () => {
    const { seed, blocker } = seedWalDbWithBlocker();
    process.env.AQE_DISABLE_WAL = '1';

    // The 2026-07 outage ran six days because the guidance pointed at the wrong
    // processes. The error must carry a command that finds ANY holder.
    expect(() => openDatabase(dbPath, { busyTimeout: 200 })).toThrow(/\/proc\/\[0-9\]\*/);

    blocker.exec('ROLLBACK');
    blocker.close();
    seed.close();
  });

  it('should_reference_the_actual_db_file_not_a_hardcoded_memory_db', () => {
    // codex review r2 #1: openDatabase serves many paths. A hardcoded "memory.db"
    // in the diagnostic sends the operator hunting for the wrong file.
    const { seed, blocker } = seedWalDbWithBlocker();
    process.env.AQE_DISABLE_WAL = '1';

    expect(() => openDatabase(dbPath, { busyTimeout: 200 })).toThrow(/test\.db/);
    expect(() => openDatabase(dbPath, { busyTimeout: 200 })).not.toThrow(/grep -q "memory\.db"/);

    blocker.exec('ROLLBACK');
    blocker.close();
    seed.close();
  });

  it('should_report_the_effective_setting_when_only_AQE_JOURNAL_MODE_is_set', () => {
    // codex review r2 #4: claiming "AQE_DISABLE_WAL is set" is false when the
    // TRUNCATE path was reached via AQE_JOURNAL_MODE alone.
    const { seed, blocker } = seedWalDbWithBlocker();
    process.env.AQE_JOURNAL_MODE = 'truncate';

    expect(() => openDatabase(dbPath, { busyTimeout: 200 })).toThrow(/AQE_JOURNAL_MODE=TRUNCATE/);
    expect(() => openDatabase(dbPath, { busyTimeout: 200 })).not.toThrow(/AQE_DISABLE_WAL=1/);

    blocker.exec('ROLLBACK');
    blocker.close();
    seed.close();
  });

  it('should_rethrow_non_lock_errors_unchanged_instead_of_calling_them_contention', () => {
    // codex review r2 #3: the narrow catch had no proof. Inject a NON-lock SQLite
    // failure and assert the original error escapes untouched — misreporting an
    // I/O or corruption fault as "another process holds the DB" is the exact
    // wrong-diagnosis failure this whole incident was made of.
    process.env.AQE_JOURNAL_MODE = 'truncate';
    const seed = openDatabase(dbPath); // creates the file in WAL
    seed.close();

    const original = Object.getOwnPropertyDescriptor(Database.prototype, 'pragma')!;
    const boom = Object.assign(new Error('disk I/O error'), { code: 'SQLITE_IOERR' });
    let calls = 0;
    Object.defineProperty(Database.prototype, 'pragma', {
      ...original,
      value(this: unknown, sql: string, o?: unknown) {
        // Let busy_timeout + the current-mode read through; fail only the switch.
        if (/journal_mode\s*=/i.test(sql) && ++calls === 1) throw boom;
        return (original.value as (s: string, o?: unknown) => unknown).call(this, sql, o);
      },
    });
    try {
      expect(() => openDatabase(dbPath, { fileMustExist: true })).toThrow(boom);
    } finally {
      Object.defineProperty(Database.prototype, 'pragma', original);
    }
  });

  it('should_not_attempt_a_switch_when_already_in_the_desired_mode', () => {
    // Steady state must need NO exclusive lock: with the DB already in DELETE, a
    // concurrent reader must not be able to block an open. This is what keeps the
    // one-time migration out of the permanent hot path.
    process.env.AQE_DISABLE_WAL = '1';
    const first = openDatabase(dbPath);
    first.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    expect((first.pragma('journal_mode', { simple: true }) as string).toLowerCase()).toBe('delete');

    const reader = openDatabase(dbPath, { readonly: true });
    reader.prepare('SELECT COUNT(*) AS c FROM t').get();

    expect(() => openDatabase(dbPath, { busyTimeout: 200 }).close()).not.toThrow();

    reader.close();
    first.close();
  });

  it('should_actually_persist_writes_durably_across_reopen', () => {
    // codex review #3: a SELECT proves readability, not persistence. Write, close,
    // reopen from scratch, and verify the row survived AND the DB is still sound.
    process.env.AQE_DISABLE_WAL = '1';
    const w = openDatabase(dbPath);
    w.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    w.prepare('INSERT INTO t (v) VALUES (?)').run('durable');
    w.close();

    const r = openDatabase(dbPath, { fileMustExist: true });
    expect(r.prepare('SELECT v FROM t WHERE id = 1').get()).toEqual({ v: 'durable' });
    expect(r.pragma('integrity_check', { simple: true })).toBe('ok');
    r.close();
  });
});
