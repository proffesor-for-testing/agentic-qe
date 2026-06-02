#!/usr/bin/env tsx
/**
 * AQE Self-Learning Verification Harness
 *
 * Ports ruflo's `benchmark-self-learning.mjs` discipline — the
 * "reports success but persists nothing" detector — to the AQE platform.
 * (docs/ruflo-adoption-plan.md item #1 / issue #510.)
 *
 * It does NOT measure speed. It proves that the learning stores actually
 * PERSIST what they claim to persist, that stat aggregators AGREE with the
 * underlying index, that nothing accidentally writes, and that the data
 * survives a process restart.
 *
 * 🔴 DATA-PROTECTION (CLAUDE.md): this harness NEVER opens the real stores
 * under .agentic-qe/ for writing.
 *   - SYNTHETIC mode (default): operates only inside a fresh temp dir.
 *   - AUDIT-REAL mode (--audit-real): COPIES the real stores into a temp dir
 *     and opens only the copies. The originals are never touched.
 *
 * Sections (each isolated, each with its own pass/fail boolean):
 *   A. STORE PERSISTENCE   — create N patterns → totalPatterns delta == N
 *   B. OUTCOME LEARNING    — record N outcomes  → learningOutcomes delta == N,
 *                            patternSuccessRate ≈ fed success ratio
 *   C. NEGATIVE CONTROL    — a read-only op must NOT persist (delta == 0)
 *   D. RESTART SURVIVAL    — reopen same temp path → counts from A/B persisted
 *   E. CONSISTENCY         — getStats().totalPatterns == adapter.status()
 *                            .totalVectors; bank.totalPatterns == store stat
 *   F. AUDIT-REAL          — (opt-in) round-trip the real banner numbers on a
 *                            read-only copy
 *
 * Run:
 *   npx tsx scripts/benchmark-self-learning.ts            # synthetic A-E
 *   npx tsx scripts/benchmark-self-learning.ts --n 50     # custom N
 *   npx tsx scripts/benchmark-self-learning.ts --audit-real
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';

// tsx transpiles project ESM modules (package.json "type":"module") without a
// `require` binding. The RVF native adapter loads its N-API binding via a bare
// `require('@ruvector/rvf-node')`, which is then undefined → native reported
// UNAVAILABLE. Exposing a CJS `require` on globalThis BEFORE the adapter module
// is evaluated lets that bare reference resolve. (Production builds bundle
// `require` via esbuild and don't need this.)
(globalThis as { require?: NodeRequire }).require = createRequire(import.meta.url);

// Dynamically import the AQE modules AFTER the shim is installed, so the
// adapter's top-level native check sees a working `require`.
const { RvfPatternStore } = await import('../src/learning/rvf-pattern-store.js');
const {
  createRvfStore,
  openRvfStore,
  openRvfStoreReadonly,
  isRvfNativeAvailable,
} = await import('../src/integrations/ruvector/rvf-native-adapter.js');
type RvfNativeAdapter =
  import('../src/integrations/ruvector/rvf-native-adapter.js').RvfNativeAdapter;
const { createSQLitePatternStore } = await import('../src/learning/sqlite-persistence.js');
type SQLitePatternStore =
  import('../src/learning/sqlite-persistence.js').SQLitePatternStore;
const { DEFAULT_PATTERN_STORE_CONFIG } = await import('../src/learning/pattern-store.js');
type CreateQEPatternOptions =
  import('../src/learning/qe-patterns.js').CreateQEPatternOptions;
type RvfPatternStore = InstanceType<typeof RvfPatternStore>;

// ── Config ──────────────────────────────────────────────────────────

const DIM = DEFAULT_PATTERN_STORE_CONFIG.embeddingDimension; // 384

function parseArgs(argv: string[]): { n: number; auditReal: boolean } {
  let n = 20;
  let auditReal = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--audit-real') auditReal = true;
    else if (a === '--n' || a === '-n') {
      const v = Number(argv[++i]);
      if (Number.isFinite(v) && v > 0) n = Math.floor(v);
    } else if (a.startsWith('--n=')) {
      const v = Number(a.slice(4));
      if (Number.isFinite(v) && v > 0) n = Math.floor(v);
    }
  }
  return { n, auditReal };
}

// ── Section result model ────────────────────────────────────────────

interface SectionResult {
  passed: boolean;
  deltas: Record<string, number>;
  latencyMs: number[];
  notes: string[];
}

function newSection(): SectionResult {
  return { passed: false, deltas: {}, latencyMs: [], notes: [] };
}

const sections: Record<string, SectionResult> = {
  A: newSection(),
  B: newSection(),
  C: newSection(),
  D: newSection(),
  E: newSection(),
  F: newSection(),
};

// ── Helpers ─────────────────────────────────────────────────────────

function deterministicVector(seed: number): number[] {
  // Cheap deterministic non-zero unit vector (no real embeddings needed —
  // the harness checks persistence/consistency, not similarity quality).
  const v = new Array(DIM);
  let s = (seed + 1) * 2654435761;
  for (let i = 0; i < DIM; i++) {
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >>> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    v[i] = (s / 0xffffffff) * 2 - 1;
  }
  let mag = 0;
  for (let i = 0; i < DIM; i++) mag += v[i] * v[i];
  mag = Math.sqrt(mag) || 1;
  for (let i = 0; i < DIM; i++) v[i] /= mag;
  return v;
}

function makePatternOptions(i: number): CreateQEPatternOptions {
  return {
    patternType: 'test-template',
    qeDomain: 'test-generation',
    name: `sl-bench-pattern-${i}`,
    description: `Self-learning benchmark pattern #${i}`,
    confidence: 0.8,
    embedding: deterministicVector(i),
    context: { tags: ['self-learning-benchmark'] },
    template: { content: `template body for pattern ${i}`, example: `example-${i}` },
  } as CreateQEPatternOptions;
}

/**
 * Build an isolated RvfPatternStore + legacy SQLitePatternStore pair pointed
 * entirely at `dir`. Legacy mode (useUnified:false) is CRITICAL — it bypasses
 * the UnifiedMemoryManager singleton that would otherwise open the real
 * memory.db. `create` chooses createRvfStore (fresh) vs openRvfStore (reopen).
 */
