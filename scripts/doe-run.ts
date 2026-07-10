/**
 * ADR-122 DoE runner — a REAL designed experiment for the (model × prompt ×
 * retrieval × scaffold) half-fraction screen.
 *
 * CRIT-2 fix: the response is N genuine stochastic REPLICATES of ONE fixed anchor
 * item, generated at temperature > 0 with a distinct seed per replicate, each
 * graded pass/fail (mutation-kill ≥ threshold via the ADR-113 oracle). The old
 * design ran 5 *different* items ×1 at temp=0 — n=1 with zero stochastic
 * variance, so there was no error term and no F-test was possible. Each JSONL row
 * is now a CELL carrying its N binary replicate outcomes; scripts/doe-aggregate.mjs
 * turns those into a real main-effects ANOVA (F, df, p).
 *
 * Modes:
 *   node scripts/doe-run.ts --stub --replicates 5   # $0, no model, no DB — deterministic
 *   npx tsx scripts/doe-run.ts --smoke              # qwen-only real run (Ollama, $0)
 *   npx tsx scripts/doe-run.ts --confirm-spend      # full screen (cloud, metered)
 *
 * Only the --stub path has no external dependency: the heavy imports (better-sqlite3,
 * the oracle, the anchor set, the retriever) are loaded lazily inside the real-run
 * branch, so `node scripts/doe-run.ts --stub` runs the whole design→run→JSONL
 * pipeline with type-stripping alone. Cloud models use a raw Anthropic fetch;
 * qwen uses Ollama. .env is loaded for the key (never printed).
 */
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import type { AnchorItem } from '../src/validation/anchor-set.js';

if (existsSync('.env')) for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const KEY = process.env.ANTHROPIC_API_KEY;
const OLLAMA = 'http://host.docker.internal:11434/api/generate';
const args = process.argv.slice(2);
const STUB = args.includes('--stub');
const SMOKE = args.includes('--smoke');
const CONFIRMED = args.includes('--confirm-spend');
const REPLICATES = Math.max(2, Number(args.find((a) => a.startsWith('--replicates'))?.split('=')[1]
  ?? args[args.indexOf('--replicates') + 1] ?? 5) || 5);
const GEN_TEMP = 0.6; // > 0 so replicates genuinely vary (was 0 in the old design)
const log = (m: string) => process.stderr.write(`[${new Date().toISOString().slice(11, 19)}] ${m}\n`);

// ---- factor levels ----
const ONLY = args.find((a) => a.startsWith('--only='))?.split('=')[1];
const ONLY_ITEM = args.find((a) => a.startsWith('--item='))?.split('=')[1];
const RESULTS_FILE = process.env.DOE_RESULTS_FILE ?? '';
const MODELS = ONLY ? [ONLY]
  : STUB ? ['qwen3-coder:30b', 'claude-haiku-4-5', 'claude-opus-4-7']
  : SMOKE ? ['qwen3-coder:30b']
  : ['qwen3-coder:30b', 'claude-haiku-4-5', 'claude-opus-4-7'];
const PROMPTS = ['neutral', 'TDD', 'ATDD'];
const RETRIEVAL = ['off', 'on'];
const SCAFFOLD = ['none', 'plan-and-solve', 'reflexion'];
// per-Mtok [in, out] USD
const PRICE: Record<string, [number, number]> = {
  'qwen3-coder:30b': [0, 0], 'claude-haiku-4-5': [1, 5], 'claude-opus-4-7': [5, 25],
};

interface Cell { model: string; prompt: string; retrieval: string; scaffold: string }

