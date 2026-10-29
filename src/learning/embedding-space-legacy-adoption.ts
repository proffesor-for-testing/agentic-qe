/**
 * Adopt an embedding space id minted before the registry (#1302).
 *
 * A space created before #1298 has stored vectors under its exact-hash id but
 * no reference canary in the registry. When the first start after upgrading
 * is already noisy, the derived id differs and no reference can match it, so
 * those vectors would be left under the old id. Before a new space is
 * registered, a few captured_experiences rows of each such legacy id are
 * re-embedded with the #1217 recipe (experience-space-verification). When the
 * active embedder reproduces a stored vector (cosine >=
 * EMBEDDING_ROUND_TRIP_MIN_COSINE), the legacy id is the active space: it is
 * adopted and registered with the current canary as its reference, so later
 * starts resolve it from the registry and this check does not run again.
 *
 * Read-only on stored rows: no vector, id or space id is ever written here.
 */

import { cosineSimilarity } from '../shared/utils/vector-math.js';
import { toErrorMessage } from '../shared/error-utils.js';
import { EMBEDDING_ROUND_TRIP_MIN_COSINE, type EmbeddingSpaceIdentity } from './embedding-space.js';
import type { RegisteredEmbeddingSpace } from './embedding-space-registry.js';
import {
  legacyExperienceEmbeddingTexts,
  storedExperienceVector,
  type LegacyExperienceRow,
} from './experience-space-verification.js';

/** Rows re-embedded per legacy space id. */
export const LEGACY_ADOPTION_ROWS_PER_SPACE = 5;
/** Legacy space ids checked per start, most rows first. */
export const LEGACY_ADOPTION_MAX_SPACES = 3;

interface ReadableDatabase {
  prepare(sql: string): { all(...params: unknown[]): unknown[] };
}

export interface LegacySpaceCheck {
  spaceId: string;
  /** Rows of this space whose vector was compared. */
  checked: number;
  /** Rows whose stored vector the active embedder reproduced. */
  matched: number;
  /** Best cosine over the compared rows. */
  bestCosine: number;
}

export interface LegacySpaceAdoption {
  /** The legacy space id to adopt, or null to register the derived space. */
  spaceId: string | null;
  /** Why nothing was adopted, or which id was and on what evidence. */
  reason: string;
  checks: LegacySpaceCheck[];
  embeds: number;
}

/**
 * Find the legacy space id whose stored experience vectors the active
 * embedder reproduces. `embed` embeds one text with the active runtime and
 * throws when it fails. Never throws; returns spaceId null with a reason when
 * nothing can be verified.
 */
export async function findAdoptableLegacySpace(
  db: ReadableDatabase,
  derived: EmbeddingSpaceIdentity,
  registered: readonly RegisteredEmbeddingSpace[],
  embed: (text: string) => Promise<number[]>,
): Promise<LegacySpaceAdoption> {
  const none = (reason: string, checks: LegacySpaceCheck[] = [], embeds = 0): LegacySpaceAdoption =>
    ({ spaceId: null, reason, checks, embeds });

  let legacyIds: string[];
  try {
    legacyIds = legacySpaceIds(db, derived, registered);
  } catch (error) {
    return none(`stored experience vectors could not be read (${toErrorMessage(error)})`);
  }
  if (legacyIds.length === 0) return none('no stored experience vectors under an unregistered space id');

  const checks: LegacySpaceCheck[] = [];
  let embeds = 0;
  try {
    for (const spaceId of legacyIds) {
      const rows = db.prepare(`
        SELECT rowid, id, task, agent, domain, steps_json, source, embedding, embedding_dimension
        FROM captured_experiences
        WHERE embedding_space_id = ? AND embedding IS NOT NULL AND embedding_dimension = ?
        ORDER BY rowid LIMIT ?
      `).all(spaceId, derived.dimensions, LEGACY_ADOPTION_ROWS_PER_SPACE) as LegacyExperienceRow[];
      const check: LegacySpaceCheck = { spaceId, checked: 0, matched: 0, bestCosine: -1 };
      for (const row of rows) {
        const stored = storedExperienceVector(row);
        if (!stored) continue;
        check.checked++;
        for (const text of legacyExperienceEmbeddingTexts(row)) {
          const recomputed = await embed(text);
          embeds++;
          if (recomputed.length !== stored.length) continue;
          const cosine = cosineSimilarity(stored, recomputed);
          if (cosine > check.bestCosine) check.bestCosine = cosine;
          if (cosine >= EMBEDDING_ROUND_TRIP_MIN_COSINE) {
            check.matched++;
            break;
          }
        }
      }
      checks.push(check);
    }
  } catch (error) {
    return none(`the embedder failed while re-embedding stored experiences (${toErrorMessage(error)})`, checks, embeds);
  }

  const matching = checks
    .filter((check) => check.matched > 0)
    .sort((a, b) => b.matched - a.matched || b.bestCosine - a.bestCosine);
  if (matching.length === 0) {
    const checked = checks.reduce((sum, check) => sum + check.checked, 0);
    return none(
      `none of ${checked} re-embedded experiences from ${checks.length} legacy space id(s) ` +
        `reached cosine ${EMBEDDING_ROUND_TRIP_MIN_COSINE}`,
      checks,
      embeds,
    );
  }
  const best = matching[0];
  const others = matching.length > 1
    ? `; also matching: ${matching.slice(1).map(describeCheck).join(', ')}`
    : '';
  return { spaceId: best.spaceId, reason: `${describeCheck(best)}${others}`, checks, embeds };
}

function describeCheck(check: LegacySpaceCheck): string {
  return `${check.spaceId.slice(0, 12)} (${check.matched}/${check.checked} rows, best cosine ${check.bestCosine.toFixed(6)})`;
}

/**
 * Space ids of stored experience vectors of the active dimension that have
 * no registry entry, most rows first. The derived id is excluded: if rows are
 * stored under it, registering it already keeps them.
 */
function legacySpaceIds(
  db: ReadableDatabase,
  derived: EmbeddingSpaceIdentity,
  registered: readonly RegisteredEmbeddingSpace[],
): string[] {
  const known = new Set(registered.map((entry) => entry.identity.spaceId));
  known.add(derived.spaceId);
  const rows = db.prepare(`
    SELECT embedding_space_id AS spaceId, COUNT(*) AS n
    FROM captured_experiences
    WHERE embedding_space_id IS NOT NULL AND embedding IS NOT NULL AND embedding_dimension = ?
    GROUP BY embedding_space_id
    ORDER BY n DESC, embedding_space_id
  `).all(derived.dimensions) as Array<{ spaceId: string }>;
  return rows
    .map((row) => row.spaceId)
    .filter((spaceId) => !known.has(spaceId))
    .slice(0, LEGACY_ADOPTION_MAX_SPACES);
}
