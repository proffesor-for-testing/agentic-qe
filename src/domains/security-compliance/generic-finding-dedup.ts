/**
 * #1170: drop a generic-pattern finding that language-specific SAST already
 * reported for the same line.
 *
 * The scan-security task runs text patterns over every file and SAST over
 * JS/TS files, so one `eval()` was counted twice: once by SAST (critical,
 * CWE-95) and once by the generic eval/exec pattern (high). Two findings are
 * the same issue when they sit on the same line of the same real file and
 * SAST's category covers the generic one.
 */

import { realpath } from 'node:fs/promises';
import * as path from 'node:path';

interface LocatedFinding {
  category: string;
  location: { file: string; line?: number };
}

/**
 * SAST categories that report what a generic-pattern category flags. SAST
 * files eval() and the Function constructor (CWE-95, code injection) under
 * `xss`, so `xss` also covers generic `injection`.
 */
const COVERING_SAST_CATEGORIES: Readonly<Record<string, readonly string[]>> = {
  injection: ['injection', 'xss'],
  'sensitive-data': ['sensitive-data'],
  'security-misconfiguration': ['security-misconfiguration'],
};

async function realPathOf(file: string, cache: Map<string, string>): Promise<string> {
  const resolved = path.resolve(file);
  let real = cache.get(resolved);
  if (real === undefined) {
    real = await realpath(resolved).catch(() => resolved);
    cache.set(resolved, real);
  }
  return real;
}

/** Generic findings without the ones a SAST finding already covers. */
export async function dropGenericFindingsCoveredBySast<T extends LocatedFinding>(
  generic: readonly T[],
  sast: readonly LocatedFinding[],
): Promise<T[]> {
  if (generic.length === 0 || sast.length === 0) return [...generic];
  const cache = new Map<string, string>();
  const covered = new Set<string>();
  for (const finding of sast) {
    const file = await realPathOf(finding.location.file, cache);
    covered.add(`${file}:${finding.location.line ?? 0}:${finding.category}`);
  }
  const kept: T[] = [];
  for (const finding of generic) {
    const file = await realPathOf(finding.location.file, cache);
    const line = finding.location.line ?? 0;
    const categories = COVERING_SAST_CATEGORIES[finding.category] ?? [finding.category];
    if (!categories.some(category => covered.has(`${file}:${line}:${category}`))) kept.push(finding);
  }
  return kept;
}
