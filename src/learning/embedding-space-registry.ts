/**
 * Embedding-space registry (#1298).
 *
 * A space id is a hash of the runtime configuration plus an exact fingerprint
 * of a canary vector, rounded to int16 (steps of about 3e-5). The same model
 * restarted on other hardware or kernels can move the canary by more than
 * that, which would mint a new space id for vectors that are still
 * comparable. So each space minted here also stores its canary vector, as the
 * space's reference. At the next start, a runtime with the same configuration
 * whose canary is within EMBEDDING_ROUND_TRIP_MIN_COSINE of a reference is
 * that space: it keeps the stored identity and id instead of minting one.
 *
 * Entries live in memory.db kv_store (namespace _system) and are only ever
 * added: a reference is never updated, so slow drift cannot walk a space
 * away, and no stored id, vector or manifest is ever rewritten. Without a
 * database, or when it cannot be read, derivation is what it was before.
 */

import { cosineSimilarity } from '../shared/utils/vector-math.js';
import { writeWhenUnlockedOn } from '../shared/sqlite-write-queue.js';
import { toErrorMessage } from '../shared/error-utils.js';
import {
  EMBEDDING_ROUND_TRIP_MIN_COSINE,
  type EmbeddingSpaceIdentity,
} from './embedding-space.js';

const NAMESPACE = '_system';
const KEY_PREFIX = 'embedding_space:';

/** The raw memory.db connection the registry reads and writes. */
export interface EmbeddingSpaceRegistryDb {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
}

/** A space and the canary vector it was minted with. */
export interface RegisteredEmbeddingSpace {
  identity: EmbeddingSpaceIdentity;
  /** The text the canary vector embeds; only like canaries are compared. */
  canaryText: string;
  canary: number[];
}

interface StoredRegistryEntry extends RegisteredEmbeddingSpace {
  version: 1;
  createdAt: number;
}

export type EmbeddingSpaceResolution =
  /** A registered space with the same fingerprint. */
  | 'matched-exact'
  /** A registered space whose canary is within the round-trip cosine. */
  | 'matched-cosine'
  /** No registered space matched: the derived space was registered. */
  | 'registered'
  /** No registered space matched; a pre-registry space id was verified and registered (#1302). */
  | 'adopted-legacy'
  /** No usable registry: the derived space is used as before. */
  | 'unavailable';

export interface ResolvedEmbeddingSpace {
  identity: EmbeddingSpaceIdentity;
  resolution: EmbeddingSpaceResolution;
  /** Same-configuration spaces that did not match (for the drift warning). */
  otherSpaces: number;
  /** Settles when the registration write has run (or failed, logged). */
  registration: Promise<void>;
}

/** Same configuration: everything but the runtime fingerprint. */
export function sameEmbeddingSpaceConfig(
  a: EmbeddingSpaceIdentity,
  b: EmbeddingSpaceIdentity,
): boolean {
  return (
    a.provider === b.provider &&
    a.model === b.model &&
    a.dimensions === b.dimensions &&
    (a.pooling ?? null) === (b.pooling ?? null) &&
    a.normalized === b.normalized &&
    (a.preprocessingVersion ?? null) === (b.preprocessingVersion ?? null) &&
    (a.implementation ?? null) === (b.implementation ?? null)
  );
}

/**
 * The registered space a runtime belongs to, or null. Candidates share the
 * runtime's configuration and canary text; an equal fingerprint wins, then
 * the highest canary cosine at or above the round-trip threshold.
 */
