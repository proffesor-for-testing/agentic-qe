#!/usr/bin/env node
// run-bench.mjs — Cognitum QE cost-Pareto benchmark.
//
// Measures, per QE task, the quality-per-dollar of three POLICIES against
// api.cognitum.one, so we can answer "cheapest way to achieve the goal":
//   P1 always-cheap  — cognitum-low  (worker key)          floor cost / floor quality
//   P2 always-frontier — cognitum-high (judge key)          ceiling quality / ceiling cost
//   P3 cheap+escalate  — low, escalate to high when the cheap attempt self-reports
//                        low confidence (the "high tier only as advisor when needed"
//                        cascade). worker key does the cheap leg, judge key the escalation.
//
// The two-key split is enforced by SCOPE, not policy: high tier is only ever
// reached via the judge key (COG_QE_BENCH_JUDGE_KEY); the worker key lacks the
// completions:high scope, so a bug cannot spend frontier money on bulk work.
//
// MODES (safety, mirroring ruflo's benches):
//   (default)          synthetic --mock is implied OFF; with no --confirm and
//                      --live set, prints a COST PROJECTION and exits (no spend).
//   --mock             synthetic pipeline validation — no network, no keys, no spend.
//   --live             real api.cognitum.one calls. Without --confirm: projection only.
//   --live --confirm   REAL run. Gated by --max-cost and AQE_MAX_BUDGET_USD; aborts
//                      pre-flight if the projection exceeds the cap, and stops mid-run
//                      if actual cumulative spend crosses it.
//
// Cost is ground truth from each receipt's x_cognitum.price_usd (never estimated
// on a live run). Projections use conservative token estimates and assume P3
// always escalates (upper bound).
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectTasks } from './corpus/index.mjs';
import { makeClient, mockQuality } from './lib/cognitum.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_VERSION = 'cognitum-qe.v1';

// Keys come from LOCAL CONFIG, never from code. Precedence: an already-set env
// var (your ~/.zshrc / ~/.bashrc export) always wins; a .env file (harness dir,
// then cwd) only FILLS GAPS. Zero-dependency loader. .env is gitignored — a key
// must never be committed. See README for setup.
function loadDotenv() {
  for (const p of [join(__dirname, '.env'), join(process.cwd(), '.env')]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
      if (process.env[key] === undefined) process.env[key] = val; // never override the shell
    }
  }
}
loadDotenv();

// ---- args ----
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const MOCK = flag('--mock');
const LIVE = flag('--live');
const CONFIRM = flag('--confirm');
const MAX_COST = Number(opt('--max-cost', '5'));
const ESCALATE_BAR = Number(opt('--escalate-bar', '0.7')); // P3 escalates below this self-confidence
const QUALITY_BAR = Number(opt('--bar', '0.8'));            // "clears the bar" for the Pareto pick
const SAMPLES = opt('--samples', 'all');
const POLICIES = opt('--policies', 'p1,p2,p3').split(',');
const OUT = opt('--out', null);
const tasks = selectTasks(opt('--tasks', 'all'));

const WORKER_KEY = process.env.COG_QE_BENCH_WORKER_KEY || '';
const JUDGE_KEY = process.env.COG_QE_BENCH_JUDGE_KEY || '';
const keyForTier = (tier) => (tier === 'high' ? JUDGE_KEY : WORKER_KEY);

// Conservative per-tier $/Mtok estimates for PROJECTION ONLY (real runs read the
// receipt). Order-of-magnitude; deliberately high so projections don't under-call.
const PROJ_PRICE = { low: { in: 0.15, out: 0.6 }, mid: { in: 0.6, out: 2.4 }, high: { in: 3, out: 15 } };

const client = makeClient({ mock: MOCK });
const RESOLVED = {}; // tier -> last resolved_model seen this run (e.g. high -> anthropic/claude-fable-5)

function log(...a) { console.log(...a); }

// ---- one model attempt ----
async function attempt({ task, sample, tier, askConfidence }) {
  const messages = task.buildPrompt(sample).slice();
  if (askConfidence) {
    messages.push({ role: 'system', content: 'After your answer, output a final line exactly: CONFIDENCE: <number 0..1> — your honest probability the answer is correct.' });
  }
  const r = await client.complete({ key: keyForTier(tier), tier, messages, maxTokens: task.maxTokens });
  const confidence = askConfidence ? parseConfidence(r.text) : null;
  return { ...r, tier, confidence };
}
function parseConfidence(text) {
  const m = String(text).match(/confidence\s*[:=]\s*(0?\.\d+|1(?:\.0+)?|\d{1,3}%)/i);
  if (!m) return null;
  let v = m[1]; if (v.endsWith('%')) return Math.max(0, Math.min(1, parseFloat(v) / 100));
  return Math.max(0, Math.min(1, parseFloat(v)));
}