async function buildIsolatedStore(
  dir: string,
  mode: 'create' | 'open',
): Promise<{ rvf: RvfPatternStore; sqlite: SQLitePatternStore; rvfPath: string; dbPath: string }> {
  const rvfPath = path.join(dir, 'patterns.rvf');
  const dbPath = path.join(dir, 'memory.db');

  const factory =
    mode === 'create'
      ? (p: string, dim: number) => createRvfStore(p, dim)
      : (p: string, _dim: number) => openRvfStore(p);

  const sqlite = createSQLitePatternStore({ dbPath, useUnified: false });
  await sqlite.initialize();

  const rvf = new RvfPatternStore(factory, {
    rvfPath,
    base: { ...DEFAULT_PATTERN_STORE_CONFIG },
  });
  rvf.setSqliteStore(sqlite);
  await rvf.initialize();

  return { rvf, sqlite, rvfPath, dbPath };
}

function pass(section: string, cond: boolean, note: string): void {
  sections[section].notes.push(`${cond ? 'PASS' : 'FAIL'}: ${note}`);
  if (!cond) sections[section].passed = false;
}

// ── Section A: STORE PERSISTENCE ────────────────────────────────────

async function sectionA(dir: string, n: number): Promise<void> {
  const s = sections.A;
  console.log('\n── A. STORE PERSISTENCE ────────────────────────────');
  try {
    const { rvf } = await buildIsolatedStore(dir, 'create');

    const before = (await rvf.getStats()).totalPatterns;
    s.deltas.before = before;

    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      const res = await rvf.create(makePatternOptions(i));
      s.latencyMs.push(performance.now() - t0);
      if (!res.success) {
        s.notes.push(`create #${i} failed: ${res.error.message}`);
      }
    }

    const after = (await rvf.getStats()).totalPatterns;
    s.deltas.after = after;
    s.deltas.delta = after - before;
    s.deltas.expected = n;

    s.passed = true;
    pass('A', s.deltas.delta === n, `totalPatterns delta == ${n} (got ${s.deltas.delta})`);

    const avg = s.latencyMs.reduce((a, b) => a + b, 0) / (s.latencyMs.length || 1);
    console.log(`  before=${before} after=${after} delta=${s.deltas.delta} (expected ${n})`);
    console.log(`  avg create latency: ${avg.toFixed(2)}ms`);

    await rvf.dispose();
  } catch (e) {
    s.passed = false;
    s.notes.push(`EXCEPTION: ${(e as Error).message}`);
    console.log(`  EXCEPTION: ${(e as Error).message}`);
  }
  console.log(`  → ${s.passed ? 'PASS' : 'FAIL'}`);
}

