/**
 * Agentic QE v3 - DAST request outcomes (#1092, #1135)
 * Classifies what a DAST request did not answer, so a failed or partial scan
 * is reported as such and never as a scan that found nothing.
 */

import type { DASTRequestFailure } from './scanner-types.js';

/** Error carrying a DAST failure code. */
export type DASTError = Error & { code: string };

export function dastError(message: string, code: string, cause?: unknown): DASTError {
  return Object.assign(new Error(message, cause === undefined ? undefined : { cause }), { code });
}

export function isDastError(error: unknown): error is DASTError {
  return error instanceof Error && 'code' in error && /^DAST_[A-Z_]+$/.test(String(error.code));
}

/**
 * The scan subject must be an http(s) URL. Anything else is a validation
 * error, not a completed scan with a synthetic finding (#1135).
 */
export function parseDastTarget(targetUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw dastError('DAST target is not a valid URL; no dynamic analysis ran', 'DAST_INVALID_TARGET');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw dastError(`DAST target must be an http(s) URL, not ${parsed.protocol}; no dynamic analysis ran`, 'DAST_INVALID_TARGET');
  }
  return parsed;
}

/**
 * A response status that says nothing about the target's security: the request
 * was refused, throttled or not served. Findings from such a page would be the
 * headers of the error page (#1092, #1135).
 */
export function unansweredStatus(status: number): { code: string; label: string } | null {
  if (status === 401 || status === 403 || status === 407) return { code: 'DAST_AUTHENTICATION_FAILED', label: 'authentication rejected' };
  if (status === 408) return { code: 'DAST_REQUEST_TIMEOUT', label: 'request timed out' };
  if (status === 429) return { code: 'DAST_RATE_LIMITED', label: 'rate limited' };
  if (status >= 500) return { code: 'DAST_TARGET_UNAVAILABLE', label: 'target unavailable' };
  return null;
}

/** Throws when the initial response cannot be scanned. */
export function assertScannableResponse(status: number): void {
  const unanswered = unansweredStatus(status);
  if (unanswered) {
    throw dastError(`DAST ${unanswered.label} (HTTP ${status}); dynamic analysis is incomplete`, unanswered.code);
  }
}

const TLS_CODE = /^(ERR_TLS_|ERR_SSL_|ERR_CERT_|CERT_|UNABLE_TO_(GET|VERIFY)_|DEPTH_ZERO_SELF_SIGNED_CERT$|SELF_SIGNED_CERT_IN_CHAIN$|EPROTO$)/;

/** The errno-style code on an error or its causes (undici wraps it as `cause.code`). */
function causeCode(error: unknown): string | undefined {
  for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Z0-9_]{1,48}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError' || /timeout|abort/i.test(error.message));
}

/** Transport failure classification; TLS failures are told apart from a closed port (#1135). */
export function classifyRequestError(error: unknown): { code: string; reason: string } {
  const cause = causeCode(error);
  if (isTimeout(error)) return { code: 'DAST_REQUEST_TIMEOUT', reason: cause ?? 'timeout' };
  if (cause && TLS_CODE.test(cause)) return { code: 'DAST_TLS_FAILED', reason: cause };
  return { code: 'DAST_REQUEST_FAILED', reason: cause ?? 'transport error' };
}

/** Transport failures are execution errors, not absence of vulnerabilities. */
export function dastRequestFailure(error: unknown): DASTError {
  if (isDastError(error)) return error;
  const { code, reason } = classifyRequestError(error);
  const what = code === 'DAST_REQUEST_TIMEOUT' ? 'request timeout'
    : code === 'DAST_TLS_FAILED' ? 'TLS handshake failed' : 'request failed';
  return dastError(`DAST target ${what} (${reason}); dynamic analysis is incomplete`, code, error);
}

/** Origin and path only: probe URLs can carry user credentials or query tokens. */
function requestLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '(invalid url)';
  }
}

export interface ProbeResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Headers;
  readonly text: string;
}

export interface ProbeOptions {
  /** A 5xx body is analysed (SQL error pages), not counted as unanswered. */
  readonly analyzeServerErrors?: boolean;
}

/**
 * A follow-up probe. When the target does not answer it (transport failure,
 * timeout, 407/408/429, or 5xx unless `analyzeServerErrors`), the failure is
 * recorded in `failures` and null is returned so the remaining probes still
 * run and the scan is reported incomplete (#1135). Without `failures`, it throws.
 */
export async function probe(
  url: string,
  init: RequestInit,
  failures?: DASTRequestFailure[],
  options: ProbeOptions = {}
): Promise<ProbeResponse | null> {
  try {
    const response = await fetch(url, init);
    const unanswered = response.status >= 500 && options.analyzeServerErrors ? null : unansweredStatus(response.status);
    // 401/403 on a probed path is an answer: the path is protected.
    if (unanswered && response.status !== 401 && response.status !== 403) {
      await response.body?.cancel().catch(() => undefined);
      throw dastError(`DAST probe ${unanswered.label} (HTTP ${response.status})`, unanswered.code);
    }
    return { status: response.status, ok: response.ok, headers: response.headers, text: await response.text() };
  } catch (error) {
    const failure = isDastError(error)
      ? { code: error.code, reason: error.message.replace(/^DAST probe /, '') }
      : classifyRequestError(error);
    if (!failures) throw isDastError(error) ? error : dastRequestFailure(error);
    failures.push({ url: requestLabel(url), ...failure });
    return null;
  }
}

export function summarizeFailures(failures: readonly DASTRequestFailure[]): string {
  const codes = [...new Set(failures.map(failure => failure.code))].join(', ');
  return `${failures.length} DAST request(s) were not answered (${codes}); findings cover only the answered requests`;
}
