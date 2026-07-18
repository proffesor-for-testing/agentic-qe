// grade.mjs — the oracles. This is the QE-perspective differentiator: several
// tasks are graded by EXECUTION (delivered quality), which is strictly stronger
// than the LLM-judge (predicted quality) that ruflo's benches lean on. Each
// oracle returns { pass: 0|1, detail } and declares its provenance tier
// (ADR-121: oracle:test-exec > judge:llm > proxy:structural) so the run-record
// is honest about HOW each number was earned.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PROVENANCE = {
  execution: 'oracle:test-exec',
  labeled: 'oracle:labeled',
  structural: 'proxy:structural',
  judge: 'judge:llm',
};

// --- Execution oracle: MUTATION SCORE (ADR-aligned, mutation-testing/SKILL) ---
// Test-generation is the headline "can this model write GOOD tests" signal, so
// it is graded the way real mutation testing does, not by a single-mutant coin
// flip:
//   1. Give the model the IMPLEMENTATION and ask for a thorough suite.
//   2. Run EACH test independently (instrumented harness) — one over-specified
//      assertion is DROPPED, never fatal to the suite (the flaw that zeroed the
//      frontier tier before). "Valid tests" = those that pass on the reference.
//   3. mutationScore = fraction of a DIVERSE, non-equivalent mutant SET that is
//      killed by >=1 valid test. Continuous 0..1; pass >= 0.6 (Stryker low band).
//   4. Report validity (valid/total) so "1 good test + noise" is visible.
// This rewards thoroughness (more discriminating tests -> higher score) instead
// of punishing it.
export function gradeByMutationScore({ testCode, correctImpl, mutants, harness, bar = 0.6 }) {
  const code = extractCode(testCode);
  // emitted = the model produced runnable-looking test code at all. Kept separate
  // from mutation score so an instruction-following failure (no code) is not
  // conflated with a test-quality failure (weak tests).
  if (!code) return { pass: 0, score: 0, validity: 0, emitted: false, detail: 'no test code found in output (emission failure)', provenance: PROVENANCE.execution };

  let runCode = code;
  let onCorrect = runInstrumented(correctImpl, runCode, harness);
  if (onCorrect.error && runCode.lastIndexOf('});') > 0) {
    // Truncated mid-statement (a verbose model exceeded the token budget): trim to
    // the last COMPLETE test block so the parseable prefix still scores, instead
    // of zeroing an otherwise-good suite. Retry once.
    runCode = runCode.slice(0, runCode.lastIndexOf('});') + 3);
    onCorrect = runInstrumented(correctImpl, runCode, harness);
  }
  if (onCorrect.error) return { pass: 0, score: 0, validity: 0, emitted: true, detail: `suite un-runnable on reference impl: ${onCorrect.error}`, provenance: PROVENANCE.execution };
  const total = onCorrect.results.length;
  if (total === 0) return { pass: 0, score: 0, validity: 0, emitted: true, detail: 'no test cases detected', provenance: PROVENANCE.execution };

  // Valid tests = those that PASS on the reference impl (dropped, not fatal).
  const validNames = new Set(onCorrect.results.filter((r) => r.ok).map((r) => r.name));
  const validity = validNames.size / total;
  if (validNames.size === 0) return { pass: 0, score: 0, validity: 0, emitted: true, detail: `all ${total} tests failed on the reference impl (invalid suite)`, provenance: PROVENANCE.execution };

  // A mutant is KILLED if some VALID test (passed on correct) fails on it.
  let killed = 0;
  const survivors = [];
  for (const m of mutants) {
    const onMutant = runInstrumented(m.impl, runCode, harness);
    // If the whole suite errors on the mutant, that counts as killed (the mutation
    // broke execution for a valid test). Otherwise check per-test.
    const caught = onMutant.error
      ? true
      : onMutant.results.some((r) => validNames.has(r.name) && !r.ok);
    if (caught) killed += 1; else survivors.push(m.op || m.id || 'mutant');
  }
  const score = mutants.length ? killed / mutants.length : 0;
  return {
    pass: score >= bar ? 1 : 0,
    score, validity, emitted: true, killed, mutants: mutants.length,
    detail: `mutation score ${killed}/${mutants.length}=${score.toFixed(2)}, validity ${validNames.size}/${total}${survivors.length ? `, survived: ${survivors.join(',')}` : ''}`,
    provenance: PROVENANCE.execution,
  };
}

