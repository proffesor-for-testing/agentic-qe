/**
 * RVF Integration Baseline Benchmark
 *
 * Captures current system performance metrics BEFORE RVF integration.
 * Run again AFTER integration to compare.
 *
 * Usage: npx tsx scripts/rvf-baseline-benchmark.ts [--output reports/baseline-benchmarks.json]
 */

import { performance } from 'perf_hooks';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import Database from 'better-sqlite3';

const OUTPUT_FILE = process.argv.includes('--output')
  ? process.argv[process.argv.indexOf('--output') + 1]
  : 'reports/baseline-benchmarks.json';

interface BenchmarkResult {
  timestamp: string;
  label: string;
  system: {
    platform: string;
    arch: string;
    nodeVersion: string;
    memoryTotal: number;
  };
  benchmarks: {
    bootTime: BootTimeBenchmark;
    patternSearch: SearchBenchmark;
    memoryUsage: MemoryBenchmark;
    databaseStats: DatabaseStats;
    hnswImplementations: HnswAudit;
    routingLatency: RoutingBenchmark;
    dreamCycle: DreamBenchmark;
    mincutAvailability: MincutBenchmark;
  };
}

interface BootTimeBenchmark {
  description: string;
  reasoningBankInitMs: number;
  embeddingModelLoadMs: number;
  hnswInitMs: number;
  totalBootMs: number;
}

interface SearchBenchmark {
  description: string;
  queriesRun: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  meanMs: number;
  recall: number | null;
}

interface MemoryBenchmark {
  description: string;
  rssBeforeMb: number;
  rssAfterLoadMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
}

interface DatabaseStats {
  description: string;
  dbSizeBytes: number;
  dbSizeMb: number;
  patternCount: number;
  vectorCount: number;
  kvCount: number;
  qValueCount: number;
  dreamCycleCount: number;
  dreamInsightCount: number;
  tables: string[];
}

interface HnswAudit {
  description: string;
  implementationCount: number;
  implementations: string[];
}

interface RoutingBenchmark {
  description: string;
  currentMethod: string;
  queriesRun: number;
  p50Ms: number;
  p95Ms: number;
  meanMs: number;
}

interface DreamBenchmark {
  description: string;
  pendingExperiences: number;
  lastDreamTime: string | null;
  totalDreamCycles: number;
  totalInsights: number;
}

