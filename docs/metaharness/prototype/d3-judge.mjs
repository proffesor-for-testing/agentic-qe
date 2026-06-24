// A11 — Writer≠evaluator LLM-judge discriminator, PRECISION-VALIDATED (plan 05).
//
// Ruv's oracle arc (ADR-178/183): pick the best of N candidates with a SEPARATE
// cheap LLM judge instead of a writer-evaluated proxy — but ADR-183's discipline
// is "validate the judge's precision against ground truth BEFORE trusting it"
// ("a hallucination filtering a hallucination → kill it"). AQE *has* that ground
// truth: real mutation-kill + coverage (ADR-104). So we measure, not assume.
//
// Writer = local qwen3:30b-a3b (generation). Evaluator = OpenRouter deepseek-v4-flash
// (judge). NO Anthropic — per the standing preference. The judge is BLIND to the
// mutation scores; it picks from the candidate test code alone.
//
// Question: does the judge pick the higher-kill suite better than "first-valid"
// (what AQE's executor does today)? Report selection accuracy + regret vs oracle.
//
// Reproduce:
//   cd /workspaces/agentic-qe; set -a; . ./.env; set +a
//   OUT=<scratch>/d3build  # built mutator (npx tsc src/arena/mutator.ts src/arena/rng.ts --outDir $OUT ...)
//   BUILD_DIR="$OUT" node docs/metaharness/prototype/d3-judge.mjs

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const BUILD = process.env.BUILD_DIR || path.join(os.tmpdir(), 'd3build');
const { enumerateMutants, applyMutant } = await import(`${BUILD}/mutator.js`);

const N_PER = Number(process.env.D3_N ?? 4);
const K = Number(process.env.D3_K ?? 3);
const MAX_MUTANTS = Number(process.env.D3_MUTANTS ?? 15);
const REPAIRS = Number(process.env.D3_REPAIRS ?? 1);
const OLLAMA = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434';
const LOCAL_MODEL = process.env.D3_LOCAL_MODEL || 'qwen3:30b-a3b';
// One or more judges (comma-list) — compares whether a STRONGER judge helps.
const JUDGE_MODELS = (process.env.D3_JUDGE_MODELS || 'deepseek/deepseek-v4-flash,deepseek/deepseek-v3.2')
  .split(',').map((s) => s.trim()).filter(Boolean);

const CORPUS = (process.env.D3_FIXTURES
  ? process.env.D3_FIXTURES.split(',').map((s) => s.trim()).filter(Boolean)
  : [
      'fixtures/arena-demo/src/pricing.mjs',
      'docs/metaharness/prototype/d3-corpus/strings.mjs',
      'docs/metaharness/prototype/d3-corpus/stats.mjs',
      'docs/metaharness/prototype/d3-corpus/validate.mjs',
      'docs/metaharness/prototype/d3-corpus/timefmt.mjs',
    ]
).map((p) => {
  const name = path.basename(p);
  const src = fs.readFileSync(p, 'utf8');
  return { path: p, name, moduleName: name.replace(/\.mjs$/, ''), src, mutants: enumerateMutants(src, name).slice(0, MAX_MUTANTS) };
});

const SYS_GEN = 'You write Node.js test files using the built-in `node:test` and `node:assert/strict`. Output ONLY the test file inside one fenced ```js code block — no prose.';
const userGen = (fx) =>
  'Write a COMPLETE, self-contained test suite for this module. ' +
  `Import from \`../src/${fx.name}\`. Maximize branch coverage and catch subtle bugs ` +
  '(off-by-one, wrong operator, swapped branch, boundary). Keep it under ~120 lines, complete.\n\n' +
  `Module:\n\`\`\`js\n${fx.src}\n\`\`\``;

