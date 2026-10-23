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

/** Basic credentials are base64("user:password"); prose such as "Basic authentication" is not. */
function looksLikeBasicCredential(value: string): boolean {
  const decoded = Buffer.from(value, 'base64').toString('latin1');
  return decoded.includes(':') && /^[\x20-\x7e]+$/.test(decoded);
}

/**
 * Bearer tokens are opaque, so prose ("use Bearer authorization") is told apart
 * by shape: a short lowercase or Capitalized word, optionally ending a sentence.
 * Anything with digits, mixed case, '_', '-', '/', '+', '=' or over 16 letters
 * is treated as a token: when unsure, redact.
 */
function looksLikeProseWord(value: string): boolean {
  return /^[A-Z]?[a-z]+\.?$/.test(value) && value.replace(/\.$/, '').length <= 16;
}

/** Log-specific credential shapes, applied before the shared advisor patterns. */
const LOG_PATTERNS: Array<[RegExp, string | ((match: string, ...groups: string[]) => string)]> = [
  // Anchored on '://' rather than a scheme prefix: `\b[a-z][a-z0-9+.-]*://`
  // backtracks quadratically on inputs such as 'a.a.a.…' (seconds per call at
  // 100 KB). The scheme is left in place; an empty user (://:pw@) is covered.
  [/(:\/\/)[^\s/@:"']*:[^\s/@"']+@/g, '$1<REDACTED:credentials>@'],
  // In a header any Basic value is a credential; outside one it must decode as user:password.
  [/\b(authorization:\s*Basic)\s+[^\s"']+/gi, '$1 <REDACTED:credential>'],
  [/\b(Basic)\s+([A-Za-z0-9+/]{8,}={0,2})(?![A-Za-z0-9._~+/=-])/gi,
    (match, scheme, value) => looksLikeBasicCredential(value) ? `${scheme} <REDACTED:credential>` : match],
  // Same split for Bearer (#1196): any value in a header; outside one, only prose words are kept.
  [/\b(authorization:\s*Bearer)\s+[^\s"']+/gi, '$1 <REDACTED:credential>'],
  [/\b(Bearer)\s+([A-Za-z0-9._~+/=-]{8,})/gi,
    (match, scheme, value) => looksLikeProseWord(value) ? match : `${scheme} <REDACTED:credential>`],
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}/g, '<REDACTED:api_key>'],
  [/\b(set-cookie|cookie):\s*[^\n]+/gi, '$1: <REDACTED:cookie>'],
  // Compound query/assignment keys the shared pattern misses: access_token=, client_secret=
  [/\b([A-Za-z0-9_-]{0,64}?[_-](?:token|secret|password|passwd))=([^\s&"'#]+)/gi, '$1=<REDACTED:credential>'],
];

/**
 * JSON / repr serialized fields ("apiKey":"…", 'password': 123, token: {…}).
 * Keys are quoted (JSON, Python repr) or bare (util.inspect); a bare key must
 * start a word. The key is checked with isSensitiveLogKey() so text and
 * structured values agree. Values are strings, numbers, or an opening '{' / '['
 * whose whole object/array is then redacted. JSON embedded in a JSON string
 * ({\"password\":\"…\"}) uses escaped quotes; its string value runs to the next
 * escaped quote. Unterminated strings are redacted to end of line and
 * unbalanced objects/arrays to end of text (fail closed).
 */
const SERIALIZED_FIELD = /(?:(\\?["'])([A-Za-z0-9_.-]{1,64})\1|(?<![A-Za-z0-9_.$-])([A-Za-z_$][A-Za-z0-9_.$-]{0,63}))(\s*:\s*)("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|\\["']|-?\d[\d.eE+-]*|[{[])/g;

function redactSerializedFields(text: string): string {
  const pattern = new RegExp(SERIALIZED_FIELD.source, SERIALIZED_FIELD.flags);
  let out = '';
  let copied = 0;
  for (let m = pattern.exec(text); m !== null; m = pattern.exec(text)) {
    const [match, quote = '', quotedKey, bareKey, sep, value] = m;
    const key = quotedKey ?? bareKey;
    const valueStart = m.index + match.length - value.length;
    if (!isSensitiveLogKey(key)) {
      // Not sensitive: resume inside the value, so keys nested in an object or
      // serialized into a string ("body={\"password\":…}") are still checked.
      pattern.lastIndex = valueStart + 1;
      continue;
    }
    const end = value === '{' || value === '['
      ? compoundValueEnd(text, valueStart, quote.length === 2)
      : value.length === 2 && value[0] === '\\'
        ? escapedStringEnd(text, valueStart + 2, value)
        : m.index + match.length;
    out += `${text.slice(copied, m.index)}${quote}${key}${quote}${sep}${quote}<REDACTED:sensitive-key>${quote}`;
    copied = end;
    // Resume after the redacted value, which is never scanned again.
    pattern.lastIndex = end;
  }
  return copied === 0 ? text : out + text.slice(copied);
}

/** Index just past the escaped closing quote, or the end of the line when there is none. */
function escapedStringEnd(text: string, start: number, quote: string): number {
  for (let i = start; i < text.length; i++) {
    if (text[i] === '\n') return i;
    if (text.startsWith(quote, i)) return i + quote.length;
  }
  return text.length;
}

/**
 * Index just past the object/array opened at `start`, skipping quoted strings
 * (delimited by \" when the object is itself escaped inside a JSON string).
 * An unbalanced value runs to the end of the text, so it is redacted rather than printed.
 */
function compoundValueEnd(text: string, start: number, escaped: boolean): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped && ch === '\\' && (text[i + 1] === '"' || text[i + 1] === "'")) {
      i = escapedStringEnd(text, i + 2, text.slice(i, i + 2)) - 1;
    } else if (!escaped && (ch === '"' || ch === "'")) {
      // A newline also ends a string: neither JSON nor repr strings contain a raw one.
      for (i++; i < text.length && text[i] !== ch && text[i] !== '\n'; i++) {
        if (text[i] === '\\') i++;
      }
    } else if (ch === '{' || ch === '[') {
      depth++;
    } else if ((ch === '}' || ch === ']') && --depth === 0) {
      return i + 1;
    }
  }
  return text.length;
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
  for (const [regex, replacement] of LOG_PATTERNS) {
    result = typeof replacement === 'string'
      ? result.replace(regex, replacement)
      : result.replace(regex, replacement);
  }
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
      let text = formatErrorText(error);
      let cause = (error as Error & { cause?: unknown }).cause;
      for (let hops = 0; cause !== undefined && hops < 3; hops++) {
        text += `\nCaused by: ${cause instanceof Error
          ? formatErrorText(cause)
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

/** Fields kept from an error besides its message and stack: they identify the failure, not its data. */
const SAFE_ERROR_FIELDS = ['name', 'code', 'status'] as const;
const MAX_ERROR_FIELD_LENGTH = 200;

/** name/code/status as a redacted record; strings are redacted, numbers kept, anything else dropped. */
function safeErrorFields(error: Error): Record<string, string | number> {
  const fields: Record<string, string | number> = {};
  for (const field of SAFE_ERROR_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(error, field)
      ?? (field === 'name' ? { value: error.name } : undefined);
    const value: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof value === 'string') fields[field] = redactLogText(value, MAX_ERROR_FIELD_LENGTH);
    else if (typeof value === 'number' && Number.isFinite(value)) fields[field] = value;
  }
  return fields;
}

/** Redacted stack (or name: message) followed by the safe structured fields, unless they add nothing. */
function formatErrorText(error: Error): string {
  const text = redactLogText(error.stack || `${error.name}: ${error.message}`);
  const fields = safeErrorFields(error);
  const keys = Object.keys(fields);
  const nameOnly = keys.length === 0 || (keys.length === 1 && text.startsWith(`${fields.name}`));
  return nameOnly ? text : `${text} ${JSON.stringify(fields)}`;
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
  const { code, status } = safeErrorFields(error);
  if (code !== undefined) out.code = code;
  if (status !== undefined) out.status = status;
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