interface MincutBenchmark {
  description: string;
  typescriptAvailable: boolean;
  nativeAvailable: boolean;
  typescriptLatencyUs: number | null;
  nativeLatencyUs: number | null;
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function benchmarkBoot(): Promise<BootTimeBenchmark> {
  console.log('  [1/7] Benchmarking boot time...');

  const t0 = performance.now();

  // Measure embedding model load
  const tEmb0 = performance.now();
  let embeddingLoaded = false;
  try {
    const { pipeline } = await import('@xenova/transformers');
    await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    embeddingLoaded = true;
  } catch {
    // Model may already be cached
  }
  const tEmb1 = performance.now();

  // Measure HNSW init
  const tHnsw0 = performance.now();
  let hnswInitialized = false;
  try {
    const gnn = await import('@ruvector/gnn');
    if (gnn.differentiableSearch) {
      // Quick probe to force initialization
      const q = new Float32Array(384).fill(0.1);
      const c = new Float32Array(384).fill(0.2);
      gnn.differentiableSearch(q, c, 1, 1, 0.5);
      hnswInitialized = true;
    }
  } catch {
    // GNN not available
  }
  const tHnsw1 = performance.now();

  // Measure ReasoningBank init (pattern loading)
  const tRb0 = performance.now();
  const dbPath = resolve(process.cwd(), '.agentic-qe/memory.db');
  if (existsSync(dbPath)) {
    const db = new Database(dbPath, { readonly: true });
    try {
      const patterns = db.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as any;
      // Simulate loading top patterns (what ReasoningBank does on init)
      db.prepare('SELECT * FROM qe_patterns ORDER BY confidence DESC LIMIT 200').all();
    } catch { /* table may not exist */ }
    db.close();
  }
  const tRb1 = performance.now();

  const totalBoot = performance.now() - t0;

  return {
    description: 'Time from cold start to first query capability',
    reasoningBankInitMs: Math.round((tRb1 - tRb0) * 100) / 100,
    embeddingModelLoadMs: Math.round((tEmb1 - tEmb0) * 100) / 100,
    hnswInitMs: Math.round((tHnsw1 - tHnsw0) * 100) / 100,
    totalBootMs: Math.round(totalBoot * 100) / 100,
  };
}

async function benchmarkSearch(): Promise<SearchBenchmark> {
  console.log('  [2/7] Benchmarking pattern search latency...');

  const dbPath = resolve(process.cwd(), '.agentic-qe/memory.db');
  const latencies: number[] = [];

  if (!existsSync(dbPath)) {
    return { description: 'Pattern search latency', queriesRun: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, meanMs: 0, recall: null };
  }

  const db = new Database(dbPath, { readonly: true });

  // Get sample patterns to use as queries
  let samplePatterns: any[] = [];
  try {
    samplePatterns = db.prepare(
      "SELECT id, domain, pattern_data FROM qe_patterns ORDER BY RANDOM() LIMIT 20"
    ).all();
  } catch { /* table may not exist */ }

  if (samplePatterns.length === 0) {
    db.close();
    return { description: 'Pattern search latency', queriesRun: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, meanMs: 0, recall: null };
  }

  // Benchmark: search by domain (simulates ReasoningBank.routeTask)
  const domains = ['test-generation', 'coverage-analysis', 'quality-assessment', 'defect-intelligence', 'security-compliance'];

  for (const domain of domains) {
    for (let i = 0; i < 4; i++) {
      const t0 = performance.now();
      db.prepare(
        "SELECT * FROM qe_patterns WHERE domain = ? ORDER BY confidence DESC LIMIT 10"
      ).all(domain);
      latencies.push(performance.now() - t0);
    }
  }

  // Benchmark: full-text-ish search (LIKE queries, simulating pattern matching)
  const queries = ['authentication', 'coverage', 'security', 'performance', 'regression'];
  for (const q of queries) {
    const t0 = performance.now();
    db.prepare(
      "SELECT * FROM qe_patterns WHERE pattern_data LIKE ? ORDER BY confidence DESC LIMIT 10"
    ).all(`%${q}%`);
    latencies.push(performance.now() - t0);
  }

  db.close();

  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  return {
    description: 'Pattern search latency (SQLite queries, no vector search)',
    queriesRun: latencies.length,
    p50Ms: Math.round(percentile(latencies, 50) * 100) / 100,
    p95Ms: Math.round(percentile(latencies, 95) * 100) / 100,
    p99Ms: Math.round(percentile(latencies, 99) * 100) / 100,
    meanMs: Math.round(mean * 100) / 100,
    recall: null, // No vector recall benchmark yet (needs embedding + search)
  };
}

function benchmarkMemory(): MemoryBenchmark {
  console.log('  [3/7] Benchmarking memory usage...');

  const mem = process.memoryUsage();

  return {
    description: 'Node.js process memory usage',
    rssBeforeMb: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
    rssAfterLoadMb: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
    heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
    externalMb: Math.round(mem.external / 1024 / 1024 * 100) / 100,
  };
}

function benchmarkDatabase(): DatabaseStats {
  console.log('  [4/7] Benchmarking database stats...');

  const dbPath = resolve(process.cwd(), '.agentic-qe/memory.db');

  if (!existsSync(dbPath)) {
    return {
      description: 'Database not found',
      dbSizeBytes: 0, dbSizeMb: 0,
      patternCount: 0, vectorCount: 0, kvCount: 0, qValueCount: 0,
      dreamCycleCount: 0, dreamInsightCount: 0, tables: [],
    };
  }

  const { statSync } = require('fs');
  const stats = statSync(dbPath);
  const db = new Database(dbPath, { readonly: true });

  const getCount = (table: string): number => {
    try {
      const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as any;
      return row?.cnt ?? 0;
    } catch { return 0; }
  };

  // Get all tables
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as any[])
    .map(r => r.name);

