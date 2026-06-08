#!/usr/bin/env tsx
/**
 * NagualJudgeBenchmark — LLM-as-Judge calibration harness
 *
 * Compares local Ollama models as quality judges for nagual patterns.
 * Ground truth: reward tiers in nagual.db + deprecated/long-term status in AQE memory.db.
 *
 * Metrics:
 *   AUROC          — discrimination (can the judge separate high from low value?)
 *   Brier Score    — calibration (does score 0.7 mean 70% quality?)
 *   Ambiguous %    — scores landing in [0.4, 0.6] (too many = judge not decisive)
 *   Precision@20   — top-20 by judge score, how many are truly high-value
 *   P50/P95 latency — ms per pattern
 *   Stability σ    — std-dev across 3 runs on same input (lower = better)
 *
 * Usage:
 *   npx tsx scripts/judge-benchmark.ts                         # phase 1 (quick)
 *   npx tsx scripts/judge-benchmark.ts --phase 2              # full 5-model run
 *   npx tsx scripts/judge-benchmark.ts --phase 3              # stability only
 *   npx tsx scripts/judge-benchmark.ts --models gemma4:12b-mlx,qwen3:8b
 *   npx tsx scripts/judge-benchmark.ts --dry-run              # show dataset only
 *
 * Recommended models (all fit in 48GB M5 Pro):
 *   Already installed: gemma4:12b-mlx, qwen3:8b, qwen3:30b-a3b
 *   Pull before phase 2: ollama pull deepseek-r1:7b && ollama pull phi4:14b
 */

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NAGUAL_DB_PATH = resolve(homedir(), 'qe-ruvector/nagual-rs/nagual.db');
const AQE_DB_PATH    = resolve(process.cwd(), '.agentic-qe/memory.db');
const OLLAMA_BASE    = process.env['NAGUAL_JUDGE_URL'] ?? 'http://localhost:11434';
const JUDGE_TIMEOUT  = 90_000; // ms — thinking models need more time

const PHASE1_MODELS  = ['gemma4:12b-mlx', 'qwen3:8b'];
const PHASE2_MODELS  = ['gemma4:12b-mlx', 'qwen3:8b', 'qwen3:30b-a3b', 'deepseek-r1:7b', 'phi4:14b'];
const STABILITY_MODELS = ['gemma4:12b-mlx', 'qwen3:8b'];
const STABILITY_REPEATS = 3;
const STABILITY_SAMPLE  = 20;

const MAX_TEXT_LEN = 600;
const AMBIGUOUS_LOW  = 0.4;
const AMBIGUOUS_HIGH = 0.6;

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const phaseIdx    = args.indexOf('--phase');
const phase       = phaseIdx !== -1 ? Number(args[phaseIdx + 1]) : 1;
const dryRun      = args.includes('--dry-run');
const customModels = args.includes('--models')
  ? args[args.indexOf('--models') + 1].split(',')
  : undefined;

const MODELS = customModels ?? (phase === 2 ? PHASE2_MODELS : phase === 3 ? STABILITY_MODELS : PHASE1_MODELS);

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

interface LabeledPattern {
  id: string;
  text: string;      // problem + '\n' + solution (truncated to MAX_TEXT_LEN)
  label: number;     // 1 = high-value, 0 = low-value, 0.5 = ambiguous/calibration
  source: 'nagual' | 'aqe';
  reward?: number;   // original reward if available
}

interface JudgeCall {
  model: string;
  patternId: string;
  score: number;
  reason: string;
  latencyMs: number;
  runIndex: number;  // for stability: 0-2
  promptVariant: 'simple' | 'rubric';
}

interface ModelReport {
  model: string;
  promptVariant: 'simple' | 'rubric';
  auroc: number;
  brierScore: number;
  ambiguousPct: number;
  precisionAt20: number;
  latencyP50: number;
  latencyP95: number;
  stabilityStddev?: number; // phase 3 only
  callCount: number;
  errorCount: number;
}

// ---------------------------------------------------------------------------
// Dataset construction
// ---------------------------------------------------------------------------

