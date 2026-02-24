/**
 * Agentic QE v3 - Hypergraph Schema Migration
 *
 * Creates SQLite tables for persistent code knowledge graph storage.
 * Part of the RuVector Neural Backbone integration (GOAP Action 5).
 *
 * Tables:
 * - hypergraph_nodes: Code entities (functions, modules, tests, files, classes)
 * - hypergraph_edges: Relationships between entities
 *
 * @see /docs/plans/GOAP-V3-RUVECTOR-NEURAL-BACKBONE.md
 */

import type { Database as DatabaseType } from 'better-sqlite3';

/**
 * Migration version identifier
 */
export const MIGRATION_VERSION = '20260120_add_hypergraph_tables';

/**
 * SQL schema for hypergraph nodes
 */
export const HYPERGRAPH_NODES_SCHEMA = `
  -- Hypergraph nodes (functions, modules, tests, files, classes)
  CREATE TABLE IF NOT EXISTS hypergraph_nodes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,  -- 'function', 'module', 'test', 'file', 'class'
    name TEXT NOT NULL,
    file_path TEXT,
    line_start INTEGER,
    line_end INTEGER,
    complexity REAL,
    coverage REAL,
    metadata TEXT,  -- JSON
    embedding BLOB,  -- Vector embedding
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`;

/**
 * SQL schema for hypergraph edges
 */
export const HYPERGRAPH_EDGES_SCHEMA = `
  -- Hypergraph edges (relationships)
  CREATE TABLE IF NOT EXISTS hypergraph_edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES hypergraph_nodes(id),
    target_id TEXT NOT NULL REFERENCES hypergraph_nodes(id),
    type TEXT NOT NULL,  -- 'calls', 'imports', 'tests', 'depends_on', 'covers'
    weight REAL DEFAULT 1.0,
    properties TEXT,  -- JSON
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(source_id, target_id, type)
  );
`;

/**
 * SQL indexes for hypergraph tables
 */
export const HYPERGRAPH_INDEXES_SCHEMA = `
  -- Indexes for fast traversal
  CREATE INDEX IF NOT EXISTS idx_hg_nodes_type ON hypergraph_nodes(type);
  CREATE INDEX IF NOT EXISTS idx_hg_nodes_file ON hypergraph_nodes(file_path);
  CREATE INDEX IF NOT EXISTS idx_hg_nodes_name ON hypergraph_nodes(name);
  CREATE INDEX IF NOT EXISTS idx_hg_edges_source ON hypergraph_edges(source_id);
  CREATE INDEX IF NOT EXISTS idx_hg_edges_target ON hypergraph_edges(target_id);
  CREATE INDEX IF NOT EXISTS idx_hg_edges_type ON hypergraph_edges(type);
`;

/**
 * Complete hypergraph schema (all statements combined)
 */
export const HYPERGRAPH_SCHEMA = `
${HYPERGRAPH_NODES_SCHEMA}
${HYPERGRAPH_EDGES_SCHEMA}
${HYPERGRAPH_INDEXES_SCHEMA}
`;

/**
 * Apply the hypergraph migration to a database
 *
 * @param db - better-sqlite3 database instance
 * @throws Error if migration fails
 */
export function applyMigration(db: DatabaseType): void {
  // Execute each schema statement separately to handle IF NOT EXISTS properly
  db.exec(HYPERGRAPH_NODES_SCHEMA);
  db.exec(HYPERGRAPH_EDGES_SCHEMA);
  db.exec(HYPERGRAPH_INDEXES_SCHEMA);
}

/**
 * Check if migration has been applied
 *
 * @param db - better-sqlite3 database instance
 * @returns true if hypergraph tables exist
 */
export function isMigrationApplied(db: DatabaseType): boolean {
  try {
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM sqlite_master
      WHERE type='table' AND name IN ('hypergraph_nodes', 'hypergraph_edges')
    `).get() as { count: number };
    return result.count === 2;
  } catch {
    return false;
  }
}

/**
 * Rollback the hypergraph migration (for testing)
 *
 * @param db - better-sqlite3 database instance
 */
export function rollbackMigration(db: DatabaseType): void {
  // Safety check: refuse to drop tables that contain data
  const nodeCount = (db.prepare('SELECT COUNT(*) as cnt FROM hypergraph_nodes').get() as { cnt: number } | undefined)?.cnt ?? 0;
  const edgeCount = (db.prepare('SELECT COUNT(*) as cnt FROM hypergraph_edges').get() as { cnt: number } | undefined)?.cnt ?? 0;
  if (nodeCount > 0 || edgeCount > 0) {
    throw new Error(
      `REFUSING rollback: hypergraph tables contain data (${nodeCount} nodes, ${edgeCount} edges). ` +
      'Backup and manually drop if you really need to rollback.'
    );
  }
  db.exec(`
    DROP TABLE IF EXISTS hypergraph_edges;
    DROP TABLE IF EXISTS hypergraph_nodes;
  `);
}

export default {
  version: MIGRATION_VERSION,
  apply: applyMigration,
  isApplied: isMigrationApplied,
  rollback: rollbackMigration,
};
