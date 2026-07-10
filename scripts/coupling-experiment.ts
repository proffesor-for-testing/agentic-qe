/**
 * Coupling validation experiment (brutal-review CRITICAL-1).
 *
 * The flywheel (ADR-118) optimizes RETRIEVAL on the premise that a better-retrieved
 * few-shot example improves a generated test. Two live runs were honest nulls, but
 * they used TOY anchor items (v1) that models know cold and a corpus with no relevant
 * exemplars — so the null was unfalsifiable (the anchor *couldn't* move). This is the
 * controlled test that CAN move it:
 *
 *   A discriminating item from qe-anchor-v2 is probed with an UNDER-SPECIFIED spec
 *   (states only the basic behaviour, NOT the trap edge) so the base model may miss
 *   the trap; grading is against the FROZEN referenceImpl that encodes the trap, so
 *   a trap-blind test still passes baseline but leaves the trap mutant alive.
 *   Default item = B4-isLeapYear (trap: the century/400 rule). Three conditions,
 *   N replicates each at temperature > 0:
 *     NONE        — no exemplar
 *     IRRELEVANT  — an exemplar about an unrelated topic (string trimming)
 *     RELEVANT    — an exemplar that teaches the trap WITHOUT giving the impl away
 *   Response = MEAN mutation score among baseline-passing replicates. Reports
 *   INCONCLUSIVE if the baseline is floored and NO-HEADROOM if the base model
 *   already scores ~1 (a ceiling artifact, not a coupling result — pick a harder item).
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
 *   npx tsx scripts/coupling-experiment.ts --model qwen3-coder:30b --item B2-rangeOverlap --reps 5
 *   npx tsx scripts/coupling-experiment.ts --model anthropic/claude-haiku-4.5 --reps 5 --confirm-spend
 * Local Ollama models are bare ids; cloud models are OpenRouter ids (vendor/model).
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
const ORKEY = process.env.OPENROUTER_API_KEY;
const OLLAMA = 'http://host.docker.internal:11434/api/generate';
// Local Ollama models are bare (qwen3-coder:30b); cloud models are OpenRouter
// IDs (vendor/model, e.g. anthropic/claude-haiku-4.5). OpenRouter replaces the
// raw Anthropic path so the rate-limited direct key is never used.
const isLocal = !MODEL.includes('/');
const isCloud = !isLocal;
const SYS = 'You are an expert software engineer. Write a thorough unit test.';
let spentUsd = 0;

const strip = (s: string) => s.replace(/^\s*```[a-z]*\s*$/gim, '').replace(/```/g, '').trim();
async function withRetry<T>(fn: () => Promise<T>, n = 4): Promise<T> {
  let e: unknown; for (let i = 0; i < n; i++) { try { return await fn(); } catch (err) { e = err; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); } } throw e;
}
async function generate(user: string, temp: number, seed: number): Promise<string> {
  return withRetry(async () => {
    if (isLocal) {
      const r = await fetch(OLLAMA, { method: 'POST', body: JSON.stringify({ model: MODEL, system: SYS, prompt: user, stream: false, options: { temperature: temp, num_predict: 1400, seed } }), signal: AbortSignal.timeout(180000) });
      return (await r.json() as any).response ?? '';
    }
    // OpenRouter (OpenAI-compatible). No seed param; temp>0 supplies variance.
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { authorization: `Bearer ${ORKEY!}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1400, temperature: temp, messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }] }),
      signal: AbortSignal.timeout(120000),
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error('openrouter ' + r.status + ' ' + JSON.stringify(j).slice(0, 160));
    spentUsd += j.usage?.cost ?? 0;
    return j.choices?.[0]?.message?.content ?? '';
  });
}

// Per-item probe. `spec` is DELIBERATELY under-specified — it states only the
// basic behaviour and does NOT mention the trap edge — so a base model may miss
// it, leaving the trap mutant alive. `relevant` is the ONLY place the trap
// knowledge is supplied. Grading is against the FROZEN referenceImpl (which
// encodes the trap), so a test that ignores the trap still passes baseline but
// scores < 1 → real headroom for retrieval to close. This is what makes the
// experiment falsifiable rather than a ceiling artifact (B1-median leaked its
// even-length trap in the spec, so qwen covered it cold — no headroom).
const PROBES: Record<string, { spec: string; relevant: string }> = {
  'B4-isLeapYear': {
    spec: 'isLeapYear(y): return true if the Gregorian year y is a leap year, else false.',
    relevant: 'Pattern "century leap-year trap": leap-year logic has a special CENTURY rule — a year divisible by 100 is NOT a leap year UNLESS also divisible by 400. ALWAYS test century years: 1900 is NOT a leap year, 2000 IS.',
  },
  'B2-rangeOverlap': {
    spec: 'rangeOverlap(a1,a2,b1,b2): return true if the two ranges [a1,a2] and [b1,b2] overlap.',
    relevant: 'Pattern "touching-endpoint boundary": for INCLUSIVE-range overlap, ranges that touch at exactly ONE endpoint (e.g. [1,5] and [5,9]) DO overlap. Always test the touching-endpoint case, not just clearly-overlapping and clearly-disjoint ranges.',
  },
  'B3-truncateWords': {
    spec: 'truncateWords(s,n): return a string of the first n words of s.',
    relevant: 'Pattern "exact-boundary ellipsis": a word-truncation helper must append the ellipsis ONLY when the input actually had MORE than n words. Always test the EXACT-n case (exactly n words in → no ellipsis) as well as the n+1 case (ellipsis added).',
  },
};
// POSITIVE CONTROL — an item whose rule the model CANNOT know a priori (an
// arbitrary, system-specific reserved set), a fair proxy for the project-specific
// knowledge a real flywheel corpus supplies. The spec tells the model the set is
// system-specific and NOT language keywords, so a base model safely returns false
// for its guesses (baseline-safe) but never exercises the true branch → the trap
// mutant survives. Only the RELEVANT exemplar names the set, so if the experiment
// is capable of detecting coupling at all, RELEVANT must lift the score here. A
// null on the textbook items is only credible if this control comes back POSITIVE.
const POS_CONTROL: Record<string, AnchorItem & { spec: string; relevant: string }> = {
  'POS-reserved': {
    id: 'POS-reserved', moduleName: 'isReserved', expectedMutants: 3, inputUnderTest: '', requirements: [],
    referenceImpl: "export function isReserved(name){return name==='zorp'||name==='quix'||name==='plib';}",
    spec: 'isReserved(name): return true only if name is one of a small, SYSTEM-SPECIFIC set of reserved identifiers (these are arbitrary project names, NOT language keywords). Return false for everything else.',
    relevant: 'Pattern "reserved-set coverage": in THIS system the reserved identifiers are exactly: zorp, quix, plib. A correct test MUST assert isReserved returns true for each of zorp, quix, and plib (and false for an unrelated name).',
  },
};
// Neutral testing-hygiene tip: an exemplar that is genuinely irrelevant to the
// trap but — unlike a topic-specific one — won't inject wrong assertions that
// floor the baseline (controls for "any exemplar helps" without a confound).
const IRRELEVANT = 'Pattern "test hygiene": give each test case a clear descriptive name and keep assertions focused, so failures are easy to diagnose.';
const ITEM_ID = arg('--item', 'B4-isLeapYear');

(async () => {
  if (isCloud && !CONFIRMED) { console.log(`Refusing to spend on ${MODEL} without --confirm-spend.`); process.exit(0); }
  if (isCloud && !ORKEY) { console.log('No OPENROUTER_API_KEY in .env.'); process.exit(2); }
  const pos = POS_CONTROL[ITEM_ID];
  const item: (AnchorItem & { spec?: string }) | undefined = pos
    ?? (loadAnchorSet('verification/anchors/qe-anchor-v2.json').items as AnchorItem[]).find((i) => i.id === ITEM_ID);
  const probe = pos ? { spec: pos.spec, relevant: pos.relevant } : PROBES[ITEM_ID];
  if (!item || !probe) { console.log(`Unknown --item ${ITEM_ID}. Choices: ${[...Object.keys(PROBES), ...Object.keys(POS_CONTROL)].join(', ')}`); process.exit(2); }
  const conditions: [string, string][] = [['NONE', ''], ['IRRELEVANT', IRRELEVANT], ['RELEVANT', probe.relevant]];
  console.log(`coupling experiment — model=${MODEL} reps=${REPS} item=${item.id} (under-specified spec, ${item.expectedMutants} trap mutant(s))\n`);
  // Response = END-TO-END usable-test quality per rep: 0 if the test doesn't run
  // against the reference (a broken suite is worthless), else its mutation score.
  // Averaged over ALL reps. This captures BOTH ways retrieval can help: rescuing a
  // test that otherwise can't be written at all (differential baseline flooring —
  // the positive control's dominant signal), and covering a trap an otherwise-
  // runnable test would miss. Conditioning on baseline (the earlier metric) hid
  // the first, stronger effect.
  const summary: Record<string, { mean: number; baseline: number }> = {};
  for (const [label, ex] of conditions) {
    let scoreSum = 0, baseline = 0;
    for (let i = 0; i < REPS; i++) {
      const prompt = `Write a Node.js unit test. Use EXACTLY these imports and API:\nimport { test } from 'node:test';\nimport assert from 'node:assert';\nimport { ${item.moduleName} } from '../src/${item.moduleName}.mjs';\nWrite one or more test('name', () => { ... }) blocks and assert with assert.strictEqual(...). Do NOT use a test-context (t) for assertions.\nSpec: ${probe.spec}\nAssume inputs are valid; do NOT test null/invalid inputs.\n${ex ? `Related pattern (inspiration):\n${ex}\n` : ''}Output ONLY the test code, no prose.`;
      const code = strip(await generate(prompt, 0.5 + i * 0.08, 100 + i));
      const r = evaluateOracle({ moduleName: item.moduleName, referenceImpl: item.referenceImpl, generatedTest: code, threshold: 0.8, maxMutants: 8 });
      if (r.baselinePassed) baseline++;
      scoreSum += r.baselinePassed ? r.mutationScore : 0; // broken test = 0
    }
    summary[label] = { mean: scoreSum / REPS, baseline };
    console.log(`${label.padEnd(10)} usable-quality(runs∧kills)=${(scoreSum / REPS).toFixed(2)}  (baselinePassed=${baseline}/${REPS})`);
  }
  // Guard 1: if even RELEVANT can't produce a runnable test, the harness — not the
  // model — is broken for this item; refuse to conclude (never a false null).
  if (summary['RELEVANT'].baseline < Math.ceil(REPS / 2)) {
    console.log('\nVERDICT: INCONCLUSIVE — even the RELEVANT condition floored the baseline, so the harness cannot generate a runnable test for this item. Fix the item spec/harness before concluding.');
    return;
  }
  const noneMax = Math.max(summary['NONE'].mean, summary['IRRELEVANT'].mean);
  // Guard 2: no headroom — the base model already produces a strong test without a
  // relevant exemplar, so retrieval has nothing to add (ceiling artifact, not a result).
  if (noneMax >= 0.98) {
    console.log(`\nVERDICT: NO HEADROOM — the base model already scores ${noneMax.toFixed(2)} without a relevant exemplar on ${item.id}, so coupling cannot be measured here. This is a ceiling artifact, not a coupling result — the model already knows the trap.`);
    return;
  }
  const relGain = summary['RELEVANT'].mean - noneMax;
  console.log(`\nRELEVANT gain over best of NONE/IRRELEVANT: ${relGain >= 0 ? '+' : ''}${relGain.toFixed(2)}`);
  console.log(relGain > 0.15
    ? `VERDICT: coupling MECHANISM validated on this model — a relevant exemplar measurably improves end-to-end test quality (${noneMax.toFixed(2)} → ${summary['RELEVANT'].mean.toFixed(2)}). Retrieval helps WHEN the corpus supplies knowledge the base model lacks.`
    : 'VERDICT: no coupling signal — a relevant exemplar does NOT measurably help; flywheel retrieval stays infrastructure (ADR-118).');
})().catch((e) => { console.error('ERR', e?.message || e); process.exit(1); });
