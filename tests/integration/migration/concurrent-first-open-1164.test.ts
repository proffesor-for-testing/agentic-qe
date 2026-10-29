/**
 * #1164: concurrent first opens of a rollback-journal (non-WAL) database.
 *
 * Each opener switches the file to WAL. That switch upgrades a read lock to a
 * write lock, and SQLite returns SQLITE_BUSY for it at once instead of waiting
 * on busy_timeout, so with several processes starting together one of them
 * occasionally failed init with "database is locked" (about 5% of opens with 4
 * processes, before the fix). openDatabase() now retries the switch within
 * busyTimeout.
 *
 * Bounded for CI: 4 processes x a few rounds per fixture. The failure was
 * rare, so this catches a regression often rather than every time; the
 * deterministic check is tests/unit/shared/sqlite-journal-mode.test.ts.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../../../src/kernel/unified-memory-schemas.js';

const repoRoot = resolve(__dirname, '../../..');
const tsxLoader = join(repoRoot, 'node_modules/tsx/dist/loader.mjs');
const childScript = join(repoRoot, 'tests/fixtures/concurrent-migration/open-child.ts');
const PROCESSES = 4;
const ROUNDS = 4;

let dir: string;

type ChildResult = { ok: boolean; version?: number; migration?: string; error?: string };

function openInChild(dbPath: string, startFile: string, onReady: () => void): Promise<ChildResult> {
  return new Promise((done) => {
    const child = spawn(process.execPath, ['--import', tsxLoader, childScript, dbPath, startFile], {
      cwd: dir,
      env: { PATH: process.env.PATH, HOME: dir, TMPDIR: dir, TSX_TSCONFIG_PATH: join(repoRoot, 'tsconfig.json') },
    });
    let out = '';
    let err = '';
    let ready = false;
    child.stdout.on('data', (d) => {
      out += d;
      if (!ready && out.includes('ready\n')) { ready = true; onReady(); }
    });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', () => {
      const line = out.trim().split('\n').reverse().find((l) => l.startsWith('{"ok"'));
      done(line ? JSON.parse(line) : { ok: false, error: `no result; stderr: ${err.slice(-500)}` });
    });
  });
}

/** Run PROCESSES openers on `dbPath` at once (start barrier as in the #1116 test). */
async function openConcurrently(dbPath: string, round: string) {
  const startFile = join(dir, `${round}.start`);
  let readyCount = 0;
  const onReady = () => { if (++readyCount === PROCESSES) writeFileSync(startFile, 'go'); };
  const results = await Promise.all(Array.from({ length: PROCESSES }, () => openInChild(dbPath, startFile, onReady)));
  const db = new Database(dbPath, { readonly: true });
  try {
    return {
      results,
      journalMode: db.pragma('journal_mode', { simple: true }),
      integrity: db.pragma('integrity_check', { simple: true }),
      version: (db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number }).version,
      patterns: (db.prepare('SELECT COUNT(*) AS n FROM qe_patterns').get() as { n: number }).n,
    };
  } finally {
    db.close();
  }
}

/** A v11 database left in rollback-journal mode, as in the #1164 report. */
function createRollbackV11(dbPath: string): void {
  const db = new Database(dbPath);
  db.pragma('journal_mode = DELETE');
  db.exec(`
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
  `);
  expect(db.pragma('journal_mode', { simple: true })).toBe('delete');
  db.close();
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'aqe-1164-first-open-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('#1164 concurrent first open of a rollback-journal database', () => {
  it(`v11 in rollback-journal mode: ${PROCESSES} processes x ${ROUNDS} rounds all open it`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const dbPath = join(dir, `v11-${round}.db`);
      createRollbackV11(dbPath);

      const result = await openConcurrently(dbPath, `v11-${round}`);

      const detail = JSON.stringify(result.results);
      for (const r of result.results) expect(r, detail).toMatchObject({ ok: true, version: SCHEMA_VERSION });
      expect(result.results.filter((r) => r.migration === 'applied'), detail).toHaveLength(1);
      expect(result.journalMode).toBe('wal');
      expect(result.integrity).toBe('ok');
      expect(result.version).toBe(SCHEMA_VERSION);
      expect(result.patterns).toBe(2);
    }
  }, 180_000);

  it(`no file yet: ${PROCESSES} processes x ${ROUNDS} rounds all create and open it`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const dbPath = join(dir, `fresh-${round}.db`);

      const result = await openConcurrently(dbPath, `fresh-${round}`);

      const detail = JSON.stringify(result.results);
      for (const r of result.results) expect(r, detail).toMatchObject({ ok: true, version: SCHEMA_VERSION });
      expect(result.journalMode).toBe('wal');
      expect(result.integrity).toBe('ok');
      expect(result.version).toBe(SCHEMA_VERSION);
    }
  }, 180_000);
});
