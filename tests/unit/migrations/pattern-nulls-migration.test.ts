/**
 * ADR-110 pattern-nulls migration tests (in-memory DB — never the real
 * memory.db; the copy-based verification against production data is recorded
 * in issue #522).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import migration, {
  applyMigration,
  isMigrationApplied,
  rollbackMigration,
} from '../../../src/migrations/20260611_add_pattern_nulls_table.js';

function freshDbWithPatterns(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE qe_patterns (id TEXT PRIMARY KEY, name TEXT);
    INSERT INTO qe_patterns (id, name) VALUES ('p1', 'fixture pattern');
  `);
  return db;
}

describe('20260611_add_pattern_nulls_table', () => {
  let db: InstanceType<typeof Database>;
  beforeEach(() => {
    db = freshDbWithPatterns();
  });

  it('should_reportNotApplied_when_tableAbsent', () => {
    expect(isMigrationApplied(db)).toBe(false);
  });

  it('should_createTable_when_applied', () => {
    applyMigration(db);
    expect(isMigrationApplied(db)).toBe(true);
  });

  it('should_beIdempotent_when_appliedTwice', () => {
    applyMigration(db);
    expect(() => applyMigration(db)).not.toThrow();
  });

  it('should_leaveExistingRowsUntouched_when_applied', () => {
    applyMigration(db);
    const count = (db.prepare('SELECT COUNT(*) AS c FROM qe_patterns').get() as { c: number }).c;
    expect(count).toBe(1);
  });

  it('should_enforceUniquePatternContextPair_when_duplicateInserted', () => {
    applyMigration(db);
    const ins = db.prepare(
      "INSERT INTO qe_pattern_nulls (id, pattern_id, context_fingerprint, failure_mode) VALUES (?, 'p1', 'ctx-a', 'fm')",
    );
    ins.run('n1');
    expect(() => ins.run('n2')).toThrow(/UNIQUE/);
  });

  it('should_consolidateCount_when_upsertOnSamePatternContext', () => {
    applyMigration(db);
    db.exec(`
      INSERT INTO qe_pattern_nulls (id, pattern_id, context_fingerprint, failure_mode)
      VALUES ('n1', 'p1', 'ctx-a', 'first');
      INSERT INTO qe_pattern_nulls (id, pattern_id, context_fingerprint, failure_mode)
      VALUES ('n2', 'p1', 'ctx-a', 'again')
      ON CONFLICT(pattern_id, context_fingerprint)
      DO UPDATE SET consolidated_count = consolidated_count + 1;
    `);
    const row = db.prepare('SELECT consolidated_count AS c FROM qe_pattern_nulls').get() as { c: number };
    expect(row.c).toBe(2);
  });

  it('should_rejectInvalidEvidenceClass_when_inserted', () => {
    applyMigration(db);
    expect(() =>
      db.prepare(
        "INSERT INTO qe_pattern_nulls (id, pattern_id, context_fingerprint, failure_mode, evidence_class) VALUES ('n1', 'p1', 'ctx', 'fm', 'VIBES')",
      ).run(),
    ).toThrow(/CHECK/);
  });

  it('should_refuseRollback_when_nullsExist', () => {
    applyMigration(db);
    db.prepare(
      "INSERT INTO qe_pattern_nulls (id, pattern_id, context_fingerprint, failure_mode) VALUES ('n1', 'p1', 'ctx', 'fm')",
    ).run();
    expect(() => rollbackMigration(db)).toThrow(/REFUSING rollback/);
  });

  it('should_rollbackCleanly_when_tableEmpty', () => {
    applyMigration(db);
    rollbackMigration(db);
    expect(isMigrationApplied(db)).toBe(false);
  });

  it('should_exposeDefaultExportContract_when_imported', () => {
    expect(migration.version).toBe('20260611_add_pattern_nulls_table');
  });
});
