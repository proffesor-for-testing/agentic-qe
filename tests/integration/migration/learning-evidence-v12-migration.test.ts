import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { getUnifiedMemory, resetUnifiedMemory } from '../../../src/kernel/unified-memory.js';

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('v11 to current learning evidence migration on a disposable copy', () => {
  const dirs: string[] = [];
  afterEach(() => {
    resetUnifiedMemory();
    dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }));
  });

  it('preserves the source and all legacy rows while backfilling unknown evidence', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aqe-learning-evidence-v12-'));
    dirs.push(dir);
    const source = join(dir, 'source-v11.db');
    const target = join(dir, 'target-current.db');
    const fixture = new Database(source);
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
    const sourceBefore = sha256(source);
    copyFileSync(source, target);

    const manager = getUnifiedMemory({ dbPath: target });
    await manager.initialize();
    const db = manager.getDatabase();
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect((db.prepare('SELECT version FROM schema_version WHERE id=1').get() as { version: number }).version).toBe(13);
    expect((db.prepare('SELECT COUNT(*) count FROM qe_patterns').get() as { count: number }).count).toBe(2);
    expect((db.prepare('SELECT COUNT(*) count FROM qe_trajectories').get() as { count: number }).count).toBe(1);
    expect((db.prepare("SELECT COUNT(*) count FROM learning_evidence_admissions WHERE disposition='legacy-unknown'").get() as { count: number }).count).toBe(2);
    expect((db.prepare("SELECT COUNT(*) count FROM learning_evidence_admissions WHERE disposition='admitted'").get() as { count: number }).count).toBe(0);
    manager.close();
    resetUnifiedMemory();

    expect(sha256(source)).toBe(sourceBefore);
    const original = new Database(source, { readonly: true });
    expect((original.prepare('SELECT COUNT(*) count FROM qe_patterns').get() as { count: number }).count).toBe(2);
    expect(original.prepare("SELECT 1 FROM sqlite_master WHERE name='learning_evidence_manifests'").get()).toBeUndefined();
    original.close();

    const reopened = getUnifiedMemory({ dbPath: target });
    await reopened.initialize();
    expect((reopened.getDatabase().prepare('SELECT COUNT(*) count FROM learning_evidence_manifests').get() as { count: number }).count).toBe(2);
  });
});
