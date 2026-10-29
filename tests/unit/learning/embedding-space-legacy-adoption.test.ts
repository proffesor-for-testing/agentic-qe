/**
 * #1302: the first start after upgrading is already noisy. A space id minted
 * before the registry has stored vectors but no reference canary; it is
 * adopted when the active embedder reproduces its stored experience vectors.
 *
 * Fixture databases only (temp dir); never a real memory.db.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EMBEDDING_SPACE_CANARY,
  deriveEmbeddingSpaceIdentity,
  fingerprintEmbeddingRuntime,
  type EmbeddingSpaceIdentity,
} from '../../../src/learning/embedding-space.js';
import {
  loadRegisteredSpaces,
  resolveEmbeddingSpace,
  resolveEmbeddingSpaceAdoptingLegacy,
  type LegacySpaceAdopter,
} from '../../../src/learning/embedding-space-registry.js';
import {
  LEGACY_ADOPTION_MAX_SPACES,
  LEGACY_ADOPTION_ROWS_PER_SPACE,
  findAdoptableLegacySpace,
} from '../../../src/learning/embedding-space-legacy-adoption.js';
import { normalize } from '../../../src/shared/utils/vector-math.js';

function seededVector(seedText: string, dim = 384): number[] {
  let seed = 0;
  for (let i = 0; i < seedText.length; i++) seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0;
  const v: number[] = [];
  for (let i = 0; i < dim; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    v.push((seed >>> 16) / 32768 - 1);
  }
  return normalize(v);
}

/** The same model on other hardware: 1e-4 per component, renormalized. */
function withNoise(v: number[], amount = 1e-4): number[] {
  return normalize(v.map((x, i) => x + (i % 2 === 0 ? amount : -amount)));
}

type Model = (text: string) => number[];
const modelA: Model = (text) => seededVector(`a:${text}`);
const modelANoisy: Model = (text) => withNoise(modelA(text));
const modelB: Model = (text) => seededVector(`b:${text}`);

function spaceFor(model: Model): EmbeddingSpaceIdentity {
  return deriveEmbeddingSpaceIdentity({
    provider: 'openai-compatible-endpoint',
    model: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
    pooling: 'mean',
    normalized: true,
    preprocessingVersion: 'aqe-text-v1',
    implementation: 'http://127.0.0.1:8080',
    runtimeFingerprint: fingerprintEmbeddingRuntime(model(EMBEDDING_SPACE_CANARY)),
  });
}

function blob(v: number[]): Buffer {
  return Buffer.from(new Float32Array(v).buffer);
}

