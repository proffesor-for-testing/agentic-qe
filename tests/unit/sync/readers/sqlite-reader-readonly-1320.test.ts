/**
 * Regression test for #1320: the cloud-sync SQLiteReader must never change the
 * source database's journal mode. It opens the file read-only, so a
 * `journal_mode = WAL` switch on a rollback-journal (DELETE) source failed with
 * SQLITE_READONLY and sync refused a perfectly readable database.
 *
 * Uses real temp SQLite files (no mocks) in both DELETE and WAL mode.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SQLiteReader } from '../../../../src/sync/readers/sqlite-reader.js';
import { openDatabase } from '../../../../src/shared/safe-db.js';
import type { SyncSource } from '../../../../src/sync/interfaces.js';

const source: SyncSource = {
  name: 'patterns',
  type: 'sqlite',
  path: 'memory.db',
  targetTable: 'aqe.qe_patterns',
  priority: 'high',
  mode: 'full',
  enabled: true,
};

function createSourceDb(dbPath: string, journalMode: 'DELETE' | 'WAL'): void {
  const db = new Database(dbPath);
  db.pragma(`journal_mode = ${journalMode}`);
  db.exec(`
    CREATE TABLE qe_patterns (id TEXT PRIMARY KEY, name TEXT, created_at TEXT);
    INSERT INTO qe_patterns VALUES
      ('p1', 'one', '2026-10-01T00:00:00Z'),
      ('p2', 'two', '2026-10-02T00:00:00Z');
  `);
  db.close();
}

function journalModeOf(dbPath: string): string {
  const db = new Database(dbPath, { readonly: true });
  try {
    return String(db.pragma('journal_mode', { simple: true }));
  } finally {
    db.close();
  }
}

describe('SQLiteReader read-only source journal mode (#1320)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-sqlite-reader-1320-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.each(['DELETE', 'WAL'] as const)(
    'reads a %s-mode source and leaves its journal mode unchanged',
    async (mode) => {
      const dbPath = path.join(tmpDir, 'memory.db');
      createSourceDb(dbPath, mode);

      const reader = new SQLiteReader({ source, baseDir: tmpDir, environment: 'test' });
      await reader.initialize();
      const rows = await reader.readAll();
      const changed = await reader.readChanged(new Date('2026-10-01T12:00:00Z'));
      expect(await reader.count()).toBe(2);
      await reader.close();

      expect(rows.map((r) => r.id)).toEqual(['p1', 'p2']);
      expect(changed.map((r) => r.id)).toEqual(['p2']);
      expect(journalModeOf(dbPath)).toBe(mode.toLowerCase());
    }
  );

  it('openDatabase ignores walMode on a read-only open of a DELETE-mode file', () => {
    const dbPath = path.join(tmpDir, 'memory.db');
    createSourceDb(dbPath, 'DELETE');

    const db = openDatabase(dbPath, { readonly: true, walMode: true });
    try {
      expect(db.prepare('SELECT COUNT(*) AS n FROM qe_patterns').get()).toEqual({ n: 2 });
    } finally {
      db.close();
    }
    expect(journalModeOf(dbPath)).toBe('delete');
  });
});
