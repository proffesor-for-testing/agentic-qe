/**
 * #1170: drop the generic eval/exec finding that language-specific SAST
 * already reported as code injection on the same line.
 *
 * The scan-security task runs text patterns over every file and SAST over
 * JS/TS files, so one `eval()` was counted twice: once by SAST (critical,
 * CWE-95) and once by the generic eval/exec pattern (high). Only that pair is
 * the same finding. Other generic rules (secrets, CORS, debug mode) can flag
 * a different value or a higher severity on a line SAST also matched, so
 * they are always kept.
 */

import { realpath } from 'node:fs/promises';
import * as path from 'node:path';

/** Title of the generic-pattern eval/exec finding in the scan-security handler. */
export const GENERIC_EVAL_EXEC_TITLE = 'Dangerous eval/exec usage';

interface LocatedFinding {
  title: string;
  severity?: string;
  location: { file: string; line?: number };
}

interface SastFinding {
  severity?: string;
  description?: string;
  references?: readonly string[];
  location: { file: string; line?: number };
}

/** CWE-95 (eval injection): SAST's eval() and Function-constructor rules. */
function isEvalInjection(finding: SastFinding): boolean {
  return /\[CWE-95\]/.test(finding.description ?? '') ||
    (finding.references ?? []).some(ref => /\/definitions\/95\.html$/.test(ref));
}

const SEVERITY_RANK: Readonly<Record<string, number>> = {
  informational: 0, low: 1, medium: 2, high: 3, critical: 4,
};
const rank = (severity: string | undefined): number => SEVERITY_RANK[severity ?? ''] ?? -1;

async function realPathOf(file: string, cache: Map<string, string>): Promise<string> {
  const resolved = path.resolve(file);
  let real = cache.get(resolved);
  if (real === undefined) {
    real = await realpath(resolved).catch(() => resolved);
    cache.set(resolved, real);
  }
  return real;
}

/**
 * Generic findings without the eval/exec matches SAST already reported as
 * CWE-95 on the same real file and line, at the same or a higher severity, so
 * dropping one never lowers what the scan reports. `isEvalOnly` says whether a generic
 * eval/exec match is eval alone; a line that also calls exec() is kept,
 * since SAST's eval rule does not report the exec call.
 */
export async function dropGenericEvalCoveredBySast<T extends LocatedFinding>(
  generic: readonly T[],
  sast: readonly SastFinding[],
  isEvalOnly: (finding: T) => boolean,
): Promise<T[]> {
  const evalSast = sast.filter(isEvalInjection);
  if (evalSast.length === 0) return [...generic];
  const cache = new Map<string, string>();
  // Highest SAST CWE-95 severity per real file and line.
  const covered = new Map<string, number>();
  for (const finding of evalSast) {
    const key = `${await realPathOf(finding.location.file, cache)}:${finding.location.line ?? 0}`;
    covered.set(key, Math.max(covered.get(key) ?? -1, rank(finding.severity)));
  }
  const kept: T[] = [];
  for (const finding of generic) {
    const key = `${await realPathOf(finding.location.file, cache)}:${finding.location.line ?? 0}`;
    const sastRank = covered.get(key);
    const duplicate = finding.title === GENERIC_EVAL_EXEC_TITLE && isEvalOnly(finding) &&
      sastRank !== undefined && sastRank >= rank(finding.severity);
    if (!duplicate) kept.push(finding);
  }
  return kept;
}
