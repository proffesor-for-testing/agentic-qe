/**
 * #1116: concurrent opens of a database that needs migrating.
 *
 * migrate() used to run as a DEFERRED transaction. On a database where
 * 3.15.9's sweep had already created dream_insights_archive, the v14 step's
 * `CREATE TABLE IF NOT EXISTS` only read, so the transaction held a read
 * snapshot and its first write had to upgrade it. That upgrade fails with
 * SQLITE_BUSY at once instead of waiting on busy_timeout, so with several
 * processes starting together all but one failed init with "database is
 * locked". migrate() now takes the write lock up front (IMMEDIATE) and reads
 * the version again under it, so a process that waited applies nothing twice.
 *
 * Each round starts real processes on a fresh copy of the fixture at once.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getUnifiedMemory, resetUnifiedMemory } from '../../../src/kernel/unified-memory.js';
import { SCHEMA_VERSION } from '../../../src/kernel/unified-memory-schemas.js';

const repoRoot = resolve(__dirname, '../../..');
const tsxLoader = join(repoRoot, 'node_modules/tsx/dist/loader.mjs');
const childScript = join(repoRoot, 'tests/fixtures/concurrent-migration/open-child.ts');
const PROCESSES = 4;
const ROUNDS = 3;

let dir: string;

function openInChild(dbPath: string): Promise<{ ok: boolean; version?: number; error?: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, ['--import', tsxLoader, childScript, dbPath], {
      cwd: dir,
      env: { PATH: process.env.PATH, HOME: dir, TMPDIR: dir, TSX_TSCONFIG_PATH: join(repoRoot, 'tsconfig.json') },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', () => {
      const line = out.trim().split('\n').reverse().find((l) => l.startsWith('{"ok"'));
      done(line ? JSON.parse(line) : { ok: false, error: `no result; stderr: ${err.slice(-500)}` });
    });
  });
}

async function openConcurrently(source: string, round: string) {
  const target = join(dir, `${round}.db`);
  copyFileSync(source, target);
  const results = await Promise.all(Array.from({ length: PROCESSES }, () => openInChild(target)));
  const db = new Database(target, { readonly: true });
  try {
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    return {
      results,
      version: count('SELECT version AS n FROM schema_version WHERE id = 1'),
      integrity: db.pragma('integrity_check', { simple: true }),
      archiveRows: count("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'dream_insights_archive'")
        ? count('SELECT COUNT(*) n FROM dream_insights_archive') : 0,
      archiveIndex: count("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'idx_dream_insights_archive_id'"),
      patterns: count('SELECT COUNT(*) n FROM qe_patterns'),
      legacyAdmissions: count("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'learning_evidence_admissions'")
        ? count("SELECT COUNT(*) n FROM learning_evidence_admissions WHERE disposition = 'legacy-unknown'") : 0,
    };
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'aqe-1116-concurrent-'));
});

afterAll(() => {
  resetUnifiedMemory();
  rmSync(dir, { recursive: true, force: true });
});

describe('#1116 concurrent migration', () => {
  it(`v13 with a lazily created archive (3.15.9 sweep): ${PROCESSES} processes x ${ROUNDS} rounds all open it`, async () => {
    // A current database, set back to the state 3.15.9 left after a sweep:
    // version 13, the archive table with rows, and no index on it.
    const source = join(dir, 'swept-v13.db');
    const manager = getUnifiedMemory({ dbPath: source });
    await manager.initialize();
    const setup = manager.getDatabase();
    setup.exec(`
      DROP INDEX IF EXISTS idx_dream_insights_archive_id;
      UPDATE schema_version SET version = 13 WHERE id = 1;
    `);
    const columns = (setup.prepare('PRAGMA table_info(dream_insights_archive)').all() as Array<{ name: string; notnull: number; dflt_value: unknown }>);
    const insert = setup.prepare(
      `INSERT INTO dream_insights_archive (${columns.map((c) => c.name).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    );
    for (let i = 0; i < 3; i++) {
      insert.run(...columns.map((c) => (c.name === 'id' ? `stale-${i}` : c.notnull ? 'x' : null)));
    }
    resetUnifiedMemory();

    for (let round = 0; round < ROUNDS; round++) {
      const result = await openConcurrently(source, `swept-${round}`);
      expect(result.results, JSON.stringify(result.results)).toEqual(
        Array.from({ length: PROCESSES }, () => ({ ok: true, version: SCHEMA_VERSION })),
      );
      expect(result.version).toBe(SCHEMA_VERSION);
      expect(result.integrity).toBe('ok');
      expect(result.archiveRows).toBe(3);
      expect(result.archiveIndex).toBe(1);
    }
  }, 180_000);

  it(`v11 with legacy rows: ${PROCESSES} processes x ${ROUNDS} rounds migrate it once, with no duplicated backfill`, async () => {
    const source = join(dir, 'v11.db');
    const fixture = new Database(source);
    // Databases AQE created are in WAL mode; switching a rollback-journal file
    // to WAL needs an exclusive lock, which is not what this test is about.
    fixture.pragma('journal_mode = WAL');
    fixture.exec(`
      CREATE TABLE schema_version (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, migrated_at TEXT);
      INSERT INTO schema_version VALUES (1, 11, datetime('now'));
      CREATE TABLE qe_patterns (
        id TEXT PRIMARY KEY, pattern_type TEXT NOT NULL, qe_domain TEXT NOT NULL,
        domain TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
        confidence REAL DEFAULT 0.5, usage_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0, quality_score REAL DEFAULT 0,
        tier TEXT DEFAULT 'short-term', created_at TEXT, updated_at TEXT
      );
      INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name) VALUES
        ('p1','fixture','test-generation','learning-optimization','fixture one'),
        ('p2','fixture','security-compliance','learning-optimization','fixture two');
      CREATE TABLE qe_trajectories (
        id TEXT PRIMARY KEY, task TEXT NOT NULL, agent TEXT, domain TEXT,
        started_at TEXT, ended_at TEXT, success INTEGER,
        steps_json TEXT, metadata_json TEXT
      );
      INSERT INTO qe_trajectories (id, task, domain) VALUES ('t1','fixture task','test-generation');
    `);
    fixture.close();

    for (let round = 0; round < ROUNDS; round++) {
      const result = await openConcurrently(source, `v11-${round}`);
      expect(result.results, JSON.stringify(result.results)).toEqual(
        Array.from({ length: PROCESSES }, () => ({ ok: true, version: SCHEMA_VERSION })),
      );
      expect(result.version).toBe(SCHEMA_VERSION);
      expect(result.integrity).toBe('ok');
      expect(result.patterns).toBe(2);
      // The v12 backfill ran once: one legacy-unknown admission per pattern.
      expect(result.legacyAdmissions).toBe(2);
    }
  }, 180_000);
});
