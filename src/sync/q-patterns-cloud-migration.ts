/**
 * #1407 / #1415: convert this environment's existing aqe.qlearning_patterns
 * rows to the format 3.15.21 uploads.
 *
 * Before 3.15.21 the writer stored every state and action JSON-quoted
 * (`"edit:ts"`), and ruvector Q-patterns shared AQE's (state, action) keys.
 * Uploads now send plain text, with ruvector states prefixed `ruvector:`. An
 * old row would no longer match its new upload, so the next sync would add a
 * duplicate and `aqe sync verify` would report a mismatch.
 *
 * Before the first Q upload of a sync, each row of the sync's own
 * environment is rewritten in place:
 * - a JSON-quoted state or action is unquoted;
 * - a row whose (state, action) is a local ruvector pattern and not a local
 *   AQE Q-value gets the `ruvector:` prefix. A pair both stores have stays an
 *   AQE row; the ruvector pattern is then uploaded as a new prefixed row.
 *
 * No row is deleted. A rewrite that would collide with an existing row is
 * left as it was and counted. The conversion is idempotent, so every later
 * sync finds nothing to change.
 */
import type { CloudWriter, DataReader, SyncSource } from './interfaces.js';
import { Q_PATTERNS_TABLE, RUVECTOR_STATE_PREFIX } from './readers/q-patterns.js';
import { toErrorMessage } from '../shared/error-utils.js';

/** A local (state, action) pair, as `pairKey` builds it. */
export type PairKey = string;

export function pairKey(state: string, action: string): PairKey {
  return `${state}\u0000${action}`;
}

export interface QRowConversion {
  /** Rows whose state or action was unquoted. */
  unquoted: number;
  /** Rows that got the ruvector prefix. */
  prefixed: number;
  /** Rows left unchanged because the rewrite would collide with a row. */
  conflicts: number;
}

/** The text inside a JSON string literal, or the value unchanged. */
export function unquote(text: string): string {
  if (text.length < 2 || !text.startsWith('"') || !text.endsWith('"')) return text;
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'string' ? parsed : text;
  } catch {
    return text;
  }
}

/** The (state, action) a stored row should have. */
export function convertedPair(
  state: string, action: string, ruvectorPairs: ReadonlySet<PairKey>, aqePairs: ReadonlySet<PairKey>,
): { state: string; action: string } {
  const plainState = unquote(state);
  const plainAction = unquote(action);
  if (plainState.startsWith(RUVECTOR_STATE_PREFIX)) return { state: plainState, action: plainAction };
  const key = pairKey(plainState, plainAction);
  const ruvector = ruvectorPairs.has(key) && !aqePairs.has(key);
  return { state: ruvector ? RUVECTOR_STATE_PREFIX + plainState : plainState, action: plainAction };
}

