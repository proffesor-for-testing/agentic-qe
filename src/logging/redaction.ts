/**
 * Agentic QE v3 - Log redaction (issue #740)
 *
 * Sink-side sanitizer applied before any log text is written. Redacts values
 * under sensitive keys and credential-shaped strings anywhere in a value.
 * Non-mutating, cycle-safe, bounded, never invokes getters or toJSON, and
 * fails closed: a value that cannot be inspected is replaced, not printed.
 *
 * Heuristic redaction is defense in depth: it does not replace keeping
 * payloads, headers and configuration out of log events in the first place.
 */

import { redact } from '../routing/advisor/redaction.js';

export interface LogRedactionOptions {
  /** Nesting depth beyond which objects become '[object]' */
  maxDepth?: number;
  /** Array items / object keys kept per level */
  maxEntries?: number;
  /** Characters kept per string after redaction */
  maxStringLength?: number;
}

const DEFAULTS: Required<LogRedactionOptions> = { maxDepth: 6, maxEntries: 100, maxStringLength: 8192 };

/** Strings above this size are dropped rather than scanned. */
const MAX_SCAN_LENGTH = 1_000_000;

const SENSITIVE_KEYS = new Set([
  'auth', 'dsn', 'pwd', 'proxyauthorization', 'setcookie', 'sessionid',
]);
const SENSITIVE_SUFFIXES = [
  'token', 'secret', 'password', 'passwd', 'passphrase', 'apikey', 'privatekey',
  'accesskey', 'secretkey', 'credential', 'credentials', 'cookie', 'authorization',
  'sessionid', 'connectionstring',
];