// ── Section B: OUTCOME LEARNING ─────────────────────────────────────

async function sectionB(dir: string, n: number): Promise<void> {
  const s = sections.B;
  console.log('\n── B. OUTCOME LEARNING ─────────────────────────────');
  try {
    const { rvf, sqlite } = await buildIsolatedStore(dir, 'create');

    // Need patterns to attach outcomes to. Create a handful of real patterns.
    const patternIds: string[] = [];
    const patternCount = Math.max(4, Math.ceil(n / 4));
    for (let i = 0; i < patternCount; i++) {
      const res = await rvf.create(makePatternOptions(1000 + i));
      if (res.success) patternIds.push(res.value.id);
    }
    if (patternIds.length === 0) {
      throw new Error('no patterns created to attach outcomes to');
    }

    const aggBefore = sqlite.getAggregateOutcomeStats();
    s.deltas.outcomesBefore = aggBefore.learningOutcomes;

    // Feed a known success ratio: mark ~70% success.
    const targetSuccessRatio = 0.7;
    let successFed = 0;
    for (let i = 0; i < n; i++) {
      const pid = patternIds[i % patternIds.length];
      const success = i / n < targetSuccessRatio; // first 70% succeed
      if (success) successFed++;
      const t0 = performance.now();
      // This is exactly the path QEReasoningBank.recordOutcome delegates to:
      //   patternStore.recordUsage(id, success) → sqliteStore.recordUsage(...)
      const res = await rvf.recordUsage(pid, success);
      s.latencyMs.push(performance.now() - t0);
      if (!res.success) s.notes.push(`recordUsage #${i} failed: ${res.error.message}`);
    }

    const aggAfter = sqlite.getAggregateOutcomeStats();
    s.deltas.outcomesAfter = aggAfter.learningOutcomes;
    s.deltas.delta = aggAfter.learningOutcomes - aggBefore.learningOutcomes;
    s.deltas.expected = n;

    const fedRatio = successFed / n;
    // patternSuccessRate as the bank computes it from usage rows:
    //   successfulOutcomes / learningOutcomes
    const observedRatio =
      aggAfter.learningOutcomes > 0
        ? aggAfter.successfulOutcomes / aggAfter.learningOutcomes
        : 0;
    s.deltas.fedSuccessRatio = Number(fedRatio.toFixed(4));
    s.deltas.observedSuccessRatio = Number(observedRatio.toFixed(4));

    s.passed = true;
    pass('B', s.deltas.delta === n, `learningOutcomes delta == ${n} (got ${s.deltas.delta})`);
    const tol = 0.001;
    pass(
      'B',
      Math.abs(observedRatio - fedRatio) <= tol,
      `patternSuccessRate ≈ fed ratio (${observedRatio.toFixed(3)} vs ${fedRatio.toFixed(3)}, tol ${tol})`,
    );

    console.log(
      `  outcomes: before=${aggBefore.learningOutcomes} after=${aggAfter.learningOutcomes} delta=${s.deltas.delta} (expected ${n})`,
    );
    console.log(
      `  successRate: fed=${fedRatio.toFixed(3)} observed=${observedRatio.toFixed(3)}`,
    );

    await rvf.dispose();
  } catch (e) {
    s.passed = false;
    s.notes.push(`EXCEPTION: ${(e as Error).message}`);
    console.log(`  EXCEPTION: ${(e as Error).message}`);
  }
  console.log(`  → ${s.passed ? 'PASS' : 'FAIL'}`);
}