// ---- half-fraction (Res-IV target): balanced subset, 9 cells per model ----
function cells(): Cell[] {
  const out: Cell[] = [];
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

async function callModel(model: string, system: string, user: string, temperature: number, seed: number): Promise<{ text: string; inTok: number; outTok: number }> {
  return withRetry(async () => {
  if (model.startsWith('qwen')) {
    const r = await fetch(OLLAMA, { method: 'POST', body: JSON.stringify({ model, system, prompt: user, stream: false, options: { temperature, seed, num_predict: 600 } }), signal: AbortSignal.timeout(120000) });
    const j: any = await r.json();
    return { text: j.response ?? '', inTok: j.prompt_eval_count ?? 0, outTok: j.eval_count ?? 0 };
  }
  // opus-4-7 is a reasoning model that DEPRECATED `temperature` (400 if sent).
  // Anthropic has no seed param; temperature > 0 alone yields the stochastic
  // variance the replicates need.
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

async function generateTest(cell: Cell, item: AnchorItem, examples: string, seed: number): Promise<{ code: string; inTok: number; outTok: number }> {
  const sys = SYS[cell.prompt];
  const base = `Write a Node.js unit test using node:test and node:assert. Import: import { ${item.moduleName} } from '../src/${item.moduleName}.mjs';\n\nSpec: ${item.inputUnderTest}\nRequirements to cover: ${item.requirements.join('; ')}\n${examples}\nOutput ONLY the test code.`;
  let inTok = 0, outTok = 0;
  if (cell.scaffold === 'none') {
    const r = await callModel(cell.model, sys, base, GEN_TEMP, seed); inTok += r.inTok; outTok += r.outTok; return { code: stripFence(r.text), inTok, outTok };
  }
  if (cell.scaffold === 'plan-and-solve') {
    const p = await callModel(cell.model, sys, `List the edge cases and boundary conditions to test for:\n${item.inputUnderTest}\nRequirements: ${item.requirements.join('; ')}\nJust a terse list.`, GEN_TEMP, seed);
    inTok += p.inTok; outTok += p.outTok;
    const r = await callModel(cell.model, sys, base + `\n\nUse this test plan:\n${p.text}`, GEN_TEMP, seed + 1); inTok += r.inTok; outTok += r.outTok;
    return { code: stripFence(r.text), inTok, outTok };
  }
  // reflexion: draft then critique+revise
  const d = await callModel(cell.model, sys, base, GEN_TEMP, seed); inTok += d.inTok; outTok += d.outTok;
  const r = await callModel(cell.model, sys, `Here is a test:\n${stripFence(d.text)}\n\nCritique it for missing boundary/edge/error cases per the spec (${item.inputUnderTest}) and output an IMPROVED complete test. Output ONLY code.`, GEN_TEMP, seed + 1);
  inTok += r.inTok; outTok += r.outTok;
  return { code: stripFence(r.text), inTok, outTok };
}

// ---------------------------------------------------------------------------
// Deterministic $0 stub — seeded pseudo-random pass/fail as a function of the
// factor levels. Lets the WHOLE pipeline (design → run → aggregate → ANOVA) be
// smoke-tested with no model and no spend. It plants a LARGE model effect and a
// NULL retrieval/scaffold effect so the F-test has a known truth to recover.
// ---------------------------------------------------------------------------
function hashStr(s: string): number {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function stubPassProbability(cell: Cell): number {
  // planted ground truth: model dominates; prompt small; retrieval/scaffold null.
  let p = 0.5;
  p += ({ 'qwen3-coder:30b': 0.0, 'claude-haiku-4-5': 0.15, 'claude-opus-4-7': 0.30 } as Record<string, number>)[cell.model] ?? 0;
  p += ({ neutral: 0.0, TDD: 0.05, ATDD: 0.05 } as Record<string, number>)[cell.prompt] ?? 0;
  // retrieval + scaffold deliberately contribute 0 (the beads "no quality gain" case)
  return Math.min(0.95, Math.max(0.05, p));
}
function stubReplicate(cell: Cell, rep: number): number {
  const rnd = mulberry32(hashStr(`${cell.model}|${cell.prompt}|${cell.retrieval}|${cell.scaffold}|${rep}`))();
  return rnd < stubPassProbability(cell) ? 1 : 0;
}

interface CellRow extends Cell { item: string; reps: number[]; passProp: number; inTok: number; outTok: number; cost: number }

async function runStub(): Promise<CellRow[]> {
  const cellList = cells();
  log(`STUB: ${cellList.length} cells × ${REPLICATES} replicates = ${cellList.length * REPLICATES} deterministic generations ($0)`);
  const results: CellRow[] = [];
  for (const cell of cellList) {
    const reps = Array.from({ length: REPLICATES }, (_, r) => stubReplicate(cell, r));
    const pass = reps.reduce((a, b) => a + b, 0);
    const row: CellRow = { ...cell, item: 'stub-fixture', reps, passProp: pass / reps.length, inTok: 0, outTok: 0, cost: 0 };
    results.push(row);
    if (RESULTS_FILE) appendFileSync(RESULTS_FILE, JSON.stringify(row) + '\n');
    log(`cell ${cell.model.slice(0, 12)}/${cell.prompt}/${cell.retrieval}/${cell.scaffold}: reps=[${reps.join(',')}] passProp=${row.passProp.toFixed(2)}`);
  }
  return results;
}

async function runReal(): Promise<CellRow[]> {
  // Lazy heavy imports: only reached under tsx with a real model + built src.
  const { default: Database } = await import('better-sqlite3');
  const { evaluateOracle } = await import('../src/validation/oracle-eval.js');
  const { loadAnchorSet } = await import('../src/validation/anchor-set.js');
  const { createSemanticRetriever } = await import('../src/learning/qe-flywheel/coupled-anchor.js');
  const { DEFAULT_POLICY } = await import('../src/learning/qe-flywheel/policy.js');

  const db = new Database('.agentic-qe/memory.db', { readonly: true });
  const anchor = loadAnchorSet('verification/anchors/qe-anchor-v1.json');
  const items = anchor.items as AnchorItem[];
  // FIXED anchor item: one representative item, run N times (was: N different items ×1).
  const fixedIx = Math.max(0, items.findIndex((it) => it.id === (ONLY_ITEM ?? items[0].id)));
  const item = items[fixedIx] ?? items[0];
  const retriever = createSemanticRetriever({ db, topK: 2 });

  const cellList = cells();
  log(`${cellList.length} cells × ${REPLICATES} replicates of fixed item ${item.id} = ${cellList.length * REPLICATES} generations`);
  const results: CellRow[] = [];
  let totalCost = 0, gens = 0;

  for (const cell of cellList) {
    let examples = '';
    if (cell.retrieval === 'on') {
      const ex = await retriever(item.inputUnderTest, DEFAULT_POLICY);
      examples = ex.length ? `\nRelated patterns (inspiration):\n${ex.map((e: any, i: number) => `${i + 1}. ${e.name}: ${e.body.slice(0, 120)}`).join('\n')}\n` : '';
    }
    const reps: number[] = [];
    let cIn = 0, cOut = 0;
    for (let r = 0; r < REPLICATES; r++) {
      const seed = 1000 + r; // distinct seed per replicate
      const g = await generateTest(cell, item, examples, seed);
      cIn += g.inTok; cOut += g.outTok; gens++;
      const res = evaluateOracle({ moduleName: item.moduleName, referenceImpl: item.referenceImpl, generatedTest: g.code, threshold: 0.8, maxMutants: 6 });
      reps.push(res.baselinePassed && res.mutationScore >= 0.8 ? 1 : 0);
    }
    const [pi, po] = PRICE[cell.model];
    const cost = (cIn / 1e6) * pi + (cOut / 1e6) * po;
    totalCost += cost;
    const pass = reps.reduce((a, b) => a + b, 0);
    const row: CellRow = { ...cell, item: item.id, reps, passProp: pass / reps.length, inTok: cIn, outTok: cOut, cost };
    results.push(row);
    if (RESULTS_FILE) appendFileSync(RESULTS_FILE, JSON.stringify(row) + '\n');
    log(`cell ${cell.model.slice(0, 12)}/${cell.prompt}/${cell.retrieval}/${cell.scaffold}: reps=[${reps.join(',')}] pass=${pass}/${reps.length} cost=$${cost.toFixed(4)} (running $${totalCost.toFixed(3)})`);
  }
  db.close();
  log(`TOTAL: ${gens} generations, $${totalCost.toFixed(3)} spent.`);
  return results;
}

(async () => {
  if (!STUB && !SMOKE && !CONFIRMED) { console.log('Refusing to spend without --confirm-spend. Use --stub for a $0 deterministic run, or --smoke for a $0 qwen-only real run.'); process.exit(0); }
  if (!STUB && !SMOKE && !KEY) { console.log('No ANTHROPIC_API_KEY — cannot run cloud cells.'); process.exit(2); }

  const results = STUB ? await runStub() : await runReal();

  // Quick in-runner marginal summary (the full ANOVA lives in doe-aggregate.mjs).
  const factors = ['model', 'prompt', 'retrieval', 'scaffold'] as const;
  console.log(`\n=== DoE cells written: ${results.length} (${REPLICATES} binary replicates each${STUB ? ', STUB deterministic $0' : ''}) ===`);
  for (const f of factors) {
    const levels = [...new Set(results.map((r) => r[f]))];
    const summary = levels.map((lv) => {
      const rs = results.filter((r) => r[f] === lv);
      const pp = rs.reduce((a, r) => a + r.passProp, 0) / rs.length;
      return `${lv}=${pp.toFixed(3)}`;
    }).join('  ');
    console.log(`  ${f.padEnd(10)} ${summary}`);
  }
  if (RESULTS_FILE) console.log(`\nWrote ${results.length} cells to ${RESULTS_FILE}. Aggregate with: node scripts/doe-aggregate.mjs ${RESULTS_FILE}`);
  else console.log('\n(no DOE_RESULTS_FILE set — nothing persisted; set it to feed doe-aggregate.mjs)');
})().catch((e) => { console.error('ERR', e?.message || e); process.exit(1); });