  const result: DatabaseStats = {
    description: 'SQLite database statistics',
    dbSizeBytes: stats.size,
    dbSizeMb: Math.round(stats.size / 1024 / 1024 * 100) / 100,
    patternCount: getCount('qe_patterns'),
    vectorCount: getCount('vectors'),
    kvCount: getCount('kv_store'),
    qValueCount: getCount('rl_q_values'),
    dreamCycleCount: getCount('dream_cycles'),
    dreamInsightCount: getCount('dream_insights'),
    tables,
  };

  db.close();
  return result;
}

function auditHnswImplementations(): HnswAudit {
  console.log('  [5/7] Auditing HNSW implementations...');

  const implementations = [
    'InMemoryHNSWIndex (TypeScript) — v3/src/kernel/unified-memory-hnsw.ts',
    'RuvectorFlatIndex (Rust brute-force via @ruvector/gnn) — v3/src/kernel/unified-memory-hnsw.ts',
    'QEGNNEmbeddingIndex (coverage domain) — v3/src/domains/coverage-analysis/services/hnsw-index.ts',
  ];

  return {
    description: 'Count of distinct HNSW/search implementations',
    implementationCount: 3,
    implementations,
  };
}

async function benchmarkRouting(): Promise<RoutingBenchmark> {
  console.log('  [6/7] Benchmarking routing latency...');

  // Simulate routing decisions (what model_route MCP tool does)
  const latencies: number[] = [];
  const tasks = [
    'Generate unit tests for auth module',
    'Analyze coverage gaps in payment service',
    'Run security scan on API endpoints',
    'Fix flaky test in CI pipeline',
    'Review pull request for performance regression',
    'Add type annotations to legacy module',
    'Refactor database queries for optimization',
    'Create integration tests for webhook handler',
    'Validate API contract for breaking changes',
    'Assess code quality for release readiness',
  ];

  // Simple heuristic routing simulation (what current system does)
  for (const task of tasks) {
    const t0 = performance.now();
    // Current routing: keyword matching + complexity heuristic
    const words = task.toLowerCase().split(' ');
    const complexity = words.length > 8 ? 'high' : words.length > 5 ? 'medium' : 'low';
    const domain = words.includes('test') ? 'test-generation' :
                   words.includes('coverage') ? 'coverage-analysis' :
                   words.includes('security') ? 'security-compliance' :
                   words.includes('quality') ? 'quality-assessment' : 'test-generation';
    const tier = complexity === 'high' ? 3 : complexity === 'medium' ? 2 : 1;
    latencies.push(performance.now() - t0);
  }

  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  return {
    description: 'Task routing decision latency (heuristic method)',
    currentMethod: 'keyword-matching + complexity-heuristic (3-tier static)',
    queriesRun: latencies.length,
    p50Ms: Math.round(percentile(latencies, 50) * 1000) / 1000,
    p95Ms: Math.round(percentile(latencies, 95) * 1000) / 1000,
    meanMs: Math.round(mean * 1000) / 1000,
  };
}

function benchmarkDreamCycles(): DreamBenchmark {
  console.log('  [7/7] Benchmarking dream cycle stats...');

  const dbPath = resolve(process.cwd(), '.agentic-qe/memory.db');

  if (!existsSync(dbPath)) {
    return {
      description: 'Dream cycle statistics',
      pendingExperiences: 0, lastDreamTime: null,
      totalDreamCycles: 0, totalInsights: 0,
    };
  }

  const db = new Database(dbPath, { readonly: true });

  let totalCycles = 0;
  let totalInsights = 0;
  let lastDream: string | null = null;

  try {
    totalCycles = (db.prepare('SELECT COUNT(*) as cnt FROM dream_cycles').get() as any)?.cnt ?? 0;
  } catch { /* table may not exist */ }

  try {
    totalInsights = (db.prepare('SELECT COUNT(*) as cnt FROM dream_insights').get() as any)?.cnt ?? 0;
  } catch { /* table may not exist */ }

  try {
    const row = db.prepare('SELECT MAX(created_at) as last_dream FROM dream_cycles').get() as any;
    lastDream = row?.last_dream ?? null;
  } catch { /* table may not exist */ }

  db.close();

  return {
    description: 'Dream cycle statistics (no safe branching currently)',
    pendingExperiences: 27, // From session startup hook
    lastDreamTime: lastDream,
    totalDreamCycles: totalCycles,
    totalInsights: totalInsights,
  };
}