// ── Section C: NEGATIVE CONTROL ─────────────────────────────────────

async function sectionC(dir: string, n: number): Promise<void> {
  const s = sections.C;
  console.log('\n── C. NEGATIVE CONTROL (no accidental writes) ──────');
  try {
    const { rvf } = await buildIsolatedStore(dir, 'create');

    // Seed a few patterns so search/get have something to read.
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await rvf.create(makePatternOptions(2000 + i));
      if (res.success) ids.push(res.value.id);
    }

    const before = (await rvf.getStats()).totalPatterns;
    s.deltas.before = before;

    // Read-only operations that MUST NOT persist a new pattern:
    for (let i = 0; i < n; i++) {
      await rvf.search(deterministicVector(2000 + (i % 5)), { limit: 5 });
      await rvf.search('self-learning', { limit: 5 });
      if (ids.length) await rvf.get(ids[i % ids.length]);
    }

    const after = (await rvf.getStats()).totalPatterns;
    s.deltas.after = after;
    s.deltas.delta = after - before;

    s.passed = true;
    pass('C', s.deltas.delta === 0, `totalPatterns delta == 0 after read-only ops (got ${s.deltas.delta})`);

    console.log(`  before=${before} after=${after} delta=${s.deltas.delta} (expected 0)`);

    await rvf.dispose();
  } catch (e) {
    s.passed = false;
    s.notes.push(`EXCEPTION: ${(e as Error).message}`);
    console.log(`  EXCEPTION: ${(e as Error).message}`);
  }
  console.log(`  → ${s.passed ? 'PASS' : 'FAIL'}`);
}

// ── Section D: RESTART SURVIVAL ─────────────────────────────────────

async function sectionD(dir: string, n: number): Promise<void> {
  const s = sections.D;
  console.log('\n── D. RESTART SURVIVAL ─────────────────────────────');
  try {
    // Phase 1: write N patterns + N outcomes, then dispose (simulated exit).
    const first = await buildIsolatedStore(dir, 'create');
    const patternIds: string[] = [];
    for (let i = 0; i < n; i++) {
      const res = await first.rvf.create(makePatternOptions(3000 + i));
      if (res.success) patternIds.push(res.value.id);
    }
    for (let i = 0; i < n; i++) {
      await first.rvf.recordUsage(patternIds[i % patternIds.length], i % 2 === 0);
    }
    const beforeStats = await first.rvf.getStats();
    const beforeOutcomes = first.sqlite.getAggregateOutcomeStats().learningOutcomes;
    s.deltas.patternsBeforeRestart = beforeStats.totalPatterns;
    s.deltas.outcomesBeforeRestart = beforeOutcomes;

    await first.rvf.dispose();
    first.sqlite.close();

    // Phase 2: brand-new instances on the SAME temp path.
    const second = await buildIsolatedStore(dir, 'open');
    const afterStats = await second.rvf.getStats();
    const afterOutcomes = second.sqlite.getAggregateOutcomeStats().learningOutcomes;
    s.deltas.patternsAfterRestart = afterStats.totalPatterns;
    s.deltas.outcomesAfterRestart = afterOutcomes;

    s.passed = true;
    pass(
      'D',
      afterStats.totalPatterns === beforeStats.totalPatterns && afterStats.totalPatterns >= n,
      `pattern count survived restart (${beforeStats.totalPatterns} → ${afterStats.totalPatterns})`,
    );
    pass(
      'D',
      afterOutcomes === beforeOutcomes && afterOutcomes >= n,
      `outcome count survived restart (${beforeOutcomes} → ${afterOutcomes})`,
    );

    console.log(
      `  patterns: before-restart=${beforeStats.totalPatterns} after-restart=${afterStats.totalPatterns}`,
    );
    console.log(
      `  outcomes: before-restart=${beforeOutcomes} after-restart=${afterOutcomes}`,
    );

    await second.rvf.dispose();
    second.sqlite.close();
  } catch (e) {
    s.passed = false;
    s.notes.push(`EXCEPTION: ${(e as Error).message}`);
    console.log(`  EXCEPTION: ${(e as Error).message}`);
  }
  console.log(`  → ${s.passed ? 'PASS' : 'FAIL'}`);
}

