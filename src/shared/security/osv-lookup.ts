/**
 * Agentic QE v3 - OSV lookup outcome types and response validation (#1049)
 *
 * A failed or partial advisory lookup is never "no vulnerabilities". Every
 * package the lookup could not check is listed with the reason, and the
 * overall status says whether the result can be read as a measurement.
 */

import type { ParsedVulnerability } from './osv-types';

/** A package handed to an OSV lookup. */
export interface OSVPackageQuery {
  name: string;
  ecosystem: string;
  version?: string;
}

/** A package whose advisories could not be checked, and why. */
export interface OSVUncheckedPackage {
  name: string;
  ecosystem: string;
  version?: string;
  reason: string;
}

/**
 * Outcome of an OSV batch lookup.
 * - complete: every package was checked; `results` is a measurement.
 * - incomplete: some packages were checked (their findings are real), others not.
 * - failed: no package could be checked.
 */
export interface OSVBatchLookup {
  status: 'complete' | 'incomplete' | 'failed';
  /** Keyed `${ecosystem}:${name}`; only packages that were actually checked. */
  results: Map<string, ParsedVulnerability[]>;
  packagesRequested: number;
  packagesChecked: number;
  unchecked: OSVUncheckedPackage[];
  /** Bounded, request-level error descriptions (no response bodies). */
  errors: string[];
}

/** Thrown by the legacy list-returning methods when a lookup did not complete. */
export class OSVLookupError extends Error {
  readonly lookup?: OSVBatchLookup;

  constructor(message: string, lookup?: OSVBatchLookup) {
    super(message);
    this.name = 'OSVLookupError';
    this.lookup = lookup;
  }

  static fromLookup(lookup: OSVBatchLookup): OSVLookupError {
    const reasons = [...new Set(lookup.unchecked.map((p) => p.reason))].slice(0, 3).join('; ');
    return new OSVLookupError(
      `OSV advisories could not be checked for ${lookup.unchecked.length} of ${lookup.packagesRequested} package(s): ${reasons}`,
      lookup,
    );
  }
}

/**
 * Result key for one queried package: `${ecosystem}:${name}@${version}`.
 * Keyed by version so two versions of one package never overwrite each other.
 */
export const lookupKey = (pkg: { ecosystem: string; name: string; version?: string }): string =>
  `${pkg.ecosystem}:${pkg.name}@${pkg.version ?? ''}`;

/** At most `max` ids, then "and N more" — keeps reasons bounded. */
export function boundedList(items: readonly string[], max = 5): string {
  return items.length <= max ? items.join(', ') : `${items.slice(0, max).join(', ')} and ${items.length - max} more`;
}

/**
 * The exact npm version a spec pins ("4.17.15", "=4.17.15", "v4.17.15"), or
 * null for anything else: ranges (^ ~ < > <= >= || hyphen), wildcards, tags,
 * and non-registry specs. A range is never reduced to a guessed version (#1049).
 */
export function exactNpmVersion(spec: string): string | null {
  const m = /^=?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(spec.trim());
  return m ? m[1] : null;
}

/** A dependency spec that does not come from the npm registry (OSV cannot match it). */
export function isNonRegistrySpec(spec: string): boolean {
  const s = spec.trim();
  return /^(workspace:|file:|link:|portal:|patch:|exec:|npm:|git\+|git:|github:|gitlab:|bitbucket:|https?:|\.{0,2}\/|~\/)/.test(s)
    || /^[^\s@/:]+\/[^\s@/:]+(#.*)?$/.test(s); // GitHub "user/repo" shorthand
}

/**
 * True for a concrete version OSV can match ("4.17.15", "1.0rc1", "2.0.0-beta.1").
 * Ranges, tags, wildcards, URLs and aliases are not: querying OSV without a
 * concrete version returns every advisory the package ever had.
 */
export function isConcreteVersion(version: string): boolean {
  if (!/^\d+(\.\d+)*([-+._]?[0-9A-Za-z][0-9A-Za-z.+-]*)?$/.test(version)) return false;
  return !/(^|\.)[xX*](\.|$)/.test(version);
}

/** One querybatch entry: the advisory ids reported for a package, or why it is unusable. */
export type BatchEntry = { ids: string[] } | { reason: string };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Validate a querybatch body against the queries sent. `null` means the body as
 * a whole is unusable (every package in the chunk is unchecked).
 */
export function parseBatchBody(body: unknown, expected: number): BatchEntry[] | null {
  if (!isObject(body) || !Array.isArray(body.results) || body.results.length !== expected) return null;
  return body.results.map((entry): BatchEntry => {
    if (!isObject(entry)) return { reason: 'malformed OSV result entry' };
    if (typeof entry.next_page_token === 'string' && entry.next_page_token) {
      return { reason: 'OSV advisory list was truncated (paginated) and not fully retrieved' };
    }
    if (entry.vulns === undefined) return { ids: [] };
    if (!Array.isArray(entry.vulns)) return { reason: 'malformed OSV result entry' };
    const ids: string[] = [];
    for (const v of entry.vulns) {
      if (!isObject(v) || typeof v.id !== 'string' || !v.id) return { reason: 'malformed OSV advisory reference' };
      ids.push(v.id);
    }
    return { ids };
  });
}

/** A full OSV advisory record has a string id and an `affected` array. */
export function isAdvisoryRecord(body: unknown): body is { id: string; affected: unknown[] } {
  return isObject(body) && typeof body.id === 'string' && Array.isArray(body.affected);
}

// ============================================================================
// Advisory/version matching
// ============================================================================

type SemverParts = { nums: [number, number, number]; pre: string[] };

function parseSemver(version: string): SemverParts | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version.trim());
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] };
}

