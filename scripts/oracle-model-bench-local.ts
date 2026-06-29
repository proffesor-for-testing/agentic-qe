#!/usr/bin/env tsx
/**
 * LOCAL oracle model benchmark (sibling of oracle-model-bench.ts, ADR-113).
 *
 * Runs durable-first test-gen tasks through LOCAL Ollama models and grades each
 * generated test with the mutation oracle — so a local model's QE quality is
 * directly comparable to the cloud numbers in value-score.ts (qwen3:30b-a3b =
 * 0.62, claude-sonnet-4-6 = 0.83). Uses a multi-fixture set so the pass-rate is
 * less noisy than a single function.
 *
 *   tsx scripts/oracle-model-bench-local.ts                          # default models, all fixtures
 *   tsx scripts/oracle-model-bench-local.ts qwen3-coder:30b          # one model
 *   ATTEMPTS=2 tsx scripts/oracle-model-bench-local.ts               # best-of-2 per fixture
 *   OLLAMA_URL=http://host.docker.internal:11434 tsx scripts/oracle-model-bench-local.ts
 *
 * Uses /api/chat so thinking models emit reasoning into message.thinking and
 * leave clean code in message.content. Reports gen tok/s + mutation kill rate.
 */

import { buildTestGenPrompt } from '../src/validation/test-gen-prompt.js';
import { evaluateOracle } from '../src/validation/oracle-eval.js';
import { extractTestSource } from './run-skill-eval.js';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://host.docker.internal:11434';
const ATTEMPTS = Number(process.env.ATTEMPTS ?? 1); // attempts per fixture (best-of-N).
const THRESHOLD = 0.6; // match value-score.ts framing (mutation >= 60%).

const DEFAULT_MODELS = ['qwen3-coder:30b', 'qwen3:30b-a3b'];

// Small, mutation-rich pure functions: boundaries + branches give the operator
// mutator plenty to flip, so a durable test is genuinely required to score.
interface Fixture { name: string; impl: string; }
const FIXTURES: Fixture[] = [
  { name: 'classify', impl: `export function classify(score, bonus) {\n  const total = score + bonus;\n  if (total >= 90 && bonus > 0) return 'A';\n  if (total >= 70) return 'B';\n  return 'C';\n}\n` },
  { name: 'inRange', impl: `export function inRange(x, lo, hi) {\n  return x >= lo && x <= hi;\n}\n` },
  { name: 'clamp', impl: `export function clamp(n, lo, hi) {\n  if (n < lo) return lo;\n  if (n > hi) return hi;\n  return n;\n}\n` },
  { name: 'gradeLetter', impl: `export function gradeLetter(p) {\n  if (p >= 90) return 'A';\n  if (p >= 80) return 'B';\n  if (p >= 70) return 'C';\n  return 'F';\n}\n` },
  { name: 'max3', impl: `export function max3(a, b, c) {\n  let m = a;\n  if (b > m) m = b;\n  if (c > m) m = c;\n  return m;\n}\n` },
  { name: 'isLeapYear', impl: `export function isLeapYear(y) {\n  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;\n}\n` },
  { name: 'sign', impl: `export function sign(n) {\n  if (n > 0) return 1;\n  if (n < 0) return -1;\n  return 0;\n}\n` },
  { name: 'fizzbuzz', impl: `export function fizzbuzz(n) {\n  if (n % 15 === 0) return 'FizzBuzz';\n  if (n % 3 === 0) return 'Fizz';\n  if (n % 5 === 0) return 'Buzz';\n  return String(n);\n}\n` },
];

interface Gen { content: string; outTokens: number; genTokPerSec: number; }

