// D3 — the GATE (ADR-111). Does cheap-local + best-of-k (06 §12) lift AQE's
// OBJECTIVE QE score (ADR-104: real mutant kill-rate + real coverage) over a
// single cheap-local shot — and where does it land vs a frontier coder?
//
// REAL throughout: the worker MODELS generate a test suite for a real module;
// the SCORER runs `node --test` for a baseline + every mutant (no simulation).
// This is the empirical authorization for ADR-111 (Proposed → Accepted/G-ABORT).
//
// Reproduce:
//   cd /workspaces/agentic-qe
//   set -a; . ./.env; set +a            # ANTHROPIC_API_KEY for the frontier arm
//   OUT=<scratchpad>/d3build
//   npx tsc src/arena/mutator.ts src/arena/rng.ts --outDir "$OUT" \
//       --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck
//   BUILD_DIR="$OUT" node docs/metaharness/prototype/d3-proof.mjs
//
// Arms (objective composite = 0.6*killRate + 0.3*coverage, ADR-104 weights;
// runtime term constant across arms, omitted):
//   A  vanilla-local        qwen3:8b, single shot (best-of-k variant 0)
//   C  best-of-k local      qwen3:8b, k diverse shots, KEEP best by the oracle (§12)
//   B  vanilla-frontier     claude-sonnet-4-6, single shot
//   D  cheap + escalate tail best-of-k local; escalate to frontier only if local invalid/weak

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const BUILD = process.env.BUILD_DIR || path.join(os.tmpdir(), 'd3build');
const { enumerateMutants, applyMutant } = await import(`${BUILD}/mutator.js`);

const N_INSTANCES = Number(process.env.D3_N ?? 5);
const K = Number(process.env.D3_K ?? 3);
const MAX_MUTANTS = Number(process.env.D3_MUTANTS ?? 20);
const ESCALATE_KILL = Number(process.env.D3_ESCALATE_KILL ?? 0.6); // local "weak" threshold
const OLLAMA = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434';
const LOCAL_MODEL = process.env.D3_LOCAL_MODEL || 'qwen3:8b';
const FRONTIER_MODEL = process.env.D3_FRONTIER_MODEL || 'claude-sonnet-4-6';

// Fixture-diverse corpus: distinct self-contained modules so the verdict isn't
// pricing-specific. Override with D3_FIXTURES=comma,separated,paths.
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
  const name = path.basename(p);                  // pricing.mjs
  const moduleName = name.replace(/\.mjs$/, '');   // pricing
  const src = fs.readFileSync(p, 'utf8');
  const mutants = enumerateMutants(src, moduleName).slice(0, MAX_MUTANTS);
  const user =
    'Write a COMPLETE, self-contained test suite for this module. ' +
    `Import from \`../src/${name}\`. ` +
    'Maximize branch coverage and catch subtle bugs (off-by-one, wrong operator, swapped branch, boundary). ' +
    'Cover every function, every branch, error paths, and boundary values. ' +
    'Keep it under ~120 lines so the file is COMPLETE and not truncated — finish every statement.\n\n' +
    `Module (../src/${name}):\n\`\`\`js\n` + src + '\n```';
  return { path: p, name, moduleName, src, mutants, user };
});

const SYS = 'You write Node.js test files using the built-in `node:test` and `node:assert/strict`. ' +
  'Output ONLY the test file inside one fenced ```js code block — no prose, no explanation.';