function stripFence(s) {
  s = (s ?? '').trim();
  const full = /```(?:js|javascript|mjs)?\s*([\s\S]*?)```/.exec(s);
  if (full) return full[1].trim();
  const open = /```(?:js|javascript|mjs)?[^\n]*\n([\s\S]*)$/.exec(s);
  return open ? open[1].trim() : s;
}
function failHead(proc) {
  const e = (proc.stderr || '').trim();
  if (/SyntaxError|Cannot find|does not provide|ERR_MODULE|is not exported/.test(e)) return e.slice(0, 400);
  const out = proc.stdout || ''; const i = out.indexOf('failing tests:');
  return (i >= 0 ? out.slice(i, i + 500) : out.slice(0, 300));
}

// REAL scorer: baseline + per-mutant kill + coverage → composite (ADR-104 weights).
function scoreTest(fx, testCode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd3j-'));
  fs.mkdirSync(path.join(dir, 'src')); fs.mkdirSync(path.join(dir, 'tests'));
  const mod = path.join(dir, 'src', fx.name);
  fs.writeFileSync(mod, fx.src); fs.writeFileSync(path.join(dir, 'tests/m.test.mjs'), testCode);
  const base = spawnSync(process.execPath, ['--test', '--experimental-test-coverage', 'tests/m.test.mjs'], { cwd: dir, timeout: 60000, encoding: 'utf8' });
  if (base.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); return { valid: false, composite: 0, killRate: 0, err: failHead(base) }; }
  const cov = Number(/all files\s*\|\s*([\d.]+)/.exec(base.stdout ?? '')?.[1] ?? 0);
  let killed = 0;
  for (const mut of fx.mutants) {
    fs.writeFileSync(mod, applyMutant(fx.src, mut));
    if (spawnSync(process.execPath, ['--test', 'tests/m.test.mjs'], { cwd: dir, timeout: 60000, encoding: 'utf8' }).status !== 0) killed++;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  const killRate = killed / fx.mutants.length;
  return { valid: true, composite: Math.round((0.6 * killRate + 0.3 * cov / 100) * 10000) / 10000, killRate, err: '' };
}

async function localChat(messages, seed, variant) {
  const msgs = messages.map((m, i) => (i === 0 ? { ...m, content: m.content + ' /no_think' } : m));
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 150000);
  try {
    const r = await fetch(`${OLLAMA}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: LOCAL_MODEL, seed, temperature: 0.2 + 0.25 * variant, max_tokens: 6000, messages: msgs }), signal: ac.signal });
    return stripFence((await r.json()).choices?.[0]?.message?.content ?? '');
  } catch { return ''; } finally { clearTimeout(t); }
}

// One candidate: generate → score → D8 repair-to-green → score.
async function genCandidate(fx, seed, variant) {
  let repair = null;
  for (let r = 0; r <= REPAIRS; r++) {
    const u = (variant === 0 ? userGen(fx) : userGen(fx) + `\n\n(Alternative approach #${variant}: vary structure.)`);
    const msgs = [{ role: 'system', content: SYS_GEN }, { role: 'user', content: u }];
    if (repair) msgs.push({ role: 'assistant', content: '```js\n' + repair.code + '\n```' }, { role: 'user', content: `That FAILED on the unmodified module:\n${repair.err}\nReturn the corrected COMPLETE test file only, fenced.` });
    const code = await localChat(msgs, seed, variant);
    const s = code ? scoreTest(fx, code) : { valid: false, composite: 0, killRate: 0, err: 'empty' };
    if (s.valid) return { code, ...s };
    repair = { code, err: s.err };
  }
  return { code: '', valid: false, composite: 0, killRate: 0 };
}

// The JUDGE — separate model, BLIND to scores, picks the best candidate.
// FULL candidate code (no truncation confound; cap 8000 covers ~120-line suites).
async function judge(model, fx, candidates) {
  let body = `Module under test:\n\`\`\`js\n${fx.src}\n\`\`\`\n\n`;
  candidates.forEach((c, i) => { body += `Candidate ${i + 1}:\n\`\`\`js\n${c.code.slice(0, 8000)}\n\`\`\`\n\n`; });
  body += `Which candidate is the BEST test suite — most thorough branch coverage, correct assertions, catches the most subtle bugs (wrong operator, off-by-one, swapped branch, boundary)? Reply with ONLY the candidate number (1-${candidates.length}).`;
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 60000);
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY },
      body: JSON.stringify({ model, max_tokens: 2000, temperature: 0,
        messages: [{ role: 'system', content: 'You are a strict test-suite quality judge. Reply with ONLY a candidate number, no prose.' }, { role: 'user', content: body }] }), signal: ac.signal });
    const txt = (await r.json()).choices?.[0]?.message?.content ?? '';
    const m = [...txt.matchAll(/\d+/g)].pop(); // last number (reasoning models may emit several)
    const idx = m ? Number(m[0]) - 1 : -1;
    return idx >= 0 && idx < candidates.length ? idx : 0; // default to first on parse-fail
  } catch { return 0; } finally { clearTimeout(t); }
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const fmt = (x) => (x * 100).toFixed(1);

