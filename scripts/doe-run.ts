/**
 * ADR-122 DoE runner — executes the half-fraction screen (model × prompt ×
 * retrieval × scaffold) over the frozen anchor items, grading with the ADR-113
 * mutation oracle ($0), and reports per-factor pass-proportion + cost (ANOVA
 * main effects). Generation is the only metered part.
 *
 * Cloud models use a raw Anthropic fetch (ClaudeProvider.generate hangs on
 * retry); qwen uses Ollama. .env is loaded for the key (never printed).
 *
 *   npx tsx scripts/doe-run.ts --smoke        # qwen-only, $0
 *   npx tsx scripts/doe-run.ts --confirm-spend # full screen (cloud, metered)
 */
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { evaluateOracle } from '../src/validation/oracle-eval.js';
import { loadAnchorSet, type AnchorItem } from '../src/validation/anchor-set.js';
import { createSemanticRetriever } from '../src/learning/qe-flywheel/coupled-anchor.js';
import { DEFAULT_POLICY } from '../src/learning/qe-flywheel/policy.js';

if (existsSync('.env')) for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const KEY = process.env.ANTHROPIC_API_KEY;
const OLLAMA = 'http://host.docker.internal:11434/api/generate';
const args = process.argv.slice(2);
const SMOKE = args.includes('--smoke');
const CONFIRMED = args.includes('--confirm-spend');
const log = (m: string) => process.stderr.write(`[${new Date().toISOString().slice(11, 19)}] ${m}\n`);

// ---- factor levels ----
const ONLY = args.find((a) => a.startsWith('--only='))?.split('=')[1];
const RESULTS_FILE = process.env.DOE_RESULTS_FILE ?? '';
const MODELS = ONLY ? [ONLY] : SMOKE ? ['qwen3-coder:30b'] : ['qwen3-coder:30b', 'claude-haiku-4-5', 'claude-opus-4-7'];
const PROMPTS = ['neutral', 'TDD', 'ATDD'];
const RETRIEVAL = ['off', 'on'];
const SCAFFOLD = ['none', 'plan-and-solve', 'reflexion'];
// per-Mtok [in, out] USD
const PRICE: Record<string, [number, number]> = {
  'qwen3-coder:30b': [0, 0], 'claude-haiku-4-5': [1, 5], 'claude-opus-4-7': [5, 25],
};

// ---- half-fraction (Res-IV target): balanced subset, 9 cells per model ----
function cells() {
  const out: { model: string; prompt: string; retrieval: string; scaffold: string }[] = [];
  for (const model of MODELS) {
    let k = 0;
    for (const prompt of PROMPTS) for (const scaffold of SCAFFOLD) {
      // balance retrieval across the 9 prompt×scaffold combos (modular)
      const retrieval = RETRIEVAL[k % 2]; k++;
      out.push({ model, prompt, retrieval, scaffold });
    }
  }
  return out;
}

const SYS: Record<string, string> = {
  neutral: 'You are an expert software engineer. Write a thorough unit test.',
  TDD: 'You are a TDD practitioner. Write the failing test FIRST from the spec, covering each stated behavior and its boundaries before any implementation exists.',
  ATDD: 'You practice Acceptance-Test-Driven Development. Derive acceptance criteria from the spec and encode each as an explicit, observable assertion covering boundaries and error paths.',
};

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);
      // retry transient network / rate-limit errors; do NOT retry a 400 (bad request)
      if (/\b400\b/.test(msg)) throw e;
      log(`  transient error (attempt ${i + 1}/${tries}): ${msg.slice(0, 80)} — retrying`);
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

async function callModel(model: string, system: string, user: string, temperature: number): Promise<{ text: string; inTok: number; outTok: number }> {
  return withRetry(async () => {
  if (model.startsWith('qwen')) {
    const r = await fetch(OLLAMA, { method: 'POST', body: JSON.stringify({ model, system, prompt: user, stream: false, options: { temperature, num_predict: 600 } }), signal: AbortSignal.timeout(120000) });
    const j: any = await r.json();
    return { text: j.response ?? '', inTok: j.prompt_eval_count ?? 0, outTok: j.eval_count ?? 0 };
  }
  // opus-4-7 is a reasoning model that DEPRECATED `temperature` (400 if sent).
  const body: Record<string, unknown> = { model, max_tokens: 700, system, messages: [{ role: 'user', content: user }] };
  if (!model.includes('opus')) body.temperature = temperature;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error('anthropic ' + r.status + ' ' + JSON.stringify(j).slice(0, 120));
  return { text: j.content?.[0]?.text ?? '', inTok: j.usage?.input_tokens ?? 0, outTok: j.usage?.output_tokens ?? 0 };
  });
}

// Strip markdown code fences — handles UNCLOSED fences too (a model that emits
// an opening ```javascript with no closing ``` used to leave a syntax-error line
// in the test → false baseline failure; see DOE §Results caveat 2).
function stripFence(s: string): string {
  return s.replace(/^\s*```[a-z]*\s*$/gim, '').replace(/```/g, '').trim();
}

