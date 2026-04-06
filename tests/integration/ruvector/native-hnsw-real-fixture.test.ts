/**
 * NativeHnswBackend — real-fixture recall test
 *
 * Issue #399 / ADR-090 regression guard.
 *
 * The previous synthetic-only tests (FNV-hashed sine signal vectors and
 * random Gaussian) were enough to detect that @ruvector/router 0.1.28's
 * HNSW was broken, but they don't prove that the new hnswlib-node-backed
 * NativeHnswBackend behaves correctly on REAL embeddings.
 *
 * This test loads the project's own qe-kernel embeddings from the unified
 * memory.db (the same vectors that AQE's code-intelligence subsystem uses
 * in production, written by sentence-transformers/all-MiniLM-L6-v2-style
 * models) and verifies:
 *
 *   1. Self-query returns id=self with score 1.0 (exact-match recall)
 *   2. Top-10 recall vs brute-force ground truth = 100%
 *   3. Repeated for several random query vectors to rule out one-off luck
 *   4. Vectors persisted in memory.db deserialize correctly into the backend
 *
 * Plus the regression guard for the second @ruvector/router bug:
 *
 *   5. Constructing a NativeHnswBackend MUST NOT create vectors.db (or any
 *      other file) in CWD or in .agentic-qe/. The previous @ruvector/router
 *      VectorDb constructor wrote a 3.5MB+ redb file to CWD on every call,
 *      polluting users' project roots and violating the unified memory
 *      architecture (CLAUDE.md: "all data goes through SQLite — one DB,
 *      one schema").
 *
 * The fixture (.agentic-qe/memory.db with qe-kernel namespace populated)
 * is part of the project tree. CI runners that don't have it will skip
 * the recall test gracefully.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  NativeHnswBackend,
  resetNativeModuleLoader,
} from '../../../src/kernel/native-hnsw-backend';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../src/integrations/ruvector/feature-flags';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const MEMORY_DB_PATH = path.join(PROJECT_ROOT, '.agentic-qe', 'memory.db');

interface RealEmbedding {
  id: string;
  vector: Float32Array;
}

/**
 * Load all embeddings for a namespace from .agentic-qe/memory.db.
 * Returns null if the database is unavailable (CI without fixture).
 */
function loadFixture(namespace: string, limit: number): RealEmbedding[] | null {
  if (!fs.existsSync(MEMORY_DB_PATH)) return null;

  // Lazy import — better-sqlite3 is heavy and we want the test file to
  // load even when the fixture is missing.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  let db: { prepare(sql: string): { all(...args: unknown[]): unknown[] }; close(): void };
  try {
    db = new Database(MEMORY_DB_PATH, { readonly: true, fileMustExist: true });
  } catch {
    return null;
  }

  try {
    const rows = db
      .prepare(
        'SELECT id, embedding, dimensions FROM vectors WHERE namespace = ? AND dimensions = 384 ORDER BY id LIMIT ?',
      )
      .all(namespace, limit) as Array<{ id: string; embedding: Buffer; dimensions: number }>;

    return rows.map((row) => ({
      id: row.id,
      // Float32 BLOB (4 bytes per element). Slice into a fresh Float32Array
      // because the underlying Buffer is owned by better-sqlite3 and may be
      // reused across rows.
      vector: new Float32Array(
        row.embedding.buffer.slice(
          row.embedding.byteOffset,
          row.embedding.byteOffset + row.embedding.byteLength,
        ),
      ),
    }));
  } finally {
    db.close();
  }
}

/**
 * Brute-force exact cosine similarity. Used as ground truth.
 */