// Robust to a missing closing fence (truncated output): prefer a complete block,
// else drop a dangling opening fence line, else return as-is.
function stripFence(s) {
  s = (s ?? '').trim();
  const full = /```(?:js|javascript|mjs)?\s*([\s\S]*?)```/.exec(s);
  if (full) return full[1].trim();
  const open = /```(?:js|javascript|mjs)?[^\n]*\n([\s\S]*)$/.exec(s);
  if (open) return open[1].trim();
  return s;
}

// Pull the ACTIONABLE failure (import/syntax error from stderr, or the failing
// test + assertion block from stdout) — NOT the coverage-table tail — so the D8
// repair turn gives the model something it can actually fix.
function extractFailure(proc) {
  const e = (proc.stderr || '').trim();
  if (/SyntaxError|Cannot find|does not provide|ERR_MODULE|ReferenceError|is not exported/.test(e)) return e.slice(0, 600);
  const out = proc.stdout || '';
  const i = out.indexOf('failing tests:');
  if (i >= 0) return out.slice(i, i + 800);
  const lines = out.split('\n').filter((l) => /AssertionError|Error:|✖|not ok|Expected|actual|expected/.test(l) && !/all files|\.mjs \|/.test(l));
  return (lines.slice(0, 16).join('\n') || e || out.slice(0, 400)).slice(0, 800);
}

// ---- objective scorer: REAL node --test baseline + per-mutant kill-rate + coverage
function scoreTest(fixture, testCode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd3-ws-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'tests'));
  const modPath = path.join(dir, 'src', fixture.name);
  fs.writeFileSync(modPath, fixture.src);
  fs.writeFileSync(path.join(dir, 'tests/model.test.mjs'), testCode);
  const run = (cov) => spawnSync(process.execPath,
    ['--test', ...(cov ? ['--experimental-test-coverage'] : []), 'tests/model.test.mjs'],
    { cwd: dir, timeout: 60_000, encoding: 'utf8' });

  const base = run(true);
  if (base.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    return { valid: false, killRate: 0, cov: 0, composite: 0, err: extractFailure(base) };
  }
  const cm = /all files\s*\|\s*([\d.]+)/.exec(base.stdout ?? '');
  const cov = cm ? Number(cm[1]) : 0;

  let killed = 0;
  for (const mut of fixture.mutants) {
    fs.writeFileSync(modPath, applyMutant(fixture.src, mut));
    const r = spawnSync(process.execPath, ['--test', 'tests/model.test.mjs'], { cwd: dir, timeout: 60_000, encoding: 'utf8' });
    if (r.status !== 0) killed++; // mutant detected (suite turned red)
  }
  fs.rmSync(dir, { recursive: true, force: true });
  const killRate = killed / fixture.mutants.length;
  const composite = Math.round((0.6 * killRate + 0.3 * (cov / 100)) * 10000) / 10000;
  return { valid: true, killRate, cov, composite, err: '' };
}

const REPAIRS = Number(process.env.D3_REPAIRS ?? 2); // D8 repair loop (Ruv Round-2 lever)

// Initial + best-of-k diversity nudge + D8 repair turns, as a chat transcript.
function buildMessages(fixture, variant, repair) {
  const u = variant === 0 ? fixture.user : fixture.user + `\n\n(Alternative approach #${variant}: vary structure/strategy from any prior attempt.)`;
  const msgs = [{ role: 'system', content: SYS }, { role: 'user', content: u }];
  if (repair) msgs.push(
    { role: 'assistant', content: '```js\n' + repair.code + '\n```' },
    { role: 'user', content: `That test file FAILED on the UNMODIFIED module (it must pass cleanly first). Error:\n${repair.err}\nFix the faulty import/assertion and return the corrected COMPLETE test file only, fenced.` },
  );
  return msgs;
}

// ---- workers (raw single calls; repair orchestration in attempt())
async function localChat(messages, seed, variant) {
  // qwen3 `/no_think` disables internal reasoning → much faster + frees the token
  // budget for the actual test file (the D0 finding: reasoning ate the budget).
  const msgs = messages.map((m, i) => (i === 0 ? { ...m, content: m.content + ' /no_think' } : m));
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 150_000);
  try {
    const res = await fetch(`${OLLAMA}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: LOCAL_MODEL, seed, temperature: 0.2 + 0.25 * variant, max_tokens: 6000, messages: msgs }), signal: ac.signal });
    const j = await res.json();
    return stripFence(j.choices?.[0]?.message?.content ?? '');
  } catch (e) { if (process.env.D3_DEBUG) console.error('  [localChat ERR]', e.message); return ''; } finally { clearTimeout(t); }
}

async function frontierChat(messages) {
  const sys = messages[0].content; const rest = messages.slice(1);
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 120_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: FRONTIER_MODEL, max_tokens: 8000, system: sys, messages: rest }), signal: ac.signal });
    const j = await res.json();
    return stripFence(j.content?.map((b) => b.text ?? '').join('') ?? '');
  } catch (e) { if (process.env.D3_DEBUG) console.error('  [frontierChat ERR]', e.message); return ''; } finally { clearTimeout(t); }
}

// One candidate: generate → score → D8 repair to green (up to REPAIRS) → score.
async function attempt(fixture, chat, variant) {
  let repair = null;
  for (let r = 0; r <= REPAIRS; r++) {
    const code = await chat(buildMessages(fixture, variant, repair), variant);
    const s = code ? scoreTest(fixture, code) : { valid: false, killRate: 0, cov: 0, composite: 0, err: 'empty output' };
    if (process.env.D3_DEBUG) console.error(`    [${fixture.moduleName} v${variant} repair${r}] codeLen=${code.length} valid=${s.valid} kill=${s.valid ? fmt(s.killRate) : '-'}${s.valid ? '' : ' err=' + JSON.stringify(s.err.slice(0, 110))}`);
    if (s.valid) return { ...s, repairs: r };
    repair = { code, err: s.err };
  }
  return { valid: false, killRate: 0, cov: 0, composite: 0, repairs: REPAIRS };
}
const attemptLocal = (fixture, seed, variant) => attempt(fixture, (m, v) => localChat(m, seed, v), variant);
const attemptFrontier = (fixture) => attempt(fixture, (m) => frontierChat(m), 0);

function wilson(p, n) {
  if (n === 0) return [0, 0];
  const z = 1.96, ph = p, d = 1 + z * z / n;
  const c = ph + z * z / (2 * n), m = z * Math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const fmt = (x) => (x * 100).toFixed(1);

// ---- run (fixture-diverse: N_PER instances per corpus module)
const N_PER = N_INSTANCES;
const TOTAL = CORPUS.length * N_PER;
console.log(`D3 GATE (fixture-diverse) — corpus=${CORPUS.length} modules × ${N_PER} = n${TOTAL}, k=${K}, repairs=${REPAIRS}, maxMutants=${MAX_MUTANTS}`);
console.log(`modules: ${CORPUS.map((f) => `${f.moduleName}(${f.mutants.length}m)`).join(', ')}`);
console.log(`local=${LOCAL_MODEL} @ ${OLLAMA} | frontier=${FRONTIER_MODEL}\n`);

const arms = { A: [], C: [], B: [], D: [] };
const meta = [];
const perFixture = {};
let inst = 0;
for (const fx of CORPUS) {
  perFixture[fx.name] = { A: [], C: [], B: [], D: [], esc: 0 };
  for (let i = 0; i < N_PER; i++) {
    const seed = 1000 + inst * 7;
    inst++;
    process.stdout.write(`[${fx.moduleName}] ${i + 1}/${N_PER} (seed ${seed}) local`);
    const cand = [];
    for (let k = 0; k < K; k++) { process.stdout.write('.'); cand.push(await attemptLocal(fx, seed, k)); }
    const A = cand[0];
    const C = cand.reduce((best, c) => (c.composite > best.composite ? c : best), cand[0]);
    const winnerVariant = cand.indexOf(C);

    process.stdout.write(' frontier.');
    const B = await attemptFrontier(fx);

    // D: cheap best-of-k; escalate to frontier only when local is invalid or weak
    const escalated = !C.valid || C.killRate < ESCALATE_KILL;
    const D = escalated ? (B.composite > C.composite ? B : C) : C;

    arms.A.push(A); arms.C.push(C); arms.B.push(B); arms.D.push(D);
    const pf = perFixture[fx.name];
    pf.A.push(A); pf.C.push(C); pf.B.push(B); pf.D.push(D); if (escalated) pf.esc++;
    meta.push({ fixture: fx.name, seed, winnerVariant, bestOfBeatSingle: C.composite > A.composite, escalated });
    console.log(` => A=${fmt(A.composite)} C=${fmt(C.composite)}(v${winnerVariant}) B=${fmt(B.composite)} D=${fmt(D.composite)}${escalated ? ' [esc]' : ''}`);
  }
}

const stdev = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const summarize = (name, rs) => {
  const validRate = mean(rs.map((r) => (r.valid ? 1 : 0)));
  const [lo, hi] = wilson(validRate, rs.length);
  const comps = rs.map((r) => r.composite);
  // SE on the COMPOSITE (the verdict metric) — the validRate Wilson CI is a
  // DIFFERENT, saturated metric and must not be used to claim a composite tie.
  const compositeSE = rs.length > 1 ? stdev(comps) / Math.sqrt(rs.length) : 0;
  return { name, composite: mean(comps), compositeSE, killRate: mean(rs.map((r) => r.killRate)), cov: mean(rs.map((r) => r.cov)), validRate, ci: [lo, hi] };
};
const S = { A: summarize('A vanilla-local', arms.A), C: summarize('C best-of-k local', arms.C), B: summarize('B vanilla-frontier', arms.B), D: summarize('D cheap+escalate', arms.D) };

console.log('\n=== ARMS (mean over instances) ===');
console.log('arm                 | composite ±SE      | killRate | coverage | baseline-valid [Wilson95]');
for (const k of ['A', 'C', 'B', 'D']) {
  const s = S[k];
  console.log(`${s.name.padEnd(19)} |   ${fmt(s.composite)} ±${fmt(s.compositeSE)}  |  ${fmt(s.killRate)}  |  ${s.cov.toFixed(1)}  | ${fmt(s.validRate)}% [${fmt(s.ci[0])},${fmt(s.ci[1])}]`);
}
// Honest comparison: do B and D composite means differ beyond ~2 combined SE?
const dbGap = S.B.composite - S.D.composite;
const dbSE = Math.sqrt(S.B.compositeSE ** 2 + S.D.compositeSE ** 2);
console.log(`B−D composite gap = ${fmt(dbGap)} (combined SE ±${fmt(dbSE)}) → ${Math.abs(dbGap) <= 2 * dbSE ? 'within noise' : 'separated'} (NOTE: composite SE, NOT the validRate Wilson CI)`);

const cBeatA = meta.filter((m) => m.bestOfBeatSingle).length;
console.log(`\n§12 best-of-k > single-shot on the objective oracle: ${cBeatA}/${TOTAL} instances; mean lift C−A = ${fmt(S.C.composite - S.A.composite)} composite pts`);
console.log(`coder-binds check: frontier B − cheap C = ${fmt(S.B.composite - S.C.composite)} composite pts (kill ${fmt(S.B.killRate - S.C.killRate)})`);
console.log(`escalations fired: ${meta.filter((m) => m.escalated).length}/${TOTAL}`);

// per-fixture composite means — does the verdict hold across modules, or is it one fixture?
console.log('\n=== PER-FIXTURE composite (A vanilla / C best-of-k / B frontier / D escalate) ===');
const pfSummary = {};
for (const fx of CORPUS) {
  const pf = perFixture[fx.name];
  const mc = (rs) => fmt(mean(rs.map((r) => r.composite)));
  pfSummary[fx.moduleName] = { A: +mc(pf.A), C: +mc(pf.C), B: +mc(pf.B), D: +mc(pf.D), esc: pf.esc, n: N_PER };
  console.log(`${fx.moduleName.padEnd(10)} | A ${mc(pf.A)} | C ${mc(pf.C)} | B ${mc(pf.B)} | D ${mc(pf.D)} | esc ${pf.esc}/${N_PER}`);
}
const cBeatAByFixture = CORPUS.filter((fx) => {
  const pf = perFixture[fx.name];
  return mean(pf.C.map((r) => r.composite)) > mean(pf.A.map((r) => r.composite));
}).length;
console.log(`best-of-k lifts cheap in ${cBeatAByFixture}/${CORPUS.length} modules; coder-binds (B>C) in ${CORPUS.filter((fx) => mean(perFixture[fx.name].B.map((r) => r.composite)) > mean(perFixture[fx.name].C.map((r) => r.composite))).length}/${CORPUS.length}`);

// gate verdict
const escRate = meta.filter((m) => m.escalated).length / TOTAL;
const cheapWins = S.C.composite >= S.B.composite * 0.9; // cheap alone ~matches frontier
const verdict = cheapWins
  ? 'PASS (cheap best-of-k ~matches frontier on the QE scorer — real cost win)'
  : (S.C.composite > S.A.composite
    ? 'PARTIAL (best-of-k lifts cheap; frontier still ahead — escalation lane is the Pareto win)'
    : `G-ABORT-leaning for cheap-replaces-frontier (cheap arm invalid; escalated ${fmt(escRate)} of tasks)`);
console.log(`\nGATE VERDICT (fixture-diverse, n=${TOTAL} over ${CORPUS.length} modules): ${verdict}`);

const out = path.join(os.tmpdir(), 'd3-gate-result.json');
fs.writeFileSync(out, JSON.stringify({ config: { corpus: CORPUS.map((f) => f.moduleName), N_PER, TOTAL, K, REPAIRS, MAX_MUTANTS, LOCAL_MODEL, FRONTIER_MODEL }, summary: S, perFixture: pfSummary, meta, verdict }, null, 2));
console.log(`\nartifact: ${out}`);