export function matchRegisteredSpace(
  derived: EmbeddingSpaceIdentity,
  canaryText: string,
  canary: readonly number[],
  entries: readonly RegisteredEmbeddingSpace[],
): { entry: RegisteredEmbeddingSpace; exact: boolean } | null {
  const candidates = entries.filter(
    (entry) =>
      entry.canaryText === canaryText &&
      entry.canary.length === canary.length &&
      sameEmbeddingSpaceConfig(entry.identity, derived),
  );
  const exact = candidates.find(
    (entry) => entry.identity.runtimeFingerprint === derived.runtimeFingerprint,
  );
  if (exact) return { entry: exact, exact: true };
  let best: { entry: RegisteredEmbeddingSpace; cosine: number } | null = null;
  for (const entry of candidates) {
    const cosine = cosineSimilarity(entry.canary, canary as number[]);
    if (cosine >= EMBEDDING_ROUND_TRIP_MIN_COSINE && (!best || cosine > best.cosine)) {
      best = { entry, cosine };
    }
  }
  return best ? { entry: best.entry, exact: false } : null;
}

/** Read every registered space. Malformed entries are skipped. Throws on a DB error. */
export function loadRegisteredSpaces(db: EmbeddingSpaceRegistryDb): RegisteredEmbeddingSpace[] {
  const rows = db
    .prepare('SELECT value FROM kv_store WHERE namespace = ? AND key LIKE ?')
    .all(NAMESPACE, `${KEY_PREFIX}%`) as Array<{ value: string }>;
  const entries: RegisteredEmbeddingSpace[] = [];
  for (const row of rows) {
    const entry = parseEntry(row.value);
    if (entry) entries.push(entry);
  }
  return entries;
}

function parseEntry(value: string): RegisteredEmbeddingSpace | null {
  let parsed: Partial<StoredRegistryEntry>;
  try {
    parsed = JSON.parse(value) as Partial<StoredRegistryEntry>;
  } catch {
    return null;
  }
  const { identity, canaryText, canary } = parsed;
  if (
    parsed.version !== 1 ||
    !identity ||
    typeof identity.spaceId !== 'string' ||
    typeof identity.runtimeFingerprint !== 'string' ||
    typeof identity.dimensions !== 'number' ||
    typeof canaryText !== 'string' ||
    !Array.isArray(canary) ||
    canary.length !== identity.dimensions ||
    !canary.every((x) => typeof x === 'number' && Number.isFinite(x))
  ) {
    return null;
  }
  return { identity, canaryText, canary };
}

/**
 * Add a space to the registry. Never replaces an entry. The write goes
 * through the connection's write queue (#1283) when it has one, so a locked
 * memory.db does not block the event loop.
 */
export function registerEmbeddingSpace(
  db: EmbeddingSpaceRegistryDb,
  space: RegisteredEmbeddingSpace,
): Promise<void> {
  const entry: StoredRegistryEntry = { version: 1, createdAt: Date.now(), ...space };
  return writeWhenUnlockedOn(db, () => {
    db.prepare('INSERT OR IGNORE INTO kv_store (key, namespace, value) VALUES (?, ?, ?)').run(
      KEY_PREFIX + space.identity.spaceId,
      NAMESPACE,
      JSON.stringify(entry),
    );
  });
}

/**
 * Choose the space for a freshly derived runtime identity: a registered space
 * it matches, or the derived space, which is then registered. Never throws:
 * when the registry cannot be read the derived space is used, as before.
 */
export function resolveEmbeddingSpace(
  db: EmbeddingSpaceRegistryDb | null,
  derived: EmbeddingSpaceIdentity,
  canaryText: string,
  canary: readonly number[],
): ResolvedEmbeddingSpace {
  const lookup = lookupEmbeddingSpace(db, derived, canaryText, canary);
  if (lookup.resolved) return lookup.resolved;
  return registerResolvedSpace(lookup.db, derived, canaryText, canary, 'registered', lookup.otherSpaces);
}

/**
 * Picks a legacy space id (one with stored vectors but no registry entry) the
 * runtime belongs to, or null. Throws only on an unexpected failure.
 */
export type LegacySpaceAdopter = (
  derived: EmbeddingSpaceIdentity,
  registered: readonly RegisteredEmbeddingSpace[],
) => Promise<string | null>;

