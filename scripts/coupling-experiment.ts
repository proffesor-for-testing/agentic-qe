/**
 * Coupling validation experiment (brutal-review CRITICAL-1).
 *
 * The flywheel (ADR-118) optimizes RETRIEVAL on the premise that a better-retrieved
 * few-shot example improves a generated test. Two live runs were honest nulls, but
 * they used TOY anchor items (v1) that models know cold and a corpus with no relevant
 * exemplars — so the null was unfalsifiable (the anchor *couldn't* move). This is the
 * controlled test that CAN move it:
 *
 *   Fixed discriminating item = `median` from qe-anchor-v2 (the sole mutant is the
 *   even-length averaging branch — "does the generated test cover even-length?").
 *   Three conditions, N replicates each at temperature > 0:
 *     NONE        — no exemplar
 *     IRRELEVANT  — an exemplar about an unrelated topic (string trimming)
 *     RELEVANT    — an exemplar that teaches the even-length trap WITHOUT giving median away
 *   Response = fraction of replicates whose test kills the mutant (i.e. tests even-length).
 *
 * VERDICT: if RELEVANT's kill-rate is meaningfully > NONE and IRRELEVANT, the coupling
 * MECHANISM is validated on a real model (path forward: populate qe_patterns with real
 * exemplars). If not, the flywheel's retrieval premise is empirically dead on this model
 * and should stay downgraded to infrastructure (ADR-118 status).
 *
 * Grading is the ADR-113 mutation oracle ($0). Only generation is metered.
 * qwen (local Ollama) is $0; cloud models require --confirm-spend.
 *
 *   npx tsx scripts/coupling-experiment.ts --model qwen3-coder:30b --reps 5
 *   npx tsx scripts/coupling-experiment.ts --model claude-haiku-4-5 --reps 5 --confirm-spend
 */
import { readFileSync, existsSync } from 'node:fs';
import { evaluateOracle } from '../src/validation/oracle-eval.js';
import { loadAnchorSet, type AnchorItem } from '../src/validation/anchor-set.js';

if (existsSync('.env')) for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MODEL = arg('--model', 'qwen3-coder:30b');
const REPS = Number(arg('--reps', '5'));
const CONFIRMED = args.includes('--confirm-spend');
const KEY = process.env.ANTHROPIC_API_KEY;
const OLLAMA = 'http://host.docker.internal:11434/api/generate';
const isCloud = MODEL.startsWith('claude');
const SYS = 'You are an expert software engineer. Write a thorough unit test.';

const strip = (s: string) => s.replace(/^\s*```[a-z]*\s*$/gim, '').replace(/```/g, '').trim();
async function withRetry<T>(fn: () => Promise<T>, n = 4): Promise<T> {
  let e: unknown; for (let i = 0; i < n; i++) { try { return await fn(); } catch (err) { e = err; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); } } throw e;
}
async function generate(user: string, temp: number, seed: number): Promise<string> {
  return withRetry(async () => {
    if (!isCloud) {
      const r = await fetch(OLLAMA, { method: 'POST', body: JSON.stringify({ model: MODEL, system: SYS, prompt: user, stream: false, options: { temperature: temp, num_predict: 500, seed } }), signal: AbortSignal.timeout(120000) });
      return (await r.json() as any).response ?? '';
    }
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, temperature: temp, system: SYS, messages: [{ role: 'user', content: user }] }),
      signal: AbortSignal.timeout(120000),
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error('anthropic ' + r.status + ' ' + JSON.stringify(j).slice(0, 120));
    return j.content?.[0]?.text ?? '';
  });
}

const RELEVANT = 'Pattern "middle-value coverage": when testing a function that returns a middle/central value of a collection, ALWAYS include EVEN-length inputs, not just odd — even-length often averages the two middle elements (a common off-by-one bug). e.g. assert.equal(fn([1,2,3,4]), 2.5).';
const IRRELEVANT = 'Pattern "string trimming": verify leading/trailing whitespace, tabs, and empty strings are handled. e.g. assert.equal(trim("  x  "), "x").';

(async () => {
  if (isCloud && !CONFIRMED) { console.log(`Refusing to spend on ${MODEL} without --confirm-spend.`); process.exit(0); }
  if (isCloud && !KEY) { console.log('No ANTHROPIC_API_KEY.'); process.exit(2); }
  const item = (loadAnchorSet('verification/anchors/qe-anchor-v2.json').items as AnchorItem[]).find((i) => i.id === 'B1-median')!;
  const conditions: [string, string][] = [['NONE', ''], ['IRRELEVANT', IRRELEVANT], ['RELEVANT', RELEVANT]];
  console.log(`coupling experiment — model=${MODEL} reps=${REPS} item=${item.id}\n`);
  const summary: Record<string, number> = {};
  for (const [label, ex] of conditions) {
    let killed = 0, baseline = 0;
    for (let i = 0; i < REPS; i++) {
      const prompt = `Write a Node.js unit test using node:test and node:assert. Import: import { ${item.moduleName} } from '../src/${item.moduleName}.mjs';\nSpec: ${item.inputUnderTest}\n${ex ? `Related pattern (inspiration):\n${ex}\n` : ''}Output ONLY the test code.`;
      const code = strip(await generate(prompt, 0.5 + i * 0.08, 100 + i));
      const r = evaluateOracle({ moduleName: item.moduleName, referenceImpl: item.referenceImpl, generatedTest: code, threshold: 0.8, maxMutants: 8 });
      if (r.baselinePassed) baseline++;
      if (r.mutationScore >= 1) killed++;
    }
    summary[label] = killed / REPS;
    console.log(`${label.padEnd(10)} kill-rate(tests even-length)=${killed}/${REPS}=${(killed / REPS).toFixed(2)}  baselinePassed=${baseline}/${REPS}`);
  }
  const relGain = summary['RELEVANT'] - Math.max(summary['NONE'], summary['IRRELEVANT']);
  console.log(`\nRELEVANT gain over best of NONE/IRRELEVANT: ${relGain >= 0 ? '+' : ''}${relGain.toFixed(2)}`);
  console.log(relGain > 0.15
    ? 'VERDICT: coupling MECHANISM validated on this model — a relevant exemplar measurably improves the generated test.'
    : 'VERDICT: no coupling signal — a relevant exemplar does NOT measurably help; flywheel retrieval stays infrastructure (ADR-118).');
})().catch((e) => { console.error('ERR', e?.message || e); process.exit(1); });