function buildDataset(): LabeledPattern[] {
  const patterns: LabeledPattern[] = [];

  // ---- Nagual patterns ----
  if (existsSync(NAGUAL_DB_PATH)) {
    const db = new Database(NAGUAL_DB_PATH, { readonly: true });

    const boilerplateFilter = `
      AND solution NOT LIKE '%lifecycle tracked%'
      AND solution NOT LIKE '%tracked for learning%'
      AND solution NOT LIKE '%completed successfully%'
      AND solution NOT LIKE '%needs investigation%'
      AND solution NOT LIKE '%check compiler errors%'
      AND solution NOT LIKE '%operation executed%'
      AND LENGTH(solution) > 100
    `;

    // High-value: reward >= 0.85, real content, proven reuse
    const high = db.prepare(`
      SELECT id, problem, solution, reward
      FROM reasoning_patterns
      WHERE reward >= 0.85 ${boilerplateFilter}
      ORDER BY reward DESC, reuse_count DESC
      LIMIT 50
    `).all() as Array<{ id: string; problem: string; solution: string; reward: number }>;

    for (const r of high) {
      patterns.push({
        id: `nagual:${r.id}`,
        text: truncate(`${r.problem}\n\n${r.solution}`),
        label: 1,
        source: 'nagual',
        reward: r.reward,
      });
    }

    // Low-value: lifecycle/boilerplate categories — short solutions, never-updated default reward
    const low = db.prepare(`
      SELECT id, problem, solution, reward
      FROM reasoning_patterns
      WHERE category IN ('agent-complete','agent-spawn','task-success','nagual-usage',
                         'compaction-flush','code-edit','config-edit','build-success',
                         'test-success','git-commit','git-push','docker-op')
        AND LENGTH(solution) < 80
        AND reward <= 0.5
      ORDER BY RANDOM()
      LIMIT 50
    `).all() as Array<{ id: string; problem: string; solution: string; reward: number }>;

    for (const r of low) {
      patterns.push({
        id: `nagual:${r.id}`,
        text: truncate(`${r.problem}\n\n${r.solution}`),
        label: 0,
        source: 'nagual',
        reward: r.reward,
      });
    }

    // Calibration band: reward 0.45-0.60 (the uninformative "default 0.5" zone)
    const medium = db.prepare(`
      SELECT id, problem, solution, reward
      FROM reasoning_patterns
      WHERE reward >= 0.45 AND reward <= 0.60
        AND LENGTH(solution) > 100
        AND solution NOT LIKE '%lifecycle tracked%'
        AND solution NOT LIKE '%tracked for learning%'
        AND solution NOT LIKE '%completed successfully%'
        AND solution NOT LIKE '%needs investigation%'
        AND LENGTH(solution) > 100
      ORDER BY RANDOM()
      LIMIT 50
    `).all() as Array<{ id: string; problem: string; solution: string; reward: number }>;

    for (const r of medium) {
      patterns.push({
        id: `nagual:${r.id}`,
        text: truncate(`${r.problem}\n\n${r.solution}`),
        label: 0.5,
        source: 'nagual',
        reward: r.reward,
      });
    }

    db.close();
    console.log(`  nagual.db: ${high.length} high, ${low.length} low, ${medium.length} medium`);
  } else {
    console.warn(`  WARN: nagual.db not found at ${NAGUAL_DB_PATH}`);
  }

  // ---- AQE patterns (try live DB, fall back to backup, skip gracefully) ----
  const AQE_BACKUP = resolve(process.cwd(), '.agentic-qe/backup-before-v3-migration/memory.db');

  const tryAqe = (dbPath: string, label: string): boolean => {
    try {
      const db = new Database(dbPath, { readonly: true });
      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(r => r.name);

      if (tables.includes('qe_patterns')) {
        const high = db.prepare(`
          SELECT id, name, description, success_rate, usage_count
          FROM qe_patterns
          WHERE deprecated_at IS NULL AND consecutive_failures < 2
            AND usage_count >= 3 AND (LENGTH(description) > 30 OR LENGTH(name) > 20)
          ORDER BY success_rate DESC, usage_count DESC LIMIT 20
        `).all() as Array<{ id: string; name: string; description: string | null; success_rate: number; usage_count: number }>;

        const low = db.prepare(`
          SELECT id, name, description, success_rate
          FROM qe_patterns WHERE deprecated_at IS NOT NULL ORDER BY RANDOM() LIMIT 20
        `).all() as Array<{ id: string; name: string; description: string | null; success_rate: number }>;

        for (const r of high) patterns.push({ id: `aqe:${r.id}`, text: truncate(`${r.name}\n\n${r.description ?? ''}`), label: 1, source: 'aqe', reward: r.success_rate });
        for (const r of low)  patterns.push({ id: `aqe:${r.id}`, text: truncate(`${r.name}\n\n${r.description ?? ''}`), label: 0, source: 'aqe', reward: r.success_rate });
        db.close();
        console.log(`  ${label}: ${high.length} long-term (high), ${low.length} deprecated (low)`);
        return true;

      } else if (tables.includes('patterns')) {
        // Legacy schema: pattern TEXT, confidence REAL, success_rate REAL
        const high = db.prepare(`
          SELECT id, pattern, confidence, success_rate, usage_count
          FROM patterns WHERE confidence >= 0.8 AND success_rate >= 0.8 AND usage_count >= 2
          ORDER BY success_rate DESC LIMIT 15
        `).all() as Array<{ id: string; pattern: string; confidence: number; success_rate: number; usage_count: number }>;

        const low = db.prepare(`
          SELECT id, pattern, confidence, success_rate
          FROM patterns WHERE confidence < 0.4 OR success_rate < 0.3
          ORDER BY RANDOM() LIMIT 15
        `).all() as Array<{ id: string; pattern: string; confidence: number; success_rate: number }>;

        for (const r of high) patterns.push({ id: `aqe:${r.id}`, text: truncate(r.pattern), label: 1, source: 'aqe', reward: r.success_rate });
        for (const r of low)  patterns.push({ id: `aqe:${r.id}`, text: truncate(r.pattern), label: 0, source: 'aqe', reward: r.success_rate });
        db.close();
        console.log(`  ${label} (legacy): ${high.length} high-confidence, ${low.length} low-confidence`);
        return true;
      }

      db.close();
      return false;
    } catch {
      return false;
    }
  };

  if (!tryAqe(AQE_DB_PATH, 'memory.db') && existsSync(AQE_BACKUP)) {
    if (!tryAqe(AQE_BACKUP, 'memory.db (backup)')) {
      console.warn('  WARN: AQE memory.db unreadable — running on nagual patterns only');
    }
  }

  // Deduplicate by id
  const seen = new Set<string>();
  return patterns.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

function truncate(text: string): string {
  return text.slice(0, MAX_TEXT_LEN);
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SIMPLE_PROMPT = (text: string) => [
  'You are a QE pattern quality judge.',
  'Rate the following pattern for: coherence, specificity, and reusability in a software quality engineering context.',
  'Reply with valid JSON only, no other text: {"score": <float 0.0-1.0>, "reason": "<one sentence>"}',
  '',
  `Pattern:\n${text}`,
].join('\n');

const RUBRIC_PROMPT = (text: string) => [
  'You are a QE pattern quality judge. Rate this pattern on a 0.0-1.0 scale:',
  '  1.00 — Specific, actionable, proven technique; clear problem context, measurable outcome',
  '  0.75 — Clear problem+solution, reusable with minor adaptation, concrete steps given',
  '  0.50 — General advice; correct but not specific enough to apply directly',
  '  0.25 — Vague, obvious, or requires extensive context to be useful',
  '  0.00 — No actionable content, boilerplate, or incorrect',
  '',
  'Evaluate separately for: (a) specificity of problem, (b) actionability of solution, (c) reusability across projects.',
  'Take the weighted average (a:25%, b:50%, c:25%).',
  'Reply with valid JSON only: {"score": <float 0.0-1.0>, "reason": "<one sentence explaining the rating>"}',
  '',
  `Pattern:\n${text}`,
].join('\n');

// ---------------------------------------------------------------------------
// Ollama call — uses native /api/chat with think:false for fast non-thinking mode.
// Pass --thinking CLI flag to enable chain-of-thought (slower, higher quality).
// ---------------------------------------------------------------------------

const USE_THINKING = args.includes('--thinking');

async function callJudge(
  model: string,
  promptText: string,
): Promise<{ score: number; reason: string; latencyMs: number } | null> {
  const t0 = Date.now();
  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        think: USE_THINKING,  // false = skip CoT; 7s gemma4 vs 30s; 1s qwen3 vs 25s
        stream: false,
        messages: [{ role: 'user', content: promptText }],
        options: { temperature: 0.1, num_predict: USE_THINKING ? 3000 : 500 },
      }),
      signal: AbortSignal.timeout(JUDGE_TIMEOUT),
    });

    if (!resp.ok) return null;

    const data = await resp.json() as {
      message?: { content?: string; thinking?: string };
    };
    const raw = (data.message?.content ?? '') || (data.message?.thinking ?? '');

    // Strip markdown code fences
    const cleaned = raw.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim();

    // Try to parse the last JSON object with a "score" key
    const allMatches = [...cleaned.matchAll(/\{[^{}]*"score"\s*:\s*[\d.]+[^{}]*\}/g)];
    const jsonMatch = allMatches.at(-1)?.[0] ?? cleaned.match(/\{[\s\S]*?"score"[\s\S]*?\}/)?.[0];

    let rawScore: number | undefined;
    let reason = '';

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch) as { score?: unknown; reason?: unknown };
        if (typeof parsed.score === 'number') {
          rawScore = parsed.score;
          reason = typeof parsed.reason === 'string' ? parsed.reason : '';
        }
      } catch { /* fall through */ }
    }

    // Fallback: scan for "Score: X.X" plain text
    if (rawScore === undefined) {
      const m = raw.match(/(?:^|\n)\s*[Ss]core\s*[:=]\s*([\d.]+)/m);
      if (m) rawScore = parseFloat(m[1]);
    }

    if (rawScore === undefined) return null;

    // Normalize 0-10 scale to 0-1 if model ignored instructions
    const normalized = rawScore > 1 ? rawScore / 10 : rawScore;

    return {
      score: Math.max(0, Math.min(1, normalized)),
      reason,
      latencyMs: Date.now() - t0,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

function computeAUROC(calls: JudgeCall[], patterns: LabeledPattern[]): number {
  // Use only binary labels (0 or 1), exclude 0.5 calibration band
  const binary = calls
    .map(c => {
      const p = patterns.find(x => x.id === c.patternId);
      return p && p.label !== 0.5 ? { score: c.score, label: p.label } : null;
    })
    .filter((x): x is { score: number; label: number } => x !== null);

  if (binary.length < 2) return 0;

  // Sort by score descending
  binary.sort((a, b) => b.score - a.score);

  const totalPos = binary.filter(x => x.label === 1).length;
  const totalNeg = binary.filter(x => x.label === 0).length;
  if (totalPos === 0 || totalNeg === 0) return 0;

  let tp = 0; let fp = 0;
  let prevTpr = 0; let prevFpr = 0;
  let auc = 0;

  for (const { label } of binary) {
    if (label === 1) tp++; else fp++;
    const tpr = tp / totalPos;
    const fpr = fp / totalNeg;
    auc += (tpr + prevTpr) / 2 * (fpr - prevFpr); // trapezoid
    prevTpr = tpr; prevFpr = fpr;
  }
  return auc;
}

function computeBrier(calls: JudgeCall[], patterns: LabeledPattern[]): number {
  const pairs = calls
    .map(c => {
      const p = patterns.find(x => x.id === c.patternId);
      return p ? { score: c.score, label: p.label } : null;
    })
    .filter((x): x is { score: number; label: number } => x !== null);

  if (pairs.length === 0) return 1;
  return pairs.reduce((sum, x) => sum + Math.pow(x.score - x.label, 2), 0) / pairs.length;
}

function computePrecisionAtK(calls: JudgeCall[], patterns: LabeledPattern[], k = 20): number {
  const sorted = [...calls].sort((a, b) => b.score - a.score).slice(0, k);
  const hits = sorted.filter(c => {
    const p = patterns.find(x => x.id === c.patternId);
    return p && p.label === 1;
  });
  return hits.length / Math.min(k, sorted.length);
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)] ?? 0;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length);
}

