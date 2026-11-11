/**
 * #1384: a value already serialized for a JSONB column.
 *
 * PostgresWriter.serializeValue guesses at each raw value: a number in the
 * millisecond range becomes an ISO date, a number array becomes a vector
 * literal (`[1,a]`, `[1,2,3]` from `[1,[2,3]]`), and JSON-looking text is
 * stored as JSON. That is right for typed columns but corrupts or rejects
 * arbitrary payloads. A JsonbText carries `JSON.stringify(value)`, which the
 * writer sends unchanged, so the payload keeps its JSON type.
 */
export class JsonbText {
  /** JSON text for the JSONB column. */
  readonly text: string;

  constructor(value: unknown) {
    this.text = stripNulEscapes(JSON.stringify(value === undefined ? null : value));
  }

  /** The payload, for logs and dry runs that serialize the record. */
  toJSON(): unknown {
    return JSON.parse(this.text);
  }
}

/** A payload for a JSONB column, written as-is by the cloud writer. */
export function jsonb(value: unknown): JsonbText {
  return new JsonbText(value);
}

/**
 * PostgreSQL JSONB rejects the escape `\u0000`. JSON.stringify writes a NUL
 * character as that escape, and writes a literal backslash as `\\`, so an
 * escape preceded by an even run of backslashes is a NUL and is dropped;
 * text such as `C:\u0000dir` (an escaped backslash) is kept.
 */
function stripNulEscapes(json: string): string {
  return json.replace(/(?<!\\)((?:\\\\)*)\\u0000/g, '$1');
}