// Run a test file with per-test result capture: each test/it records pass/fail
// independently (a throwing test does not abort the others). Returns
// { results:[{name, ok}] } or { error } if the file itself won't execute.
function runInstrumented(implCode, testCode, harness) {
  const dir = mkdtempSync(join(tmpdir(), 'qe-mut-'));
  const file = join(dir, 'case.mjs');
  const src = `${harness || INSTRUMENTED_HARNESS}\n${implCode}\n${testCode}\nconsole.log('__RESULTS__'+JSON.stringify(__R));\n`;
  try {
    writeFileSync(file, src);
    const out = execFileSync(process.execPath, [file], { stdio: 'pipe', timeout: 8000 }).toString();
    const line = out.split('\n').find((l) => l.startsWith('__RESULTS__'));
    if (!line) return { error: 'no results emitted' };
    return { results: JSON.parse(line.slice('__RESULTS__'.length)) };
  } catch (e) {
    if (e.code === 'ETIMEDOUT') return { error: 'timeout' };
    return { error: (e.stderr?.toString?.() || e.message || 'exec error').slice(0, 160) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Public: run a test suite against an implementation, returning {ran, passed}.
// Used by mutation-adequacy to derive EXECUTION-backed ground truth (does the
// suite actually kill this mutant?) rather than a hand-asserted label.
export function runSuiteAgainst(implCode, suiteCode, harness) {
  return runTest(suiteCode, implCode, harness);
}

function runTest(testBody, impl, harness) {
  // A minimal zero-dependency assert harness: the generated test calls the
  // function(s) the impl exports and throws on mismatch. We inline impl + test
  // and a tiny expect() so no test runner install is needed.
  const dir = mkdtempSync(join(tmpdir(), 'qe-bench-'));
  const file = join(dir, 'case.mjs');
  const src = `${harness || DEFAULT_HARNESS}\n${impl}\n${testBody}\n`;
  try {
    writeFileSync(file, src);
    execFileSync(process.execPath, [file], { stdio: 'pipe', timeout: 8000 });
    return { ran: true, passed: true };
  } catch (e) {
    // Non-zero exit = assertion threw = test failed (ran but not passed).
    const stderr = (e.stderr?.toString?.() || e.message || '').slice(0, 300);
    if (e.code === 'ETIMEDOUT') return { ran: false, error: 'timeout' };
    // Distinguish "assertion failed" (ran) from "syntax/reference error" (didn't run).
    const didRun = /AssertionError|Expected|Assertion/i.test(stderr) || e.status === 1;
    return didRun ? { ran: true, passed: false } : { ran: false, error: stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Zero-dependency harness supporting the common styles a model might emit
// (test/it/describe + expect matchers + a bare assert), so a correct test isn't
// scored 0 merely for using describe/it or assert instead of test/expect.
const DEFAULT_HARNESS = `
function expect(actual){return{
  toBe(e){if(actual!==e)throw new Error('AssertionError: expected '+e+' got '+actual)},
  toEqual(e){if(JSON.stringify(actual)!==JSON.stringify(e))throw new Error('AssertionError: expected '+JSON.stringify(e)+' got '+JSON.stringify(actual))},
  toThrow(){let t=false;try{actual()}catch{t=true}if(!t)throw new Error('AssertionError: expected throw')},
  toBeTruthy(){if(!actual)throw new Error('AssertionError: expected truthy got '+actual)},
  toBeFalsy(){if(actual)throw new Error('AssertionError: expected falsy got '+actual)},
  toBeCloseTo(e){if(Math.abs(actual-e)>1e-6)throw new Error('AssertionError: expected ~'+e+' got '+actual)},
  get not(){return {toBe(e){if(actual===e)throw new Error('AssertionError: expected not '+e)}}}
}}
function test(_n,fn){fn()}
function it(_n,fn){fn()}
function describe(_n,fn){fn()}
function beforeEach(fn){fn&&fn()}
function afterEach(fn){}
function assert(c,m){if(!c)throw new Error('AssertionError: '+(m||'assert failed'))}
assert.equal=function(a,b,m){if(a!==b)throw new Error('AssertionError: '+a+' !== '+b+(m?' '+m:''))};
assert.strictEqual=assert.equal;
assert.deepEqual=function(a,b){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('AssertionError: deepEqual')};
assert.throws=function(fn){let t=false;try{fn()}catch{t=true}if(!t)throw new Error('AssertionError: expected throw')};
assert.ok=function(c,m){if(!c)throw new Error('AssertionError: '+(m||'not ok'))};
`;

// Instrumented variant for mutation scoring: test/it record pass/fail into __R
// independently (a throwing test does not abort the rest), so one bad assertion
// drops one test instead of the whole suite. Same matchers as DEFAULT_HARNESS.
const INSTRUMENTED_HARNESS = `
const __R=[]; let __before=[];
function __run(name,fn){ try{ for(const b of __before) b(); fn(); __R.push({name:String(name),ok:true}); }catch(e){ __R.push({name:String(name),ok:false}); } }
function test(n,fn){__run(n,fn)}
function it(n,fn){__run(n,fn)}
function describe(_n,fn){ const s=__before.slice(); try{fn()}finally{__before=s;} }
function beforeEach(fn){__before.push(fn)}
function afterEach(){}
function expect(actual){return{
  toBe(e){if(actual!==e)throw new Error('AssertionError')},
  toEqual(e){if(JSON.stringify(actual)!==JSON.stringify(e))throw new Error('AssertionError')},
  toThrow(){let t=false;try{actual()}catch{t=true}if(!t)throw new Error('AssertionError')},
  toBeTruthy(){if(!actual)throw new Error('AssertionError')},
  toBeFalsy(){if(actual)throw new Error('AssertionError')},
  toBeCloseTo(e){if(Math.abs(actual-e)>1e-6)throw new Error('AssertionError')},
  get not(){return {toBe(e){if(actual===e)throw new Error('AssertionError')},toEqual(e){if(JSON.stringify(actual)===JSON.stringify(e))throw new Error('AssertionError')}}}
}}
function assert(c,m){if(!c)throw new Error('AssertionError')}
assert.equal=function(a,b){if(a!==b)throw new Error('AssertionError')};
assert.strictEqual=assert.equal;
assert.deepEqual=function(a,b){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('AssertionError')};
assert.throws=function(fn){let t=false;try{fn()}catch{t=true}if(!t)throw new Error('AssertionError')};
assert.ok=function(c){if(!c)throw new Error('AssertionError')};
`;

// --- Labeled oracle ---------------------------------------------------------
// Exact-label or set-membership match against ground truth. Used where the QE
// task has a discrete correct answer (a severity class, an exploitability verdict,
// a root-cause class). We parse the model's declared label out of its output.
export function gradeLabel({ output, gold, choices }) {
  const got = extractLabel(output, choices);
  if (!got) return { pass: 0, detail: `no label in {${choices.join(',')}} found in output`, provenance: PROVENANCE.labeled, got: null };
  const pass = got === String(gold).toLowerCase() ? 1 : 0;
  return { pass, detail: pass ? `correct: ${got}` : `got ${got}, gold ${gold}`, provenance: PROVENANCE.labeled, got };
}

function extractLabel(output, choices) {
  const low = String(output).toLowerCase();
  // Prefer an explicit "VERDICT: x" / "label: x" line; else first choice mentioned.
  const tagged = low.match(/(?:verdict|label|answer|classification|severity)\s*[:=]\s*([a-z-]+)/);
  if (tagged && choices.map((c) => c.toLowerCase()).includes(tagged[1])) return tagged[1];
  for (const c of choices) if (new RegExp(`\\b${c.toLowerCase()}\\b`).test(low)) return c.toLowerCase();
  return null;
}

// --- Structural oracle ------------------------------------------------------
// Weakest (proxy) tier: the output must include the right tokens and avoid the
// wrong ones. For tasks like "name the uncovered branch" where an exact string
// oracle over identifiers is meaningful but not execution-backed.
export function gradeStructural({ output, mustInclude = [], mustNotInclude = [] }) {
  const low = String(output).toLowerCase();
  const missing = mustInclude.filter((t) => !low.includes(t.toLowerCase()));
  const banned = mustNotInclude.filter((t) => low.includes(t.toLowerCase()));
  const pass = missing.length === 0 && banned.length === 0 ? 1 : 0;
  return {
    pass,
    detail: pass ? 'all required tokens present, none banned' : `missing:[${missing}] banned:[${banned}]`,
    provenance: PROVENANCE.structural,
  };
}

// --- LLM-judge oracle (parameterizable tier) --------------------------------
// A rubric graded by a model. Crucially the judge tier is a PARAMETER — the
// whole experiment is comparing a cheap judge vs cognitum-high as judge — so the
// grader takes a `judge` callback bound to whatever key/tier the policy assigns.
// Two-stage (structural gate then rubric) mirrors ruflo benchmark-models-midtier.
export async function gradeByJudge({ output, sample, judge }) {
  const rubric = sample.rubric || [{ name: 'correct', weight: 1, desc: 'Is the answer correct and complete?' }];
  const prompt = [
    { role: 'system', content: 'You are a strict QE reviewer. Score each criterion 0, 0.5, or 1. Reply ONLY with JSON: {"scores":{"<name>":<0|0.5|1>},"comment":"..."}.' },
    { role: 'user', content: `TASK:\n${sample.task}\n\nCANDIDATE ANSWER:\n${output}\n\nGROUND TRUTH / REFERENCE:\n${sample.reference || '(none)'}\n\nRUBRIC:\n${rubric.map((r) => `- ${r.name} (w=${r.weight}): ${r.desc}`).join('\n')}` },
  ];
  const res = await judge(prompt);
  if (!res.ok) return { pass: 0, score: 0, detail: `judge failed: ${res.error}`, provenance: PROVENANCE.judge, ran: false };
  const parsed = parseJson(res.text);
  if (!parsed?.scores) return { pass: 0, score: 0, detail: 'judge returned unparseable JSON', provenance: PROVENANCE.judge, ran: false };
  let score = 0, wsum = 0;
  for (const r of rubric) { score += (parsed.scores[r.name] ?? 0) * r.weight; wsum += r.weight; }
  score = wsum ? score / wsum : 0;
  return { pass: score >= (sample.bar ?? 0.7) ? 1 : 0, score, detail: parsed.comment || '', provenance: PROVENANCE.judge, ran: true, judgeCost: res.priceUsd ?? 0 };
}

// --- helpers ---------------------------------------------------------------
export function extractCode(text) {
  const s = String(text);
  let code = null;
  // 1. A properly closed fenced block (preferred).
  let m = s.match(/```(?:js|javascript|mjs|typescript|ts)?\s*([\s\S]*?)```/);
  if (m) code = m[1];
  // 2. An UNCLOSED fence (verbose model truncated mid-block): take to end.
  else if ((m = s.match(/```(?:js|javascript|mjs|typescript|ts)?\s*([\s\S]*)$/))) code = m[1];
  // 3. No fence, but the text is itself test-like.
  else if (/(?:^|\n)\s*(?:test|it|describe|expect|assert)\s*\(/.test(s)) code = s;
  if (code == null) return null; // model emitted no tests (an emission failure, not a quality one)
  // Strip lines that break inline execution — imports/requires/exports of the
  // helpers/impl we inline ourselves.
  return code
    .split('\n')
    .filter((l) => !/^\s*(import\s|export\s|(?:const|let|var)\s+\{[^}]*\}\s*=\s*require\(|.*=\s*require\()/.test(l))
    .join('\n')
    .trim();
}
function parseJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
