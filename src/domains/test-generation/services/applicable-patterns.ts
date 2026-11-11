/**
 * Agentic QE v3 - Which stored patterns a test generation applies
 *
 * Every pattern a generator receives (requested ids, PreTestGeneration hook
 * ids, QESONA-adapted ids, pattern-matcher ids and the file-extension lookup)
 * is resolved here against qe_patterns. The result becomes the template's
 * "Applied patterns" header, `patternsUsed`, and the ids whose usage is
 * recorded after a real test is produced.
 *
 * #1388: a pattern LEARNED from generation runs is applied only once it has a
 * measured successful usage. Before #1387, scaffold-only runs stored such
 * patterns with success_rate 1.0 from unmeasured "task completed" rows, and
 * they kept being applied (and reinforced) to any later generation. Learned
 * means `context_json.experienceOrigin` (written since v3.14.7) or the
 * "Pattern extracted from" description every experience-derived pattern
 * carries; curated seeds have neither. Nothing is written: the rows stay as
 * they are, and a pattern becomes applicable again as soon as a measured
 * success is recorded for it.
 */

import type { Database } from 'better-sqlite3';
import type { Pattern } from '../interfaces';
import { MEASURED_USAGE_SQL } from '../../../learning/usage-outcome.js';

interface PatternRow {
  id: string;
  name: string;
  pattern_type: string;
  usage_count: number;
  quality_score: number;
}

const COLUMNS = 'p.id, p.name, p.pattern_type, p.usage_count, p.quality_score';

/** SQL over `qe_patterns p`: the pattern was learned from tool runs, not curated. */
export const LEARNED_PATTERN_SQL =
  `((json_valid(p.context_json) AND json_extract(p.context_json, '$.experienceOrigin') IS NOT NULL)
    OR p.description LIKE 'Pattern extracted from%')`;

/** SQL over `qe_patterns p`: at least one measured successful usage exists. */
export const MEASURED_SUCCESS_SQL =
  `EXISTS (SELECT 1 FROM qe_pattern_usage u
           WHERE u.pattern_id = p.id AND u.success = 1 AND ${MEASURED_USAGE_SQL} = 1)`;

/** SQL over `qe_patterns p`: the pattern may be applied to a generation. */
export const APPLICABLE_PATTERN_SQL = `(NOT ${LEARNED_PATTERN_SQL} OR ${MEASURED_SUCCESS_SQL})`;

function toPattern(row: PatternRow): Pattern {
  return {
    id: row.id,
    name: row.name,
    structure: row.pattern_type,
    examples: row.usage_count,
    applicability: row.quality_score,
  };
}

/**
 * Resolve the patterns to apply for one source file. Read-only.
 */
export function queryApplicablePatterns(
  db: Database,
  sourceFile: string,
  requestedPatterns: readonly string[]
): Pattern[] {
  const patterns: Pattern[] = [];
  const byIdOrName = db.prepare(
    `SELECT ${COLUMNS} FROM qe_patterns p
     WHERE (p.id = ? OR p.name = ?) AND ${APPLICABLE_PATTERN_SQL} LIMIT 1`
  );
  for (const requested of requestedPatterns) {
    const row = byIdOrName.get(requested, requested) as PatternRow | undefined;
    if (row && !patterns.some((p) => p.id === row.id)) patterns.push(toPattern(row));
  }

  const extension = sourceFile.split('.').pop() || '';
  const domainRows = db.prepare(
    `SELECT ${COLUMNS} FROM qe_patterns p
     WHERE p.qe_domain = 'test-generation' AND p.context_json LIKE ?
       AND ${APPLICABLE_PATTERN_SQL}
     ORDER BY p.quality_score DESC
     LIMIT 5`
  ).all(`%${extension}%`) as PatternRow[];
  for (const row of domainRows) {
    if (!patterns.some((p) => p.id === row.id)) patterns.push(toPattern(row));
  }
  return patterns;
}
