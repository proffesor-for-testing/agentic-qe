/**
 * #1422: patterns for `aqe learning export`, `export-full` and the import
 * duplicate checks, read from memory.db without writing to it.
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
import type { QEDomain, QEPattern } from '../../learning/qe-patterns.js';

type QEPatternTier = 'short-term' | 'long-term';

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
    // The pattern cache the export used to read kept only these two tiers.
    return rows.map(patternFromRow).map(p => ({ ...p, tier: tierOf(p.tier) }));
  } finally {
    db.close();
  }
}

function tierOf(tier: unknown): QEPatternTier {
  return tier === 'long-term' ? 'long-term' : 'short-term';
}

/**
 * #1421: the exported domain, when it is a domain name. Import passes it to
 * storePattern; without it the domain was re-derived from the pattern type, so
 * a round trip stored the pattern again in another domain. Stored domains are
 * not only the QE domain list (agent and hook paths write e.g. `general`).
 */
export function importedDomain(value: unknown): QEDomain | undefined {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value) ? value as QEDomain : undefined;
}

/** What storePattern needs so an imported pattern updates the row it matches. */
export interface ImportTarget {
  qeDomain?: QEDomain;
  /** A row with the same name, domain and type exists: the import updates it. */
  exists: boolean;
  /** The existing row's tier and confidence, kept on update (the upsert would reset them). */
  tier?: QEPatternTier;
  confidence?: number;
}

/**
 * #1421: the rows an import updates. Keyed like the qe_patterns upsert
 * (name, qe_domain, pattern_type). A file without a domain (older exports)
 * matches the one existing row with that name and type, if there is exactly one.
 */
export class ImportTargets {
  private readonly byKey = new Map<string, QEPattern>();
  private readonly byNameType = new Map<string, QEPattern[]>();

  constructor(existing: QEPattern[]) {
    for (const p of existing) {
      this.byKey.set(key(p.name, p.qeDomain, p.patternType), p);
      const nameType = key(p.name, '', p.patternType);
      this.byNameType.set(nameType, [...(this.byNameType.get(nameType) ?? []), p]);
    }
  }

  resolve(name: unknown, patternType: unknown, exportedDomain: unknown): ImportTarget {
    const domain = importedDomain(exportedDomain);
    const match = domain
      ? this.byKey.get(key(name, domain, patternType))
      : singleOrNone(this.byNameType.get(key(name, '', patternType)));
    if (!match) return { qeDomain: domain, exists: false };
    return { qeDomain: match.qeDomain, exists: true, tier: tierOf(match.tier), confidence: match.confidence };
  }
}

function key(name: unknown, domain: unknown, patternType: unknown): string {
  return JSON.stringify([name, domain, patternType]);
}

function singleOrNone<T>(items: T[] | undefined): T | undefined {
  return items && items.length === 1 ? items[0] : undefined;
}