// ---------------------------------------------------------------------------
// Check model availability
// ---------------------------------------------------------------------------

async function checkAvailableModels(models: string[]): Promise<Set<string>> {
  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return new Set(models); // assume all available if we can't check
    const data = await resp.json() as { models?: Array<{ name: string }> };
    const available = new Set((data.models ?? []).map(m => m.name));
    return new Set(models.filter(m => available.has(m)));
  } catch {
    return new Set(models);
  }
}

// ---------------------------------------------------------------------------
// Run benchmark
// ---------------------------------------------------------------------------

async function runPhase1or2(
  patterns: LabeledPattern[],
  models: string[],
  promptVariants: Array<'simple' | 'rubric'>,
): Promise<JudgeCall[]> {
  const calls: JudgeCall[] = [];
  const binaryPatterns = patterns.filter(p => p.label !== 0.5);
  const allPatterns = patterns; // include calibration band for Brier

  console.log(`\n  Running ${models.length} model(s) × ${promptVariants.length} prompt(s) × ${allPatterns.length} patterns`);
  console.log(`  (${binaryPatterns.length} binary-labeled + ${allPatterns.length - binaryPatterns.length} calibration)`);

  for (const model of models) {
    for (const variant of promptVariants) {
      let errors = 0;
      process.stdout.write(`\n  [${model}/${variant}] `);

      for (let i = 0; i < allPatterns.length; i++) {
        const p = allPatterns[i];
        const prompt = variant === 'rubric' ? RUBRIC_PROMPT(p.text) : SIMPLE_PROMPT(p.text);
        const result = await callJudge(model, prompt);

        if (result) {
          calls.push({
            model,
            patternId: p.id,
            score: result.score,
            reason: result.reason,
            latencyMs: result.latencyMs,
            runIndex: 0,
            promptVariant: variant,
          });
          process.stdout.write(result.score >= 0.7 ? '█' : result.score >= 0.4 ? '▒' : '░');
        } else {
          errors++;
          process.stdout.write('✗');
        }

        if ((i + 1) % 20 === 0) process.stdout.write(` ${i + 1}/${allPatterns.length}`);
      }

      if (errors > 0) process.stdout.write(` (${errors} errors)`);
    }
  }

  console.log('\n');
  return calls;
}