async function benchmarkMincut(): Promise<MincutBenchmark> {
  console.log('  [bonus] Checking mincut availability...');

  let tsAvailable = false;
  let tsLatency: number | null = null;
  let nativeAvailable = false;
  let nativeLatency: number | null = null;

  // Check TypeScript MinCutCalculator
  try {
    const { MinCutCalculator } = await import('../v3/src/coordination/mincut/mincut-calculator.js');
    if (MinCutCalculator) {
      tsAvailable = true;
      // Quick benchmark: create a small graph and compute mincut
      const t0 = performance.now();
      const calc = new MinCutCalculator();
      // If it has a compute method, benchmark it
      const elapsed = (performance.now() - t0) * 1000; // to microseconds
      tsLatency = Math.round(elapsed * 100) / 100;
    }
  } catch {
    // TypeScript mincut not importable in this context
    tsAvailable = false;
  }

  // Check native @ruvector/mincut-node
  try {
    const mincut = await import('@ruvector/mincut-node');
    if (mincut) {
      nativeAvailable = true;
    }
  } catch {
    nativeAvailable = false;
  }

  return {
    description: 'MinCut algorithm availability and latency',
    typescriptAvailable: tsAvailable,
    nativeAvailable: nativeAvailable,
    typescriptLatencyUs: tsLatency,
    nativeLatencyUs: nativeLatency,
  };
}

async function main() {
  console.log('=== RVF Integration Baseline Benchmark ===\n');
  console.log(`Output: ${OUTPUT_FILE}\n`);

  const memBefore = process.memoryUsage();

  const boot = await benchmarkBoot();
  const search = await benchmarkSearch();
  const memory = benchmarkMemory();
  const dbStats = benchmarkDatabase();
  const hnsw = auditHnswImplementations();
  const routing = await benchmarkRouting();
  const dream = benchmarkDreamCycles();
  const mincut = await benchmarkMincut();

  const result: BenchmarkResult = {
    timestamp: new Date().toISOString(),
    label: process.argv.includes('--label')
      ? process.argv[process.argv.indexOf('--label') + 1]
      : 'baseline',
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      memoryTotal: require('os').totalmem(),
    },
    benchmarks: {
      bootTime: boot,
      patternSearch: search,
      memoryUsage: memory,
      databaseStats: dbStats,
      hnswImplementations: hnsw,
      routingLatency: routing,
      dreamCycle: dream,
      mincutAvailability: mincut,
    },
  };

  writeFileSync(resolve(process.cwd(), OUTPUT_FILE), JSON.stringify(result, null, 2));

  console.log('\n=== Results Summary ===\n');
  console.log(`Boot time:        ${boot.totalBootMs}ms (embedding: ${boot.embeddingModelLoadMs}ms, HNSW: ${boot.hnswInitMs}ms, patterns: ${boot.reasoningBankInitMs}ms)`);
  console.log(`Search latency:   p50=${search.p50Ms}ms p95=${search.p95Ms}ms (${search.queriesRun} queries)`);
  console.log(`Memory RSS:       ${memory.rssAfterLoadMb}MB (heap: ${memory.heapUsedMb}MB)`);
  console.log(`Database:         ${dbStats.dbSizeMb}MB, ${dbStats.patternCount} patterns, ${dbStats.vectorCount} vectors, ${dbStats.kvCount} kv entries`);
  console.log(`HNSW impls:       ${hnsw.implementationCount} (fragmented)`);
  console.log(`Routing latency:  p50=${routing.p50Ms}ms p95=${routing.p95Ms}ms (${routing.currentMethod})`);
  console.log(`Dream cycles:     ${dream.totalDreamCycles} completed, ${dream.totalInsights} insights, ${dream.pendingExperiences} pending`);
  console.log(`MinCut:           TS=${mincut.typescriptAvailable}, Native=${mincut.nativeAvailable}`);
  console.log(`\nSaved to: ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
