#!/usr/bin/env tsx
/**
 * KG-Assisted QE Benchmark (Issue #266)
 *
 * A/B comparison: does code intelligence KG improve QE agent test generation?
 *
 * Protocol:
 *   Run A (Control)  — aqe init --minimal (no code intelligence) → test generate × N files
 *   Run B (Treatment) — aqe init --auto   (KG populated)         → same test generate calls
 *
 * Metrics captured per file:
 *   - Token usage (via `aqe token-usage --json`)
 *   - Generated test count, assertions, coverage estimate
 *   - Wall-clock latency
 *   - Output size (chars — proxy for context consumed)
 *   - KG index stats (vectors in memory.db)
 *
 * Test subject: https://github.com/maxritter/claude-pilot (cloned to /tmp)
 *
 * Run:
 *   npx tsx scripts/benchmark-kg-assisted.ts
 *   npx tsx scripts/benchmark-kg-assisted.ts --skip-clone   # reuse existing clone
 *   npx tsx scripts/benchmark-kg-assisted.ts --files 3      # fewer files for quick test
 */

import { execSync, ExecSyncOptions } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ── Configuration ────────────────────────────────────────────────────

const REPO_URL = 'https://github.com/maxritter/claude-pilot';
const BENCH_DIR = '/tmp/kg-benchmark';
const PROJECT_DIR = path.join(BENCH_DIR, 'claude-pilot');
const RESULTS_DIR = path.join(BENCH_DIR, 'results');
const AQE_DIR = path.join(PROJECT_DIR, '.agentic-qe');

// Parse CLI args
const args = process.argv.slice(2);
const skipClone = args.includes('--skip-clone');
const fileCountArg = args.indexOf('--files');
const maxFiles = fileCountArg >= 0 ? parseInt(args[fileCountArg + 1] || '10', 10) : 10;

// ── File Selection ───────────────────────────────────────────────────

interface BenchmarkFile {
  relativePath: string;
  complexity: 'simple' | 'medium' | 'complex';
  lineCount: number;
}

function discoverBenchmarkFiles(): BenchmarkFile[] {
  const result = execSync(
    `find ${PROJECT_DIR} -name '*.py' ! -path '*/test*' ! -name 'conftest.py' ! -name '__init__.py' -exec wc -l {} + 2>/dev/null | sort -rn | grep -v total`,
    { encoding: 'utf-8' }
  );

  const files: BenchmarkFile[] = [];
  for (const line of result.trim().split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!match) continue;
    const lineCount = parseInt(match[1], 10);
    const absPath = match[2];
    const relativePath = path.relative(PROJECT_DIR, absPath);

    let complexity: BenchmarkFile['complexity'];
    if (lineCount < 150) complexity = 'simple';
    else if (lineCount < 400) complexity = 'medium';
    else complexity = 'complex';

    files.push({ relativePath, complexity, lineCount });
  }

  // Select balanced set: 30% complex, 40% medium, 30% simple
  const simple = files.filter((f) => f.complexity === 'simple');
  const medium = files.filter((f) => f.complexity === 'medium');
  const complex = files.filter((f) => f.complexity === 'complex');

  const selected: BenchmarkFile[] = [];
  const targets = [
    { bucket: complex, target: Math.min(3, Math.ceil(maxFiles * 0.3)) },
    { bucket: medium, target: Math.min(4, Math.ceil(maxFiles * 0.4)) },
    { bucket: simple, target: Math.min(3, Math.ceil(maxFiles * 0.3)) },
  ];

  for (const { bucket, target } of targets) {
    selected.push(...bucket.slice(0, target));
  }

  return selected.slice(0, maxFiles);
}

// ── AQE CLI Helpers ──────────────────────────────────────────────────

const EXEC_OPTS: ExecSyncOptions = {
  cwd: PROJECT_DIR,
  encoding: 'utf-8' as BufferEncoding,
  timeout: 300_000,
  stdio: ['pipe', 'pipe', 'pipe'],
};

function runAqe(subcommand: string): string {
  const cmd = `npx agentic-qe ${subcommand}`;
  console.log(`    $ ${cmd}`);
  try {
    return execSync(cmd, EXEC_OPTS) as string;
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const output = (err.stdout || '') + '\n' + (err.stderr || '');
    console.error(`    [WARN] ${err.message?.split('\n')[0]}`);
    return output;
  }
}

function wipeAqeData(): void {
  if (fs.existsSync(AQE_DIR)) {
    fs.rmSync(AQE_DIR, { recursive: true, force: true });
    console.log('    Wiped .agentic-qe/');
  }
}

