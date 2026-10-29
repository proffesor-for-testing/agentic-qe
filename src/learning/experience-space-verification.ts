/**
 * Attribute legacy experience vectors to an embedding space (#1217)
 *
 * captured_experiences rows written before #1217 carry a vector but no
 * embedding_space_id, so ExperienceReplay never compares them. Their vectors
 * are learning data and are never overwritten here. Instead each row's text is
 * re-embedded with the recipe its writer used; when the result matches the
 * stored vector (cosine >= EMBEDDING_ROUND_TRIP_MIN_COSINE), the stored vector
 * came from the active space and only embedding_space_id is set. A row that
 * does not match (another space, or text that can no longer be rebuilt) is
 * left as it is: it stays excluded from comparison.
 *
 * Progress is kept per space in kv_store, so rows that did not match are not
 * re-checked on every start; a different active space starts over.
 */

import { cosineSimilarity } from '../shared/utils/vector-math.js';
import { safeJsonParse } from '../shared/safe-json.js';
import { scrubReasoningBlocks } from '../shared/reasoning-scrub.js';
import { EMBEDDING_ROUND_TRIP_MIN_COSINE } from './embedding-space.js';

interface VerifiableDatabase {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { changes: number };
  };
}

export interface LegacyExperienceRow {
  rowid: number;
  id: string;
  task: string;
  agent: string | null;
  domain: string | null;
  steps_json: string | null;
  source: string | null;
  embedding: Buffer;
  embedding_dimension: number;
}

export interface ExperienceSpaceVerificationOptions {
  /** Embed text in the active space; throws when the embedder fails. */
  embed: (text: string) => Promise<number[]>;
  /** The active embedding space, read after embedding. */
  activeSpaceId: () => string | undefined;
  /** Rows to check in this pass. */
  limit?: number;
  /** Runs a write (e.g. UnifiedMemoryManager.writeWhenUnlocked). */
  write?: <T>(fn: () => T) => Promise<T> | T;
}

export interface ExperienceSpaceVerificationResult {
  spaceId: string | null;
  checked: number;
  stamped: string[];
  left: number;
}

const CURSOR_NAMESPACE = '_system';
const cursorKey = (spaceId: string) => `experience-space-verified-rowid:${spaceId}`;

/**
 * The texts the row's writer may have embedded. Each is only a candidate:
 * a row is attributed only when one reproduces its stored vector.
 * - experience-capture middleware and the CLI hooks: `${domain}: ${task}`,
 *   capped at 512 chars (the hooks store task capped at 500, so a longer
 *   task cannot be rebuilt and will not match);
 * - ExperienceReplay's start-up backfill: the same, scrubbed (ADR-099);
 * - ExperienceReplay.storeExperience (source 'experience-replay'):
 *   `${task} ${strategy} ${keyActions}`, strategy in `agent`, key actions
 *   in steps_json.
 */
export function legacyExperienceEmbeddingTexts(row: LegacyExperienceRow): string[] {
  const domainTask = `${row.domain ?? ''}: ${row.task}`;
  const texts = new Set([
    domainTask.slice(0, 512),
    scrubReasoningBlocks(domainTask).slice(0, 512),
  ]);
  if (row.source === 'experience-replay') {
    const keyActions = safeJsonParse<unknown>(row.steps_json || '[]');
    if (Array.isArray(keyActions)) {
      texts.add(`${row.task} ${row.agent ?? ''} ${keyActions.join(' ')}`);
    }
  }
  return [...texts];
}

/** The row's stored float32 vector, or null when the blob is short. */
export function storedExperienceVector(row: LegacyExperienceRow): number[] | null {
  if (row.embedding.length < row.embedding_dimension * 4) return null;
  const v: number[] = [];
  for (let i = 0; i < row.embedding_dimension; i++) v.push(row.embedding.readFloatLE(i * 4));
  return v;
}

function readCursor(db: VerifiableDatabase, spaceId: string): number {
  try {
    const row = db.prepare('SELECT value FROM kv_store WHERE namespace = ? AND key = ?')
      .get(CURSOR_NAMESPACE, cursorKey(spaceId)) as { value: string } | undefined;
    return row ? Number(row.value) || 0 : 0;
  } catch {
    return 0; // no kv_store: check from the start
  }
}

function writeCursor(db: VerifiableDatabase, spaceId: string, rowid: number): void {
  try {
    db.prepare('INSERT OR REPLACE INTO kv_store (key, namespace, value) VALUES (?, ?, ?)')
      .run(cursorKey(spaceId), CURSOR_NAMESPACE, String(rowid));
  } catch {
    // Without kv_store the next start checks these rows again.
  }
}

/**
 * Check up to `limit` legacy rows (vector, no embedding_space_id) and set
 * embedding_space_id on those whose stored vector the active embedder
 * reproduces. Never writes a vector. Stops at the first embedder failure.
 */
export async function verifyLegacyExperienceSpaces(
  db: VerifiableDatabase,
  options: ExperienceSpaceVerificationOptions,
): Promise<ExperienceSpaceVerificationResult> {
  const write = options.write ?? (<T>(fn: () => T) => fn());
  const result: ExperienceSpaceVerificationResult = { spaceId: null, checked: 0, stamped: [], left: 0 };
  // The cursor is per space, so the space must be known first: embedding
  // anything initializes the embedder if needed.
  let spaceId = options.activeSpaceId();
  const rowsAfter = (cursor: number) => db.prepare(`
    SELECT rowid, id, task, agent, domain, steps_json, source, embedding, embedding_dimension
    FROM captured_experiences
    WHERE rowid > ? AND embedding IS NOT NULL AND embedding_space_id IS NULL
      AND embedding_dimension > 0 AND consolidated_into IS NULL
    ORDER BY rowid LIMIT ?
  `).all(cursor, options.limit ?? 200) as LegacyExperienceRow[];

  let rows = rowsAfter(spaceId ? readCursor(db, spaceId) : 0);
  if (rows.length === 0) return result;
  if (!spaceId) {
    await options.embed(legacyExperienceEmbeddingTexts(rows[0])[0]);
    spaceId = options.activeSpaceId();
    if (!spaceId) return result;
    rows = rowsAfter(readCursor(db, spaceId));
  }
  result.spaceId = spaceId;
  const stamp = db.prepare(`
    UPDATE captured_experiences SET embedding_space_id = ?
    WHERE id = ? AND embedding_space_id IS NULL AND embedding = ?
  `);

  let lastRowid = 0;
  try {
    for (const row of rows) {
      const stored = storedExperienceVector(row);
      let matched = false;
      if (stored) {
        for (const text of legacyExperienceEmbeddingTexts(row)) {
          const recomputed = await options.embed(text);
          if (options.activeSpaceId() !== spaceId) return result; // embedder changed mid-pass
          if (recomputed.length === stored.length
            && cosineSimilarity(stored, recomputed) >= EMBEDDING_ROUND_TRIP_MIN_COSINE) {
            matched = true;
            break;
          }
        }
      }
      if (matched) {
        // Only the provenance column, and only if the vector is still the one checked.
        const changes = (await write(() => stamp.run(spaceId, row.id, row.embedding))).changes;
        if (changes > 0) result.stamped.push(row.id);
        else result.left++;
      } else {
        result.left++;
      }
      result.checked++;
      lastRowid = row.rowid;
    }
  } finally {
    // Rows checked so far are not checked again in this space, even when an
    // embedder failure ends the pass early.
    if (lastRowid > 0) await write(() => writeCursor(db, spaceId!, lastRowid));
  }
  return result;
}
