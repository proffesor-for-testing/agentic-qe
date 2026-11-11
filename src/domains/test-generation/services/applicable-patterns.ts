/**
 * Agentic QE v3 - Which stored patterns a test generation applies
 *
 * Every pattern a generator receives (requested ids, PreTestGeneration hook
 * ids, QESONA-adapted ids, pattern-matcher ids and the file-extension lookup)
 * is resolved here against qe_patterns. The result becomes the template's
 * "Applied patterns" header, `patternsUsed`, and the ids whose usage is
 * recorded after a real test is produced.
 *
 * #1388: fail-closed. A pattern is applied only when it is a built-in seed (or
 * a seed's cross-domain transfer), a pattern a person imported, or a pattern
 * with a measured successful usage. Automatic writers record only unmeasured
 * "task completed" evidence; before #1387 they stored scaffold-only runs as
 * patterns with success_rate 1.0, which kept being applied and reinforced.
 * Nothing is written: the rows stay as they are, and a pattern becomes
 * applicable as soon as a measured success is recorded for it.
 */

import type { Database } from 'better-sqlite3';
import type { Pattern } from '../interfaces';
import { MEASURED_USAGE_SQL } from '../../../learning/usage-outcome.js';
import { isBuiltinSeedName, isUserCurated } from '../../../learning/curated-patterns.js';
import { getLanguageFromExtension } from '../../../shared/types/test-frameworks.js';
import { safeJsonParse } from '../../../shared/safe-json.js';

interface CandidateRow {
  id: string;
  name: string;
  pattern_type: string;
  usage_count: number;
  quality_score: number;
  context_json: string | null;
  measured_success: number;
}

/** Candidate columns over `qe_patterns p`, with whether a measured success exists. */
const COLUMNS = `p.id, p.name, p.pattern_type, p.usage_count, p.quality_score, p.context_json,
  EXISTS (SELECT 1 FROM qe_pattern_usage u
          WHERE u.pattern_id = p.id AND u.success = 1 AND ${MEASURED_USAGE_SQL} = 1) AS measured_success`;

/** The best five extension matches are applied. */
const EXTENSION_MATCH_LIMIT = 5;

function parseContext(row: CandidateRow): Record<string, unknown> {
  try {
    const parsed = safeJsonParse<unknown>(row.context_json || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** #1388: seed, person-curated, or measured success. Everything else is unproven. */
export function isApplicableToGeneration(row: Pick<CandidateRow, 'name' | 'context_json' | 'measured_success'>): boolean {
  if (row.measured_success === 1) return true;
  if (isBuiltinSeedName(row.name)) return true;
  return isUserCurated(parseContext(row as CandidateRow));
}

function toPattern(row: CandidateRow): Pattern {
  return {
    id: row.id,
    name: row.name,
    structure: row.pattern_type,
    examples: row.usage_count,
    applicability: row.quality_score,
  };
}

/**
 * #1388: patterns relevant to a file extension. A pattern matches through a
 * file reference with exactly that extension (`src/Calc.kt`, not `.kts`) or
 * through its declared `language`. A bare substring (`%ts%`) matched the
 * "generate-tests" text of every learned pattern, applying Kotlin and Python
 * patterns to TypeScript files.
 */
function queryExtensionPatterns(db: Database, sourceFile: string): CandidateRow[] {
  const dot = sourceFile.lastIndexOf('.');
  const extension = dot >= 0 ? sourceFile.slice(dot + 1) : '';
  if (!/^[A-Za-z0-9]+$/.test(extension)) return [];
  const language = getLanguageFromExtension(extension) ?? null;
  const fileReference = new RegExp(`\\.${extension}(?![A-Za-z0-9_])`, 'i');

  const candidates = db.prepare(
    `SELECT ${COLUMNS} FROM qe_patterns p
     WHERE p.qe_domain = 'test-generation'
       AND (p.context_json LIKE ?
            OR (json_valid(p.context_json) AND json_extract(p.context_json, '$.language') = ?))
     ORDER BY p.quality_score DESC`
  ).all(`%.${extension}%`, language) as CandidateRow[];

  return candidates
    .filter((row) => {
      const declared = parseContext(row).language;
      return (language !== null && declared === language) || fileReference.test(row.context_json ?? '');
    })
    .filter(isApplicableToGeneration)
    .slice(0, EXTENSION_MATCH_LIMIT);
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
  const byIdOrName = db.prepare(`SELECT ${COLUMNS} FROM qe_patterns p WHERE p.id = ? OR p.name = ?`);
  for (const requested of requestedPatterns) {
    const rows = byIdOrName.all(requested, requested) as CandidateRow[];
    const row = rows.find(isApplicableToGeneration);
    if (row && !patterns.some((p) => p.id === row.id)) patterns.push(toPattern(row));
  }

  for (const row of queryExtensionPatterns(db, sourceFile)) {
    if (!patterns.some((p) => p.id === row.id)) patterns.push(toPattern(row));
  }
  return patterns;
}