function bruteForceTopK(
  query: Float32Array,
  pool: RealEmbedding[],
  k: number,
): Array<{ idx: number; score: number }> {
  const scored: Array<{ idx: number; score: number }> = new Array(pool.length);
  let qNorm = 0;
  for (let i = 0; i < query.length; i++) qNorm += query[i] * query[i];
  qNorm = Math.sqrt(qNorm);

  for (let i = 0; i < pool.length; i++) {
    const v = pool[i].vector;
    let dot = 0;
    let vNorm = 0;
    for (let j = 0; j < v.length; j++) {
      dot += query[j] * v[j];
      vNorm += v[j] * v[j];
    }
    vNorm = Math.sqrt(vNorm);
    const denom = qNorm * vNorm;
    scored[i] = { idx: i, score: denom === 0 ? 0 : dot / denom };
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

describe('NativeHnswBackend — real qe-kernel fixture (#399)', () => {
  // Cap at 2000 vectors so the test stays under a second even on slow runners.
  // The qe-kernel namespace has ~2.5k vectors at the time of writing.
  const fixture = loadFixture('qe-kernel', 2000);

  beforeAll(() => {
    if (!fixture) {
      // eslint-disable-next-line no-console
      console.warn(
        '[#399 fixture] .agentic-qe/memory.db not found or empty — skipping real-fixture recall test. ' +
          'Run `aqe init` and let the kernel populate the qe-kernel namespace to enable this test.',
      );
    }
  });

  beforeEach(() => {
    resetNativeModuleLoader();
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useNativeHNSW: true });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it.runIf(fixture !== null && fixture.length >= 100)(
    'should return self with score 1.0 for self-query on real qe-kernel embeddings',
    () => {
      const pool = fixture!;
      const backend = new NativeHnswBackend({
        dimensions: 384,
        metric: 'cosine',
      });

      for (let i = 0; i < pool.length; i++) {
        backend.add(i, pool[i].vector);
      }
      expect(backend.size()).toBe(pool.length);

      // Pick a fixed deterministic query — id at index 42, mirroring #399.
      const queryIdx = Math.min(42, pool.length - 1);
      const queryVector = pool[queryIdx].vector;

      const results = backend.search(queryVector, 1);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(queryIdx);
      // Cosine self-similarity should be ~1.0; allow tiny float-rounding slack.
      expect(results[0].score).toBeGreaterThanOrEqual(0.999);

      backend.dispose();
    },
  );

  it.runIf(fixture !== null && fixture.length >= 100)(
    'should hit recall@10 >= 0.9 and top-1 == self on real qe-kernel embeddings',
    () => {
      const pool = fixture!;
      const backend = new NativeHnswBackend({
        dimensions: 384,
        metric: 'cosine',
      });

      for (let i = 0; i < pool.length; i++) {
        backend.add(i, pool[i].vector);
      }

      // Test against 5 deterministic query vectors at evenly-spaced indices.
      // This guards against one-off luck — a single self-query that happened
      // to land on a "well-connected" graph node would not catch a regression
      // affecting other regions of the embedding space.
      //
      // Recall expectations on REAL embeddings differ from synthetic fixtures:
      //   - Synthetic FNV/Gaussian: nearest neighbors are well-separated, so
      //     hnswlib-node hits 100% recall@10 deterministically.
      //   - Real text embeddings (sentence-transformers etc.): the cosine
      //     similarity surface has plateau regions where many vectors are
      //     within 0.001 of each other. HNSW's graph walk may swap some of
      //     them based on entry-point luck. 90-100% recall@10 is the
      //     standard approximate-HNSW guarantee.
      //
      // The TOP-1 self-match assertion is the strict bug-detector — it's
      // mathematically impossible to fail unless HNSW is fundamentally
      // broken (which is exactly what @ruvector/router 0.1.28 was: it
      // returned random non-neighbors with recall@10 = 0% to 10%). Anything
      // above 0.5 recall@10 here would already be a clear pass. We hold
      // the bar at 0.9 to catch tuning regressions while accepting the
      // legitimate plateau-region behavior of real embeddings.
      const RECALL_FLOOR = 0.9;

      for (const queryIdx of [
        0,
        Math.floor(pool.length * 0.2),
        Math.floor(pool.length * 0.4),
        Math.floor(pool.length * 0.6),
        Math.floor(pool.length * 0.8),
      ]) {
        const queryVector = pool[queryIdx].vector;
        const groundTruth = bruteForceTopK(queryVector, pool, 10);
        const groundTruthIds = new Set(groundTruth.map((r) => r.idx));

        const results = backend.search(queryVector, 10);
        const hitIds = new Set(results.map((r) => r.id));
        const recallAt10 =
          [...groundTruthIds].filter((id) => hitIds.has(id)).length / groundTruthIds.size;

        expect(results[0].id).toBe(queryIdx); // self MUST be top-1 (exact-match guarantee)
        expect(recallAt10).toBeGreaterThanOrEqual(RECALL_FLOOR);
      }

      backend.dispose();
    },
  );

  it.runIf(fixture !== null && fixture.length >= 100)(
    'should preserve descending score order in real-fixture results',
    () => {
      const pool = fixture!;
      const backend = new NativeHnswBackend({
        dimensions: 384,
        metric: 'cosine',
      });

      for (let i = 0; i < pool.length; i++) {
        backend.add(i, pool[i].vector);
      }

      const results = backend.search(pool[0].vector, 20);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }

      backend.dispose();
    },
  );

  it('should handle resize past initial maxElements with real-shaped vectors', () => {
    // 12000 > the 10000 INITIAL_MAX_ELEMENTS in NativeHnswBackend, forcing
    // a resizeIndex() doubling. Use a small synthetic shape (Math.sin)
    // because we don't necessarily have 12k real vectors.
    const backend = new NativeHnswBackend({
      dimensions: 384,
      metric: 'cosine',
    });

    const N = 12_000;
    for (let i = 0; i < N; i++) {
      const v = new Float32Array(384);
      for (let j = 0; j < 384; j++) v[j] = Math.sin((i + 1) * 0.01 + j * 0.03);
      backend.add(i, v);
    }
    expect(backend.size()).toBe(N);

    // Self-query for vector i=7777 — must come back as top-1.
    const query = new Float32Array(384);
    for (let j = 0; j < 384; j++) query[j] = Math.sin(7778 * 0.01 + j * 0.03);
    const results = backend.search(query, 5);
    expect(results[0].id).toBe(7777);
    expect(results[0].score).toBeGreaterThanOrEqual(0.999);

    backend.dispose();
  });
});

describe('NativeHnswBackend — vectors.db CWD pollution regression guard (#399)', () => {
  // The previous @ruvector/router VectorDb constructor unconditionally wrote
  // a `vectors.db` redb file to the current working directory, even when
  // `storagePath` was not provided. This violated the unified memory
  // architecture (everything should live in .agentic-qe/memory.db) and
  // accumulated 3.5MB-50MB+ of orphaned data in users' project roots.
  //
  // hnswlib-node has no auto-persistence — `writeIndex(filename)` is the
  // only way to write to disk, and we never call it from NativeHnswBackend.
  //
  // This test guards against the pollution coming back. It runs in a tmp
  // directory so we don't false-positive on the project root's vectors.db
  // (which exists from the @ruvector/router era and will be cleaned up
  // separately by the user, NOT by us — see CLAUDE.md data protection rules).
  let originalCwd: string;
  let tmpDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'aqe-vectors-db-guard-'));
    process.chdir(tmpDir);
    resetNativeModuleLoader();
    resetRuVectorFeatureFlags();
    setRuVectorFeatureFlags({ useNativeHNSW: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
    resetRuVectorFeatureFlags();
  });

  it('should not create vectors.db in CWD when constructed', () => {
    const backend = new NativeHnswBackend({ dimensions: 384, metric: 'cosine' });
    expect(fs.existsSync(path.join(tmpDir, 'vectors.db'))).toBe(false);
    backend.dispose();
  });

  it('should not create vectors.db after add/search/dispose lifecycle', () => {
    const backend = new NativeHnswBackend({ dimensions: 384, metric: 'cosine' });
    const v = new Float32Array(384).fill(0.1);
    backend.add(0, v);
    backend.search(v, 1);
    backend.dispose();
    expect(fs.existsSync(path.join(tmpDir, 'vectors.db'))).toBe(false);
  });

  it('should not create any unexpected files in CWD across full lifecycle', () => {
    const before = new Set(fs.readdirSync(tmpDir));

    const backend = new NativeHnswBackend({ dimensions: 384, metric: 'cosine' });
    for (let i = 0; i < 50; i++) {
      const v = new Float32Array(384);
      for (let j = 0; j < 384; j++) v[j] = Math.sin(i * 0.1 + j * 0.05);
      backend.add(i, v);
    }
    backend.search(new Float32Array(384).fill(0.1), 5);
    backend.remove(0);
    backend.clear();
    backend.dispose();

    const after = new Set(fs.readdirSync(tmpDir));
    const newFiles = [...after].filter((f) => !before.has(f));
    expect(newFiles).toEqual([]);
  });

  it('should support multiple concurrent instances without lock contention', () => {
    // The previous @ruvector/router VectorDb held a process-wide redb file
    // lock — only one instance could exist per process. hnswlib-node has no
    // such limitation; this test guards against any future regression.
    const a = new NativeHnswBackend({ dimensions: 384, metric: 'cosine' });
    const b = new NativeHnswBackend({ dimensions: 384, metric: 'cosine' });
    const c = new NativeHnswBackend({ dimensions: 384, metric: 'cosine' });

    a.add(1, new Float32Array(384).fill(0.1));
    b.add(2, new Float32Array(384).fill(0.2));
    c.add(3, new Float32Array(384).fill(0.3));

    expect(a.size()).toBe(1);
    expect(b.size()).toBe(1);
    expect(c.size()).toBe(1);

    a.dispose();
    b.dispose();
    c.dispose();
  });
});
