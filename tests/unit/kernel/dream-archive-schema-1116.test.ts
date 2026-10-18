/**
 * #1116: dream_insights_archive was created lazily by the retention sweep,
 * outside the versioned schema. It is now created by the v14 migration:
 * additive and idempotent, keeping a lazily created table and its rows.
 *
 * Fixture: fresh SQLite files under the OS temp dir, opened through the real
 * UnifiedMemoryManager. Older schema states are simulated on the fixture only.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeUnifiedMemory, resetUnifiedMemory } from '../../../src/kernel/unified-memory';
import { SCHEMA_VERSION } from '../../../src/kernel/unified-memory-schemas';

let dir: string;
afterEach(() => {
  resetUnifiedMemory();
  rmSync(dir, { recursive: true, force: true });
});

async function open(dbPath: string): Promise<void> {
  await initializeUnifiedMemory({ dbPath });
  resetUnifiedMemory();
}

function read<T>(dbPath: string, sql: string): T {
  const db = new Database(dbPath, { readonly: true });
  try { return db.prepare(sql).get() as T; } finally { db.close(); }
}

const has = (dbPath: string, type: string, name: string) =>
  read<{ n: number }>(dbPath, `SELECT COUNT(*) n FROM sqlite_master WHERE type='${type}' AND name='${name}'`).n === 1;

/** Put the fixture back to a v13 state, with or without a lazily created archive. */
function asV13(dbPath: string, lazyArchiveRows: number | null): void {
  const db = new Database(dbPath);
  try {
    db.exec('DROP INDEX IF EXISTS idx_dream_insights_archive_id; DROP TABLE IF EXISTS dream_insights_archive;');
    if (lazyArchiveRows !== null) {
      // The exact statement 3.15.9's sweep ran.
      db.exec(`CREATE TABLE IF NOT EXISTS dream_insights_archive (
        archive_id INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, cycle_id TEXT, insight_type TEXT,
        source_concepts TEXT, description TEXT, novelty_score REAL, confidence_score REAL, actionable INTEGER,
        applied INTEGER, suggested_action TEXT, pattern_id TEXT, created_at TEXT,
        archived_at TEXT NOT NULL DEFAULT (datetime('now')))`);
      const insert = db.prepare('INSERT INTO dream_insights_archive (id, description) VALUES (?, ?)');
      for (let i = 0; i < lazyArchiveRows; i++) insert.run(`archived-${i}`, `kept ${i}`);
    }
    db.prepare('UPDATE schema_version SET version = 13 WHERE id = 1').run();
  } finally {
    db.close();
  }
}

const version = (dbPath: string) => read<{ version: number }>(dbPath, 'SELECT version FROM schema_version').version;

describe('#1116 dream_insights_archive in the versioned schema (real SQLite)', () => {
  it('a fresh database is at v14 with the archive table and its index', async () => {
    dir = mkdtempSync(join(tmpdir(), 'aqe-1116-schema-'));
    const dbPath = join(dir, 'memory.db');
    await open(dbPath);

    expect(SCHEMA_VERSION).toBe(14);
    expect(version(dbPath)).toBe(14);
    expect(has(dbPath, 'table', 'dream_insights_archive')).toBe(true);
    expect(has(dbPath, 'index', 'idx_dream_insights_archive_id')).toBe(true);
  });

  it('a v13 database without the table gets it on open', async () => {
    dir = mkdtempSync(join(tmpdir(), 'aqe-1116-schema-'));
    const dbPath = join(dir, 'memory.db');
    await open(dbPath);
    asV13(dbPath, null);
    expect(has(dbPath, 'table', 'dream_insights_archive')).toBe(false);

    await open(dbPath);

    expect(version(dbPath)).toBe(14);
    expect(has(dbPath, 'table', 'dream_insights_archive')).toBe(true);
  });

  it('a v13 database whose sweep already created the table keeps every archived row, across reopens', async () => {
    dir = mkdtempSync(join(tmpdir(), 'aqe-1116-schema-'));
    const dbPath = join(dir, 'memory.db');
    await open(dbPath);
    asV13(dbPath, 3);
    const rows = () => read<{ n: number; ids: string }>(dbPath, 'SELECT COUNT(*) n, group_concat(id) ids FROM dream_insights_archive');
    const before = rows();

    await open(dbPath);
    await open(dbPath);

    expect(before).toEqual({ n: 3, ids: 'archived-0,archived-1,archived-2' });
    expect(rows()).toEqual(before);
    expect(version(dbPath)).toBe(14);
    expect(has(dbPath, 'index', 'idx_dream_insights_archive_id')).toBe(true);
    expect(read<{ integrity_check: string }>(dbPath, 'PRAGMA integrity_check').integrity_check).toBe('ok');
  });
});