function compareSemver(a: SemverParts, b: SemverParts): number {
  for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return a.nums[i] < b.nums[i] ? -1 : 1;
  if (a.pre.length === 0 || b.pre.length === 0) return a.pre.length === b.pre.length ? 0 : a.pre.length === 0 ? 1 : -1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) return Number(x) < Number(y) ? -1 : 1;
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

type RangeEvent = { introduced?: string; fixed?: string; last_affected?: string; limit?: string };

/** OSV SEMVER range evaluation; null when an event version cannot be parsed. */
function semverRangeAffects(version: SemverParts, events: RangeEvent[]): boolean | null {
  // `at: null` is `introduced: "0"`: before every version, prereleases included.
  const keyed: Array<{ at: SemverParts | null; kind: 'introduced' | 'fixed' | 'last_affected' }> = [];
  for (const e of events) {
    const kind = e.introduced !== undefined ? 'introduced' : e.fixed !== undefined ? 'fixed' : e.last_affected !== undefined ? 'last_affected' : null;
    if (!kind) continue; // `limit` does not change membership for a single version
    const raw = (e as Record<string, string>)[kind];
    if (kind === 'introduced' && raw === '0') {
      keyed.push({ at: null, kind });
      continue;
    }
    const at = parseSemver(raw);
    if (!at) return null;
    keyed.push({ at, kind });
  }
  // Sort by version; on a tie a fixed/last_affected closes the earlier window
  // before an introduced at the same version opens the next one.
  const tieRank = (kind: string) => (kind === 'introduced' ? 1 : 0);
  keyed.sort((a, b) => {
    if (!a.at || !b.at) return a.at === b.at ? 0 : a.at ? 1 : -1;
    return compareSemver(a.at, b.at) || tieRank(a.kind) - tieRank(b.kind);
  });
  let affected = false;
  for (const { at, kind } of keyed) {
    if (!at) {
      affected = true;
      continue;
    }
    const cmp = compareSemver(version, at);
    if (kind === 'introduced' && cmp >= 0) affected = true;
    else if (kind === 'fixed' && cmp >= 0) affected = false;
    else if (kind === 'last_affected' && cmp > 0) affected = false;
  }
  return affected;
}

/**
 * Whether an advisory affects `pkg@version` according to its own `affected`
 * entries. Used to confirm querybatch matches: OSV's batch endpoint can return
 * advisories whose ranges for the package exclude the version. An advisory is
 * dropped only when every matching entry is positively evaluated as not
 * affected; anything that cannot be evaluated (no matching entry, ECOSYSTEM/GIT
 * ranges, unparseable versions) is kept.
 */
export function advisoryAffectsVersion(advisory: unknown, pkg: { name: string; ecosystem: string; version: string }): boolean {
  const affected = (advisory as { affected?: unknown }).affected;
  if (!Array.isArray(affected)) return true;
  const entries = affected.filter((a): a is Record<string, unknown> => isObject(a) && isObject(a.package)
    && (a.package as Record<string, unknown>).name === pkg.name && (a.package as Record<string, unknown>).ecosystem === pkg.ecosystem);
  if (entries.length === 0) return true;
  const version = parseSemver(pkg.version);
  for (const entry of entries) {
    if (Array.isArray(entry.versions) && entry.versions.includes(pkg.version)) return true;
    const ranges = Array.isArray(entry.ranges) ? entry.ranges.filter(isObject) : [];
    if (ranges.length === 0 && !Array.isArray(entry.versions)) return true;
    for (const range of ranges) {
      if (range.type !== 'SEMVER' || !version || !Array.isArray(range.events)) return true;
      const verdict = semverRangeAffects(version, range.events as RangeEvent[]);
      if (verdict !== false) return true;
    }
  }
  return false;
}

/** Lookup status from the counts. */
export function lookupStatus(requested: number, checked: number): OSVBatchLookup['status'] {
  if (checked === requested) return 'complete';
  return checked === 0 ? 'failed' : 'incomplete';
}
