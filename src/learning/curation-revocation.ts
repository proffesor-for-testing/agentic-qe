/**
 * Agentic QE v3 - Measured failures revoke a pattern (#1426)
 *
 * A pattern is applied by test generation when it is a built-in seed, curated
 * by a person, or has a measured success (#1388). Measured evidence outranks
 * all three: once a pattern's measured test runs fail more often than they
 * pass, over at least MIN_RUNS_TO_REVOKE runs, it is no longer applied, and an
 * export no longer marks it as curated. Nothing is rewritten: it is applied
 * again once passing runs catch up.
 *
 * Measured outcomes are recorded for test runs (execute-tests), on the
 * patterns the run used, which are mostly the test-execution copies that
 * cross-domain seeding made (`<name> (from <domain>)`, new id, context and
 * curation copied). So the evidence is counted per family: a pattern together
 * with its copies, whatever domain they sit in. A run that wrote a row for
 * several members counts once, and a run with any failed row is a failed run.
 */

import { MEASURED_USAGE_SQL, USAGE_RUN_SQL } from './usage-outcome.js';

/** A single red run (a TDD red phase, a test that caught a bug) revokes nothing. */
export const MIN_RUNS_TO_REVOKE = 3;

/** Minimal statement interface shared by better-sqlite3 handles. */
interface QueryableDb {
  prepare(sql: string): { all(...params: unknown[]): unknown[] };
}

export interface PatternIdentity {
  id: string;
  name: string;
  qe_domain: string;
}

const COPY_NAME = /^(.*) \(from ([a-z][a-z0-9-]*)\)$/;
const CHUNK = 400;

/** The family a pattern belongs to: its source's domain and name. */
export function patternFamily(name: string, qeDomain: string): string {
  const copy = COPY_NAME.exec(name);
  return copy ? `${copy[2]}\u0000${copy[1]}` : `${qeDomain}\u0000${name}`;
}

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/** Families (of the given members) whose measured runs mostly fail. */
function revokedFamilies(db: QueryableDb, members: readonly PatternIdentity[]): Set<string> {
  const familyOf = new Map(members.map((m) => [m.id, patternFamily(m.name, m.qe_domain)]));
  const runs = new Map<string, Map<string, number>>();
  for (const ids of chunks([...familyOf.keys()])) {
    const rows = db.prepare(
      `SELECT pattern_id, ${USAGE_RUN_SQL} AS run, MIN(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS ok
       FROM qe_pattern_usage
       WHERE pattern_id IN (${ids.map(() => '?').join(', ')}) AND ${MEASURED_USAGE_SQL} = 1
       GROUP BY pattern_id, run`
    ).all(...ids) as Array<{ pattern_id: string; run: string; ok: number }>;
    for (const row of rows) {
      const family = familyOf.get(row.pattern_id);
      if (family === undefined) continue;
      const verdicts = runs.get(family) ?? new Map<string, number>();
      verdicts.set(row.run, Math.min(verdicts.get(row.run) ?? 1, row.ok));
      runs.set(family, verdicts);
    }
  }
  const revoked = new Set<string>();
  for (const [family, verdicts] of runs) {
    const passed = [...verdicts.values()].filter((ok) => ok === 1).length;
    const failed = verdicts.size - passed;
    if (verdicts.size >= MIN_RUNS_TO_REVOKE && failed > passed) revoked.add(family);
  }
  return revoked;
}

/**
 * Ids among `candidates` whose family is revoked. One lookup of the families'
 * members and one of their measured usage, for a whole test generation.
 */
export function revokedAmong(db: QueryableDb, candidates: readonly PatternIdentity[]): Set<string> {
  if (candidates.length === 0) return new Set();
  const families = new Set(candidates.map((c) => patternFamily(c.name, c.qe_domain)));
  const names = new Set<string>();
  for (const family of families) {
    const [domain, name] = family.split('\u0000');
    names.add(name);
    names.add(`${name} (from ${domain})`);
  }
  const members: PatternIdentity[] = [];
  for (const batch of chunks([...names])) {
    members.push(...(db.prepare(
      `SELECT id, name, qe_domain FROM qe_patterns WHERE name IN (${batch.map(() => '?').join(', ')})`
    ).all(...batch) as PatternIdentity[]));
  }
  const inFamilies = members.filter((m) => families.has(patternFamily(m.name, m.qe_domain)));
  const revoked = revokedFamilies(db, inFamilies);
  return new Set(candidates.filter((c) => revoked.has(patternFamily(c.name, c.qe_domain))).map((c) => c.id));
}

/** Ids of every pattern whose family is revoked (for export and stats). Read-only. */
export function selectRevokedIds(db: QueryableDb): Set<string> {
  const measured = db.prepare(
    `SELECT DISTINCT p.id, p.name, p.qe_domain FROM qe_patterns p
     JOIN qe_pattern_usage u ON u.pattern_id = p.id WHERE ${MEASURED_USAGE_SQL} = 1`
  ).all() as PatternIdentity[];
  if (measured.length === 0) return new Set();
  const all = db.prepare('SELECT id, name, qe_domain FROM qe_patterns').all() as PatternIdentity[];
  const families = new Set(measured.map((m) => patternFamily(m.name, m.qe_domain)));
  const revoked = revokedFamilies(db, all.filter((m) => families.has(patternFamily(m.name, m.qe_domain))));
  return new Set(all.filter((m) => revoked.has(patternFamily(m.name, m.qe_domain))).map((m) => m.id));
}