/**
 * #1302: like resolveEmbeddingSpace, but before registering a new space the
 * adopter may name a legacy space id the runtime has been shown to reproduce.
 * That id is kept and registered with the current canary as its reference.
 * Its identity carries the current runtime fields: a pre-registry id is a
 * hash that cannot be reversed into the fields it was minted from.
 */
export async function resolveEmbeddingSpaceAdoptingLegacy(
  db: EmbeddingSpaceRegistryDb | null,
  derived: EmbeddingSpaceIdentity,
  canaryText: string,
  canary: readonly number[],
  adoptLegacy: LegacySpaceAdopter,
): Promise<ResolvedEmbeddingSpace> {
  const lookup = lookupEmbeddingSpace(db, derived, canaryText, canary);
  if (lookup.resolved) return lookup.resolved;
  let legacySpaceId: string | null = null;
  try {
    legacySpaceId = await adoptLegacy(derived, lookup.entries);
  } catch (error) {
    console.warn(
      `[EmbeddingSpaceRegistry] legacy space check failed (${toErrorMessage(error)}); ` +
        `registering the derived space id`,
    );
  }
  if (legacySpaceId) {
    const adopted: EmbeddingSpaceIdentity = { ...derived, spaceId: legacySpaceId };
    return registerResolvedSpace(lookup.db, adopted, canaryText, canary, 'adopted-legacy', 0);
  }
  return registerResolvedSpace(lookup.db, derived, canaryText, canary, 'registered', lookup.otherSpaces);
}

type SpaceLookup =
  | { resolved: ResolvedEmbeddingSpace }
  | {
      resolved?: undefined;
      db: EmbeddingSpaceRegistryDb;
      entries: RegisteredEmbeddingSpace[];
      otherSpaces: number;
    };

/** A registered match (or the unavailable fallback), or what is needed to register. */
function lookupEmbeddingSpace(
  db: EmbeddingSpaceRegistryDb | null,
  derived: EmbeddingSpaceIdentity,
  canaryText: string,
  canary: readonly number[],
): SpaceLookup {
  const unavailable = (): SpaceLookup => ({
    resolved: {
      identity: derived,
      resolution: 'unavailable',
      otherSpaces: 0,
      registration: Promise.resolve(),
    },
  });
  if (!db) return unavailable();

  let entries: RegisteredEmbeddingSpace[];
  try {
    entries = loadRegisteredSpaces(db);
  } catch (error) {
    console.warn(
      `[EmbeddingSpaceRegistry] could not read registered embedding spaces ` +
        `(${toErrorMessage(error)}); using the derived space id`,
    );
    return unavailable();
  }

  const match = matchRegisteredSpace(derived, canaryText, canary, entries);
  if (match) {
    return {
      resolved: {
        identity: match.entry.identity,
        resolution: match.exact ? 'matched-exact' : 'matched-cosine',
        otherSpaces: 0,
        registration: Promise.resolve(),
      },
    };
  }

  const otherSpaces = entries.filter(
    (entry) => entry.canaryText === canaryText && sameEmbeddingSpaceConfig(entry.identity, derived),
  ).length;
  return { db, entries, otherSpaces };
}

function registerResolvedSpace(
  db: EmbeddingSpaceRegistryDb,
  identity: EmbeddingSpaceIdentity,
  canaryText: string,
  canary: readonly number[],
  resolution: 'registered' | 'adopted-legacy',
  otherSpaces: number,
): ResolvedEmbeddingSpace {
  const registration = Promise.resolve()
    .then(() => registerEmbeddingSpace(db, { identity, canaryText, canary: [...canary] }))
    .catch((error: unknown) => {
      console.warn(
        `[EmbeddingSpaceRegistry] could not register embedding space ${identity.spaceId.slice(0, 12)} ` +
          `(${toErrorMessage(error)}); it is registered at a later start`,
      );
    });
  return { identity, resolution, otherSpaces, registration };
}
