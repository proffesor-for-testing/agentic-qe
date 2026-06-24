// A12 — Cross-model best-of-N (plan 05). Does generating candidates across
// DIFFERENT models widen the quality spread (raising the union) and let the
// A11-validated judge (deepseek-v3.2, 88.9%) actually pay off vs first-valid?
//
// A11 found the judge is reliable but its aggregate gain was ~0 because a single
// model's candidates CLUSTER. Cross-FAMILY generation should spread them.
//
// Generators (writers): local qwen3:30b-a3b + OpenRouter z-ai/glm-5.2 (different
// families). Judge (evaluator): OpenRouter deepseek-v3.2 — a THIRD family, fully
// decoupled (writer≠evaluator). NO Anthropic, per the standing preference.
//
// Ground truth = REAL mutation-kill + coverage (ADR-104). The judge is blind to it.
//
// Reproduce:
//   cd /workspaces/agentic-qe; set -a; . ./.env; set +a
//   OUT=<scratch>/d3build   # built mutator
//   BUILD_DIR="$OUT" node docs/metaharness/prototype/d3-xmodel.mjs

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const BUILD = process.env.BUILD_DIR || path.join(os.tmpdir(), 'd3build');
const { enumerateMutants, applyMutant } = await import(`${BUILD}/mutator.js`);

const N_PER = Number(process.env.D3_N ?? 4);
const PER_MODEL = Number(process.env.D3_PER_MODEL ?? 2); // candidates per generator
const MAX_MUTANTS = Number(process.env.D3_MUTANTS ?? 15);
const REPAIRS = Number(process.env.D3_REPAIRS ?? 1);
const OLLAMA = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434';
const GEN_MODELS = (process.env.D3_GEN_MODELS || 'qwen3:30b-a3b,z-ai/glm-5.2').split(',').map((s) => s.trim()).filter(Boolean);
const JUDGE_MODEL = process.env.D3_JUDGE_MODEL || 'deepseek/deepseek-v3.2';
const isLocal = (m) => !m.includes('/');

const CORPUS = (process.env.D3_FIXTURES
  ? process.env.D3_FIXTURES.split(',').map((s) => s.trim()).filter(Boolean)
  : ['fixtures/arena-demo/src/pricing.mjs', 'docs/metaharness/prototype/d3-corpus/strings.mjs',
     'docs/metaharness/prototype/d3-corpus/stats.mjs', 'docs/metaharness/prototype/d3-corpus/validate.mjs',
     'docs/metaharness/prototype/d3-corpus/timefmt.mjs']
).map((p) => {
  const name = path.basename(p); const src = fs.readFileSync(p, 'utf8');
  return { path: p, name, moduleName: name.replace(/\.mjs$/, ''), src, mutants: enumerateMutants(src, name).slice(0, MAX_MUTANTS) };
});

const SYS = 'You write Node.js test files using the built-in `node:test` and `node:assert/strict`. Output ONLY the test file inside one fenced ```js code block — no prose.';
const userGen = (fx) => 'Write a COMPLETE, self-contained test suite for this module. ' +
  `Import from \`../src/${fx.name}\`. Maximize branch coverage and catch subtle bugs ` +
  '(off-by-one, wrong operator, swapped branch, boundary). Keep it complete (finish every statement).\n\n' +
  `Module:\n\`\`\`js\n${fx.src}\n\`\`\``;

function stripFence(s) {
  s = (s ?? '').trim();
  const full = /```(?:js|javascript|mjs)?\s*([\s\S]*?)```/.exec(s); if (full) return full[1].trim();
  const open = /```(?:js|javascript|mjs)?[^\n]*\n([\s\S]*)$/.exec(s); return open ? open[1].trim() : s;
}
function failHead(proc) {
  const e = (proc.stderr || '').trim();
  if (/SyntaxError|Cannot find|does not provide|ERR_MODULE|is not exported/.test(e)) return e.slice(0, 400);
  const out = proc.stdout || ''; const i = out.indexOf('failing tests:');
  return (i >= 0 ? out.slice(i, i + 500) : out.slice(0, 300));
}
function scoreTest(fx, code) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd3x-'));
  fs.mkdirSync(path.join(dir, 'src')); fs.mkdirSync(path.join(dir, 'tests'));
  const mod = path.join(dir, 'src', fx.name);
  fs.writeFileSync(mod, fx.src); fs.writeFileSync(path.join(dir, 'tests/m.test.mjs'), code);
  const base = spawnSync(process.execPath, ['--test', '--experimental-test-coverage', 'tests/m.test.mjs'], { cwd: dir, timeout: 60000, encoding: 'utf8' });
  if (base.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); return { valid: false, composite: 0, killRate: 0, err: failHead(base) }; }
  const cov = Number(/all files\s*\|\s*([\d.]+)/.exec(base.stdout ?? '')?.[1] ?? 0);
  let killed = 0;
  for (const mut of fx.mutants) { fs.writeFileSync(mod, applyMutant(fx.src, mut)); if (spawnSync(process.execPath, ['--test', 'tests/m.test.mjs'], { cwd: dir, timeout: 60000, encoding: 'utf8' }).status !== 0) killed++; }
  fs.rmSync(dir, { recursive: true, force: true });
  const killRate = killed / fx.mutants.length;
  return { valid: true, composite: Math.round((0.6 * killRate + 0.3 * cov / 100) * 10000) / 10000, killRate, err: '' };
}

async function genChat(model, messages, variant) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 150000);
  try {
    if (isLocal(model)) {
      const msgs = messages.map((m, i) => (i === 0 ? { ...m, content: m.content + ' /no_think' } : m));
      const r = await fetch(`${OLLAMA}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, seed: 1000 + variant * 13, temperature: 0.2 + 0.25 * variant, max_tokens: 6000, messages: msgs }), signal: ac.signal });
      return stripFence((await r.json()).choices?.[0]?.message?.content ?? '');
    }
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY },
      body: JSON.stringify({ model, temperature: 0.2 + 0.25 * variant, max_tokens: 6000, messages }), signal: ac.signal });
    return stripFence((await r.json()).choices?.[0]?.message?.content ?? '');
  } catch { return ''; } finally { clearTimeout(t); }
}

