import type { Database as DatabaseType } from 'better-sqlite3';

export const MIGRATION_VERSION = '20260830_add_learning_evidence_tables';

export const LEARNING_EVIDENCE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS learning_evidence_manifests (
    id TEXT PRIMARY KEY,
    trajectory_id TEXT,
    trajectory_hash TEXT,
    manifest_hash TEXT NOT NULL UNIQUE,
    task_family TEXT NOT NULL,
    task_identity TEXT,
    run_identity TEXT,
    correlation_group TEXT,
    dedupe_fingerprint TEXT,
    revision TEXT,
    environment TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('verified-success','verified-failure','unknown')),
    oracle_refs_json TEXT NOT NULL DEFAULT '[]',
    source_kind TEXT NOT NULL CHECK (source_kind IN ('executed','static','human-reviewed','inferred')),
    process_signals_json TEXT NOT NULL DEFAULT '{}',
    manifest_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS learning_evidence_segments (
    id TEXT NOT NULL,
    manifest_id TEXT NOT NULL REFERENCES learning_evidence_manifests(id) ON DELETE RESTRICT,
    segment_order INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('observe','decide','act','verify','recover','other')),
    contribution TEXT NOT NULL CHECK (contribution IN ('causal','supporting','irrelevant','harmful','unknown')),
    evidence_refs_json TEXT NOT NULL DEFAULT '[]',
    admit_for_learning INTEGER NOT NULL CHECK (admit_for_learning IN (0,1)),
    reasons_json TEXT NOT NULL DEFAULT '[]',
    content_hash TEXT,
    PRIMARY KEY (manifest_id, id),
    UNIQUE (manifest_id, segment_order)
  );

  CREATE TABLE IF NOT EXISTS learning_segment_edges (
    manifest_id TEXT NOT NULL,
    parent_segment_id TEXT NOT NULL,
    child_segment_id TEXT NOT NULL,
    edge_kind TEXT NOT NULL DEFAULT 'depends-on',
    PRIMARY KEY (manifest_id, parent_segment_id, child_segment_id, edge_kind),
    FOREIGN KEY (manifest_id, parent_segment_id)
      REFERENCES learning_evidence_segments(manifest_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (manifest_id, child_segment_id)
      REFERENCES learning_evidence_segments(manifest_id, id) ON DELETE RESTRICT,
    CHECK (parent_segment_id <> child_segment_id)
  );

  CREATE TABLE IF NOT EXISTS learning_evidence_admissions (
    id TEXT PRIMARY KEY,
    manifest_id TEXT NOT NULL REFERENCES learning_evidence_manifests(id) ON DELETE RESTRICT,
    decision_seq INTEGER NOT NULL CHECK (decision_seq > 0),
    disposition TEXT NOT NULL CHECK (disposition IN ('admitted','rejected','review-required','legacy-unknown')),
    reason_codes_json TEXT NOT NULL DEFAULT '[]',
    assessor_kind TEXT NOT NULL CHECK (assessor_kind IN ('executed','static','human-reviewed','inferred')),
    evidence_class TEXT NOT NULL CHECK (evidence_class IN ('EXECUTED','STATIC','INFERRED','CONJECTURE')),
    policy_version TEXT,
    policy_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (manifest_id, decision_seq)
  );

  CREATE TABLE IF NOT EXISTS pattern_manifest_lineage (
    pattern_id TEXT NOT NULL REFERENCES qe_patterns(id) ON DELETE RESTRICT,
    manifest_id TEXT NOT NULL REFERENCES learning_evidence_manifests(id) ON DELETE RESTRICT,
    pattern_version_id TEXT,
    use_kind TEXT NOT NULL CHECK (use_kind IN ('candidate-source','promotion-support','rejection','rollback','legacy-context')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (pattern_id, manifest_id, use_kind)
  );

  CREATE TABLE IF NOT EXISTS pattern_segment_lineage (
    pattern_id TEXT NOT NULL REFERENCES qe_patterns(id) ON DELETE RESTRICT,
    manifest_id TEXT NOT NULL,
    segment_id TEXT NOT NULL,
    pattern_version_id TEXT,
    use_kind TEXT NOT NULL CHECK (use_kind IN ('candidate-source','promotion-support','rejection','rollback')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (pattern_id, manifest_id, segment_id, use_kind),
    FOREIGN KEY (manifest_id, segment_id)
      REFERENCES learning_evidence_segments(manifest_id, id) ON DELETE RESTRICT
  );

  CREATE INDEX IF NOT EXISTS idx_learning_manifest_trajectory ON learning_evidence_manifests(trajectory_id);
  CREATE INDEX IF NOT EXISTS idx_learning_manifest_task ON learning_evidence_manifests(task_family);
  CREATE INDEX IF NOT EXISTS idx_learning_manifest_dedupe ON learning_evidence_manifests(dedupe_fingerprint);
  CREATE INDEX IF NOT EXISTS idx_learning_manifest_correlation ON learning_evidence_manifests(correlation_group);
  CREATE INDEX IF NOT EXISTS idx_learning_manifest_outcome ON learning_evidence_manifests(outcome, source_kind);
  CREATE INDEX IF NOT EXISTS idx_learning_admission_manifest ON learning_evidence_admissions(manifest_id, decision_seq DESC);
  CREATE INDEX IF NOT EXISTS idx_pattern_manifest_lineage_manifest ON pattern_manifest_lineage(manifest_id);
  CREATE INDEX IF NOT EXISTS idx_pattern_segment_lineage_manifest ON pattern_segment_lineage(manifest_id, segment_id);

  CREATE TRIGGER IF NOT EXISTS learning_manifests_no_update BEFORE UPDATE ON learning_evidence_manifests
  BEGIN SELECT RAISE(ABORT, 'learning evidence manifests are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS learning_manifests_no_delete BEFORE DELETE ON learning_evidence_manifests
  BEGIN SELECT RAISE(ABORT, 'learning evidence manifests are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS learning_segments_no_update BEFORE UPDATE ON learning_evidence_segments
  BEGIN SELECT RAISE(ABORT, 'learning evidence segments are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS learning_segments_no_delete BEFORE DELETE ON learning_evidence_segments
  BEGIN SELECT RAISE(ABORT, 'learning evidence segments are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS learning_edges_no_update BEFORE UPDATE ON learning_segment_edges
  BEGIN SELECT RAISE(ABORT, 'learning evidence edges are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS learning_edges_no_delete BEFORE DELETE ON learning_segment_edges
  BEGIN SELECT RAISE(ABORT, 'learning evidence edges are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS learning_admissions_no_update BEFORE UPDATE ON learning_evidence_admissions
  BEGIN SELECT RAISE(ABORT, 'learning evidence admissions are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS learning_admissions_no_delete BEFORE DELETE ON learning_evidence_admissions
  BEGIN SELECT RAISE(ABORT, 'learning evidence admissions are append-only'); END;
`;

export function applyMigration(db: DatabaseType): void {
  db.exec(LEARNING_EVIDENCE_SCHEMA);
  db.exec(`
    INSERT OR IGNORE INTO learning_evidence_manifests (
      id, trajectory_id, trajectory_hash, manifest_hash, task_family,
      outcome, oracle_refs_json, source_kind, process_signals_json
    )
    SELECT
      'legacy-pattern:' || id, NULL, NULL, 'legacy-pattern:' || id,
      COALESCE(NULLIF(qe_domain, ''), NULLIF(domain, ''), 'unknown'),
      'unknown', '[]', 'inferred', '{"legacy":true,"unassessed":true}'
    FROM qe_patterns;

    INSERT OR IGNORE INTO learning_evidence_admissions (
      id, manifest_id, decision_seq, disposition, reason_codes_json,
      assessor_kind, evidence_class
    )
    SELECT
      'legacy-admission:' || id, 'legacy-pattern:' || id, 1, 'legacy-unknown',
      '["legacy-pattern-without-qualified-trajectory"]', 'inferred', 'INFERRED'
    FROM qe_patterns;

    INSERT OR IGNORE INTO pattern_manifest_lineage (
      pattern_id, manifest_id, use_kind
    )
    SELECT id, 'legacy-pattern:' || id, 'legacy-context' FROM qe_patterns;
  `);
}

export function isMigrationApplied(db: DatabaseType): boolean {
  const required = [
    'learning_evidence_manifests', 'learning_evidence_segments',
    'learning_segment_edges', 'learning_evidence_admissions',
    'pattern_manifest_lineage', 'pattern_segment_lineage',
  ];
  const rows = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${required.map(() => '?').join(',')})
  `).all(...required) as Array<{ name: string }>;
  return rows.length === required.length;
}

export function rollbackMigration(db: DatabaseType): void {
  const tables = [
    'learning_evidence_manifests', 'learning_evidence_segments',
    'learning_segment_edges', 'learning_evidence_admissions',
    'pattern_manifest_lineage', 'pattern_segment_lineage',
  ];
  for (const table of tables) {
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!exists) continue;
    const count = (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
    if (count > 0) throw new Error(`REFUSING rollback: ${table} contains ${count} learning evidence row(s)`);
  }
  db.exec(`
    DROP TABLE IF EXISTS pattern_segment_lineage;
    DROP TABLE IF EXISTS pattern_manifest_lineage;
    DROP TABLE IF EXISTS learning_evidence_admissions;
    DROP TABLE IF EXISTS learning_segment_edges;
    DROP TABLE IF EXISTS learning_evidence_segments;
    DROP TABLE IF EXISTS learning_evidence_manifests;
  `);
}