console.log(`A11 JUDGE precision validation — writer=${LOCAL_MODEL} | judges=${JUDGE_MODELS.join(', ')} (OpenRouter, full code)`);
console.log(`corpus=${CORPUS.length} × ${N_PER} instances, k=${K}, repairs=${REPAIRS}\n`);

const rows = []; // per judged instance (judgePicks keyed by judge model)
let nInstances = 0, nJudged = 0;
for (const fx of CORPUS) {
  for (let i = 0; i < N_PER; i++) {
    nInstances++;
    const seed = 2000 + nInstances * 7;
    process.stdout.write(`[${fx.moduleName}] ${i + 1}/${N_PER} gen`);
    const cand = [];
    for (let k = 0; k < K; k++) { process.stdout.write('.'); cand.push(await genCandidate(fx, seed, k)); }
    const valid = cand.filter((c) => c.valid);
    if (valid.length < 2) { console.log(` => <2 valid (${valid.length}), skip judge`); continue; }
    nJudged++;

    const best = Math.max(...valid.map((c) => c.composite));
    const worst = Math.min(...valid.map((c) => c.composite));
    const firstValid = valid[0].composite;            // current executor behavior
    const avg = mean(valid.map((c) => c.composite));   // random-pick expectation
    process.stdout.write(' judge');
    const judgePicks = {};
    for (const model of JUDGE_MODELS) { const jIdx = await judge(model, fx, valid); judgePicks[model] = valid[jIdx]?.composite ?? valid[0].composite; }
    rows.push({ fixture: fx.name, nValid: valid.length, best, worst, firstValid, avg, judgePicks, spread: best - worst });
    const picks = JUDGE_MODELS.map((m) => `${m.split('/').pop()}=${fmt(judgePicks[m])}${Math.abs(judgePicks[m] - best) < 1e-6 ? '✓' : ''}`).join(' ');
    console.log(` => best=${fmt(best)} firstValid=${fmt(firstValid)} | ${picks}`);
  }
}

// --- precision verdict (ADR-183 discipline) ---
console.log('\n=== A11 JUDGE VERDICT ===');
const disc = rows.filter((r) => r.spread > 1e-6); // where the choice actually matters
console.log(`instances: ${nInstances} | judged (≥2 valid): ${nJudged} | discriminating (best>worst): ${disc.length}`);
if (rows.length) {
  const firstRegret = mean(rows.map((r) => r.best - r.firstValid));
  const randRegret = mean(rows.map((r) => r.best - r.avg));
  console.log(`baselines — first-valid regret=${fmt(firstRegret)}  random regret=${fmt(randRegret)}  (oracle=0)`);
  console.log(`Ruv's judge bar ≈ 88% best-pick on discriminating instances.\n`);
  const perJudge = {};
  for (const model of JUDGE_MODELS) {
    const accDisc = disc.length ? mean(disc.map((r) => (Math.abs(r.judgePicks[model] - r.best) < 1e-6 ? 1 : 0))) : 0;
    const judgeRegret = mean(rows.map((r) => r.best - r.judgePicks[model]));
    const gap = firstRegret - judgeRegret; // >0 ⇒ judge better
    const MEANINGFUL = 1.0;
    const v = disc.length < 5 ? `INCONCLUSIVE (only ${disc.length} discriminating — candidates cluster)`
      : Math.abs(gap) < MEANINGFUL ? `INCONCLUSIVE — within noise of first-valid (|Δregret|=${fmt(Math.abs(gap))})`
      : (gap > 0 ? `WINS first-valid by ${fmt(gap)} → wire it` : `LOSES to first-valid by ${fmt(-gap)} → keep first-valid`);
    perJudge[model] = { accDisc, judgeRegret, gap, verdict: v };
    console.log(`  ${model.padEnd(28)} best-pick(disc)=${fmt(accDisc)}%  regret=${fmt(judgeRegret)}  → ${v}`);
  }
  const out = path.join(os.tmpdir(), 'd3-judge-result.json');
  fs.writeFileSync(out, JSON.stringify({ config: { N_PER, K, REPAIRS, LOCAL_MODEL, JUDGE_MODELS, corpus: CORPUS.map((f) => f.moduleName) }, nInstances, nJudged, nDiscriminating: disc.length, firstRegret, randRegret, perJudge, rows }, null, 2));
  console.log(`\nartifact: ${out}`);
} else {
  console.log('No judged instances (need ≥2 valid candidates per instance).');
}
