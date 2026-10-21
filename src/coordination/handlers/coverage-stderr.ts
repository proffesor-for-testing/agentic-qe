/**
 * Caller-facing summary of a coverage runner's stderr.
 *
 * #1150: the summary reaches `provenance.notes` of a SUCCESS result, where the
 * #1139 error backstop never sees it, so it is redacted here. Redaction runs
 * BEFORE slicing: a slice boundary that cut a token or connection string in
 * half would leave a fragment the redaction patterns no longer recognise.
 * The collector therefore keeps a wide raw window at each end of the stream;
 * each window is redacted whole, and only then are the short head and tail
 * taken from it. A secret cut by a window edge lies far outside the part
 * that is kept.
 */

import { redactLogText } from '../../logging/redaction.js';

/** Raw stderr kept at each end of the stream, before redaction. */
export const STDERR_WINDOW_BYTES = 64 * 1024;
const STDERR_TAIL_BYTES = 2048;
const STDERR_HEAD_BYTES = 4096;
const STDERR_PREFIX_BYTES = 512;
const ERROR_LINE_RE = /^.*(?:error|\[[A-Z][A-Z_]{2,}\]|ERR_[A-Z_]+).*$/im;

/**
 * Summarise a runner's stderr for a caller: the FIRST error-looking line (or
 * the first ~512 bytes) plus the last ~2 KB (#995 review NB-C). A tail alone
 * loses the cause when a long stack follows it — a vitest config syntax error
 * prints `[PARSE_ERROR] …` first and then kilobytes of frames. `head` and
 * `tail` are the raw windows at each end; both are redacted before slicing.
 */
export function summarizeStderr(head: string, tail: string, totalBytes: number): string {
  const safeTail = redactLogText(tail, Number.POSITIVE_INFINITY);
  if (totalBytes <= STDERR_TAIL_BYTES) return safeTail.trim();
  const safeHead = redactLogText(head, Number.POSITIVE_INFINITY).slice(0, STDERR_HEAD_BYTES);
  const tailPart = safeTail.slice(-STDERR_TAIL_BYTES);
  const errorLine = ERROR_LINE_RE.exec(safeHead)?.[0]?.trim();
  const prefix = (errorLine ?? safeHead.slice(0, STDERR_PREFIX_BYTES)).trim();
  if (prefix && tailPart.includes(prefix)) return tailPart.trim();
  return `${prefix}\n…\n${tailPart.trim()}`;
}