/** A memory.db-shaped fixture: kv_store as UnifiedMemory creates it, captured_experiences as its writers do. */
function createFixture(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE kv_store (
      key TEXT NOT NULL,
      namespace TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      PRIMARY KEY (namespace, key)
    );
    CREATE TABLE captured_experiences (
      id TEXT PRIMARY KEY,
      task TEXT NOT NULL,
      agent TEXT NOT NULL,
      domain TEXT NOT NULL DEFAULT '',
      steps_json TEXT,
      source TEXT DEFAULT 'middleware',
      embedding BLOB,
      embedding_dimension INTEGER,
      embedding_space_id TEXT
    );
  `);
  return db;
}

/** A row as experience capture writes it: the vector of `${domain}: ${task}`. */
function insertExperience(db: Database.Database, id: string, model: Model, spaceId: string | null, task = `task ${id}`): void {
  db.prepare(`
    INSERT INTO captured_experiences (id, task, agent, domain, embedding, embedding_dimension, embedding_space_id)
    VALUES (?, ?, 'qe-test-architect', 'test-generation', ?, 384, ?)
  `).run(id, task, blob(model(`test-generation: ${task}`)), spaceId);
}

function counting(model: Model): { embed: (text: string) => Promise<number[]>; calls: () => number } {
  let calls = 0;
  return {
    embed: async (text) => {
      calls++;
      return model(text);
    },
    calls: () => calls,
  };
}

function adopterFor(db: Database.Database, embed: (text: string) => Promise<number[]>): LegacySpaceAdopter {
  return async (derived, registered) => (await findAdoptableLegacySpace(db, derived, registered, embed)).spaceId;
}

function snapshot(db: Database.Database) {
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return {
    counts: { captured_experiences: count('captured_experiences'), kv_store: count('kv_store') },
    experiences: db.prepare('SELECT id, embedding, embedding_space_id FROM captured_experiences ORDER BY id').all(),
    kvOther: db.prepare(`SELECT key, namespace, value FROM kv_store WHERE key NOT LIKE 'embedding_space:%' ORDER BY key`).all(),
  };
}

describe('embedding-space legacy adoption (#1302)', () => {
  let dir: string;
  let dbPath: string;
  let db: Database.Database;
  const legacy = spaceFor(modelA);
  const noisyCanary = modelANoisy(EMBEDDING_SPACE_CANARY);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aqe-1302-'));
    dbPath = join(dir, 'memory.db');
    db = createFixture(dbPath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('premise: without adoption, a noisy first start after the upgrade mints a new id', async () => {
    insertExperience(db, 'e1', modelA, legacy.spaceId);
    const resolved = resolveEmbeddingSpace(db, spaceFor(modelANoisy), EMBEDDING_SPACE_CANARY, noisyCanary);
    await resolved.registration;
    expect(spaceFor(modelANoisy).spaceId).not.toBe(legacy.spaceId);
    expect(resolved.resolution).toBe('registered');
    expect(resolved.identity.spaceId).not.toBe(legacy.spaceId);
  });

  it('a noisy first start adopts the legacy id and registers the current canary as its reference; stored rows are untouched', async () => {
    for (const id of ['e1', 'e2', 'e3']) insertExperience(db, id, modelA, legacy.spaceId);
    insertExperience(db, 'e0', modelB, null); // unattributed: never a candidate
    db.pragma('wal_checkpoint(TRUNCATE)');
    const backup = `${dbPath}.bak-${Date.now()}`;
    copyFileSync(dbPath, backup);
    const before = snapshot(db);
    const embedder = counting(modelANoisy);

    const resolved = await resolveEmbeddingSpaceAdoptingLegacy(
      db, spaceFor(modelANoisy), EMBEDDING_SPACE_CANARY, noisyCanary, adopterFor(db, embedder.embed),
    );
    await resolved.registration;

    expect(resolved.resolution).toBe('adopted-legacy');
    expect(resolved.identity.spaceId).toBe(legacy.spaceId);
    expect(resolved.identity.runtimeFingerprint).toBe(spaceFor(modelANoisy).runtimeFingerprint);
    const [entry] = loadRegisteredSpaces(db);
    expect(entry.identity.spaceId).toBe(legacy.spaceId);
    expect(entry.canary).toEqual(noisyCanary);

    const after = snapshot(db);
    expect(after.counts).toEqual({ ...before.counts, kv_store: before.counts.kv_store + 1 });
    expect(after.experiences).toEqual(before.experiences);
    expect(after.kvOther).toEqual(before.kvOther);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    const original = new Database(backup, { readonly: true });
    try {
      expect(snapshot(original)).toEqual(before);
    } finally {
      original.close();
    }
  });

  it('runs the bounded embedding once: the next start resolves from the registry without embedding', async () => {
    insertExperience(db, 'e1', modelA, legacy.spaceId);
    const first = counting(modelANoisy);
    await (await resolveEmbeddingSpaceAdoptingLegacy(
      db, spaceFor(modelANoisy), EMBEDDING_SPACE_CANARY, noisyCanary, adopterFor(db, first.embed),
    )).registration;
    expect(first.calls()).toBeGreaterThan(0);

    const otherNoise: Model = (text) => withNoise(modelA(text), -1e-4);
    const second = counting(otherNoise);
    const restarted = await resolveEmbeddingSpaceAdoptingLegacy(
      db, spaceFor(otherNoise), EMBEDDING_SPACE_CANARY, otherNoise(EMBEDDING_SPACE_CANARY), adopterFor(db, second.embed),
    );

    expect(restarted.resolution).toBe('matched-cosine');
    expect(restarted.identity.spaceId).toBe(legacy.spaceId);
    expect(second.calls()).toBe(0);
  });

  it('another model reproduces none of the stored vectors: nothing is adopted and the derived space is registered', async () => {
    for (const id of ['e1', 'e2']) insertExperience(db, id, modelA, legacy.spaceId);
    const adoption = await findAdoptableLegacySpace(db, spaceFor(modelB), [], counting(modelB).embed);
    expect(adoption.spaceId).toBeNull();
    expect(adoption.reason).toMatch(/none of 2 re-embedded experiences from 1 legacy space id\(s\) reached cosine 0\.999/);

    const resolved = await resolveEmbeddingSpaceAdoptingLegacy(
      db, spaceFor(modelB), EMBEDDING_SPACE_CANARY, modelB(EMBEDDING_SPACE_CANARY), adopterFor(db, counting(modelB).embed),
    );
    await resolved.registration;
    expect(resolved.resolution).toBe('registered');
    expect(resolved.identity.spaceId).toBe(spaceFor(modelB).spaceId);
  });

  it('with no stored rows nothing is embedded and the reason says so', async () => {
    const embedder = counting(modelANoisy);
    const adoption = await findAdoptableLegacySpace(db, spaceFor(modelANoisy), [], embedder.embed);
    expect(adoption).toMatchObject({ spaceId: null, embeds: 0 });
    expect(adoption.reason).toMatch(/no stored experience vectors under an unregistered space id/);
    expect(embedder.calls()).toBe(0);
  });

  it('without a captured_experiences table nothing is adopted and the reason says so', async () => {
    db.exec('DROP TABLE captured_experiences');
    const adoption = await findAdoptableLegacySpace(db, spaceFor(modelANoisy), [], counting(modelANoisy).embed);
    expect(adoption.spaceId).toBeNull();
    expect(adoption.reason).toMatch(/could not be read.*no such table: captured_experiences/);
  });

  it('when the embedder fails nothing is adopted, the reason says why, and the derived space is used as before', async () => {
    insertExperience(db, 'e1', modelA, legacy.spaceId);
    const failing = async () => {
      throw new Error('endpoint 503');
    };
    const adoption = await findAdoptableLegacySpace(db, spaceFor(modelANoisy), [], failing);
    expect(adoption.spaceId).toBeNull();
    expect(adoption.reason).toMatch(/embedder failed .*endpoint 503/);

    const resolved = await resolveEmbeddingSpaceAdoptingLegacy(
      db, spaceFor(modelANoisy), EMBEDDING_SPACE_CANARY, noisyCanary, adopterFor(db, failing),
    );
    expect(resolved.resolution).toBe('registered');
    expect(resolved.identity.spaceId).toBe(spaceFor(modelANoisy).spaceId);
  });

  it('an adopter that throws is logged and the derived space is registered', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const resolved = await resolveEmbeddingSpaceAdoptingLegacy(
      db, spaceFor(modelANoisy), EMBEDDING_SPACE_CANARY, noisyCanary, async () => {
        throw new Error('boom');
      },
    );
    expect(resolved.resolution).toBe('registered');
    expect(warn.mock.calls.some((c) => /legacy space check failed \(boom\)/.test(String(c[0])))).toBe(true);
  });

  it('a registry match never runs the legacy check', async () => {
    await resolveEmbeddingSpace(db, spaceFor(modelA), EMBEDDING_SPACE_CANARY, modelA(EMBEDDING_SPACE_CANARY)).registration;
    const adopter = vi.fn<LegacySpaceAdopter>(async () => null);
    const resolved = await resolveEmbeddingSpaceAdoptingLegacy(
      db, spaceFor(modelANoisy), EMBEDDING_SPACE_CANARY, noisyCanary, adopter,
    );
    expect(resolved.resolution).toBe('matched-cosine');
    expect(adopter).not.toHaveBeenCalled();
  });

  it('registered ids and the derived id are not legacy candidates', async () => {
    const registeredSpace = spaceFor(modelB);
    await resolveEmbeddingSpace(db, registeredSpace, EMBEDDING_SPACE_CANARY, modelB(EMBEDDING_SPACE_CANARY)).registration;
    insertExperience(db, 'e1', modelANoisy, registeredSpace.spaceId);
    insertExperience(db, 'e2', modelANoisy, spaceFor(modelANoisy).spaceId);
    const embedder = counting(modelANoisy);
    const adoption = await findAdoptableLegacySpace(db, spaceFor(modelANoisy), loadRegisteredSpaces(db), embedder.embed);
    expect(adoption.spaceId).toBeNull();
    expect(embedder.calls()).toBe(0);
  });

  it('when several legacy ids match, the one with the most reproduced rows wins and the others are named', async () => {
    const splitId = 'f'.repeat(64); // an id split off by an earlier noisy restart (item 2, not merged here)
    for (const id of ['a1', 'a2', 'a3']) insertExperience(db, id, modelA, legacy.spaceId);
    insertExperience(db, 's1', modelA, splitId);
    insertExperience(db, 's2', modelB, splitId);
    const adoption = await findAdoptableLegacySpace(db, spaceFor(modelANoisy), [], counting(modelANoisy).embed);
    expect(adoption.spaceId).toBe(legacy.spaceId);
    expect(adoption.reason).toMatch(new RegExp(`^${legacy.spaceId.slice(0, 12)} \\(3/3 rows.*also matching: ffffffffffff \\(1/2 rows`));
  });

  it('is bounded: at most LEGACY_ADOPTION_ROWS_PER_SPACE rows of at most LEGACY_ADOPTION_MAX_SPACES ids are re-embedded', async () => {
    for (let s = 0; s < LEGACY_ADOPTION_MAX_SPACES + 2; s++) {
      const spaceId = String(s).repeat(64);
      for (let r = 0; r < LEGACY_ADOPTION_ROWS_PER_SPACE + 10; r++) insertExperience(db, `s${s}-r${r}`, modelB, spaceId);
    }
    const embedder = counting(modelANoisy);
    const adoption = await findAdoptableLegacySpace(db, spaceFor(modelANoisy), [], embedder.embed);
    expect(adoption.spaceId).toBeNull();
    expect(adoption.checks).toHaveLength(LEGACY_ADOPTION_MAX_SPACES);
    expect(adoption.checks.every((c) => c.checked === LEGACY_ADOPTION_ROWS_PER_SPACE)).toBe(true);
    // Middleware rows have up to two candidate texts (raw and scrubbed, deduplicated).
    expect(embedder.calls()).toBeLessThanOrEqual(LEGACY_ADOPTION_MAX_SPACES * LEGACY_ADOPTION_ROWS_PER_SPACE * 2);
  });
});