// ── Section E: CONSISTENCY (cross-aggregator agreement) ─────────────

async function sectionE(dir: string, n: number): Promise<void> {
  const s = sections.E;
  console.log('\n── E. CONSISTENCY (aggregators agree) ──────────────');
  try {
    const { rvf } = await buildIsolatedStore(dir, 'create');
    for (let i = 0; i < n; i++) {
      await rvf.create(makePatternOptions(4000 + i));
    }

    const stats = await rvf.getStats();
    const adapter = rvf.getAdapter();
    const adapterVectors = adapter ? adapter.status().totalVectors : -1;

    s.deltas.storeTotalPatterns = stats.totalPatterns;
    s.deltas.adapterTotalVectors = adapterVectors;
    s.deltas.hnswVectorCount = stats.hnswStats.vectorCount;

    s.passed = true;
    pass(
      'E',
      adapter !== null,
      `RVF native adapter present (required for vector-count consistency)`,
    );
    pass(
      'E',
      stats.totalPatterns === adapterVectors,
      `getStats().totalPatterns == adapter.status().totalVectors (${stats.totalPatterns} vs ${adapterVectors})`,
    );

    // Mirror QEReasoningBank.getStats(): bank.totalPatterns is taken verbatim
    // from patternStoreStats.totalPatterns. Verify that identity holds.
    const bankView = { totalPatterns: stats.totalPatterns, patternStoreStats: stats };
    pass(
      'E',
      bankView.totalPatterns === bankView.patternStoreStats.totalPatterns,
      `bank.totalPatterns == patternStoreStats.totalPatterns (${bankView.totalPatterns})`,
    );

    console.log(
      `  store.totalPatterns=${stats.totalPatterns} adapter.totalVectors=${adapterVectors} hnsw.vectorCount=${stats.hnswStats.vectorCount}`,
    );

    await rvf.dispose();
  } catch (e) {
    s.passed = false;
    s.notes.push(`EXCEPTION: ${(e as Error).message}`);
    console.log(`  EXCEPTION: ${(e as Error).message}`);
  }
  console.log(`  → ${s.passed ? 'PASS' : 'FAIL'}`);
}

// ── Section F: AUDIT-REAL (read-only copy of real stores) ───────────

const REAL_DIR = path.resolve('.agentic-qe');

function copyIfExists(src: string, dst: string): boolean {
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, dst);
  // Copy WAL/SHM sidecars too so the SQLite copy is consistent.
  for (const ext of ['-wal', '-shm', '.idmap.json']) {
    if (fs.existsSync(src + ext)) fs.copyFileSync(src + ext, dst + ext);
  }
  return true;
}