// ── Token Usage ──────────────────────────────────────────────────────

interface TokenSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  patternsReused: number;
  tokensSaved: number;
}

function captureTokenUsage(): TokenSnapshot {
  const empty: TokenSnapshot = { inputTokens: 0, outputTokens: 0, totalTokens: 0, patternsReused: 0, tokensSaved: 0 };

  // Try reading token metrics directly from memory.db (faster than spawning CLI)
  const memoryDb = path.join(AQE_DIR, 'memory.db');
  if (!fs.existsSync(memoryDb)) return empty;

  try {
    // Query the token_metrics table directly via sqlite3
    const result = execSync(
      `sqlite3 '${memoryDb}' "SELECT COALESCE(SUM(json_extract(value, '$.usage.inputTokens')),0), COALESCE(SUM(json_extract(value, '$.usage.outputTokens')),0), COALESCE(SUM(json_extract(value, '$.usage.totalTokens')),0) FROM kv_store WHERE namespace='token-metrics';" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5_000, cwd: PROJECT_DIR }
    ).trim();

    if (result) {
      const parts = result.split('|');
      return {
        inputTokens: parseInt(parts[0], 10) || 0,
        outputTokens: parseInt(parts[1], 10) || 0,
        totalTokens: parseInt(parts[2], 10) || 0,
        patternsReused: 0,
        tokensSaved: 0,
      };
    }
  } catch { /* table may not exist */ }

  // Fallback: try the pattern reuse count
  try {
    const patternResult = execSync(
      `sqlite3 '${memoryDb}' "SELECT COUNT(*) FROM qe_patterns WHERE access_count > 0;" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5_000, cwd: PROJECT_DIR }
    ).trim();
    return { ...empty, patternsReused: parseInt(patternResult, 10) || 0 };
  } catch { /* ignore */ }

  return empty;
}

// ── Output Parsing ───────────────────────────────────────────────────

interface ParsedOutput {
  testsGenerated: number;
  assertions: number;
  coverageEstimate: number;
  patternsUsed: number;
}

function parseTestGenerationOutput(output: string): ParsedOutput {
  // "Generated N tests"
  const genMatch = output.match(/Generated\s+(\d+)\s+test/i);
  const testsGenerated = genMatch ? parseInt(genMatch[1], 10) : 0;

  // "Assertions: N"
  const assertMatch = output.match(/Assertions:\s*(\d+)/i);
  const assertions = assertMatch ? parseInt(assertMatch[1], 10) : 0;

  // "Coverage Estimate: N%"
  const covMatch = output.match(/Coverage\s+Estimate:\s*([\d.]+)%/i);
  const coverageEstimate = covMatch ? parseFloat(covMatch[1]) : 0;

  // Count pattern-related lines
  const patternMatches = output.match(/pattern|SONA|DecisionTransformer/gi);
  const patternsUsed = patternMatches ? patternMatches.length : 0;

  return { testsGenerated, assertions, coverageEstimate, patternsUsed };
}

// ── Test Generation ──────────────────────────────────────────────────

interface GenerationResult {
  file: string;
  complexity: string;
  lineCount: number;
  sourceChars: number;
  wallTimeMs: number;
  parsed: ParsedOutput;
  outputLength: number;
  rawOutput: string;
}

