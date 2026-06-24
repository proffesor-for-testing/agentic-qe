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
const JUDGE_MODEL = process.env.D3_JUDGE_MODEL || 'deepseek/deepseek-v4-flash';

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

// The JUDGE — separate cheap model, BLIND to scores, picks the best candidate.
async function judge(fx, candidates) {
  let body = `Module under test:\n\`\`\`js\n${fx.src}\n\`\`\`\n\n`;
  candidates.forEach((c, i) => { body += `Candidate ${i + 1}:\n\`\`\`js\n${c.code.slice(0, 2500)}\n\`\`\`\n\n`; });
  body += `Which candidate is the BEST test suite — most thorough branch coverage, correct assertions, catches the most subtle bugs (wrong operator, off-by-one, swapped branch, boundary)? Reply with ONLY the candidate number (1-${candidates.length}).`;
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 45000);
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY },
      body: JSON.stringify({ model: JUDGE_MODEL, max_tokens: 200, temperature: 0,
        messages: [{ role: 'system', content: 'You are a strict test-suite quality judge. Reply with ONLY a candidate number, no prose.' }, { role: 'user', content: body }] }), signal: ac.signal });
    const txt = (await r.json()).choices?.[0]?.message?.content ?? '';
    const m = /\d+/.exec(txt);
    const idx = m ? Number(m[0]) - 1 : -1;
    return idx >= 0 && idx < candidates.length ? idx : 0; // default to first on parse-fail
  } catch { return 0; } finally { clearTimeout(t); }
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const fmt = (x) => (x * 100).toFixed(1);

console.log(`A11 JUDGE precision validation — writer=${LOCAL_MODEL} | judge=${JUDGE_MODEL} (OpenRouter)`);
console.log(`corpus=${CORPUS.length} × ${N_PER} instances, k=${K}, repairs=${REPAIRS}\n`);

const rows = []; // per judged instance
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
    process.stdout.write(' judge');
    const jIdx = await judge(fx, valid);
    const judgePick = valid[jIdx]?.composite ?? valid[0].composite;
    const firstValid = valid[0].composite;                 // current executor behavior
    const avg = mean(valid.map((c) => c.composite));        // random-pick expectation
    rows.push({ fixture: fx.name, nValid: valid.length, best, worst, judgePick, firstValid, avg, judgeIsBest: Math.abs(judgePick - best) < 1e-6, spread: best - worst });
    console.log(` => best=${fmt(best)} judge=${fmt(judgePick)} firstValid=${fmt(firstValid)} ${Math.abs(judgePick - best) < 1e-6 ? '✓BEST' : ''}`);
  }
}

// --- precision verdict (ADR-183 discipline) ---
console.log('\n=== A11 JUDGE VERDICT ===');
console.log(`instances: ${nInstances} | judged (≥2 valid): ${nJudged} | discriminating (best>worst): ${rows.filter((r) => r.spread > 1e-6).length}`);
if (rows.length) {
  const acc = mean(rows.map((r) => (r.judgeIsBest ? 1 : 0)));
  const disc = rows.filter((r) => r.spread > 1e-6); // where the choice actually matters
  const accDisc = disc.length ? mean(disc.map((r) => (r.judgeIsBest ? 1 : 0))) : 0;
  const judgeRegret = mean(rows.map((r) => r.best - r.judgePick));
  const firstRegret = mean(rows.map((r) => r.best - r.firstValid));
  const randRegret = mean(rows.map((r) => r.best - r.avg));
  console.log(`judge picks the BEST: ${fmt(acc)}% overall | ${fmt(accDisc)}% on discriminating instances (Ruv's bar ≈ 88%)`);
  console.log(`mean composite REGRET vs oracle:  judge=${fmt(judgeRegret)}  first-valid=${fmt(firstRegret)}  random=${fmt(randRegret)}`);
  // Honest 3-way verdict: a regret gap within ~1 composite pt at small N is NOISE,
  // not a refutation — report INCONCLUSIVE rather than overclaiming either way.
  const gap = firstRegret - judgeRegret; // >0 ⇒ judge better
  const MEANINGFUL = 1.0; // composite pts
  const verdict = disc.length < 5 ? `INCONCLUSIVE (only ${disc.length} discriminating instances — candidates cluster; need n≥~20)`
    : Math.abs(gap) < MEANINGFUL ? `INCONCLUSIVE — judge vs first-valid within noise (|Δregret|=${fmt(Math.abs(gap))} pts, <${MEANINGFUL}); no benefit measured → keep first-valid`
    : (gap > 0 ? `JUDGE WINS — lower regret than first-valid by ${fmt(gap)} pts → wire it as the best-of-k selector`
      : `JUDGE LOSES to first-valid by ${fmt(-gap)} pts → keep first-valid; do NOT trust the judge (ADR-183)`);
  console.log(`\nVERDICT: ${verdict}`);
  const out = path.join(os.tmpdir(), 'd3-judge-result.json');
  fs.writeFileSync(out, JSON.stringify({ config: { N_PER, K, REPAIRS, LOCAL_MODEL, JUDGE_MODEL, corpus: CORPUS.map((f) => f.moduleName) }, nInstances, nJudged, acc, accDisc, judgeRegret, firstRegret, randRegret, verdict, rows }, null, 2));
  console.log(`artifact: ${out}`);
} else {
  console.log('No judged instances (need ≥2 valid candidates per instance).');
}
