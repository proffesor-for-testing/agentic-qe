/**
 * Witness Chain Backfill - Retroactive Genesis Entries
 * ADR-070: Witness Chain Audit Compliance (Phase 6.5)
 *
 * Creates PATTERN_CREATE witness entries for patterns that exist in
 * qe_patterns but have no corresponding witness chain entry.
 *
 * Uses a temp table + LEFT JOIN approach (not LIKE scan) for efficiency.
 * Idempotent: running twice creates zero new entries.
 */

import { type Database as DatabaseType } from 'better-sqlite3';
import { type WitnessChain } from './witness-chain.js';

/**
 * Result of a backfill operation
 */
export interface BackfillResult {
  /** Number of genesis entries created */
  created: number;
  /** Number of patterns already covered by existing entries */
  skipped: number;
}

/**
 * Backfill the witness chain with PATTERN_CREATE entries for patterns
 * that have no corresponding witness entry.
 *
 * Uses a temporary table to collect pattern IDs that already have
 * PATTERN_CREATE entries, then inserts genesis entries for the rest.
 *
 * @param db - The SQLite database containing both qe_patterns and witness_chain
 * @param witnessChain - An initialized WitnessChain instance for appending
 * @returns Counts of created and skipped entries
 */
export function backfillWitnessChain(
  db: DatabaseType,
  witnessChain: WitnessChain
): BackfillResult {
  // Verify qe_patterns table exists
  const hasPatterns = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='qe_patterns'"
    )
    .get();

  if (!hasPatterns) {
    return { created: 0, skipped: 0 };
  }

  // Create a temp table of pattern IDs that already have witness entries
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS _covered_patterns (
      pattern_id TEXT PRIMARY KEY
    )
  `);

  db.exec(`DELETE FROM _covered_patterns`);

  db.exec(`
    INSERT INTO _covered_patterns (pattern_id)
    SELECT DISTINCT json_extract(action_data, '$.patternId')
    FROM witness_chain
    WHERE action_type = 'PATTERN_CREATE'
      AND json_extract(action_data, '$.patternId') IS NOT NULL
  `);

  // Also check the alternative key name
  db.exec(`
    INSERT OR IGNORE INTO _covered_patterns (pattern_id)
    SELECT DISTINCT json_extract(action_data, '$.pattern_id')
    FROM witness_chain
    WHERE action_type = 'PATTERN_CREATE'
      AND json_extract(action_data, '$.pattern_id') IS NOT NULL
  `);

  // Find uncovered patterns using LEFT JOIN
  const uncovered = db
    .prepare(
      `SELECT p.id, p.pattern_type, p.qe_domain, p.name, p.created_at
       FROM qe_patterns p
       LEFT JOIN _covered_patterns c ON p.id = c.pattern_id
       WHERE c.pattern_id IS NULL
       ORDER BY p.created_at ASC`
    )
    .all() as Array<{
    id: string;
    pattern_type: string;
    qe_domain: string;
    name: string;
    created_at: string;
  }>;

  // Count how many were already covered
  const totalPatterns = (
    db.prepare('SELECT COUNT(*) as count FROM qe_patterns').get() as { count: number }
  ).count;
  const skipped = totalPatterns - uncovered.length;

  // Append genesis entries for uncovered patterns
  let created = 0;
  for (const pattern of uncovered) {
    witnessChain.append(
      'PATTERN_CREATE',
      {
        patternId: pattern.id,
        patternType: pattern.pattern_type,
        qeDomain: pattern.qe_domain,
        name: pattern.name,
        originalCreatedAt: pattern.created_at,
        backfilled: true,
      },
      'system:backfill'
    );
    created++;
  }

  // Clean up temp table
  db.exec('DROP TABLE IF EXISTS _covered_patterns');

  return { created, skipped };
}