function generateTestsForFile(file: BenchmarkFile): GenerationResult {
  const absPath = path.join(PROJECT_DIR, file.relativePath);
  const sourceCode = fs.readFileSync(absPath, 'utf-8');
  const sourceChars = sourceCode.length;

  const t0 = performance.now();

  // CLI: aqe test generate <file> --type unit --framework pytest
  const escapedPath = file.relativePath.replace(/'/g, "'\\''");
  let output: string;
  try {
    output = execSync(
      `npx agentic-qe test generate '${escapedPath}' --type unit --framework pytest 2>&1`,
      { ...EXEC_OPTS, timeout: 120_000 }
    ) as string;
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    output = (err.stdout || '') + '\n' + (err.stderr || '');
  }

  const wallTimeMs = performance.now() - t0;
  const parsed = parseTestGenerationOutput(output);

  return {
    file: file.relativePath,
    complexity: file.complexity,
    lineCount: file.lineCount,
    sourceChars,
    wallTimeMs,
    parsed,
    outputLength: output.length,
    rawOutput: output,
  };
}

// ── KG Stats ─────────────────────────────────────────────────────────

interface KGStats {
  vectorCount: number;
  patternCount: number;
  hasKG: boolean;
  indexDuration?: number;
  dbSizeBytes: number;
}

function getKGStats(): KGStats {
  const memoryDb = path.join(AQE_DIR, 'memory.db');
  const empty: KGStats = { vectorCount: 0, patternCount: 0, hasKG: false, dbSizeBytes: 0 };

  if (!fs.existsSync(memoryDb)) return empty;

  try {
    const dbSize = fs.statSync(memoryDb).size;

    // KG data lives in `vectors` table (code index) and `kv_store` (KG nodes/edges)
    const vectorResult = execSync(
      `sqlite3 '${memoryDb}' "SELECT COUNT(*) FROM vectors;" 2>/dev/null`,
      { encoding: 'utf-8' }
    ).trim();

    const kvResult = execSync(
      `sqlite3 '${memoryDb}' "SELECT COUNT(*) FROM kv_store;" 2>/dev/null`,
      { encoding: 'utf-8' }
    ).trim();

    // Also check qe_patterns for learned patterns
    const patternResult = execSync(
      `sqlite3 '${memoryDb}' "SELECT COUNT(*) FROM qe_patterns;" 2>/dev/null`,
      { encoding: 'utf-8' }
    ).trim();

    const vectorCount = parseInt(vectorResult, 10) || 0;
    const kvCount = parseInt(kvResult, 10) || 0;
    const patternCount = parseInt(patternResult, 10) || 0;

    return { vectorCount, patternCount: patternCount + kvCount, hasKG: vectorCount > 0, dbSizeBytes: dbSize };
  } catch {
    return empty;
  }
}

// ── Benchmark Run ────────────────────────────────────────────────────

interface RunResult {
  label: string;
  kgStats: KGStats;
  initOutput: string;
  initDurationMs: number;
  files: GenerationResult[];
  totalWallTimeMs: number;
  aggregateTokens: TokenSnapshot;
}

function runBenchmark(label: string, files: BenchmarkFile[], useAutoInit: boolean): RunResult {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${'═'.repeat(60)}`);

  // Step 1: Wipe and reinitialize
  wipeAqeData();

  const initCmd = useAutoInit ? 'init --auto' : 'init --minimal --skip-patterns';
  const initT0 = performance.now();
  const initOutput = runAqe(initCmd);
  let initDurationMs = performance.now() - initT0;
  console.log(`    Init completed in ${(initDurationMs / 1000).toFixed(1)}s`);

  // For treatment: explicitly run code indexing to populate KG
  if (useAutoInit) {
    console.log('    Running code intelligence indexing...');
    const indexT0 = performance.now();
    const indexOutput = runAqe('code index .');
    const indexMs = performance.now() - indexT0;
    initDurationMs += indexMs;
    console.log(`    Code index completed in ${(indexMs / 1000).toFixed(1)}s`);

    // Log index results
    const filesMatch = indexOutput.match(/Files indexed:\s*(\d+)/);
    const nodesMatch = indexOutput.match(/Nodes created:\s*(\d+)/);
    const edgesMatch = indexOutput.match(/Edges created:\s*(\d+)/);
    if (filesMatch) console.log(`    Indexed: ${filesMatch[1]} files, ${nodesMatch?.[1] || '?'} nodes, ${edgesMatch?.[1] || '?'} edges`);
  }

  // Step 2: KG stats
  const kgStats = getKGStats();
  if (useAutoInit) kgStats.indexDuration = initDurationMs;
  console.log(`    KG vectors: ${kgStats.vectorCount} | patterns: ${kgStats.patternCount} | DB: ${(kgStats.dbSizeBytes / 1024).toFixed(0)}KB`);

  // Step 3: Generate tests per file
  const results: GenerationResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`\n    [${i + 1}/${files.length}] ${file.relativePath} (${file.complexity}, ${file.lineCount} lines)`);

    const result = generateTestsForFile(file);
    results.push(result);

    console.log(`      Tests: ${result.parsed.testsGenerated} | Assertions: ${result.parsed.assertions} | Coverage: ${result.parsed.coverageEstimate}% | Time: ${(result.wallTimeMs / 1000).toFixed(1)}s`);
    console.log(`      Output: ${result.outputLength} chars | Patterns: ${result.parsed.patternsUsed}`);
  }

  // Capture token usage once at end of run (avoids per-file process overhead)
  console.log('\n    Capturing token usage...');
  const aggregateTokens = captureTokenUsage();
  console.log(`    Tokens: in=${aggregateTokens.inputTokens} out=${aggregateTokens.outputTokens} total=${aggregateTokens.totalTokens} saved=${aggregateTokens.tokensSaved}`);

  return {
    label,
    kgStats,
    initOutput,
    initDurationMs,
    files: results,
    totalWallTimeMs: results.reduce((s, r) => s + r.wallTimeMs, 0),
    aggregateTokens,
  };
}

// ── Comparison ───────────────────────────────────────────────────────

interface FileComparison {
  file: string;
  complexity: string;
  lineCount: number;
  control: { tests: number; assertions: number; coverage: number; wallMs: number; outputChars: number; patterns: number };
  treatment: { tests: number; assertions: number; coverage: number; wallMs: number; outputChars: number; patterns: number };
  delta: { tests: number; assertions: number; coverage: number; wallMs: number; outputChars: number; patterns: number };
}

function compare(control: RunResult, treatment: RunResult): FileComparison[] {
  return control.files.map((c, i) => {
    const t = treatment.files[i];
    return {
      file: c.file,
      complexity: c.complexity,
      lineCount: c.lineCount,
      control: {
        tests: c.parsed.testsGenerated,
        assertions: c.parsed.assertions,
        coverage: c.parsed.coverageEstimate,
        wallMs: c.wallTimeMs,
        outputChars: c.outputLength,
        patterns: c.parsed.patternsUsed,
      },
      treatment: {
        tests: t.parsed.testsGenerated,
        assertions: t.parsed.assertions,
        coverage: t.parsed.coverageEstimate,
        wallMs: t.wallTimeMs,
        outputChars: t.outputLength,
        patterns: t.parsed.patternsUsed,
      },
      delta: {
        tests: t.parsed.testsGenerated - c.parsed.testsGenerated,
        assertions: t.parsed.assertions - c.parsed.assertions,
        coverage: t.parsed.coverageEstimate - c.parsed.coverageEstimate,
        wallMs: t.wallTimeMs - c.wallTimeMs,
        outputChars: t.outputLength - c.outputLength,
        patterns: t.parsed.patternsUsed - c.parsed.patternsUsed,
      },
    };
  });
}

// ── Summary Printing ─────────────────────────────────────────────────

function printSummary(control: RunResult, treatment: RunResult, comparisons: FileComparison[]): void {
  const W = 76;
  const hr = '═'.repeat(W);
  const line = (s: string) => console.log(`║  ${s.padEnd(W - 4)}  ║`);
  const blank = () => line('');

  console.log(`\n╔${hr}╗`);
  console.log(`║${'KG-ASSISTED QE BENCHMARK RESULTS'.padStart((W + 32) / 2).padEnd(W)}║`);
  console.log(`╠${hr}╣`);

  blank();
  line('INITIALIZATION');
  line(`  Control  (no KG): ${(control.initDurationMs / 1000).toFixed(1).padStart(6)}s | Vectors: ${control.kgStats.vectorCount} | DB: ${(control.kgStats.dbSizeBytes / 1024).toFixed(0)}KB`);
  line(`  Treatment (KG):   ${(treatment.initDurationMs / 1000).toFixed(1).padStart(6)}s | Vectors: ${treatment.kgStats.vectorCount} | DB: ${(treatment.kgStats.dbSizeBytes / 1024).toFixed(0)}KB`);

  blank();
  line('PER-FILE COMPARISON');
  console.log(`╟${'─'.repeat(W)}╢`);
  line('File                       Ctrl    KG    ΔTests  ΔAssert  ΔCov%   ΔTime');
  console.log(`╟${'─'.repeat(W)}╢`);

  for (const c of comparisons) {
    const name = path.basename(c.file).padEnd(26).slice(0, 26);
    const ctrl = String(c.control.tests).padStart(4);
    const kg = String(c.treatment.tests).padStart(5);
    const dt = ((c.delta.tests >= 0 ? '+' : '') + c.delta.tests).padStart(7);
    const da = ((c.delta.assertions >= 0 ? '+' : '') + c.delta.assertions).padStart(8);
    const dc = ((c.delta.coverage >= 0 ? '+' : '') + c.delta.coverage.toFixed(1)).padStart(6);
    const dw = ((c.delta.wallMs >= 0 ? '+' : '') + (c.delta.wallMs / 1000).toFixed(1) + 's').padStart(7);
    line(`${name} ${ctrl} ${kg} ${dt} ${da} ${dc} ${dw}`);
  }

  console.log(`╟${'─'.repeat(W)}╢`);

  // Aggregates
  const sumCtrl = { tests: 0, assertions: 0, coverage: 0 };
  const sumKg = { tests: 0, assertions: 0, coverage: 0 };
  for (const c of comparisons) {
    sumCtrl.tests += c.control.tests;
    sumCtrl.assertions += c.control.assertions;
    sumCtrl.coverage += c.control.coverage;
    sumKg.tests += c.treatment.tests;
    sumKg.assertions += c.treatment.assertions;
    sumKg.coverage += c.treatment.coverage;
  }

  const n = comparisons.length || 1;
  const ctrlTok = control.aggregateTokens;
  const kgTok = treatment.aggregateTokens;

  blank();
  line('AGGREGATES');
  line(`  Tests generated:  Control=${sumCtrl.tests}  KG=${sumKg.tests}  Δ=${sumKg.tests - sumCtrl.tests}`);
  line(`  Total assertions: Control=${sumCtrl.assertions}  KG=${sumKg.assertions}  Δ=${sumKg.assertions - sumCtrl.assertions}`);
  line(`  Avg coverage:     Control=${(sumCtrl.coverage / n).toFixed(1)}%  KG=${(sumKg.coverage / n).toFixed(1)}%`);
  line(`  Token usage:      Control=${ctrlTok.totalTokens}  KG=${kgTok.totalTokens}  Δ=${kgTok.totalTokens - ctrlTok.totalTokens}`);
  line(`  Tokens saved:     Control=${ctrlTok.tokensSaved}  KG=${kgTok.tokensSaved}`);
  line(`  Patterns reused:  Control=${ctrlTok.patternsReused}  KG=${kgTok.patternsReused}`);
  line(`  Wall time:        Control=${(control.totalWallTimeMs / 1000).toFixed(1)}s  KG=${(treatment.totalWallTimeMs / 1000).toFixed(1)}s`);

  blank();
  line('KEY FINDINGS (Issue #266 Questions)');
  const tokenDelta = kgTok.totalTokens - ctrlTok.totalTokens;
  line(`  Q1: KG reduces tokens?     ${tokenDelta < 0 ? 'YES (saved ' + Math.abs(tokenDelta) + ')' : tokenDelta === 0 ? 'NO CHANGE' : 'NO (increased by ' + tokenDelta + ')'}`);
  line(`  Q2: KG improves quality?   ${sumKg.tests > sumCtrl.tests ? 'YES (+' + (sumKg.tests - sumCtrl.tests) + ' tests, +' + (sumKg.assertions - sumCtrl.assertions) + ' assertions)' : 'NO CHANGE or WORSE'}`);
  line(`  Q3: Latency justified?     ${treatment.totalWallTimeMs < control.totalWallTimeMs * 1.5 ? 'YES (overhead < 50%)' : 'NEEDS REVIEW (>' + ((treatment.totalWallTimeMs / control.totalWallTimeMs - 1) * 100).toFixed(0) + '% slower)'}`);
  line(`  Q4: Best KG query type?    Requires per-query-type instrumentation (future work)`);

  // Q5: By complexity
  for (const cx of ['simple', 'medium', 'complex'] as const) {
    const subset = comparisons.filter((c) => c.complexity === cx);
    if (subset.length === 0) continue;
    const ct = subset.reduce((s, c) => s + c.control.tests, 0);
    const kt = subset.reduce((s, c) => s + c.treatment.tests, 0);
    const ca = subset.reduce((s, c) => s + c.control.assertions, 0);
    const ka = subset.reduce((s, c) => s + c.treatment.assertions, 0);
    line(`  Q5 [${cx.padEnd(7)}]: tests ${ct}→${kt}  assertions ${ca}→${ka}`);
  }

  blank();
  console.log(`╚${hr}╝`);
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     KG-Assisted QE Benchmark (Issue #266)                  ║');
  console.log('║     Test subject: github.com/maxritter/claude-pilot        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Timestamp:   ${new Date().toISOString()}`);
  console.log(`  Max files:   ${maxFiles}`);
  console.log(`  Skip clone:  ${skipClone}`);

  // Step 1: Clone
  if (!skipClone) {
    console.log('\n── 1. Cloning test project ──────────────────────────');
    if (fs.existsSync(PROJECT_DIR)) {
      fs.rmSync(PROJECT_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(BENCH_DIR, { recursive: true });
    execSync(`git clone ${REPO_URL} ${PROJECT_DIR}`, { stdio: 'inherit' });
  } else {
    console.log('\n── 1. Using existing clone ──────────────────────────');
    if (!fs.existsSync(PROJECT_DIR)) {
      console.error(`ERROR: ${PROJECT_DIR} does not exist. Run without --skip-clone.`);
      process.exit(1);
    }
  }

  // Step 2: Select files
  console.log('\n── 2. Selecting benchmark files ─────────────────────');
  const files = discoverBenchmarkFiles();
  console.log(`  Selected ${files.length} files:`);
  for (const f of files) {
    console.log(`    [${f.complexity.padEnd(7)}] ${f.relativePath} (${f.lineCount} lines)`);
  }
  if (files.length === 0) {
    console.error('ERROR: No source files found');
    process.exit(1);
  }

  // Step 3: Run A — Control
  console.log('\n── 3. Run A: Control (no KG) ────────────────────────');
  const control = runBenchmark('CONTROL (no KG)', files, false);

  // Step 4: Run B — Treatment
  console.log('\n── 4. Run B: Treatment (with KG) ────────────────────');
  const treatment = runBenchmark('TREATMENT (KG-assisted)', files, true);

  // Step 5: Compare & report
  console.log('\n── 5. Results ───────────────────────────────────────');
  const comparisons = compare(control, treatment);
  printSummary(control, treatment, comparisons);

  // Step 6: Save JSON
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const resultsPath = path.join(RESULTS_DIR, `kg-benchmark-${Date.now()}.json`);

  const fullResults = {
    timestamp: new Date().toISOString(),
    testSubject: REPO_URL,
    filesCount: files.length,
    control: {
      label: control.label,
      kgStats: control.kgStats,
      initDurationMs: control.initDurationMs,
      totalWallTimeMs: control.totalWallTimeMs,
      aggregateTokens: control.aggregateTokens,
      files: control.files.map((f) => ({
        file: f.file, complexity: f.complexity, lineCount: f.lineCount, sourceChars: f.sourceChars,
        wallTimeMs: f.wallTimeMs, outputLength: f.outputLength, parsed: f.parsed,
      })),
    },
    treatment: {
      label: treatment.label,
      kgStats: treatment.kgStats,
      initDurationMs: treatment.initDurationMs,
      totalWallTimeMs: treatment.totalWallTimeMs,
      aggregateTokens: treatment.aggregateTokens,
      files: treatment.files.map((f) => ({
        file: f.file, complexity: f.complexity, lineCount: f.lineCount, sourceChars: f.sourceChars,
        wallTimeMs: f.wallTimeMs, outputLength: f.outputLength, parsed: f.parsed,
      })),
    },
    comparisons,
    keyFindings: {
      q1_kg_reduces_tokens: treatment.aggregateTokens.totalTokens < control.aggregateTokens.totalTokens,
      q2_kg_improves_quality: comparisons.reduce((s, c) => s + c.delta.tests, 0) > 0,
      q3_latency_justified: treatment.totalWallTimeMs < control.totalWallTimeMs * 1.5,
      q4_best_kg_query_type: 'Requires per-query instrumentation (future work)',
      q5_complexity_breakdown: Object.fromEntries(
        (['simple', 'medium', 'complex'] as const).map((cx) => {
          const subset = comparisons.filter((c) => c.complexity === cx);
          return [cx, {
            files: subset.length,
            controlTests: subset.reduce((s, c) => s + c.control.tests, 0),
            kgTests: subset.reduce((s, c) => s + c.treatment.tests, 0),
            controlAssertions: subset.reduce((s, c) => s + c.control.assertions, 0),
            kgAssertions: subset.reduce((s, c) => s + c.treatment.assertions, 0),
          }];
        })
      ),
    },
  };

  fs.writeFileSync(resultsPath, JSON.stringify(fullResults, null, 2));
  console.log(`\n  Results JSON: ${resultsPath}`);

  // Save raw outputs for manual diff
  const rawDir = path.join(RESULTS_DIR, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  for (const r of control.files) {
    fs.writeFileSync(path.join(rawDir, `control-${path.basename(r.file, '.py')}.txt`), r.rawOutput);
  }
  for (const r of treatment.files) {
    fs.writeFileSync(path.join(rawDir, `treatment-${path.basename(r.file, '.py')}.txt`), r.rawOutput);
  }
  console.log(`  Raw outputs:  ${rawDir}/`);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