async function runStability(
  patterns: LabeledPattern[],
  models: string[],
): Promise<JudgeCall[]> {
  const sample = patterns.filter(p => p.label !== 0.5).slice(0, STABILITY_SAMPLE);
  const calls: JudgeCall[] = [];

  console.log(`\n  Stability: ${STABILITY_REPEATS} repeats × ${sample.length} patterns × ${models.length} models`);

  for (const model of models) {
    for (let run = 0; run < STABILITY_REPEATS; run++) {
      process.stdout.write(`\n  [${model}/run${run + 1}] `);

      for (const p of sample) {
        const prompt = SIMPLE_PROMPT(p.text);
        const result = await callJudge(model, prompt);

        if (result) {
          calls.push({
            model,
            patternId: p.id,
            score: result.score,
            reason: result.reason,
            latencyMs: result.latencyMs,
            runIndex: run,
            promptVariant: 'simple',
          });
          process.stdout.write(result.score >= 0.7 ? '█' : '▒');
        } else {
          process.stdout.write('✗');
        }
      }
    }
  }

  console.log('\n');
  return calls;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function computeReport(
  model: string,
  variant: 'simple' | 'rubric',
  allCalls: JudgeCall[],
  patterns: LabeledPattern[],
  stabilityCallsByModel?: Map<string, JudgeCall[]>,
): ModelReport {
  const calls = allCalls.filter(c => c.model === model && c.promptVariant === variant && c.runIndex === 0);

  const latencies = calls.map(c => c.latencyMs);
  const ambiguousCount = calls.filter(c => c.score >= AMBIGUOUS_LOW && c.score <= AMBIGUOUS_HIGH).length;

  let stabilityStddev: number | undefined;
  if (stabilityCallsByModel?.has(model)) {
    const stabCalls = stabilityCallsByModel.get(model)!;
    const patternIds = [...new Set(stabCalls.map(c => c.patternId))];
    const stddevs = patternIds.map(id => {
      const scores = stabCalls.filter(c => c.patternId === id).map(c => c.score);
      return stddev(scores);
    });
    stabilityStddev = stddevs.reduce((a, b) => a + b, 0) / stddevs.length;
  }

  return {
    model,
    promptVariant: variant,
    auroc: computeAUROC(calls, patterns),
    brierScore: computeBrier(calls, patterns),
    ambiguousPct: calls.length > 0 ? (ambiguousCount / calls.length) * 100 : 0,
    precisionAt20: computePrecisionAtK(calls, patterns, 20),
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    stabilityStddev,
    callCount: calls.length,
    errorCount: 0, // errors are missing calls
  };
}

function printTable(reports: ModelReport[]): void {
  const fmt = (n: number, digits = 3) => n.toFixed(digits);

  console.log('\n' + '═'.repeat(110));
  console.log('NagualJudgeBenchmark Results');
  console.log('═'.repeat(110));
  console.log(
    'Model'.padEnd(22) +
    'Prompt'.padEnd(8) +
    'AUROC'.padStart(7) +
    'Brier'.padStart(7) +
    'Amb%'.padStart(7) +
    'P@20'.padStart(7) +
    'P50ms'.padStart(8) +
    'P95ms'.padStart(8) +
    'Stability'.padStart(11) +
    'N'.padStart(6),
  );
  console.log('─'.repeat(110));

  const sorted = [...reports].sort((a, b) => b.auroc - a.auroc);

  for (const r of sorted) {
    const stab = r.stabilityStddev !== undefined ? fmt(r.stabilityStddev) : '  —  ';
    const aurocFmt = r.auroc >= 0.8 ? `\x1b[32m${fmt(r.auroc)}\x1b[0m` : r.auroc >= 0.7 ? fmt(r.auroc) : `\x1b[31m${fmt(r.auroc)}\x1b[0m`;
    console.log(
      r.model.padEnd(22) +
      r.promptVariant.padEnd(8) +
      aurocFmt.padStart(7 + (aurocFmt.length - fmt(r.auroc).length)) +
      fmt(r.brierScore).padStart(7) +
      `${fmt(r.ambiguousPct, 1)}%`.padStart(7) +
      fmt(r.precisionAt20).padStart(7) +
      `${Math.round(r.latencyP50)}`.padStart(8) +
      `${Math.round(r.latencyP95)}`.padStart(8) +
      stab.padStart(11) +
      `${r.callCount}`.padStart(6),
    );
  }

  console.log('═'.repeat(110));
  console.log('AUROC: >0.80 \x1b[32m■\x1b[0m good   0.70-0.80 usable   <0.70 \x1b[31m■\x1b[0m weak');
  console.log('Brier: lower=better (perfect=0)   Amb%: lower=more decisive   Stability: lower=more consistent');
  console.log();

  // Recommendation
  const winner = sorted[0];
  if (winner) {
    console.log(`\x1b[1mRecommendation:\x1b[0m ${winner.model} (${winner.promptVariant}) — AUROC ${fmt(winner.auroc)}, P50 ${Math.round(winner.latencyP50)}ms`);
    if (winner.stabilityStddev !== undefined) {
      console.log(`  Stability σ = ${fmt(winner.stabilityStddev)} (${winner.stabilityStddev < 0.05 ? '✓ stable' : '⚠ unstable — consider ensemble'})`);
    }
    if (winner.ambiguousPct > 25) {
      console.log('  ⚠ High ambiguous zone rate — consider ensemble voting to resolve unclear cases');
    }
  }
}

// ---------------------------------------------------------------------------
// Disaggregation: where judge adds value over outcome_reward alone
// ---------------------------------------------------------------------------

function printDisagreementAnalysis(
  model: string,
  variant: 'simple' | 'rubric',
  allCalls: JudgeCall[],
  patterns: LabeledPattern[],
): void {
  const calls = allCalls.filter(c => c.model === model && c.promptVariant === variant && c.runIndex === 0);

  // Patterns with default reward (0.45-0.55) but judge scores high (>= 0.7) — judge found value outcome missed
  const judgeFoundValue = calls
    .filter(c => {
      const p = patterns.find(x => x.id === c.patternId);
      return p && p.reward !== undefined && p.reward >= 0.45 && p.reward <= 0.55 && c.score >= 0.7;
    })
    .slice(0, 5);

  // High-outcome patterns (>= 0.85) judge scored low (< 0.4) — judge disagrees, potential false positive
  const judgeDisagreed = calls
    .filter(c => {
      const p = patterns.find(x => x.id === c.patternId);
      return p && p.reward !== undefined && p.reward >= 0.85 && c.score < 0.4;
    })
    .slice(0, 5);

  if (judgeFoundValue.length > 0) {
    console.log(`\n\x1b[1mJudge adds signal (default reward, judge scores high):\x1b[0m`);
    for (const c of judgeFoundValue) {
      const p = patterns.find(x => x.id === c.patternId)!;
      console.log(`  score=${c.score.toFixed(2)} reward=${(p.reward ?? 0).toFixed(2)} — ${p.text.slice(0, 80).replace(/\n/g, ' ')}…`);
      console.log(`    reason: ${c.reason}`);
    }
  }

  if (judgeDisagreed.length > 0) {
    console.log(`\n\x1b[1mJudge disagrees with high-reward (possible quality mismatch):\x1b[0m`);
    for (const c of judgeDisagreed) {
      const p = patterns.find(x => x.id === c.patternId)!;
      console.log(`  score=${c.score.toFixed(2)} reward=${(p.reward ?? 0).toFixed(2)} — ${p.text.slice(0, 80).replace(/\n/g, ' ')}…`);
      console.log(`    reason: ${c.reason}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('═'.repeat(60));
  console.log('NagualJudgeBenchmark');
  console.log(`Phase: ${phase}  Models: ${MODELS.join(', ')}`);
  console.log(`Ollama: ${OLLAMA_BASE}`);
  console.log('═'.repeat(60));

  // Dataset
  console.log('\nBuilding dataset...');
  const patterns = buildDataset();
  const highCount   = patterns.filter(p => p.label === 1).length;
  const lowCount    = patterns.filter(p => p.label === 0).length;
  const medCount    = patterns.filter(p => p.label === 0.5).length;
  console.log(`  Total: ${patterns.length} patterns (${highCount} high, ${lowCount} low, ${medCount} calibration)`);

  if (dryRun) {
    console.log('\nDry run — dataset preview:');
    for (const p of patterns.slice(0, 10)) {
      console.log(`  [${p.source}] label=${p.label} reward=${p.reward?.toFixed(2) ?? '?'} — ${p.text.slice(0, 80).replace(/\n/g, ' ')}…`);
    }
    return;
  }

  if (patterns.length < 10) {
    console.error('ERROR: dataset too small — check DB paths');
    process.exit(1);
  }

  // Model availability
  const available = await checkAvailableModels(MODELS);
  const toRun = MODELS.filter(m => available.has(m));
  const missing = MODELS.filter(m => !available.has(m));
  if (missing.length > 0) {
    console.warn(`\nWARN: models not available, skipping: ${missing.join(', ')}`);
    console.warn('  Pull with: ' + missing.map(m => `ollama pull ${m}`).join(' && '));
  }
  if (toRun.length === 0) {
    console.error('ERROR: no models available — is Ollama running?');
    process.exit(1);
  }

  console.log(`\nRunning with: ${toRun.join(', ')}`);

  const allCalls: JudgeCall[] = [];
  const stabilityMap = new Map<string, JudgeCall[]>();

  if (phase === 3) {
    // Stability only
    const stabCalls = await runStability(patterns, toRun);
    for (const m of toRun) {
      stabilityMap.set(m, stabCalls.filter(c => c.model === m));
    }
    allCalls.push(...stabCalls);
  } else {
    // Phase 1: simple prompt only; Phase 2: both prompts
    const variants: Array<'simple' | 'rubric'> = phase === 2 ? ['simple', 'rubric'] : ['simple'];
    const calls = await runPhase1or2(patterns, toRun, variants);
    allCalls.push(...calls);

    // Phase 2 also includes stability
    if (phase === 2) {
      const stabCalls = await runStability(patterns, toRun.filter(m => STABILITY_MODELS.includes(m)));
      for (const m of toRun) {
        if (STABILITY_MODELS.includes(m)) {
          stabilityMap.set(m, stabCalls.filter(c => c.model === m));
        }
      }
      allCalls.push(...stabCalls);
    }
  }

  // Build reports
  const reports: ModelReport[] = [];
  const variants = phase === 2 ? ['simple', 'rubric'] as const : ['simple'] as const;

  for (const model of toRun) {
    for (const variant of variants) {
      const hasCalls = allCalls.some(c => c.model === model && c.promptVariant === variant && c.runIndex === 0);
      if (!hasCalls) continue;
      reports.push(computeReport(model, variant, allCalls, patterns, stabilityMap));
    }
  }

  // Print results
  printTable(reports);

  // Disaggregation on best model
  const best = [...reports].sort((a, b) => b.auroc - a.auroc)[0];
  if (best) {
    printDisagreementAnalysis(best.model, best.promptVariant, allCalls, patterns);
  }

  // Save raw results
  const output = {
    timestamp: new Date().toISOString(),
    phase,
    models: toRun,
    datasetSize: patterns.length,
    reports,
    rawCallCount: allCalls.length,
  };
  const outPath = join(process.cwd(), `scripts/judge-benchmark-results-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nRaw results saved: ${outPath}`);
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
