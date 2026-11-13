/**
 * #1407: serialize each value by the cloud column's real type.
 *
 * PostgresWriter used to guess from the column name: any column called
 * `state`, `action`, `value`, … was treated as JSONB, so a plain string in a
 * TEXT column such as `aqe.qlearning_patterns.state` was stored JSON-quoted
 * (`"edit:ts"`). A 13-digit numeric string was rewritten to an ISO date in
 * every column, and an ISO-looking string was sent raw even to a JSONB
 * column, which rejected it as invalid JSON.
 *
 * The writer now reads the target table's column types from
 * information_schema once per connection and serializes by type. A column
 * it has no type for keeps the old name-based handling.
 */
import { JsonbText } from '../jsonb-text.js';

/** How a cloud column's values are serialized. */
export type ColumnKind = 'text' | 'jsonb' | 'timestamp' | 'vector' | 'scalar';

/** The column kind for an information_schema `data_type` / `udt_name`. */
export function columnKind(dataType: string, udtName: string): ColumnKind {
  const type = dataType.toLowerCase();
  if (type === 'text' || type === 'character varying' || type === 'character') return 'text';
  if (type === 'jsonb' || type === 'json') return 'jsonb';
  if (type.startsWith('timestamp') || type === 'date') return 'timestamp';
  // ruvector(384) / pgvector `vector` columns report USER-DEFINED.
  if (type === 'user-defined' && /vector/i.test(udtName)) return 'vector';
  return 'scalar';
}

/** information_schema query for one `schema.table` (or `table` in public). */
export function columnTypesQuery(table: string): { sql: string; params: string[] } {
  const [schema, name] = table.includes('.') ? table.split('.', 2) : ['public', table];
  return {
    sql: 'SELECT column_name, data_type, udt_name FROM information_schema.columns ' +
      'WHERE table_schema = $1 AND table_name = $2',
    params: [schema, name],
  };
}

/** Column kinds from information_schema rows. */
export function toColumnKinds(
  rows: Array<{ column_name: string; data_type: string; udt_name: string }>,
): Map<string, ColumnKind> {
  const kinds = new Map<string, ColumnKind>();
  for (const row of rows) kinds.set(row.column_name, columnKind(row.data_type, row.udt_name ?? ''));
  return kinds;
}

const MS_MIN = 946684800000; // 2000-01-01 in ms
const MS_MAX = 4102444800000; // 2100-01-01 in ms
const S_MIN = 946684800;
const S_MAX = 4102444800;

/** Serialize a non-null value for a column of a known kind. */
export function serializeForKind(value: unknown, kind: ColumnKind): unknown {
  // #1384: already JSON text, written unchanged (a TEXT column keeps the JSON text).
  if (value instanceof JsonbText) return value.text;
  switch (kind) {
    case 'text':
      if (typeof value === 'string') return stripNul(value);
      if (typeof value === 'object') return stripNul(JSON.stringify(value));
      return value;
    case 'jsonb':
      return toJsonText(value);
    case 'timestamp':
      return toTimestamp(value);
    case 'vector':
      return toVector(value);
    case 'scalar':
      return value;
  }
}

function stripNul(text: string): string {
  // eslint-disable-next-line no-control-regex -- PostgreSQL TEXT and JSONB reject \u0000
  return text.replace(/\u0000/g, '');
}

/** Valid JSON text: a string that already is JSON is kept, anything else is encoded. */
function toJsonText(value: unknown): string {
  if (typeof value === 'string') {
    const text = stripNul(value);
    try {
      JSON.parse(text);
      return text;
    } catch {
      return JSON.stringify(text);
    }
  }
  if (Buffer.isBuffer(value)) return JSON.stringify(value.toString('base64'));
  return stripNul(JSON.stringify(value) ?? 'null');
}

function toTimestamp(value: unknown): unknown {
  if (typeof value === 'number') {
    if (value > MS_MIN && value < MS_MAX) return new Date(value).toISOString();
    if (value > S_MIN && value < S_MAX) return new Date(value * 1000).toISOString();
    return value;
  }
  if (typeof value === 'string') {
    if (value === '') return null;
    if (/^\d+$/.test(value)) return toTimestamp(Number(value));
  }
  return value;
}

function toVector(value: unknown): unknown {
  if (Buffer.isBuffer(value)) {
    if (value.length === 0 || value.length % 4 !== 0) return null;
    // Copy first: Float32Array needs a 4-byte aligned offset.
    const floats = new Float32Array(Uint8Array.from(value).buffer);
    return floats.length <= 1024 ? `[${Array.from(floats).join(',')}]` : null;
  }
  if (Array.isArray(value)) return `[${value.join(',')}]`;
  return value;
}