async function ollamaChat(model: string, prompt: string, timeoutMs: number): Promise<Gen> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        // High cap: thinking models (qwen3) spend ~2.5k tokens reasoning before
        // emitting the answer; too low a cap yields empty content ("no assertions").
        options: { temperature: 0.2, num_predict: 8000 },
      }),
      signal: ac.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 80)}`);
    const j = (await r.json()) as { message?: { content?: string }; eval_count?: number; eval_duration?: number; error?: string };
    if (j.error) throw new Error(j.error);
    const ec = j.eval_count ?? 0;
    const ed = (j.eval_duration ?? 0) / 1e9;
    return { content: j.message?.content ?? '', outTokens: ec, genTokPerSec: ed > 0 ? ec / ed : 0 };
  } finally {
    clearTimeout(t);
  }
}

interface Row {
  id: string; ok: boolean; passFixtures: number; fixtures: number;
  passAttempts: number; totalAttempts: number; sumBestScore: number;
  avgTokPerSec: number; avgLatencyMs: number; note: string; perFixture: string[];
}

async function runModel(model: string): Promise<Row> {
  const row: Row = { id: model, ok: false, passFixtures: 0, fixtures: FIXTURES.length, passAttempts: 0, totalAttempts: 0, sumBestScore: 0, avgTokPerSec: 0, avgLatencyMs: 0, note: '', perFixture: [] };
  let tps = 0, lat = 0, ran = 0, lastReason = '';
  for (const fx of FIXTURES) {
    let fxPassed = false, fxBest = 0;
    for (let i = 0; i < ATTEMPTS; i++) {
      row.totalAttempts++;
      try {
        const started = Date.now();
        const res = await ollamaChat(model, buildTestGenPrompt(fx.impl, fx.name), 300_000);
        lat += Date.now() - started; tps += res.genTokPerSec; ran++;
        const test = extractTestSource(res.content, 'first_code_block');
        const o = evaluateOracle({ moduleName: fx.name, referenceImpl: fx.impl, generatedTest: test, threshold: THRESHOLD });
        row.ok = true;
        if (o.passed) { row.passAttempts++; fxPassed = true; }
        if (o.mutationScore > fxBest) fxBest = o.mutationScore;
        lastReason = o.reason;
      } catch (e) {
        lastReason = e instanceof Error ? e.message : String(e);
        if (/HTTP 40[0-9]|not found|no such model/i.test(lastReason)) { row.note = lastReason.slice(0, 50); return row; }
      }
    }
    if (fxPassed) row.passFixtures++;
    row.sumBestScore += fxBest;
    row.perFixture.push(`${fx.name}:${fxPassed ? 'P' : '.'}(${(fxBest * 100).toFixed(0)}%)`);
  }
  row.avgTokPerSec = ran ? tps / ran : 0;
  row.avgLatencyMs = ran ? lat / ran : 0;
  row.note = lastReason.slice(0, 40);
  return row;
}

async function main(): Promise<void> {
  const models = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_MODELS;
  console.log(`Local oracle bench @ ${OLLAMA_URL} — ${FIXTURES.length} fixtures, best-of-${ATTEMPTS}, mutation >= ${THRESHOLD * 100}%.\n`);

  const rows: Row[] = [];
  for (const m of models) {
    process.stdout.write(`running ${m.padEnd(20)} ... `);
    const r = await runModel(m);
    rows.push(r);
    console.log(r.ok ? `${r.passFixtures}/${r.fixtures} fixtures, ${r.avgTokPerSec.toFixed(0)} tok/s, ${(r.avgLatencyMs / 1000).toFixed(1)}s/gen` : `ERROR: ${r.note}`);
  }

  console.log('\n===================== RESULTS (' + FIXTURES.length + ' fixtures, best-of-' + ATTEMPTS + ') =====================');
  console.log('fixtPass  attPass   avgMut   tok/s   s/gen   model');
  for (const r of rows) {
    if (!r.ok) { console.log(`ERROR                                       ${r.id} (${r.note})`); continue; }
    const avgMut = (r.sumBestScore / r.fixtures) * 100;
    console.log(
      `${`${r.passFixtures}/${r.fixtures}`.padEnd(8)}  ${`${r.passAttempts}/${r.totalAttempts}`.padEnd(7)}  ${`${avgMut.toFixed(0)}%`.padStart(5)}   ${`${r.avgTokPerSec.toFixed(0)}`.padStart(5)}  ${`${(r.avgLatencyMs / 1000).toFixed(1)}`.padStart(5)}   ${r.id}`,
    );
  }
  for (const r of rows) if (r.ok) console.log(`  ${r.id}: ${r.perFixture.join('  ')}`);
  console.log('\nCompare: qwen3:30b-a3b=0.62, z-ai/glm-5.2=0.71, claude-sonnet-4-6=0.83 (value-score.ts).');
}

main().catch((e) => { console.error('bench error:', e instanceof Error ? e.message : String(e)); process.exit(1); });
