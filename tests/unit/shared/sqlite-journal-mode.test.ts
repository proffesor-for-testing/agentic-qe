/**
 * #1164: the journal-mode switch retries lock contention within its budget.
 *
 * SQLite does not run the busy handler when `PRAGMA journal_mode = WAL` upgrades
 * its read lock to a write lock, so with busy_timeout set it still fails with
 * SQLITE_BUSY at once while another connection holds a write lock.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../../src/shared/safe-db.js';
import {
  isJournalLockContention,
  setJournalModeWithRetry,
  type JournalModeConnection,
} from '../../../src/shared/sqlite-journal-mode.js';

const busy = (code = 'SQLITE_BUSY') => Object.assign(new Error('database is locked'), { code });

/** A connection whose journal_mode pragma fails with `errors` in turn, then reports `wal`. */
function fakeConnection(errors: Error[]): JournalModeConnection & { calls: number } {
  return {
    calls: 0,
    pragma(source: string) {
      expect(source).toBe('journal_mode = WAL');
      const err = errors[this.calls++];
      if (err) throw err;
      return 'wal';
    },
  };
}

/** A clock that only moves when the injected sleep is called. */
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: vi.fn((ms: number) => { t += ms; }) };
}

describe('setJournalModeWithRetry (#1164)', () => {
  it('should_return_the_mode_without_sleeping_when_the_switch_succeeds', () => {
    const db = fakeConnection([]);
    const clock = fakeClock();

    expect(setJournalModeWithRetry(db, 'WAL', 5000, clock)).toBe('wal');
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it('should_retry_SQLITE_BUSY_until_the_switch_succeeds', () => {
    const db = fakeConnection([busy(), busy(), busy()]);
    const clock = fakeClock();

    expect(setJournalModeWithRetry(db, 'WAL', 5000, clock)).toBe('wal');
    expect(db.calls).toBe(4);
    expect(clock.sleep).toHaveBeenCalledTimes(3);
  });

  it('should_retry_extended_and_LOCKED_codes', () => {
    const db = fakeConnection([busy('SQLITE_BUSY_RECOVERY'), busy('SQLITE_LOCKED')]);

    expect(setJournalModeWithRetry(db, 'WAL', 5000, fakeClock())).toBe('wal');
    expect(db.calls).toBe(3);
  });

  it('should_throw_the_last_busy_error_once_the_budget_is_spent', () => {
    const errors = Array.from({ length: 1000 }, () => busy());
    const db = fakeConnection(errors);
    const clock = fakeClock();

    let thrown: unknown;
    try { setJournalModeWithRetry(db, 'WAL', 100, clock); } catch (err) { thrown = err; }

    expect(db.calls).toBeGreaterThan(1);
    expect(thrown).toBe(errors[db.calls - 1]);
    expect(clock.now()).toBeLessThanOrEqual(100);
  });

  it('should_keep_each_sleep_within_the_backoff_cap_and_the_remaining_budget', () => {
    const db = fakeConnection(Array.from({ length: 1000 }, () => busy()));
    const clock = fakeClock();

    expect(() => setJournalModeWithRetry(db, 'WAL', 1000, clock)).toThrow(/locked/);
    for (const [ms] of clock.sleep.mock.calls) {
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(50);
    }
  });

  it('should_throw_non_lock_errors_at_once', () => {
    const ioError = Object.assign(new Error('disk I/O error'), { code: 'SQLITE_IOERR' });
    const db = fakeConnection([ioError]);
    const clock = fakeClock();

    expect(() => setJournalModeWithRetry(db, 'WAL', 5000, clock)).toThrow(ioError);
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it('should_not_retry_when_the_budget_is_zero', () => {
    const db = fakeConnection([busy(), busy()]);

    expect(() => setJournalModeWithRetry(db, 'WAL', 0, fakeClock())).toThrow(/locked/);
    expect(db.calls).toBe(1);
  });

  it('should_classify_lock_contention_codes', () => {
    expect(isJournalLockContention(busy())).toBe(true);
    expect(isJournalLockContention(busy('SQLITE_BUSY_SNAPSHOT'))).toBe(true);
    expect(isJournalLockContention(busy('SQLITE_LOCKED_SHAREDCACHE'))).toBe(true);
    expect(isJournalLockContention(busy('SQLITE_IOERR'))).toBe(false);
    expect(isJournalLockContention(new Error('no code'))).toBe(false);
    expect(isJournalLockContention(null)).toBe(false);
  });
});

describe('journal-mode switch against a real rollback-journal database (#1164)', () => {
  let dir: string;
  let dbPath: string;
  let holder: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aqe-1164-'));
    dbPath = join(dir, 'rollback.db');
    holder = new Database(dbPath);
    holder.pragma('journal_mode = DELETE');
    holder.exec('CREATE TABLE t (v TEXT)');
    // Another connection is mid-write: it holds the RESERVED lock.
    holder.exec('BEGIN IMMEDIATE');
    holder.prepare("INSERT INTO t VALUES ('x')").run();
  });

  afterEach(() => {
    if (holder.inTransaction) holder.exec('ROLLBACK');
    holder.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('should_fail_at_once_despite_busy_timeout_without_the_retry', () => {
    const db = new Database(dbPath);
    db.pragma('busy_timeout = 5000');
    const started = performance.now();
    try {
      expect(() => db.pragma('journal_mode = WAL')).toThrow(expect.objectContaining({ code: 'SQLITE_BUSY' }));
      // Nowhere near the 5 s busy_timeout: SQLite skipped the busy handler.
      expect(performance.now() - started).toBeLessThan(1000);
    } finally {
      db.close();
    }
  });

  it('should_switch_to_wal_once_the_writer_commits_during_a_retry', () => {
    const db = new Database(dbPath);
    db.pragma('busy_timeout = 5000');
    // The "other process" finishes its write while this one is backing off.
    const sleep = vi.fn(() => { if (holder.inTransaction) holder.exec('COMMIT'); });
    try {
      expect(setJournalModeWithRetry(db, 'WAL', 5000, { sleep })).toBe('wal');
      expect(sleep).toHaveBeenCalledTimes(1);
      expect(db.prepare('SELECT COUNT(*) AS n FROM t').get()).toEqual({ n: 1 });
    } finally {
      db.close();
    }
  });

  it('should_give_up_with_SQLITE_BUSY_after_the_budget_when_the_writer_never_commits', () => {
    const db = new Database(dbPath);
    db.pragma('busy_timeout = 5000');
    const started = performance.now();
    try {
      expect(() => setJournalModeWithRetry(db, 'WAL', 150)).toThrow(expect.objectContaining({ code: 'SQLITE_BUSY' }));
      expect(performance.now() - started).toBeGreaterThanOrEqual(140);
    } finally {
      db.close();
    }
  });

  it('openDatabase_should_retry_the_wal_switch_instead_of_failing_the_open', () => {
    // Release the holder after openDatabase's first failed attempt.
    const original = Object.getOwnPropertyDescriptor(Database.prototype, 'pragma')!;
    let switchAttempts = 0;
    Object.defineProperty(Database.prototype, 'pragma', {
      ...original,
      value(this: Database.Database, sql: string, o?: unknown) {
        if (this !== holder && /journal_mode\s*=\s*WAL/i.test(sql) && ++switchAttempts === 2 && holder.inTransaction) {
          holder.exec('COMMIT');
        }
        return (original.value as (s: string, o?: unknown) => unknown).call(this, sql, o);
      },
    });
    let db: Database.Database | undefined;
    try {
      db = openDatabase(dbPath, { busyTimeout: 5000 });
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(switchAttempts).toBeGreaterThanOrEqual(2);
    } finally {
      Object.defineProperty(Database.prototype, 'pragma', original);
      db?.close();
    }
  });

  it('openDatabase_should_close_and_rethrow_when_contention_outlasts_busyTimeout', () => {
    expect(() => openDatabase(dbPath, { busyTimeout: 100 })).toThrow(expect.objectContaining({ code: 'SQLITE_BUSY' }));
  });
});
