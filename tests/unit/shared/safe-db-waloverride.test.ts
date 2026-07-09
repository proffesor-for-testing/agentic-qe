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
});