/** Log-specific credential shapes, applied before the shared advisor patterns. */
const LOG_PATTERNS: Array<[RegExp, string]> = [
  // Anchored on '://' rather than a scheme prefix: `\b[a-z][a-z0-9+.-]*://`
  // backtracks quadratically on inputs such as 'a.a.a.…' (seconds per call at
  // 100 KB). The scheme is left in place; an empty user (://:pw@) is covered.
  [/(:\/\/)[^\s/@:"']*:[^\s/@"']+@/g, '$1<REDACTED:credentials>@'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 <REDACTED:credential>'],
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}/g, '<REDACTED:api_key>'],
  [/\b(set-cookie|cookie):\s*[^\n]+/gi, '$1: <REDACTED:cookie>'],
  // Compound query/assignment keys the shared pattern misses: access_token=, client_secret=
  [/\b([A-Za-z0-9_-]{0,64}?[_-](?:token|secret|password|passwd))=([^\s&"'#]+)/gi, '$1=<REDACTED:credential>'],
];

/**
 * JSON / repr serialized fields ("apiKey":"…", 'password': 123). The key is
 * checked with isSensitiveLogKey() so text and structured values agree.
 * Unterminated strings are redacted to end of line (fail closed).
 */
const SERIALIZED_FIELD = /(["'])([A-Za-z0-9_.-]{1,64})\1(\s*:\s*)("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|-?\d[\d.eE+-]*)/g;

function redactSerializedFields(text: string): string {
  return text.replace(SERIALIZED_FIELD, (match, q: string, key: string, sep: string) =>
    isSensitiveLogKey(key) ? `${q}${key}${q}${sep}${q}<REDACTED:sensitive-key>${q}` : match);
}

export function isSensitiveLogKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEYS.has(normalized) || SENSITIVE_SUFFIXES.some(suffix => normalized.endsWith(suffix));
}

/** Redact credential-shaped substrings from free text. */
export function redactLogText(text: string, maxLength = DEFAULTS.maxStringLength): string {
  // Untyped (JS / `any`) callers may pass a non-string message; render it
  // safely instead of throwing from inside the logger.
  if (typeof text !== 'string') return formatErrorForLog(text);
  if (text.length > MAX_SCAN_LENGTH) return `[REDACTED:size-limit ${text.length} chars]`;
  let result = text;
  for (const [regex, replacement] of LOG_PATTERNS) result = result.replace(regex, replacement);
  result = redactSerializedFields(result);
  result = redact(result, 'balanced').text;
  return result.length > maxLength
    ? `${result.slice(0, maxLength)}…[truncated ${result.length - maxLength} chars]`
    : result;
}

/** Return a sanitized, JSON-safe copy of `value`. The input is never modified. */
export function redactLogValue(value: unknown, options: LogRedactionOptions = {}): unknown {
  return sanitize(value, { ...DEFAULTS, ...options }, 0, []);
}

/** Render a thrown value (Error or not) as redacted text for direct console output. */
export function formatErrorForLog(error: unknown): string {
  try {
    if (error instanceof Error) {
      let text = redactLogText(error.stack || `${error.name}: ${error.message}`);
      let cause = (error as Error & { cause?: unknown }).cause;
      for (let hops = 0; cause !== undefined && hops < 3; hops++) {
        text += `\nCaused by: ${cause instanceof Error
          ? redactLogText(cause.stack || `${cause.name}: ${cause.message}`)
          : JSON.stringify(redactLogValue(cause, { maxDepth: 3 }))}`;
        cause = cause instanceof Error ? (cause as Error & { cause?: unknown }).cause : undefined;
      }
      return text;
    }
    return typeof error === 'string'
      ? redactLogText(error)
      : JSON.stringify(redactLogValue(error, { maxDepth: 3 })) ?? String(error);
  } catch {
    return '[REDACTED:sanitization-failed]';
  }
}

function sanitize(value: unknown, opts: Required<LogRedactionOptions>, depth: number, ancestors: object[]): unknown {
  try {
    if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') return redactLogText(value, opts.maxStringLength);
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'symbol') return value.toString();
    if (typeof value === 'function') return '[function]';

    const obj = value as object;
    if (ancestors.includes(obj)) return '[circular]';
    if (depth >= opts.maxDepth) return '[object]';
    if (ArrayBuffer.isView(obj)) return `[binary ${obj.byteLength} bytes]`;
    if (obj instanceof ArrayBuffer) return `[binary ${obj.byteLength} bytes]`;
    if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? '[invalid date]' : obj.toISOString();
    if (obj instanceof Map || obj instanceof Set) return `[${obj.constructor.name}(${obj.size})]`;

    const path = [...ancestors, obj];
    if (Array.isArray(obj)) {
      const items = obj.slice(0, opts.maxEntries).map(item => sanitize(item, opts, depth + 1, path));
      if (obj.length > opts.maxEntries) items.push(`[+${obj.length - opts.maxEntries} more]`);
      return items;
    }
    if (obj instanceof Error) return sanitizeError(obj, opts, depth, path);
    return sanitizeRecord(obj, Object.keys(obj), opts, depth, path);
  } catch {
    return '[REDACTED:sanitization-failed]';
  }
}

function sanitizeError(error: Error, opts: Required<LogRedactionOptions>, depth: number, path: object[]): unknown {
  const out: Record<string, unknown> = {
    name: redactLogText(String(error.name), opts.maxStringLength),
    message: redactLogText(String(error.message), opts.maxStringLength),
  };
  if (typeof error.stack === 'string') out.stack = redactLogText(error.stack, opts.maxStringLength);
  const code = (error as Error & { code?: unknown }).code;
  if (typeof code === 'string' || typeof code === 'number') out.code = code;
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause !== undefined) out.cause = sanitize(cause, opts, depth + 1, path);
  return out;
}

function sanitizeRecord(
  obj: object, keys: string[], opts: Required<LogRedactionOptions>, depth: number, path: object[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys.slice(0, opts.maxEntries)) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, key);
    if (!descriptor) continue;
    if (!('value' in descriptor)) { out[key] = '[getter]'; continue; }
    const v: unknown = descriptor.value;
    // Numbers are redacted too (numeric PINs, session IDs); counters such as
    // maxTokens/tokensUsed do not match a sensitive suffix in the first place.
    if (isSensitiveLogKey(key) && v !== null && v !== undefined && typeof v !== 'boolean') {
      out[key] = '[REDACTED:sensitive-key]';
      continue;
    }
    out[key] = sanitize(v, opts, depth + 1, path);
  }
  if (keys.length > opts.maxEntries) out['[truncated]'] = `${keys.length - opts.maxEntries} more keys`;
  return out;
}
