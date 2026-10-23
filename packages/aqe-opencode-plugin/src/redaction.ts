/**
 * Log and capture redaction for the OpenCode plugin (agentic-qe #740)
 *
 * This package ships separately and does not depend on agentic-qe, so it
 * carries a compact copy of the detectors in agentic-qe's
 * src/logging/redaction.ts. The parity test
 * (tests/unit/logging/redaction-copies.test.ts) runs both against the same
 * fixtures. Every pattern is linear: bounded or single-pass quantifiers only.
 *
 * Heuristic redaction is defense in depth: unknown secrets in free prose can
 * still slip through, so callers should keep payloads out of logs and captures.
 *
 * @module redaction
 */

type Replacement = string | ((match: string, ...groups: string[]) => string);

const PATTERNS: Array<[RegExp, Replacement]> = [
  [/-----BEGIN[^-\n]{0,64}PRIVATE KEY-----(?:[\s\S]*?-----END[^-\n]{0,64}PRIVATE KEY-----|[\s\S]*)/g, '<REDACTED:private_key>'],
  [/(:\/\/)[^\s/@:"']*:[^\s/@"']+@/g, '$1<REDACTED:credentials>@'],
  [/\b((?:authorization|x-api-key):\s*(?:(?:Bearer|Basic|Token)\s+)?)[^\s"']+/gi, '$1<REDACTED:credential>'],
  [/\b(set-cookie|cookie):\s*[^\n]+/gi, '$1: <REDACTED:cookie>'],
  [/\b(Bearer)\s+([A-Za-z0-9._~+/=-]{8,})/gi,
    (match, scheme, value) => (isProseWord(value) ? match : `${scheme} <REDACTED:credential>`)],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '<REDACTED:jwt>'],
  [/\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|glpat-[A-Za-z0-9_-]{20,}|xox[bpsa]-[A-Za-z0-9-]{10,}|hf_[A-Za-z0-9]{30,}|npm_[A-Za-z0-9]{36,}|cog_[A-Za-z0-9-]{20,}|[spr]k_(?:live|test)_[A-Za-z0-9]{10,}|AIzaSy[A-Za-z0-9_-]{33}|A[KS]IA[0-9A-Z]{16})/g,
    '<REDACTED:token>'],
  // key=value, key: value and "key": "value" for sensitive key names.
  [/((?:^|[^A-Za-z0-9])[A-Za-z0-9_-]{0,64}?(?:token|secret|password|passwd|passphrase|api[_-]?key|credentials?|private[_-]?key)["']?\s*[:=]\s*["']?)[^\s"'&,;}]+/gi,
    '$1<REDACTED:credential>'],
  // --token value / -password value command-line flags.
  [/(--?[A-Za-z0-9-]{0,64}?(?:token|secret|password|api-?key)\s+)[^\s-][^\s]*/gi, '$1<REDACTED:credential>'],
];

/** Strings above this size are dropped rather than scanned. */
const MAX_SCAN_LENGTH = 1_000_000;

/** "use Bearer authorization" is prose; digits, mixed case, symbols or >16 letters mean a token. */
function isProseWord(value: string): boolean {
  return /^[A-Z]?[a-z]+\.?$/.test(value) && value.replace(/\.$/, '').length <= 16;
}

/** Redact credential-shaped substrings from free text. */
export function redactText(text: string): string {
  if (typeof text !== 'string') return formatErrorForLog(text);
  if (text.length > MAX_SCAN_LENGTH) return `[REDACTED:size-limit ${text.length} chars]`;
  let out = text;
  for (const [regex, replacement] of PATTERNS) {
    out = typeof replacement === 'string' ? out.replace(regex, replacement) : out.replace(regex, replacement);
  }
  return out;
}

/** name/code/status of an error: strings redacted, numbers kept, getters never invoked. */
function safeErrorFields(error: Error): Record<string, string | number> {
  const fields: Record<string, string | number> = {};
  for (const field of ['name', 'code', 'status'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(error, field)
      ?? (field === 'name' ? { value: error.name } : undefined);
    const value: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof value === 'string') fields[field] = redactText(value).slice(0, 200);
    else if (typeof value === 'number' && Number.isFinite(value)) fields[field] = value;
  }
  return fields;
}

/** Render a thrown value as redacted text plus its safe structured fields, for console output. */
export function formatErrorForLog(error: unknown): string {
  try {
    if (error instanceof Error) {
      const text = redactText(error.stack || `${error.name}: ${error.message}`);
      const fields = safeErrorFields(error);
      const keys = Object.keys(fields);
      // Skip the fields when they only repeat the name the stack already starts with.
      const nameOnly = keys.length === 0 || (keys.length === 1 && text.startsWith(`${fields.name}`));
      return nameOnly ? text : `${text} ${JSON.stringify(fields)}`;
    }
    if (typeof error === 'string') return redactText(error);
    // Serializing an arbitrary thrown object could run getters or toJSON and
    // print nested secrets, so only its type is reported.
    return `[non-error thrown: ${error === null ? 'null' : typeof error}]`;
  } catch {
    return '[REDACTED:sanitization-failed]';
  }
}