async function genCandidate(fx, model, variant) {
  let repair = null;
  for (let r = 0; r <= REPAIRS; r++) {
    const u = variant === 0 ? userGen(fx) : userGen(fx) + `\n\n(Alternative approach #${variant}: vary structure.)`;
    const msgs = [{ role: 'system', content: SYS }, { role: 'user', content: u }];
    if (repair) msgs.push({ role: 'assistant', content: '```js\n' + repair.code + '\n```' }, { role: 'user', content: `That FAILED on the unmodified module:\n${repair.err}\nReturn the corrected COMPLETE test file only, fenced.` });
    const code = await genChat(model, msgs, variant);
    const s = code ? scoreTest(fx, code) : { valid: false, composite: 0, killRate: 0, err: 'empty' };
    if (s.valid) return { model, code, ...s };
    repair = { code, err: s.err };
  }
  return { model, code: '', valid: false, composite: 0, killRate: 0 };
}

async function judge(fx, candidates) {
  let body = `Module under test:\n\`\`\`js\n${fx.src}\n\`\`\`\n\n`;
  candidates.forEach((c, i) => { body += `Candidate ${i + 1}:\n\`\`\`js\n${c.code.slice(0, 8000)}\n\`\`\`\n\n`; });
  body += `Which candidate is the BEST test suite — most thorough branch coverage, correct assertions, catches the most subtle bugs? Reply with ONLY the candidate number (1-${candidates.length}).`;
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 60000);
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY },
      body: JSON.stringify({ model: JUDGE_MODEL, max_tokens: 2000, temperature: 0, messages: [{ role: 'system', content: 'You are a strict test-suite quality judge. Reply with ONLY a candidate number.' }, { role: 'user', content: body }] }), signal: ac.signal });
    const txt = (await r.json()).choices?.[0]?.message?.content ?? '';
    const m = [...txt.matchAll(/\d+/g)].pop(); const idx = m ? Number(m[0]) - 1 : -1;
    return idx >= 0 && idx < candidates.length ? idx : 0;
  } catch { return 0; } finally { clearTimeout(t); }
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const fmt = (x) => (x * 100).toFixed(1);
const shortModel = (m) => m.split('/').pop().split(':')[0];

console.log(`A12 CROSS-MODEL best-of-N — generators: ${GEN_MODELS.join(' + ')} | judge: ${JUDGE_MODEL}`);
console.log(`corpus=${CORPUS.length} × ${N_PER} = ${CORPUS.length * N_PER} instances, ${PER_MODEL}/model (=${GEN_MODELS.length * PER_MODEL} candidates), repairs=${REPAIRS}\n`);

