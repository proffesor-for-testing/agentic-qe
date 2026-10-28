/**
 * #1298: the same model restarted with float noise keeps its embedding space.
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
  matchRegisteredSpace,
  registerEmbeddingSpace,
  resolveEmbeddingSpace,
} from '../../../src/learning/embedding-space-registry.js';
import {
  registerWriteQueue,
  unregisterWriteQueue,
} from '../../../src/shared/sqlite-write-queue.js';
import { cosineSimilarity, normalize } from '../../../src/shared/utils/vector-math.js';

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

const MODEL_A = seededVector('model-a');
const MODEL_B = seededVector('model-b');

function spaceFor(canary: number[], overrides: Partial<EmbeddingSpaceIdentity> = {}): EmbeddingSpaceIdentity {
  return deriveEmbeddingSpaceIdentity({
    provider: 'openai-compatible-endpoint',
    model: 'Xenova/all-MiniLM-L6-v2',
    dimensions: canary.length,
    pooling: 'mean',
    normalized: true,
    preprocessingVersion: 'aqe-text-v1',
    implementation: 'http://127.0.0.1:8080',
    runtimeFingerprint: fingerprintEmbeddingRuntime(canary),
    ...overrides,
  });
}

/** A memory.db-shaped fixture: kv_store as UnifiedMemory creates it, plus vector rows. */
function createFixture(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT NOT NULL,
      namespace TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      PRIMARY KEY (namespace, key)
    );
    CREATE TABLE captured_experiences (
      id TEXT PRIMARY KEY, task TEXT, embedding BLOB, embedding_dimension INTEGER, embedding_space_id TEXT
    );
    CREATE TABLE qe_pattern_embeddings (
      pattern_id TEXT PRIMARY KEY, embedding BLOB NOT NULL, dimension INTEGER NOT NULL, model TEXT, space_id TEXT
    );
  `);
  return db;
}

function blob(v: number[]): Buffer {
  return Buffer.from(new Float32Array(v).buffer);
}

interface Snapshot {
  counts: Record<string, number>;
  experiences: unknown[];
  patterns: unknown[];
  kvOther: unknown[];
}

function snapshot(db: Database.Database): Snapshot {
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return {
    counts: {
      captured_experiences: count('captured_experiences'),
      qe_pattern_embeddings: count('qe_pattern_embeddings'),
      kv_store: count('kv_store'),
    },
    experiences: db.prepare('SELECT id, embedding, embedding_space_id FROM captured_experiences ORDER BY id').all(),
    patterns: db.prepare('SELECT pattern_id, embedding, space_id FROM qe_pattern_embeddings ORDER BY pattern_id').all(),
    kvOther: db.prepare(`SELECT key, namespace, value FROM kv_store WHERE key NOT LIKE 'embedding_space:%' ORDER BY key`).all(),
  };
}

describe('embedding-space registry (#1298)', () => {
  let dir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aqe-1298-'));
    dbPath = join(dir, 'memory.db');
    db = createFixture(dbPath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('premise: 1e-4 noise changes the fingerprint and space id but keeps cosine above 0.999', () => {
    const noisy = withNoise(MODEL_A);
    expect(fingerprintEmbeddingRuntime(noisy)).not.toBe(fingerprintEmbeddingRuntime(MODEL_A));
    expect(spaceFor(noisy).spaceId).not.toBe(spaceFor(MODEL_A).spaceId);
    expect(cosineSimilarity(MODEL_A, noisy)).toBeGreaterThan(0.999);
    expect(cosineSimilarity(MODEL_A, MODEL_B)).toBeLessThan(0.5);
  });

  it('a restart of the same model with float noise resolves to the registered space', async () => {
    const first = resolveEmbeddingSpace(db, spaceFor(MODEL_A), EMBEDDING_SPACE_CANARY, MODEL_A);
    await first.registration;
    expect(first.resolution).toBe('registered');

    const noisy = withNoise(MODEL_A);
    const restarted = resolveEmbeddingSpace(db, spaceFor(noisy), EMBEDDING_SPACE_CANARY, noisy);

    expect(restarted.resolution).toBe('matched-cosine');
    expect(restarted.identity).toEqual(first.identity);
    expect(restarted.identity.spaceId).toBe(spaceFor(MODEL_A).spaceId);
  });

  it('noise is always measured against the first reference, so drift cannot walk a space away', async () => {
    await resolveEmbeddingSpace(db, spaceFor(MODEL_A), EMBEDDING_SPACE_CANARY, MODEL_A).registration;
    const drift = withNoise(MODEL_A, 1e-4);
    await resolveEmbeddingSpace(db, spaceFor(drift), EMBEDDING_SPACE_CANARY, drift).registration;

    expect(loadRegisteredSpaces(db)).toHaveLength(1);
    expect(loadRegisteredSpaces(db)[0].canary).toEqual(MODEL_A);
  });

  it('an exact fingerprint resolves without a new entry', async () => {
    await resolveEmbeddingSpace(db, spaceFor(MODEL_A), EMBEDDING_SPACE_CANARY, MODEL_A).registration;

    const again = resolveEmbeddingSpace(db, spaceFor(MODEL_A), EMBEDDING_SPACE_CANARY, MODEL_A);

    expect(again.resolution).toBe('matched-exact');
    expect(loadRegisteredSpaces(db)).toHaveLength(1);
  });

  it('a different model of the same dimension gets its own space', async () => {
    await resolveEmbeddingSpace(db, spaceFor(MODEL_A), EMBEDDING_SPACE_CANARY, MODEL_A).registration;

    const other = resolveEmbeddingSpace(db, spaceFor(MODEL_B), EMBEDDING_SPACE_CANARY, MODEL_B);
    await other.registration;

    expect(other.resolution).toBe('registered');
    expect(other.identity.spaceId).toBe(spaceFor(MODEL_B).spaceId);
    expect(other.otherSpaces).toBe(1);
    expect(loadRegisteredSpaces(db)).toHaveLength(2);
  });

  it('only spaces of the same configuration and canary text are candidates', async () => {
    await resolveEmbeddingSpace(db, spaceFor(MODEL_A), EMBEDDING_SPACE_CANARY, MODEL_A).registration;
    const noisy = withNoise(MODEL_A);

    const otherHost = spaceFor(noisy, { implementation: 'http://10.0.0.2:8080' });
    const otherCanary = 'some other canary';

    expect(matchRegisteredSpace(otherHost, EMBEDDING_SPACE_CANARY, noisy, loadRegisteredSpaces(db))).toBeNull();
    expect(matchRegisteredSpace(spaceFor(noisy), otherCanary, noisy, loadRegisteredSpaces(db))).toBeNull();
  });

  it('the closest of several matching spaces wins', () => {
    const near = withNoise(MODEL_A, 2e-5);
    const far = withNoise(MODEL_A, 4e-4);
    const entries = [
      { identity: spaceFor(far), canaryText: EMBEDDING_SPACE_CANARY, canary: far },
      { identity: spaceFor(near), canaryText: EMBEDDING_SPACE_CANARY, canary: near },
    ];

    const match = matchRegisteredSpace(spaceFor(withNoise(MODEL_A, 1e-4)), EMBEDDING_SPACE_CANARY, withNoise(MODEL_A, 1e-4), entries);

    expect(match?.entry.identity.spaceId).toBe(spaceFor(near).spaceId);
  });

  it('malformed registry entries are skipped', () => {
    const insert = db.prepare('INSERT INTO kv_store (key, namespace, value) VALUES (?, ?, ?)');
    insert.run('embedding_space:bad-json', '_system', '{');
    insert.run('embedding_space:short', '_system', JSON.stringify({
      version: 1, identity: spaceFor(MODEL_A), canaryText: EMBEDDING_SPACE_CANARY, canary: [1, 2],
    }));

    expect(loadRegisteredSpaces(db)).toEqual([]);
  });

  it('never replaces an existing entry', async () => {
    const identity = spaceFor(MODEL_A);
    await registerEmbeddingSpace(db, { identity, canaryText: EMBEDDING_SPACE_CANARY, canary: MODEL_A });
    await registerEmbeddingSpace(db, { identity, canaryText: EMBEDDING_SPACE_CANARY, canary: MODEL_B });

    expect(loadRegisteredSpaces(db)[0].canary).toEqual(MODEL_A);
  });

  it('without a database, the derived space is used as before', () => {
    const derived = spaceFor(MODEL_A);
    const resolved = resolveEmbeddingSpace(null, derived, EMBEDDING_SPACE_CANARY, MODEL_A);
    expect(resolved).toMatchObject({ identity: derived, resolution: 'unavailable' });
  });

  it('a registry that cannot be read falls back to the derived space and logs it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { prepare: () => { throw new Error('SQLITE_BUSY: database is locked'); } };
    const derived = spaceFor(MODEL_A);

    const resolved = resolveEmbeddingSpace(broken, derived, EMBEDDING_SPACE_CANARY, MODEL_A);

    expect(resolved).toMatchObject({ identity: derived, resolution: 'unavailable' });
    expect(String(warn.mock.calls[0][0])).toMatch(/could not read registered embedding spaces.*SQLITE_BUSY/);
  });

  it('a failed registration write is logged, never thrown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const readOnly = {
      prepare: (sql: string) => {
        if (sql.startsWith('INSERT')) throw new Error('SQLITE_BUSY: database is locked');
        return db.prepare(sql);
      },
    };

    const resolved = resolveEmbeddingSpace(readOnly, spaceFor(MODEL_A), EMBEDDING_SPACE_CANARY, MODEL_A);
    await resolved.registration;

    expect(resolved.resolution).toBe('registered');
    expect(String(warn.mock.calls[0][0])).toMatch(/could not register embedding space/);
  });

  it('registration goes through the connection write queue (#1283), so resolving never waits on a lock', async () => {
    let release!: () => void;
    const queued: Array<() => unknown> = [];
    const gate = new Promise<void>((r) => (release = r));
    registerWriteQueue(db, async (fn) => {
      queued.push(fn);
      await gate;
      return fn();
    });
    try {
      const resolved = resolveEmbeddingSpace(db, spaceFor(MODEL_A), EMBEDDING_SPACE_CANARY, MODEL_A);
      await new Promise((r) => setImmediate(r));

      expect(resolved.resolution).toBe('registered');
      expect(queued).toHaveLength(1);
      expect(loadRegisteredSpaces(db)).toHaveLength(0);
      release();
      await resolved.registration;
      expect(loadRegisteredSpaces(db)).toHaveLength(1);
    } finally {
      unregisterWriteQueue(db);
    }
  });

  it('upgrade: a database whose space id came from the exact fingerprint is seeded, then survives noise; stored data is untouched', async () => {
    // A pre-#1298 database: vectors stamped with the exact-hash space id, no registry.
    const legacy = spaceFor(MODEL_A);
    db.prepare('INSERT INTO captured_experiences VALUES (?, ?, ?, ?, ?)').run('e1', 'flaky login', blob(MODEL_A), 384, legacy.spaceId);
    db.prepare('INSERT INTO captured_experiences VALUES (?, ?, ?, ?, ?)').run('e2', 'slow suite', blob(MODEL_B), 384, legacy.spaceId);
    db.prepare('INSERT INTO qe_pattern_embeddings VALUES (?, ?, ?, ?, ?)').run('p1', blob(MODEL_A), 384, 'm', legacy.spaceId);
    db.prepare('INSERT INTO kv_store (key, namespace, value) VALUES (?, ?, ?)').run(
      'embedder_identity:http://127.0.0.1:8080', '_system', JSON.stringify({ fingerprint: legacy.runtimeFingerprint, dim: 384 }),
    );
    db.pragma('wal_checkpoint(TRUNCATE)');
    const backup = `${dbPath}.bak-${Date.now()}`;
    copyFileSync(dbPath, backup);
    const before = snapshot(db);

    // First start after the upgrade answers with the exact fingerprint: seeds.
    const seeded = resolveEmbeddingSpace(db, spaceFor(MODEL_A), EMBEDDING_SPACE_CANARY, MODEL_A);
    await seeded.registration;
    // Next start is noisy: still the stored id.
    const noisy = withNoise(MODEL_A);
    const restarted = resolveEmbeddingSpace(db, spaceFor(noisy), EMBEDDING_SPACE_CANARY, noisy);

    expect(seeded.identity.spaceId).toBe(legacy.spaceId);
    expect(restarted.identity.spaceId).toBe(legacy.spaceId);

    const after = snapshot(db);
    expect(after.counts).toEqual({ ...before.counts, kv_store: before.counts.kv_store + 1 });
    expect(after.experiences).toEqual(before.experiences);
    expect(after.patterns).toEqual(before.patterns);
    expect(after.kvOther).toEqual(before.kvOther);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');

    const original = new Database(backup, { readonly: true });
    try {
      expect(snapshot(original)).toEqual(before);
    } finally {
      original.close();
    }
  });
});