// ---- policies ----
const RUNNERS = {
  p1: async (task, sample) => {
    const a = await attempt({ task, sample, tier: 'low' });
    return finalize(task, sample, a.text, [a], false);
  },
  p2: async (task, sample) => {
    const a = await attempt({ task, sample, tier: 'high' });
    return finalize(task, sample, a.text, [a], false);
  },
  p3: async (task, sample) => {
    const cheap = await attempt({ task, sample, tier: 'low', askConfidence: true });
    const conf = cheap.confidence ?? (MOCK ? (mockQuality(sample.id, 'low') ? 0.9 : 0.4) : 0.5);
    if (conf >= ESCALATE_BAR) return finalize(task, sample, cheap.text, [cheap], false);
    const strong = await attempt({ task, sample, tier: 'high' }); // escalate to the advisor
    return finalize(task, sample, strong.text, [cheap, strong], true);
  },
};

async function finalize(task, sample, finalText, calls, escalated) {
  const costUsd = calls.reduce((s, c) => s + (c.priceUsd || 0), 0);
  const latencyMs = calls.reduce((s, c) => s + (c.latencyMs || 0), 0);
  const tokens = calls.reduce((s, c) => s + (c.promptTokens || 0) + (c.completionTokens || 0), 0);
  const tierUsed = calls[calls.length - 1].tier;
  let graded;
  if (MOCK) {
    graded = { pass: mockQuality(sample.id, tierUsed), detail: 'SYNTHETIC (mock)', provenance: 'mock' };
  } else {
    graded = await task.grade(sample, finalText, { judge: (m) => client.complete({ key: JUDGE_KEY, tier: 'high', messages: m }) });
  }
  const anyMissingCost = calls.some((c) => c.ok && c.costSource === 'missing');
  for (const c of calls) if (c.resolvedModel) RESOLVED[c.tier] = c.resolvedModel; // track tier -> model
  const last = calls[calls.length - 1];
  return {
    sampleId: sample.id, pass: graded.pass, costUsd, latencyMs, tokens, escalated, tierUsed,
    score: typeof graded.score === 'number' ? graded.score : null, // continuous quality (e.g. mutation score)
    validity: typeof graded.validity === 'number' ? graded.validity : null,
    emitted: typeof graded.emitted === 'boolean' ? graded.emitted : null, // did the model produce runnable tests at all
    resolvedModel: last.resolvedModel, requestId: last.requestId,
    calls: calls.map((c) => ({ tier: c.tier, model: c.resolvedModel, requestId: c.requestId, priceUsd: round6(c.priceUsd || 0) })),
    provenance: graded.provenance, detail: graded.detail, anyMissingCost,
  };
}

// ---- projection (no spend) ----
function projectCost() {
  let calls = 0, usd = 0;
  for (const task of tasks) {
    const n = SAMPLES === 'all' ? task.samples.length : Math.min(Number(SAMPLES), task.samples.length);
    const estTok = { in: 400, out: Math.min(task.maxTokens, 300) }; // conservative
    const perTier = (tier) => (estTok.in * PROJ_PRICE[tier].in + estTok.out * PROJ_PRICE[tier].out) / 1e6;
    for (const p of POLICIES) {
      for (let i = 0; i < n; i++) {
        if (p === 'p1') { calls += 1; usd += perTier('low'); }
        else if (p === 'p2') { calls += 1; usd += perTier('high'); }
        else if (p === 'p3') { calls += 2; usd += perTier('low') + perTier('high'); } // worst case: all escalate
      }
    }
  }
  return { calls, usd };
}

