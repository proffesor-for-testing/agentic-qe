// mutation-adequacy — EXECUTION-backed labeled oracle. The model must predict,
// WITHOUT running anything, whether a given test suite KILLS a mutant (catches it)
// or the mutant SURVIVES (suite misses it) — pure test-adequacy reasoning. The
// gold label is not hand-asserted: the oracle actually RUNS the suite against the
// mutant to derive truth, then compares. v1 seed set: 5 impl/suite/mutant triples.
import { gradeLabel, runSuiteAgainst } from '../lib/grade.mjs';

const CHOICES = ['killed', 'survived'];
const HARNESS = null; // use grade.mjs DEFAULT_HARNESS (expect/test)

const SAMPLES = [
  {
    id: 'abs-covered',
    impl: 'function absVal(x){return x<0?-x:x;}',
    suite: 'test("neg",()=>{expect(absVal(-4)).toBe(4)}); test("pos",()=>{expect(absVal(3)).toBe(3)});',
    mutant: 'function absVal(x){return x<0?x:x;}', // returns x for negatives → -4
    // suite checks absVal(-4)===4; mutant gives -4 → suite FAILS → killed
  },
  {
    id: 'max-boundary-missed',
    impl: 'function isAdult(age){return age>=18;}',
    suite: 'test("adult",()=>{expect(isAdult(40)).toBe(true)}); test("child",()=>{expect(isAdult(5)).toBe(false)});',
    mutant: 'function isAdult(age){return age>18;}', // boundary off-by-one at 18
    // suite tests 40 and 5, never 18 → mutant passes both → survived
  },
  {
    id: 'sum-covered',
    impl: 'function sum(a){return a.reduce((s,x)=>s+x,0);}',
    suite: 'test("s",()=>{expect(sum([1,2,3])).toBe(6)});',
    mutant: 'function sum(a){return a.reduce((s,x)=>s+x,1);}', // seeds accumulator at 1
    // sum([1,2,3]) correct 6, mutant 7 → suite FAILS → killed
  },
  {
    id: 'contains-empty-missed',
    impl: 'function includesNeg(a){return a.some(x=>x<0);}',
    suite: 'test("has",()=>{expect(includesNeg([1,-2,3])).toBe(true)}); test("none",()=>{expect(includesNeg([1,2,3])).toBe(false)});',
    mutant: 'function includesNeg(a){return a.length>0 && a.some(x=>x<0);}', // differs only on []
    // suite never tests [] → both agree on the tested inputs → survived
  },
  {
    id: 'round-covered',
    impl: 'function half(n){return Math.floor(n/2);}',
    suite: 'test("even",()=>{expect(half(10)).toBe(5)}); test("odd",()=>{expect(half(7)).toBe(3)});',
    mutant: 'function half(n){return Math.ceil(n/2);}', // ceil vs floor: differs on odd
    // half(7): floor 3, ceil 4 → suite FAILS on odd → killed
  },
];

// Derive gold by EXECUTION at load (5 quick synchronous runs). Reproducible,
// not asserted: gold = 'survived' iff the suite passes against the mutant.
const withGold = SAMPLES.map((s) => {
  const r = runSuiteAgainst(s.mutant, s.suite, HARNESS);
  const gold = r.ran && r.passed ? 'survived' : 'killed';
  return { ...s, gold };
});

export default {
  id: 'mutation-adequacy',
  title: 'Predict whether a test suite kills a mutant (test-adequacy reasoning)',
  oracleType: 'execution',
  maxTokens: 600,
  samples: withGold.map((s) => ({ id: s.id, task: `IMPLEMENTATION:\n${s.impl}\n\nTEST SUITE:\n${s.suite}\n\nMUTANT (a changed implementation):\n${s.mutant}`, gold: s.gold, choices: CHOICES })),
  buildPrompt(sample) {
    return [
      { role: 'system', content: `You are a mutation-testing analyst. Decide, by reasoning (do NOT run code), whether the TEST SUITE would KILL the mutant (some test fails on it) or the mutant would SURVIVE (all tests still pass). Your VERY FIRST line must be exactly "VERDICT: killed" or "VERDICT: survived"; then justify briefly.` },
      { role: 'user', content: sample.task },
    ];
  },
  async grade(sample, output) {
    return gradeLabel({ output, gold: sample.gold, choices: sample.choices });
  },
};