async function generateTest(cell: any, item: AnchorItem, examples: string): Promise<{ code: string; inTok: number; outTok: number }> {
  const sys = SYS[cell.prompt];
  const base = `Write a Node.js unit test using node:test and node:assert. Import: import { ${item.moduleName} } from '../src/${item.moduleName}.mjs';\n\nSpec: ${item.inputUnderTest}\nRequirements to cover: ${item.requirements.join('; ')}\n${examples}\nOutput ONLY the test code.`;
  let inTok = 0, outTok = 0;
  if (cell.scaffold === 'none') {
    const r = await callModel(cell.model, sys, base, 0); inTok += r.inTok; outTok += r.outTok; return { code: stripFence(r.text), inTok, outTok };
  }
  if (cell.scaffold === 'plan-and-solve') {
    const p = await callModel(cell.model, sys, `List the edge cases and boundary conditions to test for:\n${item.inputUnderTest}\nRequirements: ${item.requirements.join('; ')}\nJust a terse list.`, 0);
    inTok += p.inTok; outTok += p.outTok;
    const r = await callModel(cell.model, sys, base + `\n\nUse this test plan:\n${p.text}`, 0); inTok += r.inTok; outTok += r.outTok;
    return { code: stripFence(r.text), inTok, outTok };
  }
  // reflexion: draft then critique+revise
  const d = await callModel(cell.model, sys, base, 0); inTok += d.inTok; outTok += d.outTok;
  const r = await callModel(cell.model, sys, `Here is a test:\n${stripFence(d.text)}\n\nCritique it for missing boundary/edge/error cases per the spec (${item.inputUnderTest}) and output an IMPROVED complete test. Output ONLY code.`, 0);
  inTok += r.inTok; outTok += r.outTok;
  return { code: stripFence(r.text), inTok, outTok };
}

(async () => {
  if (!SMOKE && !CONFIRMED) { console.log('Refusing to spend without --confirm-spend. Use --smoke for a $0 qwen-only run.'); process.exit(0); }
  if (!SMOKE && !KEY) { console.log('No ANTHROPIC_API_KEY — cannot run cloud cells.'); process.exit(2); }
  const db = new Database('.agentic-qe/memory.db', { readonly: true });
  const anchor = loadAnchorSet('verification/anchors/qe-anchor-v1.json');
  const items = anchor.items as AnchorItem[];
  const retriever = createSemanticRetriever({ db, topK: 2 });

  const cellList = cells();
  log(`${cellList.length} cells × ${items.length} anchor items = ${cellList.length * items.length} generations`);
  const results: any[] = [];
  let totalCost = 0, gens = 0;

  for (const cell of cellList) {
    let pass = 0, cIn = 0, cOut = 0;
    for (const item of items) {
      let examples = '';
      if (cell.retrieval === 'on') {
        const ex = await retriever(item.inputUnderTest, DEFAULT_POLICY);
        examples = ex.length ? `\nRelated patterns (inspiration):\n${ex.map((e, i) => `${i + 1}. ${e.name}: ${e.body.slice(0, 120)}`).join('\n')}\n` : '';
      }
      const g = await generateTest(cell, item, examples);
      cIn += g.inTok; cOut += g.outTok; gens++;
      const res = evaluateOracle({ moduleName: item.moduleName, referenceImpl: item.referenceImpl, generatedTest: g.code, threshold: 0.8, maxMutants: 6 });
      if (res.baselinePassed && res.mutationScore >= 0.8) pass++;
    }
    const [pi, po] = PRICE[cell.model];
    const cost = (cIn / 1e6) * pi + (cOut / 1e6) * po;
    totalCost += cost;
    const row = { ...cell, passProp: pass / items.length, inTok: cIn, outTok: cOut, cost };
    results.push(row);
    if (RESULTS_FILE) appendFileSync(RESULTS_FILE, JSON.stringify(row) + '\n');
    log(`cell ${cell.model.slice(0, 12)}/${cell.prompt}/${cell.retrieval}/${cell.scaffold}: pass=${pass}/${items.length} cost=$${cost.toFixed(4)} (running $${totalCost.toFixed(3)})`);
  }
  db.close();

  // ---- ANOVA main effects: per-factor-level mean pass-proportion + mean cost ----
  const factors = ['model', 'prompt', 'retrieval', 'scaffold'] as const;
  console.log('\n=== DoE RESULTS: pass-proportion + cost by factor level ===');
  for (const f of factors) {
    const levels = [...new Set(results.map((r) => r[f]))];
    console.log(`\n${f}:`);
    for (const lv of levels) {
      const rs = results.filter((r) => r[f] === lv);
      const pp = rs.reduce((a, r) => a + r.passProp, 0) / rs.length;
      const cc = rs.reduce((a, r) => a + r.cost, 0) / rs.length;
      console.log(`  ${String(lv).padEnd(16)} passProp=${pp.toFixed(3)}  meanCost=$${cc.toFixed(4)}  (n=${rs.length})`);
    }
  }
  // crude variance-share: range of level-mean passProp per factor (bigger = more influential)
  console.log('\n=== which factor moves pass-proportion most (level-mean range) ===');
  const ranges = factors.map((f) => {
    const levels = [...new Set(results.map((r) => r[f]))];
    const means = levels.map((lv) => { const rs = results.filter((r) => r[f] === lv); return rs.reduce((a, r) => a + r.passProp, 0) / rs.length; });
    return { f, range: Math.max(...means) - Math.min(...means) };
  }).sort((a, b) => b.range - a.range);
  ranges.forEach((r) => console.log(`  ${r.f.padEnd(10)} Δ=${r.range.toFixed(3)}`));
  console.log(`\nTOTAL: ${gens} generations, $${totalCost.toFixed(3)} spent.`);
  console.log(JSON.stringify({ results, ranges }, null, 0).slice(0, 0)); // (results available in-memory)
})().catch((e) => { console.error('ERR', e?.message || e); process.exit(1); });
