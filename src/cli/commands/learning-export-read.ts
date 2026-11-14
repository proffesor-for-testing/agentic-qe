/**
 * #1422: patterns for `aqe learning export`, `export-full` and the
 * `import-merge` duplicate check, read from memory.db without writing to it.
 *
 * These commands used to start the learning system, which on a database it
 * had not seen yet loads pre-trained patterns and runs cross-domain seeding:
 * an export of a fresh project wrote 70 patterns. A read-only connection
 * returns the same set the empty-query search did (every pattern, up to the
 * limit, optionally of one domain).
 */
import { existsSync } from 'node:fs';
import { openDatabase } from '../../shared/safe-db.js';
import { patternFromRow, type PatternRow } from '../../learning/sqlite-persistence.js';
import { QE_DOMAIN_LIST, type QEDomain, type QEPattern } from '../../learning/qe-patterns.js';

export const EXPORT_PATTERN_LIMIT = 10000;

export function readPatternsReadOnly(dbPath: string, domain?: string, limit = EXPORT_PATTERN_LIMIT): QEPattern[] {
  if (!existsSync(dbPath)) return [];
  const db = openDatabase(dbPath, { readonly: true, fileMustExist: true });
  try {
    const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'qe_patterns'").get();
    if (!table) return [];
    const rows = (domain
      ? db.prepare('SELECT * FROM qe_patterns WHERE qe_domain = ? ORDER BY quality_score DESC LIMIT ?').all(domain, limit)
      : db.prepare('SELECT * FROM qe_patterns ORDER BY quality_score DESC LIMIT ?').all(limit)) as PatternRow[];
    return rows.map(patternFromRow);
  } finally {
    db.close();
  }
}

/**
 * #1421: the exported domain, when it is one. Import passes it to
 * storePattern; without it the domain was re-derived from the pattern type,
 * so a round trip stored the pattern again in another domain.
 */
export function importedDomain(value: unknown): QEDomain | undefined {
  return typeof value === 'string' && (QE_DOMAIN_LIST as string[]).includes(value) ? value as QEDomain : undefined;
}