// ---- aggregation + pareto ----
function aggregate(rows) {
  const pass = rows.filter((r) => r.pass).length;
  const passRate = rows.length ? pass / rows.length : 0;
  const totalCost = rows.reduce((s, r) => s + r.costUsd, 0);
  const avgCost = rows.length ? totalCost / rows.length : 0;
  const lat = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p = (q) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(q * lat.length))] : 0;
  const escalated = rows.filter((r) => r.escalated).length;
  const scored = rows.filter((r) => typeof r.score === 'number');
  const avgScore = scored.length ? scored.reduce((s, r) => s + r.score, 0) / scored.length : null;
  const valid = rows.filter((r) => typeof r.validity === 'number');
  const avgValidity = valid.length ? valid.reduce((s, r) => s + r.validity, 0) / valid.length : null;
  const emittable = rows.filter((r) => typeof r.emitted === 'boolean');
  const emissionRate = emittable.length ? emittable.filter((r) => r.emitted).length / emittable.length : null;
  return {
    n: rows.length, passRate, passes: pass, totalCostUsd: totalCost, avgCostUsd: avgCost,
    avgScore, avgValidity, emissionRate, // continuous quality (mutation score) + did-it-emit, when the oracle reports them
    costPer1kPasses: pass ? (totalCost / pass) * 1000 : null,
    usdPerQuality: passRate ? avgCost / passRate : null, // ruflo $/quality
    latencyMs: { p50: p(0.5), p95: p(0.95) },
    escalationRate: rows.length ? escalated / rows.length : 0,
  };
}

// Pareto pick per task: cheapest policy whose passRate >= QUALITY_BAR; if none
// clears the bar, the highest-quality policy (and we say so). Mirrors ADR-149's
// "cheapest that clears the bar," honest about the null.
function paretoPick(perPolicy) {
  const entries = Object.entries(perPolicy);
  const clears = entries.filter(([, a]) => a.passRate >= QUALITY_BAR).sort((a, b) => a[1].avgCostUsd - b[1].avgCostUsd);
  if (clears.length) return { policy: clears[0][0], clearedBar: true, bar: QUALITY_BAR };
  const best = entries.slice().sort((a, b) => b[1].passRate - a[1].passRate)[0];
  return { policy: best[0], clearedBar: false, bar: QUALITY_BAR };
}

// ---- main ----
async function main() {
  const mode = MOCK ? 'mock' : (LIVE && CONFIRM ? 'live' : (LIVE ? 'projection' : 'mock'));
  log(`=== Cognitum QE cost-Pareto benchmark · mode=${mode} · policies=${POLICIES.join(',')} · tasks=${tasks.map((t) => t.id).join(',')} ===`);

  const proj = projectCost();
  log(`projected: ${proj.calls} calls · ~$${proj.usd.toFixed(4)} (conservative upper bound, P3 all-escalate) · cap $${MAX_COST}`);

  if (mode === 'projection') {
    log(proj.usd <= MAX_COST ? `✓ fits under --max-cost $${MAX_COST}. Re-run with --live --confirm to spend.` : `✗ EXCEEDS --max-cost $${MAX_COST}. Lower --samples or raise --max-cost.`);
    return;
  }
  if (mode === 'live') {
    if (proj.usd > MAX_COST) { log(`✗ ABORT: projection $${proj.usd.toFixed(4)} > --max-cost $${MAX_COST}. Refusing to start.`); process.exit(1); }
    if (!WORKER_KEY || !JUDGE_KEY) { log('✗ ABORT: --live needs COG_QE_BENCH_WORKER_KEY and COG_QE_BENCH_JUDGE_KEY.'); process.exit(1); }
  }

  const report = { schemaVersion: SCHEMA_VERSION, mode, startedAt: null, qualityBar: QUALITY_BAR, escalateBar: ESCALATE_BAR, perTask: [], overall: {}, notes: [] };
  let cumCost = 0, aborted = false;

  for (const task of tasks) {
    const n = SAMPLES === 'all' ? task.samples.length : Math.min(Number(SAMPLES), task.samples.length);
    const samples = task.samples.slice(0, n);
    const perPolicy = {};
    for (const p of POLICIES) {
      const rows = [];
      for (const sample of samples) {
        if (mode === 'live' && cumCost >= MAX_COST) { aborted = true; report.notes.push(`cap $${MAX_COST} reached — remaining ${task.id}/${p} samples SKIPPED (not counted)`); break; }
        const r = await RUNNERS[p](task, sample);
        cumCost += r.costUsd;
        rows.push(r);
      }
      perPolicy[p] = { ...aggregate(rows), rows: rows.map((r) => ({ sampleId: r.sampleId, pass: r.pass, score: r.score, validity: r.validity, costUsd: round6(r.costUsd), latencyMs: Math.round(r.latencyMs), escalated: r.escalated, tierUsed: r.tierUsed, resolvedModel: r.resolvedModel, requestId: r.requestId, calls: r.calls, detail: r.detail, provenance: r.provenance })) };
    }
    const pick = paretoPick(perPolicy);
    const provenance = samples.length ? (perPolicy[POLICIES[0]]?.rows?.[0]?.provenance || task.oracleType) : task.oracleType;
    report.perTask.push({ task: task.id, title: task.title, oracle: task.oracleType, provenance, samples: samples.length, perPolicy: strip(perPolicy), paretoPick: pick });
    printTaskTable(task, perPolicy, pick);
  }

  report.overall = { totalCostUsd: round6(cumCost), aborted, cap: MAX_COST };
  report.resolvedModels = RESOLVED; // which concrete model each tier resolved to this run
  if (Object.keys(RESOLVED).length) log(`\nresolved models: ${Object.entries(RESOLVED).map(([t, m]) => `${t}→${m}`).join('  ')}`);
  emit(report);
}

