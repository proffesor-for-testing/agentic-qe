import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  applyMigration,
  isMigrationApplied,
  rollbackMigration,
} from '../../../src/migrations/20260830_add_learning_evidence_tables.js';

function fixtureDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE qe_patterns (
      id TEXT PRIMARY KEY, qe_domain TEXT, domain TEXT
    );
    INSERT INTO qe_patterns VALUES ('p1', 'test-generation', 'learning-optimization');
  `);
  return db;
}

describe('learning evidence v12 migration', () => {
  let db: InstanceType<typeof Database>;
  beforeEach(() => { db = fixtureDb(); });
  afterEach(() => db.close());

  it('creates the complete schema and backfills legacy patterns as unknown', () => {
    applyMigration(db);
    expect(isMigrationApplied(db)).toBe(true);
    expect(db.prepare('SELECT outcome, source_kind FROM learning_evidence_manifests').get()).toEqual({
      outcome: 'unknown', source_kind: 'inferred',
    });
    expect(db.prepare('SELECT disposition FROM learning_evidence_admissions').get()).toEqual({
      disposition: 'legacy-unknown',
    });
    expect(db.prepare('SELECT use_kind FROM pattern_manifest_lineage').get()).toEqual({
      use_kind: 'legacy-context',
    });
  });

  it('is idempotent and never duplicates legacy evidence', () => {
    applyMigration(db);
    applyMigration(db);
    expect((db.prepare('SELECT COUNT(*) count FROM learning_evidence_manifests').get() as { count: number }).count).toBe(1);
    expect((db.prepare('SELECT COUNT(*) count FROM learning_evidence_admissions').get() as { count: number }).count).toBe(1);
  });

  it('rejects cross-manifest edges and invalid enum values', () => {
    applyMigration(db);
    db.exec(`
      INSERT INTO learning_evidence_manifests
        (id, manifest_hash, task_family, outcome, source_kind)
      VALUES ('m2', 'hash-m2', 'family', 'verified-success', 'executed');
      INSERT INTO learning_evidence_segments
        (id, manifest_id, segment_order, kind, contribution, admit_for_learning)
      VALUES ('s1', 'legacy-pattern:p1', 0, 'observe', 'causal', 1),
             ('s2', 'm2', 0, 'verify', 'supporting', 1);
    `);
    expect(() => db.exec(`
      INSERT INTO learning_segment_edges VALUES ('m2', 's1', 's2', 'depends-on')
    `)).toThrow(/FOREIGN KEY/);
    expect(() => db.exec(`
      INSERT INTO learning_evidence_admissions
        (id, manifest_id, decision_seq, disposition, assessor_kind, evidence_class)
      VALUES ('bad', 'm2', 1, 'approved', 'executed', 'EXECUTED')
    `)).toThrow(/CHECK/);
  });

  it('enforces append-only evidence and refuses rollback with data', () => {
    applyMigration(db);
    expect(() => db.exec("UPDATE learning_evidence_manifests SET task_family='changed'"))
      .toThrow(/append-only/);
    expect(() => db.exec('DELETE FROM learning_evidence_admissions')).toThrow(/append-only/);
    expect(() => rollbackMigration(db)).toThrow(/REFUSING rollback/);
  });
});

