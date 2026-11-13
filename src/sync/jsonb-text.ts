/**
 * #1384: a value already serialized for a JSONB column.
 *
 * PostgresWriter.serializeValue guesses at each raw value: a number in the
 * millisecond range becomes an ISO date, a number array becomes a vector
 * literal (`[1,a]`, `[1,2,3]` from `[1,[2,3]]`), and JSON-looking text is
 * stored as JSON. That is right for typed columns but corrupts or rejects
 * arbitrary payloads. A JsonbText carries `JSON.stringify(value)`, which the
 * writer sends unchanged, so the payload keeps its JSON type.
 *
 * It deliberately has no toJSON(): a writer that does not know JsonbText
 * would store `{"text": …}`, never something that looks right by accident.
 */
export class JsonbText {
  /** JSON text for the JSONB column. */
  readonly text: string;

  constructor(value: unknown) {
    this.text = JSON.stringify(toPostgresSafe(value === undefined ? null : value));
  }
}

/** A payload for a JSONB column, written as-is by the cloud writer. */
export function jsonb(value: unknown): JsonbText {
  return new JsonbText(value);
}

/**
 * PostgreSQL rejects two things JSON allows in strings: the NUL character
 * (`\u0000`) and an unpaired UTF-16 surrogate. Both are fixed in every string
 * and object key before serializing: NUL is dropped, a lone surrogate
 * becomes U+FFFD (String.prototype.toWellFormed).
 */
function toPostgresSafe(value: unknown): unknown {
  if (typeof value === 'string') return safeString(value);
  if (Array.isArray(value)) return value.map(toPostgresSafe);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[safeString(key)] = toPostgresSafe(item);
    return out;
  }
  return value;
}

function safeString(text: string): string {
  // toWellFormed is ES2024 (Node 20+; the package requires Node 22.13+).
  // eslint-disable-next-line no-control-regex -- NUL removal: PostgreSQL rejects \u0000
  return (text as string & { toWellFormed(): string }).toWellFormed().replace(/\u0000/g, '');
}