function strip(perPolicy) {
  const o = {};
  for (const [k, v] of Object.entries(perPolicy)) o[k] = { n: v.n, passRate: round(v.passRate), passes: v.passes, avgScore: v.avgScore == null ? null : round(v.avgScore), avgValidity: v.avgValidity == null ? null : round(v.avgValidity), emissionRate: v.emissionRate == null ? null : round(v.emissionRate), avgCostUsd: round6(v.avgCostUsd), totalCostUsd: round6(v.totalCostUsd), usdPerQuality: v.usdPerQuality == null ? null : round6(v.usdPerQuality), costPer1kPasses: v.costPer1kPasses == null ? null : round(v.costPer1kPasses), latencyMs: v.latencyMs, escalationRate: round(v.escalationRate), rows: v.rows };
  return o;
}
function printTaskTable(task, perPolicy, pick) {
  const hasScore = Object.values(perPolicy).some((a) => a.avgScore != null);
  log(`\n▸ ${task.id} — ${task.title}  [oracle: ${task.oracleType}]`);
  log(`  policy        pass%   $/task      $/quality   esc%   p50ms${hasScore ? '   mut-score  valid  emit%' : ''}`);
  for (const [p, a] of Object.entries(perPolicy)) {
    const extra = hasScore ? `   ${(a.avgScore == null ? 'n/a' : a.avgScore.toFixed(2)).padStart(8)}  ${(a.avgValidity == null ? 'n/a' : a.avgValidity.toFixed(2)).padStart(5)}  ${(a.emissionRate == null ? 'n/a' : (a.emissionRate * 100).toFixed(0) + '%').padStart(5)}` : '';
    log(`  ${p.padEnd(12)}  ${(a.passRate * 100).toFixed(0).padStart(4)}%  ${fmt$(a.avgCostUsd).padStart(9)}  ${(a.usdPerQuality == null ? 'n/a' : fmt$(a.usdPerQuality)).padStart(10)}  ${(a.escalationRate * 100).toFixed(0).padStart(4)}%  ${String(a.latencyMs.p50).padStart(5)}${extra}`);
  }
  log(`  → Pareto: ${pick.clearedBar ? `${pick.policy} is cheapest clearing ${Math.round(pick.bar * 100)}% bar` : `NO policy clears ${Math.round(pick.bar * 100)}% — best is ${pick.policy}`}`);
}
function emit(report) {
  log('\n===BENCH_JSON===');
  log(JSON.stringify(report));
  const outPath = OUT || join(__dirname, '..', '..', 'docs', 'benchmarks', 'runs', `cognitum-qe-${report.mode}-${stamp()}.json`);
  try { mkdirSync(dirname(outPath), { recursive: true }); writeFileSync(outPath, JSON.stringify(report, null, 2)); log(`\nwrote ${outPath}`); }
  catch (e) { log(`(could not write run-record: ${e.message})`); }
}

const round = (x) => Math.round(x * 1000) / 1000;
const round6 = (x) => Math.round(x * 1e6) / 1e6;
const fmt$ = (x) => x == null ? 'n/a' : `$${x < 0.001 ? x.toExponential(2) : x.toFixed(4)}`;
// Timestamp passed nowhere-sensitive; new Date() is fine in a normal script.
function stamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z'; }

main().catch((e) => { console.error('FATAL', e?.stack || e); process.exit(1); });