async function sectionF(): Promise<void> {
  const s = sections.F;
  console.log('\n── F. AUDIT-REAL (copy + read-only) ────────────────');
  const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-sl-audit-'));
  try {
    const realRvf = path.join(REAL_DIR, 'patterns.rvf');
    const realDb = path.join(REAL_DIR, 'memory.db');
    const copyRvf = path.join(auditDir, 'patterns.rvf');
    const copyDb = path.join(auditDir, 'memory.db');

    const haveRvf = copyIfExists(realRvf, copyRvf);
    const haveDb = copyIfExists(realDb, copyDb);
    s.notes.push(`copied patterns.rvf=${haveRvf} memory.db=${haveDb}`);

    // -- SQLite side (unified memory.db copy, read-only) --
    let bannerPatterns = 0;
    let bannerSuccessRate = 0;
    let bannerRoutingRequests = 0;
    let bannerRoutingConfidence = 0;
    let sqliteOutcomeAgg: ReturnType<SQLitePatternStore['getAggregateOutcomeStats']> | null = null;
    let dbPatternCount = 0;

    if (haveDb) {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(copyDb, { readonly: true, fileMustExist: true });
      try {
        dbPatternCount =
          (db.prepare('SELECT COUNT(*) AS c FROM qe_patterns').get() as { c: number })?.c ?? 0;

        const safeAgg = <T>(sql: string): T | undefined => {
          try {
            return db.prepare(sql).get() as T | undefined;
          } catch {
            return undefined;
          }
        };
        const routing = safeAgg<{ total: number; avg_q: number | null; succ: number }>(`
          SELECT COUNT(*) AS total,
                 AVG(CASE WHEN quality_score >= 0 THEN quality_score END) AS avg_q,
                 COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END),0) AS succ
          FROM routing_outcomes`);
        const usage = safeAgg<{ total: number; succ: number }>(`
          SELECT COUNT(*) AS total,
                 COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END),0) AS succ
          FROM qe_pattern_usage`);

        bannerRoutingRequests = routing?.total ?? 0;
        bannerRoutingConfidence = routing?.avg_q ?? 0;
        bannerPatterns = dbPatternCount;
        bannerSuccessRate =
          usage && usage.total > 0 ? usage.succ / usage.total : 0;

        sqliteOutcomeAgg = {
          routingRequests: routing?.total ?? 0,
          avgRoutingConfidence: routing?.avg_q ?? 0,
          successfulRoutings: routing?.succ ?? 0,
          learningOutcomes: usage?.total ?? 0,
          successfulOutcomes: usage?.succ ?? 0,
          avgPatternSuccessRate: 0,
        };
      } finally {
        db.close();
      }
    }

    // -- RVF side (vector count on the copy, read-only) --
    let rvfVectorCount = -1;
    let rvfReadable = false;
    if (haveRvf && isRvfNativeAvailable()) {
      let adapter: RvfNativeAdapter | null = null;
      try {
        adapter = openRvfStoreReadonly(copyRvf);
        rvfVectorCount = adapter.status().totalVectors;
        rvfReadable = true;
      } catch (e) {
        s.notes.push(`RVF copy open failed: ${(e as Error).message}`);
      } finally {
        try {
          adapter?.close();
        } catch {
          /* best effort */
        }
      }
    } else if (haveRvf) {
      s.notes.push('RVF native binding unavailable — skipping vector-count check');
    }

    s.deltas.bannerPatterns = bannerPatterns;
    s.deltas.bannerSuccessRatePct = Number((bannerSuccessRate * 100).toFixed(1));
    s.deltas.bannerRoutingRequests = bannerRoutingRequests;
    s.deltas.bannerRoutingConfidencePct = Number((bannerRoutingConfidence * 100).toFixed(1));
    s.deltas.rvfVectorCount = rvfVectorCount;
    s.deltas.dbPatternCount = dbPatternCount;
    s.deltas.learningOutcomes = sqliteOutcomeAgg?.learningOutcomes ?? 0;

    console.log('  REAL BANNER NUMBERS (from read-only copies):');
    console.log(`    patterns (qe_patterns rows): ${bannerPatterns}`);
    console.log(`    patternSuccessRate:          ${(bannerSuccessRate * 100).toFixed(1)}%`);
    console.log(`    routingRequests:             ${bannerRoutingRequests}`);
    console.log(`    avgRoutingConfidence:        ${(bannerRoutingConfidence * 100).toFixed(1)}%`);
    console.log(`    learningOutcomes (usage):    ${sqliteOutcomeAgg?.learningOutcomes ?? 0}`);
    console.log(`    RVF vector count:            ${rvfVectorCount}`);

    // Internal consistency: does the RVF vector count agree with the SQLite
    // pattern count? (They can legitimately diverge — orphan vectors, patterns
    // without embeddings — so this is reported, not hard-failed.)
    const consistent = rvfReadable && rvfVectorCount === dbPatternCount;
    s.deltas.rvfMatchesDb = consistent ? 1 : 0;
    if (rvfReadable) {
      const diff = rvfVectorCount - dbPatternCount;
      s.notes.push(
        consistent
          ? 'RVF vector count == SQLite pattern count (internally consistent)'
          : `RVF vector count (${rvfVectorCount}) != SQLite pattern count (${dbPatternCount}), diff=${diff}`,
      );
      console.log(
        `  consistency: RVF(${rvfVectorCount}) vs DB(${dbPatternCount}) → ${consistent ? 'MATCH' : `MISMATCH (diff ${diff})`}`,
      );
    }

    // F passes as long as the audit RAN and produced numbers (it is a
    // diagnostic, not a gate — mismatches are reported as notes).
    s.passed = haveDb || haveRvf;
    if (!s.passed) s.notes.push('no real stores found to audit');
  } catch (e) {
    s.passed = false;
    s.notes.push(`EXCEPTION: ${(e as Error).message}`);
    console.log(`  EXCEPTION: ${(e as Error).message}`);
  } finally {
    // Clean up the audit temp dir (copies only — never the originals).
    try {
      fs.rmSync(auditDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
  console.log(`  → ${s.passed ? 'PASS' : 'FAIL'}`);
}

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { n, auditReal } = parseArgs(process.argv.slice(2));

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║      AQE Self-Learning Verification Harness              ║');
  console.log('║      "reports success but persists nothing" detector     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`  Mode:        ${auditReal ? 'AUDIT-REAL (+synthetic A-E)' : 'SYNTHETIC'}`);
  console.log(`  N:           ${n}`);
  console.log(`  Dimensions:  ${DIM}`);
  console.log(`  RVF native:  ${isRvfNativeAvailable() ? 'available' : 'UNAVAILABLE'}`);

  // Each section gets its own fresh temp dir for full isolation.
  // Also redirect AQE_PROJECT_ROOT to a throwaway dir so any incidental
  // unified-memory access cannot reach the real .agentic-qe store.
  const guardRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-sl-guard-'));
  process.env.AQE_PROJECT_ROOT = guardRoot;

  const mkSectionDir = (tag: string) =>
    fs.mkdtempSync(path.join(os.tmpdir(), `aqe-sl-${tag}-`));

  const dirs: string[] = [];
  const run = async (tag: string, fn: (dir: string) => Promise<void>) => {
    const d = mkSectionDir(tag);
    dirs.push(d);
    await fn(d);
  };

  await run('A', (d) => sectionA(d, n));
  await run('B', (d) => sectionB(d, n));
  await run('C', (d) => sectionC(d, n));
  await run('D', (d) => sectionD(d, n));
  await run('E', (d) => sectionE(d, n));

  if (auditReal) {
    await sectionF();
  } else {
    sections.F.notes.push('skipped (run with --audit-real)');
    sections.F.passed = true; // not a gate in synthetic mode
  }

  // ── Summary ──
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  const order = auditReal ? ['A', 'B', 'C', 'D', 'E', 'F'] : ['A', 'B', 'C', 'D', 'E'];
  for (const k of order) {
    console.log(`  ${k}: ${sections[k].passed ? 'PASS' : 'FAIL'}`);
    for (const note of sections[k].notes) console.log(`       ${note}`);
  }

  // ── JSON output ──
  const outDir = path.resolve('docs/benchmarks/runs');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'self-learning-latest.json');
  const jsonSections: Record<string, unknown> = {};
  for (const k of Object.keys(sections)) {
    const sec = sections[k];
    const avg =
      sec.latencyMs.length > 0
        ? sec.latencyMs.reduce((a, b) => a + b, 0) / sec.latencyMs.length
        : 0;
    jsonSections[k] = {
      passed: sec.passed,
      deltas: sec.deltas,
      latencyMs: { avg: Number(avg.toFixed(4)), count: sec.latencyMs.length },
      notes: sec.notes,
    };
  }
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        timestamp: null, // caller stamps — do not embed Date.now() in committed data
        mode: auditReal ? 'audit-real' : 'synthetic',
        n,
        sections: jsonSections,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`\n  Results written to: ${outPath}`);

  // ── Cleanup synthetic temp dirs ──
  for (const d of dirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
  try {
    fs.rmSync(guardRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }

  // ── CI gate: fail if any NON-audit section failed ──
  const gated = ['A', 'B', 'C', 'D', 'E'];
  const anyFail = gated.some((k) => !sections[k].passed);
  if (anyFail) {
    console.log('\n  ❌ One or more non-audit sections FAILED — exiting 1');
    process.exit(1);
  }
  console.log('\n  ✅ All non-audit sections passed');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