/** PostgreSQL unique_violation. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === '23505';
}

/** Rewrite the environment's rows in place; see the module comment. */
export async function convertQPatternRows(
  writer: Pick<CloudWriter, 'query' | 'execute'>,
  environment: string,
  ruvectorPairs: ReadonlySet<PairKey>,
  aqePairs: ReadonlySet<PairKey>,
): Promise<QRowConversion> {
  const result: QRowConversion = { unquoted: 0, prefixed: 0, conflicts: 0 };
  // Only rows that can change: JSON-quoted ones, and unprefixed rows whose
  // pair is a ruvector-only pair. Once converted, a sync reads no rows.
  const toPrefix = [...ruvectorPairs].filter(key => !aqePairs.has(key)).map(key => key.split('\u0000'));
  const rows = await writer.query<{ id: string; state: string; action: string }>(
    `SELECT id, state, action FROM ${Q_PATTERNS_TABLE} WHERE source_env = $1 AND (` +
      `state LIKE '"%' OR action LIKE '"%' OR (state NOT LIKE '${RUVECTOR_STATE_PREFIX}%' AND ` +
      '(state, action) IN (SELECT * FROM unnest($2::text[], $3::text[]))))',
    [environment, toPrefix.map(([state]) => state), toPrefix.map(([, action]) => action)],
  );
  for (const row of rows) {
    if (typeof row.state !== 'string' || typeof row.action !== 'string') continue;
    const next = convertedPair(row.state, row.action, ruvectorPairs, aqePairs);
    if (next.state === row.state && next.action === row.action) continue;
    try {
      await writer.execute(
        `UPDATE ${Q_PATTERNS_TABLE} SET state = $1, action = $2 WHERE id = $3 AND source_env = $4`,
        [next.state, next.action, row.id, environment],
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw new Error(`converting ${Q_PATTERNS_TABLE} rows: ${toErrorMessage(error)}`);
      result.conflicts++;
      continue;
    }
    if (unquote(row.state) !== row.state || unquote(row.action) !== row.action) result.unquoted++;
    if (next.state.startsWith(RUVECTOR_STATE_PREFIX) && !unquote(row.state).startsWith(RUVECTOR_STATE_PREFIX)) {
      result.prefixed++;
    }
  }
  return result;
}

/**
 * How the conversion reaches a local store: its reader, MISSING_STORE when
 * the store does not exist (so it has no pairs), or null when it exists but
 * cannot be opened.
 */
export const MISSING_STORE = Symbol('missing-store');
export type QStoreReader = (source: SyncSource) => Promise<DataReader | typeof MISSING_STORE | null>;

/** The local (state, action) pairs of one store, or null when it cannot be read. */
async function readPairs(
  reader: DataReader | typeof MISSING_STORE | null, stripPrefix: boolean,
): Promise<Set<PairKey> | null> {
  if (reader === MISSING_STORE) return new Set();
  if (!reader) return null;
  try {
    if ((reader as { exists?: () => boolean }).exists?.() === false) return new Set();
    const pairs = new Set<PairKey>();
    for (const record of await reader.readAll() as Array<Record<string, unknown>>) {
      if (typeof record.state !== 'string' || typeof record.action !== 'string') continue;
      const state = stripPrefix && record.state.startsWith(RUVECTOR_STATE_PREFIX)
        ? record.state.slice(RUVECTOR_STATE_PREFIX.length) : record.state;
      pairs.add(pairKey(state, record.action));
    }
    return pairs;
  } catch {
    return null;
  }
}

/**
 * Run the conversion before the first Q upload of a sync. The local pairs
 * come from every store that writes the table, whether or not it was
 * selected for this sync (`aqe sync --sources` narrows the upload, not the
 * conversion): JSON sources are ruvector stores, the others AQE's own. When
 * AQE's pairs cannot be read, no row is prefixed (a shared pair could not be
 * told apart), only unquoted.
 * Returns a note for the sync report, or null when nothing changed.
 */
export async function convertBeforeQUpload(
  writer: Pick<CloudWriter, 'query' | 'execute'>,
  environment: string,
  qWriters: readonly SyncSource[],
  storeReader: QStoreReader,
): Promise<string | null> {
  let ruvectorPairs: Set<PairKey> | null = new Set();
  let aqePairs: Set<PairKey> | null = new Set();
  for (const source of qWriters) {
    if (source.enabled === false || source.targetTable !== Q_PATTERNS_TABLE) continue;
    const ruvector = source.type === 'json';
    const pairs = await readPairs(await storeReader(source), ruvector);
    if (ruvector) ruvectorPairs = ruvectorPairs && pairs ? new Set([...ruvectorPairs, ...pairs]) : null;
    else aqePairs = aqePairs && pairs ? new Set([...aqePairs, ...pairs]) : null;
  }
  const converted = await convertQPatternRows(
    writer, environment, aqePairs ? (ruvectorPairs ?? new Set()) : new Set(), aqePairs ?? new Set(),
  );
  const parts: string[] = [];
  if (converted.unquoted > 0) parts.push(`unquoted ${converted.unquoted} existing row(s)`);
  if (converted.prefixed > 0) parts.push(`marked ${converted.prefixed} existing ruvector row(s) with "${RUVECTOR_STATE_PREFIX}"`);
  if (converted.conflicts > 0) {
    parts.push(`left ${converted.conflicts} row(s) unchanged because the converted row already exists`);
  }
  return parts.length === 0 ? null : `${Q_PATTERNS_TABLE}: ${parts.join('; ')} (one-time conversion, #1407/#1415)`;
}
