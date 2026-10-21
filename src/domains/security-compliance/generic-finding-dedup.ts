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
  location: { file: string; line?: number };
}

interface SastFinding {
  description?: string;
  references?: readonly string[];
  location: { file: string; line?: number };
}

/** CWE-95 (eval injection): SAST's eval() and Function-constructor rules. */
function isEvalInjection(finding: SastFinding): boolean {
  return /\[CWE-95\]/.test(finding.description ?? '') ||
    (finding.references ?? []).some(ref => /\/definitions\/95\.html$/.test(ref));
}

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
 * CWE-95 on the same real file and line. `isEvalOnly` says whether a generic
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
  const covered = new Set<string>();
  for (const finding of evalSast) {
    covered.add(`${await realPathOf(finding.location.file, cache)}:${finding.location.line ?? 0}`);
  }
  const kept: T[] = [];
  for (const finding of generic) {
    const duplicate = finding.title === GENERIC_EVAL_EXEC_TITLE && isEvalOnly(finding) &&
      covered.has(`${await realPathOf(finding.location.file, cache)}:${finding.location.line ?? 0}`);
    if (!duplicate) kept.push(finding);
  }
  return kept;
}