const rows = [];
let nInstances = 0;
const winShare = Object.fromEntries(GEN_MODELS.map((m) => [m, 0]));
for (const fx of CORPUS) {
  for (let i = 0; i < N_PER; i++) {
    nInstances++;
    process.stdout.write(`[${fx.moduleName}] ${i + 1}/${N_PER}`);
    const cand = [];
    for (const model of GEN_MODELS) for (let v = 0; v < PER_MODEL; v++) { process.stdout.write(isLocal(model) ? 'q' : 'g'); cand.push(await genCandidate(fx, model, v)); }
    const valid = cand.filter((c) => c.valid);
    if (valid.length < 1) { console.log(' => 0 valid'); continue; }

    const bestXModel = Math.max(...valid.map((c) => c.composite));
    const bestByModel = Object.fromEntries(GEN_MODELS.map((m) => {
      const cs = valid.filter((c) => c.model === m).map((c) => c.composite);
      return [m, cs.length ? Math.max(...cs) : null];
    }));
    const bestSingleModel = Math.max(...Object.values(bestByModel).filter((x) => x != null));
    const unionLift = bestXModel - bestSingleModel; // >0 ⇒ cross-model raised the best
    const bestModel = valid.find((c) => Math.abs(c.composite - bestXModel) < 1e-6)?.model;
    if (bestModel) winShare[bestModel]++;

    let judgePick = valid[0].composite, jModel = valid[0].model;
    if (valid.length >= 2) { const jIdx = await judge(fx, valid); judgePick = valid[jIdx]?.composite ?? valid[0].composite; jModel = valid[jIdx]?.model ?? valid[0].model; process.stdout.write('J'); }
    const firstValid = valid[0].composite;

    rows.push({ fixture: fx.name, nValid: valid.length, bestXModel, bestSingleModel, unionLift, bestByModel, bestModel, judgePick, firstValid, spread: bestXModel - Math.min(...valid.map((c) => c.composite)), nJudged: valid.length >= 2 });
    const bm = GEN_MODELS.map((m) => `${shortModel(m)}=${bestByModel[m] != null ? fmt(bestByModel[m]) : '—'}`).join(' ');
    console.log(` => ${bm} | xBest=${fmt(bestXModel)} lift=${fmt(unionLift)} judge=${fmt(judgePick)}(${shortModel(jModel)}) first=${fmt(firstValid)}`);
  }
}

// --- A12 verdict ---
console.log('\n=== A12 CROSS-MODEL VERDICT ===');
const judged = rows.filter((r) => r.nJudged);
const disc = judged.filter((r) => r.spread > 1e-6);
console.log(`instances: ${nInstances} | with ≥1 valid: ${rows.length} | judged (≥2 valid): ${judged.length} | discriminating: ${disc.length}`);
if (rows.length) {
  // UNION lift vs each SINGLE model alone (null best -> 0; a model that produced
  // no valid output "delivers" 0 for that instance — captures validity rescue).
  // NOTE: lift vs max(single models) is tautologically 0 — compare vs each model.
  const single = (r, m) => r.bestByModel[m] ?? 0;
  console.log(`\nUNION CEILING — cross-model best vs a SINGLE model alone:`);
  console.log(`  cross-model best (mean)=${fmt(mean(rows.map((r) => r.bestXModel)))}`);
  for (const m of GEN_MODELS) {
    const lift = mean(rows.map((r) => r.bestXModel - single(r, m)));
    const raised = rows.filter((r) => r.bestXModel - single(r, m) > 1e-6).length;
    const fails = rows.filter((r) => r.bestByModel[m] == null).length;
    console.log(`  vs ${shortModel(m).padEnd(12)} alone=${fmt(mean(rows.map((r) => single(r, m))))}  → cross-model lift=+${fmt(lift)} (raised ${raised}/${rows.length}; ${shortModel(m)} 0-valid on ${fails})`);
  }
  console.log(`  win share (best came from):  ${GEN_MODELS.map((m) => `${shortModel(m)}=${winShare[m]}`).join('  ')}`);
  if (judged.length) {
    const accDisc = disc.length ? mean(disc.map((r) => (Math.abs(r.judgePick - r.bestXModel) < 1e-6 ? 1 : 0))) : 0;
    const ceiling = mean(judged.map((r) => r.bestXModel));
    const judgeDeliv = mean(judged.map((r) => r.judgePick));
    const firstDeliv = mean(judged.map((r) => r.firstValid));
    const firstGen = mean(judged.map((r) => single(r, GEN_MODELS[0]))); // default writer alone
    console.log(`\nSELECTOR delivery (judged n=${judged.length}) — oracle ceiling=${fmt(ceiling)}:`);
    console.log(`  judge=${fmt(judgeDeliv)} (regret ${fmt(ceiling - judgeDeliv)}, best-pick(disc)=${fmt(accDisc)}%)  |  first-valid=${fmt(firstDeliv)} (regret ${fmt(ceiling - firstDeliv)})  |  ${shortModel(GEN_MODELS[0])}-alone=${fmt(firstGen)}`);
    const judgeOverFirst = judgeDeliv - firstDeliv;
    const xmodelOverSingle = firstDeliv - firstGen;
    console.log(`  → cross-model over single-model (even with first-valid): +${fmt(xmodelOverSingle)}.  judge over first-valid: +${fmt(judgeOverFirst)} ${Math.abs(judgeOverFirst) < 1 ? '(within noise — judge not worth it; cross-model is the lever)' : ''}`);
  }
  const out = path.join(os.tmpdir(), 'd3-xmodel-result.json');
  fs.writeFileSync(out, JSON.stringify({ config: { N_PER, PER_MODEL, REPAIRS, GEN_MODELS, JUDGE_MODEL, corpus: CORPUS.map((f) => f.moduleName) }, nInstances, winShare, rows }, null, 2));
  console.log(`\nartifact: ${out}`);
}
