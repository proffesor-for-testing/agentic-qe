#!/usr/bin/env tsx
/**
 * AQE Baseline Performance Benchmark
 *
 * Measures current AQE performance characteristics for comparison
 * with an RVF-based implementation. Covers:
 *
 * 1. Cold start (DB open + HNSW init)
 * 2. Pattern insert throughput
 * 3. Vector search latency + recall
 * 4. KV read/write throughput
 * 5. Memory footprint
 * 6. File size
 *
 * Run: npx tsx scripts/benchmark-aqe-baseline.ts
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ── Config ──────────────────────────────────────────────────────────

const BENCH_DIR = path.join('/tmp', 'aqe-benchmark-' + Date.now());
const DB_PATH = path.join(BENCH_DIR, 'bench.db');
const DIMENSIONS = 384; // AQE default
const VECTOR_COUNTS = [100, 500, 1000, 5000];
const QUERY_COUNT = 100;
const KV_COUNT = 1000;
const SEARCH_K = 10;

// ── Helpers ─────────────────────────────────────────────────────────

function randomVector(dim: number): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = Math.random() * 2 - 1;
  return v;
}

function normalizeVector(v: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function bruteForceKNN(
  query: Float32Array,
  vectors: Float32Array[],
  k: number
): { id: number; similarity: number }[] {
  const scored = vectors.map((v, i) => ({ id: i, similarity: cosineSimilarity(query, v) }));
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k);
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function formatMs(ms: number): string {
  if (ms < 0.01) return `${(ms * 1000).toFixed(1)}µs`;
  if (ms < 1) return `${ms.toFixed(2)}ms`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ── SQLite Schema (mirrors AQE unified-memory) ─────────────────────

function createSchema(db: ReturnType<typeof Database>) {
  db.pragma('journal_mode = WAL');
  db.pragma('mmap_size = 268435456');
  db.pragma('cache_size = -64000');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      namespace TEXT DEFAULT 'default',
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now')),
      expires_at INTEGER,
      tags TEXT DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_kv_namespace ON kv_store(namespace);

    CREATE TABLE IF NOT EXISTS qe_patterns (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      embedding BLOB,
      confidence REAL DEFAULT 0.5,
      access_count INTEGER DEFAULT 0,
      tier TEXT DEFAULT 'short-term',
      metadata TEXT DEFAULT '{}',
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_patterns_domain ON qe_patterns(domain);
    CREATE INDEX IF NOT EXISTS idx_patterns_tier ON qe_patterns(tier);

    CREATE TABLE IF NOT EXISTS rl_q_values (
      state TEXT NOT NULL,
      action TEXT NOT NULL,
      q_value REAL NOT NULL DEFAULT 0.0,
      visit_count INTEGER DEFAULT 0,
      last_reward REAL DEFAULT 0.0,
      updated_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (state, action)
    );
  `);
}

// ── Benchmarks ──────────────────────────────────────────────────────

interface BenchmarkResult {
  name: string;
  value: number;
  unit: string;
  formatted: string;
  details?: string;
}

const results: BenchmarkResult[] = [];

function record(name: string, value: number, unit: string, details?: string) {
  const formatted = unit === 'ms' ? formatMs(value) :
                    unit === 'bytes' ? formatBytes(value) :
                    unit === 'MB' ? `${value.toFixed(1)}MB` :
                    unit === 'ops/s' ? `${Math.round(value).toLocaleString()} ops/s` :
                    unit === '%' ? `${value.toFixed(1)}%` :
                    `${value}`;
  results.push({ name, value, unit, formatted, details });
}

async function benchmarkColdStart() {
  console.log('\n── 1. Cold Start ──────────────────────────────────');

  // Measure DB open + schema creation
  const t0 = performance.now();
  const db = new Database(DB_PATH);
  createSchema(db);
  const t1 = performance.now();
  record('cold_start_db_open', t1 - t0, 'ms', 'DB open + schema + WAL + pragma');
  console.log(`  DB open + schema:    ${formatMs(t1 - t0)}`);

  // Measure HNSW init via @ruvector/gnn
  let hnswInitMs = 0;
  try {
    const { default: gnn } = await import('@ruvector/gnn');
    const { HNSWIndex: GNNIndex } = gnn as any;

    const t2 = performance.now();
    const idx = new GNNIndex({ dimension: DIMENSIONS, metric: 'cosine', M: 16 });
    await idx.initialize?.();
    const t3 = performance.now();
    hnswInitMs = t3 - t2;
    record('cold_start_hnsw_init', hnswInitMs, 'ms', '@ruvector/gnn HNSW init (empty)');
    console.log(`  HNSW init (empty):   ${formatMs(hnswInitMs)}`);
  } catch {
    // Fallback: hnswlib-node
    try {
      const hnswlib = await import('hnswlib-node');
      const { HierarchicalNSW } = hnswlib.default || hnswlib;

      const t2 = performance.now();
      const idx = new HierarchicalNSW('cosine', DIMENSIONS);
      idx.initIndex({ maxElements: 10000, m: 16, efConstruction: 200 });
      const t3 = performance.now();
      hnswInitMs = t3 - t2;
      record('cold_start_hnsw_init', hnswInitMs, 'ms', 'hnswlib-node HNSW init (empty)');
      console.log(`  HNSW init (empty):   ${formatMs(hnswInitMs)}`);
    } catch {
      console.log('  HNSW init: SKIPPED (no HNSW library available)');
    }
  }

  record('cold_start_total', (t1 - t0) + hnswInitMs, 'ms', 'Total cold start');
  console.log(`  Total cold start:    ${formatMs((t1 - t0) + hnswInitMs)}`);

  db.close();
}

async function benchmarkPatternInsert() {
  console.log('\n── 2. Pattern Insert Throughput ────────────────────');

  for (const count of VECTOR_COUNTS) {
    const db = new Database(DB_PATH);
    createSchema(db);

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO qe_patterns (id, domain, type, name, description, embedding, confidence, tier)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const vectors: Float32Array[] = [];
    const t0 = performance.now();

    const insertAll = db.transaction(() => {
      for (let i = 0; i < count; i++) {
        const vec = normalizeVector(randomVector(DIMENSIONS));
        vectors.push(vec);
        const embedding = Buffer.from(vec.buffer);
        insertStmt.run(
          `pattern-${i}`,
          'test-generation',
          'test-pattern',
          `Pattern ${i}`,
          `Test pattern ${i} for benchmarking`,
          embedding,
          Math.random(),
          i % 3 === 0 ? 'long-term' : 'short-term'
        );
      }
    });
    insertAll();

    const t1 = performance.now();
    const totalMs = t1 - t0;
    const opsPerSec = (count / totalMs) * 1000;

    record(`insert_${count}_total`, totalMs, 'ms');
    record(`insert_${count}_ops`, opsPerSec, 'ops/s');
    console.log(`  ${count} patterns:     ${formatMs(totalMs)} (${Math.round(opsPerSec).toLocaleString()} ops/s)`);

    // Measure file size
    const fileSize = fs.statSync(DB_PATH).size;
    record(`filesize_${count}_patterns`, fileSize, 'bytes');
    console.log(`  File size:           ${formatBytes(fileSize)}`);

    db.close();
    fs.unlinkSync(DB_PATH);
    // Remove WAL/SHM files too
    try { fs.unlinkSync(DB_PATH + '-wal'); } catch {}
    try { fs.unlinkSync(DB_PATH + '-shm'); } catch {}
  }
}

async function benchmarkVectorSearch() {
  console.log('\n── 3. Vector Search (Brute Force - SQLite BLOBs) ──');

  for (const count of VECTOR_COUNTS) {
    const db = new Database(DB_PATH);
    createSchema(db);

    // Insert vectors
    const vectors: Float32Array[] = [];
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO qe_patterns (id, domain, type, name, embedding, confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertAll = db.transaction(() => {
      for (let i = 0; i < count; i++) {
        const vec = normalizeVector(randomVector(DIMENSIONS));
        vectors.push(vec);
        insertStmt.run(`p-${i}`, 'test-gen', 'pattern', `P${i}`, Buffer.from(vec.buffer), Math.random());
      }
    });
    insertAll();

    // Benchmark: load all vectors from DB and brute-force search
    const queryVec = normalizeVector(randomVector(DIMENSIONS));
    const latencies: number[] = [];

    for (let q = 0; q < QUERY_COUNT; q++) {
      const qv = q === 0 ? queryVec : normalizeVector(randomVector(DIMENSIONS));

      const t0 = performance.now();

      // Load from DB (simulates AQE's in-memory vector scan)
      const rows = db.prepare('SELECT id, embedding FROM qe_patterns WHERE embedding IS NOT NULL').all() as any[];
      const scored: { id: string; sim: number }[] = [];
      for (const row of rows) {
        const stored = new Float32Array(new Uint8Array(row.embedding).buffer);
        scored.push({ id: row.id, sim: cosineSimilarity(qv, stored) });
      }
      scored.sort((a, b) => b.sim - a.sim);
      const _topK = scored.slice(0, SEARCH_K);

      const t1 = performance.now();
      latencies.push(t1 - t0);
    }

    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    const p99 = percentile(latencies, 99);

    record(`search_${count}_p50`, p50, 'ms', 'Brute force from SQLite BLOBs');
    record(`search_${count}_p95`, p95, 'ms');
    record(`search_${count}_p99`, p99, 'ms');
    console.log(`  ${count} vectors: p50=${formatMs(p50)}  p95=${formatMs(p95)}  p99=${formatMs(p99)}`);

    db.close();
    fs.unlinkSync(DB_PATH);
    try { fs.unlinkSync(DB_PATH + '-wal'); } catch {}
    try { fs.unlinkSync(DB_PATH + '-shm'); } catch {}
  }
}

async function benchmarkHNSWSearch() {
  console.log('\n── 4. Vector Search (HNSW - In-Memory) ────────────');

  let HNSWConstructor: any = null;

  // Try @ruvector/gnn first
  try {
    const gnn = await import('@ruvector/gnn');
    const mod = (gnn as any).default || gnn;
    if (mod.HNSWIndex) {
      HNSWConstructor = { type: 'gnn', ctor: mod.HNSWIndex };
    }
  } catch {}

  // Fallback to hnswlib-node
  if (!HNSWConstructor) {
    try {
      const hnswlib = await import('hnswlib-node');
      const mod = (hnswlib as any).default || hnswlib;
      HNSWConstructor = { type: 'hnswlib', ctor: mod.HierarchicalNSW };
    } catch {}
  }

  if (!HNSWConstructor) {
    console.log('  SKIPPED: No HNSW library available');
    return;
  }

  console.log(`  Using: ${HNSWConstructor.type}`);

  for (const count of VECTOR_COUNTS) {
    const vectors: Float32Array[] = [];
    for (let i = 0; i < count; i++) {
      vectors.push(normalizeVector(randomVector(DIMENSIONS)));
    }

    // Build HNSW index
    const t0 = performance.now();
    let index: any;

    if (HNSWConstructor.type === 'gnn') {
      index = new HNSWConstructor.ctor({ dimension: DIMENSIONS, metric: 'cosine', M: 16 });
      for (let i = 0; i < count; i++) {
        index.addPoint(Array.from(vectors[i]), i);
      }
    } else {
      index = new HNSWConstructor.ctor('cosine', DIMENSIONS);
      index.initIndex({ maxElements: count + 1000, m: 16, efConstruction: 200 });
      for (let i = 0; i < count; i++) {
        index.addPoint(Array.from(vectors[i]), i);
      }
    }

    const buildMs = performance.now() - t0;
    record(`hnsw_build_${count}`, buildMs, 'ms', `${HNSWConstructor.type} build time`);

    // Search
    const latencies: number[] = [];
    let totalRecall = 0;

    if (HNSWConstructor.type === 'hnswlib') {
      index.setEfSearch(100);
    }

    for (let q = 0; q < Math.min(QUERY_COUNT, count); q++) {
      const queryVec = normalizeVector(randomVector(DIMENSIONS));
      const queryArr = Array.from(queryVec);

      const t1 = performance.now();
      let hnswResults: number[];

      if (HNSWConstructor.type === 'gnn') {
        const res = index.searchKNN(queryArr, SEARCH_K);
        hnswResults = res.neighbors || res.ids || [];
      } else {
        const res = index.searchKnn(queryArr, SEARCH_K);
        hnswResults = Array.from(res.neighbors);
      }
      const t2 = performance.now();
      latencies.push(t2 - t1);

      // Compute recall vs brute force
      const bruteForce = bruteForceKNN(queryVec, vectors, SEARCH_K);
      const bfIds = new Set(bruteForce.map(r => r.id));
      const hits = hnswResults.filter(id => bfIds.has(id)).length;
      totalRecall += hits / SEARCH_K;
    }

    const searchCount = Math.min(QUERY_COUNT, count);
    const avgRecall = (totalRecall / searchCount) * 100;
    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);

    record(`hnsw_search_${count}_p50`, p50, 'ms');
    record(`hnsw_search_${count}_p95`, p95, 'ms');
    record(`hnsw_search_${count}_recall`, avgRecall, '%');

    console.log(`  ${count} vectors: build=${formatMs(buildMs)}  search p50=${formatMs(p50)}  p95=${formatMs(p95)}  recall@${SEARCH_K}=${avgRecall.toFixed(1)}%`);
  }
}

async function benchmarkKVOps() {
  console.log('\n── 5. KV Store Throughput ──────────────────────────');

  const db = new Database(DB_PATH);
  createSchema(db);

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO kv_store (key, value, namespace) VALUES (?, ?, ?)
  `);
  const getStmt = db.prepare('SELECT value FROM kv_store WHERE key = ? AND namespace = ?');

  // Write throughput
  const t0 = performance.now();
  const writeAll = db.transaction(() => {
    for (let i = 0; i < KV_COUNT; i++) {
      insertStmt.run(`key-${i}`, JSON.stringify({ data: `value-${i}`, ts: Date.now() }), 'bench');
    }
  });
  writeAll();
  const writeMs = performance.now() - t0;
  const writeOps = (KV_COUNT / writeMs) * 1000;

  record('kv_write_total', writeMs, 'ms', `${KV_COUNT} writes`);
  record('kv_write_ops', writeOps, 'ops/s');
  console.log(`  Write ${KV_COUNT}:     ${formatMs(writeMs)} (${Math.round(writeOps).toLocaleString()} ops/s)`);

  // Read throughput
  const t1 = performance.now();
  for (let i = 0; i < KV_COUNT; i++) {
    getStmt.get(`key-${i}`, 'bench');
  }
  const readMs = performance.now() - t1;
  const readOps = (KV_COUNT / readMs) * 1000;

  record('kv_read_total', readMs, 'ms', `${KV_COUNT} reads`);
  record('kv_read_ops', readOps, 'ops/s');
  console.log(`  Read ${KV_COUNT}:      ${formatMs(readMs)} (${Math.round(readOps).toLocaleString()} ops/s)`);

  // Random read
  const t2 = performance.now();
  for (let i = 0; i < KV_COUNT; i++) {
    const key = `key-${Math.floor(Math.random() * KV_COUNT)}`;
    getStmt.get(key, 'bench');
  }
  const randReadMs = performance.now() - t2;
  const randReadOps = (KV_COUNT / randReadMs) * 1000;

  record('kv_random_read_total', randReadMs, 'ms', `${KV_COUNT} random reads`);
  record('kv_random_read_ops', randReadOps, 'ops/s');
  console.log(`  Random read ${KV_COUNT}: ${formatMs(randReadMs)} (${Math.round(randReadOps).toLocaleString()} ops/s)`);

  db.close();
  fs.unlinkSync(DB_PATH);
  try { fs.unlinkSync(DB_PATH + '-wal'); } catch {}
  try { fs.unlinkSync(DB_PATH + '-shm'); } catch {}
}

async function benchmarkMemoryFootprint() {
  console.log('\n── 6. Memory Footprint ────────────────────────────');

  const baseline = process.memoryUsage();

  // Load vectors into memory (simulating HNSW index rebuild)
  const vectors: Float32Array[] = [];
  for (let i = 0; i < 5000; i++) {
    vectors.push(normalizeVector(randomVector(DIMENSIONS)));
  }

  const afterVectors = process.memoryUsage();
  const vectorMB = (afterVectors.heapUsed - baseline.heapUsed) / (1024 * 1024);
  record('memory_5000_vectors', vectorMB, 'MB', `5000 × ${DIMENSIONS}-dim Float32Array in memory`);
  console.log(`  5000 vectors:        ${vectorMB.toFixed(1)}MB heap`);
  console.log(`  Per vector:          ${((vectorMB * 1024 * 1024) / 5000).toFixed(0)} bytes`);
  console.log(`  Theoretical:         ${(5000 * DIMENSIONS * 4 / (1024 * 1024)).toFixed(1)}MB raw`);
}

async function benchmarkQValueOps() {
  console.log('\n── 7. Q-Value Operations ──────────────────────────');

  const db = new Database(DB_PATH);
  createSchema(db);

  const upsertStmt = db.prepare(`
    INSERT INTO rl_q_values (state, action, q_value, visit_count, last_reward)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(state, action) DO UPDATE SET
      q_value = excluded.q_value,
      visit_count = visit_count + 1,
      last_reward = excluded.last_reward,
      updated_at = strftime('%s','now')
  `);

  const lookupStmt = db.prepare(`
    SELECT action, q_value FROM rl_q_values
    WHERE state = ?
    ORDER BY q_value DESC
    LIMIT 5
  `);

  // Write Q-values
  const states = 100;
  const actionsPerState = 10;
  const t0 = performance.now();
  const writeAll = db.transaction(() => {
    for (let s = 0; s < states; s++) {
      for (let a = 0; a < actionsPerState; a++) {
        upsertStmt.run(`state-${s}`, `action-${a}`, Math.random(), 1, Math.random());
      }
    }
  });
  writeAll();
  const writeMs = performance.now() - t0;
  console.log(`  Write ${states * actionsPerState} Q-values: ${formatMs(writeMs)}`);
  record('qvalue_write_1000', writeMs, 'ms');

  // Lookup best actions
  const lookupLatencies: number[] = [];
  for (let q = 0; q < 200; q++) {
    const state = `state-${Math.floor(Math.random() * states)}`;
    const t1 = performance.now();
    lookupStmt.all(state);
    lookupLatencies.push(performance.now() - t1);
  }

  const p50 = percentile(lookupLatencies, 50);
  const p95 = percentile(lookupLatencies, 95);
  record('qvalue_lookup_p50', p50, 'ms');
  record('qvalue_lookup_p95', p95, 'ms');
  console.log(`  Lookup best action: p50=${formatMs(p50)}  p95=${formatMs(p95)}`);

  db.close();
  fs.unlinkSync(DB_PATH);
  try { fs.unlinkSync(DB_PATH + '-wal'); } catch {}
  try { fs.unlinkSync(DB_PATH + '-shm'); } catch {}
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         AQE Baseline Performance Benchmark               ║');
  console.log('║         Dimensions: 384  |  Metric: cosine               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  console.log(`\n  Platform:    ${process.platform} ${process.arch}`);
  console.log(`  Node:        ${process.version}`);
  console.log(`  Bench dir:   ${BENCH_DIR}`);
  console.log(`  Timestamp:   ${new Date().toISOString()}`);

  fs.mkdirSync(BENCH_DIR, { recursive: true });

  await benchmarkColdStart();
  await benchmarkPatternInsert();
  await benchmarkVectorSearch();
  await benchmarkHNSWSearch();
  await benchmarkKVOps();
  await benchmarkMemoryFootprint();
  await benchmarkQValueOps();

  // ── Summary table ──
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    SUMMARY TABLE                         ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log('║  Metric                          │  Value                ║');
  console.log('╟──────────────────────────────────┼───────────────────────╢');
  for (const r of results) {
    const name = r.name.padEnd(32).slice(0, 32);
    const val = r.formatted.padStart(21).slice(-21);
    console.log(`║  ${name}  │  ${val}  ║`);
  }
  console.log('╚══════════════════════════════════╧═══════════════════════╝');

  // Write JSON results
  const jsonPath = path.join(BENCH_DIR, 'results.json');
  fs.writeFileSync(jsonPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    platform: `${process.platform} ${process.arch}`,
    node: process.version,
    dimensions: DIMENSIONS,
    results,
  }, null, 2));
  console.log(`\n  Results saved to: ${jsonPath}`);

  // Cleanup
  try {
    fs.rmSync(BENCH_DIR, { recursive: true });
  } catch {}
}

main().catch(console.error);
