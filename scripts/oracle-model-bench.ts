#!/usr/bin/env tsx
/**
 * Oracle model benchmark (ADR-113): run the SAME test-generation task through
 * several OpenRouter models (free + cheap) and grade each generated test with
 * the mutation oracle. Shows which budget models can do the job, so users can
 * pick a cheap/free provider and save money.
 *
 *   tsx scripts/oracle-model-bench.ts          # 5 free + 5 cheap
 *   tsx scripts/oracle-model-bench.ts free     # free only
 *
 * Loads .env for OPENROUTER_API_KEY; never prints the key.
 */

import { readFileSync, existsSync } from 'fs';
import { buildTestGenPrompt } from '../src/validation/test-gen-prompt.js';
import { evaluateOracle } from '../src/validation/oracle-eval.js';
import { extractTestSource } from './run-skill-eval.js';

// NOTE: calls the OpenRouter HTTP API directly. AQE's OpenRouterProvider currently
// hangs/errors under the ProviderManager (tracked separately); the oracle grading
// below is identical regardless of how the test text was generated.
async function openRouterGenerate(model: string, prompt: string, timeoutMs: number): Promise<{ content: string; outTokens: number }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/proffesor-for-testing/agentic-qe',
        'X-Title': 'AQE oracle eval',
      },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 1500, temperature: 0.2 }),
      signal: ac.signal,
    });
    if (r.status === 429) throw new Error('HTTP 429 rate-limited');
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 80)}`);
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { completion_tokens?: number }; error?: { message?: string } };
    if (j.error) throw new Error(j.error.message ?? 'api error');
    return { content: j.choices?.[0]?.message?.content ?? '', outTokens: j.usage?.completion_tokens ?? 0 };
  } finally {
    clearTimeout(t);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Retry transient 429s (free tiers are heavily throttled) with backoff.
async function generateWithRetry(model: string, prompt: string): Promise<{ content: string; outTokens: number }> {
  let lastErr: Error | undefined;
  for (let i = 0; i < 4; i++) {
    try {
      return await openRouterGenerate(model, prompt, 120_000);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (!/429/.test(lastErr.message)) throw lastErr; // only retry rate limits
      await sleep(3000 * (i + 1));
    }
  }
  throw lastErr ?? new Error('unknown');
}

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const REFERENCE_IMPL = `export function classify(score, bonus) {
  const total = score + bonus;
  if (total >= 90 && bonus > 0) return 'A';
  if (total >= 70) return 'B';
  return 'C';
}
`;

// $/1M out price recorded for cost framing (free = 0). Models chosen as a spread
// of budget options capable of code; pricing/ids from `tsx scripts/openrouter-models.ts`.
interface Candidate { tier: 'free' | 'cheap'; id: string; outPrice: number }
const FREE: Candidate[] = [
  { tier: 'free', id: 'qwen/qwen3-coder:free', outPrice: 0 },
  { tier: 'free', id: 'openai/gpt-oss-120b:free', outPrice: 0 },
  { tier: 'free', id: 'meta-llama/llama-3.3-70b-instruct:free', outPrice: 0 },
  { tier: 'free', id: 'google/gemma-4-31b-it:free', outPrice: 0 },
  { tier: 'free', id: 'nvidia/nemotron-3-super-120b-a12b:free', outPrice: 0 },
];
const CHEAP: Candidate[] = [
  { tier: 'cheap', id: 'openai/gpt-oss-120b', outPrice: 0.15 },
  { tier: 'cheap', id: 'qwen/qwen3-235b-a22b-2507', outPrice: 0.10 },
  { tier: 'cheap', id: 'qwen/qwen3-235b-a22b-thinking-2507', outPrice: 0.10 },
  { tier: 'cheap', id: 'deepseek/deepseek-v4-flash', outPrice: 0.18 },
  { tier: 'cheap', id: 'mistralai/mistral-small-3.2-24b-instruct', outPrice: 0.20 },
];

const ATTEMPTS = 3; // best-of-N: budget-model output is nondeterministic; report reliability.

interface Row {
  tier: string; id: string; ok: boolean; passes: number; attempts: number;
  bestKilled: number; total: number; bestScore: number; pass: boolean;
  avgLatencyMs: number; avgCostUsd: number; note: string;
}

async function runModel(c: Candidate): Promise<Row> {
  const base: Row = { tier: c.tier, id: c.id, ok: false, passes: 0, attempts: 0, bestKilled: 0, total: 0, bestScore: 0, pass: false, avgLatencyMs: 0, avgCostUsd: 0, note: '' };
  let lat = 0, cost = 0, ran = 0, lastReason = '';
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      const started = Date.now();
      const res = await generateWithRetry(c.id, buildTestGenPrompt(REFERENCE_IMPL, 'classify'));
      lat += Date.now() - started; cost += (res.outTokens * c.outPrice) / 1e6; ran++;
      const test = extractTestSource(res.content, 'first_code_block');
      const o = evaluateOracle({ moduleName: 'classify', referenceImpl: REFERENCE_IMPL, generatedTest: test, threshold: 0.6 });
      base.ok = true; base.total = o.mutantsTotal || base.total;
      if (o.passed) base.passes++;
      if (o.mutationScore > base.bestScore) { base.bestScore = o.mutationScore; base.bestKilled = o.mutantsKilled; }
      lastReason = o.reason;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastReason = msg;
      if (/HTTP 40[0-9]|HTTP 429/.test(msg)) { base.note = msg.slice(0, 50); return base; } // unavailable: don't retry
    }
  }
  base.attempts = ran;
  base.pass = base.passes > 0;
  base.avgLatencyMs = ran ? lat / ran : 0;
  base.avgCostUsd = ran ? cost / ran : 0;
  base.note = base.pass ? `PASS ${base.passes}/${ran}` : lastReason.slice(0, 50);
  return base;
}

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) { console.error('OPENROUTER_API_KEY not set (.env or env).'); process.exit(1); }
  const mode = process.argv[2];
  const candidates = mode === 'free' ? FREE : mode === 'cheap' ? CHEAP : [...FREE, ...CHEAP];
  console.log(`Oracle model benchmark — task: generate a durable test for classify(); grade by mutation kill of 5 operator mutants.\n`);

  const rows: Row[] = [];
  for (const c of candidates) {
    process.stdout.write(`running ${c.tier.padEnd(5)} ${c.id} (best of ${ATTEMPTS}) ... `);
    const r = await runModel(c); // sequential: free tiers are rate-limited
    rows.push(r);
    console.log(r.ok ? `${r.note} (best mut ${r.bestKilled}/${r.total}, ${(r.avgLatencyMs / 1000).toFixed(1)}s avg)` : `ERROR: ${r.note}`);
  }

  console.log('\n===================== RESULTS (best of ' + ATTEMPTS + ') =====================');
  console.log('tier   verdict  pass  bestMut  avgLat   ~$/run     model');
  for (const r of rows.sort((a, b) => (a.tier === b.tier ? b.passes - a.passes || b.bestScore - a.bestScore : a.tier < b.tier ? -1 : 1))) {
    const verdict = !r.ok ? 'ERROR' : r.pass ? 'PASS' : 'FAIL';
    const cost = r.tier === 'free' ? '$0' : `$${r.avgCostUsd.toFixed(6)}`;
    const passCol = r.ok ? `${r.passes}/${r.attempts}` : '-';
    console.log(
      `${r.tier.padEnd(6)} ${verdict.padEnd(7)} ${passCol.padEnd(5)} ${`${r.bestKilled}/${r.total}`.padEnd(7)} ${`${(r.avgLatencyMs / 1000).toFixed(1)}s`.padStart(6)}  ${cost.padStart(9)}  ${r.id}`,
    );
  }
  const passed = rows.filter((r) => r.pass);
  console.log(`\n${passed.length}/${rows.length} models cleared the oracle at least once (mutation >= 60%).`);
  console.log('PASS:', passed.map((r) => `${r.id} (${r.passes}/${r.attempts})`).join(', ') || '(none)');
  const errored = rows.filter((r) => !r.ok);
  if (errored.length) console.log('UNAVAILABLE:', errored.map((r) => r.id).join(', '));
}

main().catch((e) => { console.error('bench error:', e instanceof Error ? e.message : String(e)); process.exit(1); });
