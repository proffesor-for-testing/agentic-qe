// test-generation — EXECUTION oracle graded by MUTATION SCORE (the headline
// "can this model write GOOD tests" signal, done properly — see grade.mjs
// gradeByMutationScore + the rethink in the session notes).
//
// The model is given the IMPLEMENTATION (realistic: you write tests for existing
// code; removes spec ambiguity) and asked for a thorough suite. Grading:
//   validity  = fraction of its tests that pass on the reference impl
//               (an over-specified test is DROPPED, never fatal to the suite)
//   score     = mutation score = fraction of a diverse, non-equivalent mutant
//               SET killed by >=1 valid test (Stryker low band 0.6 = pass)
// v1 seed set: 5 pure functions, each with 4 mutants spanning the standard
// operators (arithmetic swap, boundary, off-by-one, return alteration).
import { gradeByMutationScore } from '../lib/grade.mjs';

const SAMPLES = [
  {
    id: 'clamp',
    impl: 'function clamp(x,lo,hi){return Math.max(lo,Math.min(hi,x));}',
    mutants: [
      { op: 'max→min', impl: 'function clamp(x,lo,hi){return Math.min(lo,Math.min(hi,x));}' },
      { op: 'min→max', impl: 'function clamp(x,lo,hi){return Math.max(lo,Math.max(hi,x));}' },
      { op: 'swap-lo-hi', impl: 'function clamp(x,lo,hi){return Math.max(hi,Math.min(lo,x));}' },
      { op: 'off-by-one', impl: 'function clamp(x,lo,hi){return Math.max(lo,Math.min(hi,x+1));}' },
    ],
  },
  {
    id: 'dedupe',
    impl: 'function dedupe(a){const s=new Set();const o=[];for(const x of a){if(!s.has(x)){s.add(x);o.push(x);}}return o;}',
    mutants: [
      { op: 'no-dedup', impl: 'function dedupe(a){return a.slice();}' },
      { op: 'reversed', impl: 'function dedupe(a){const s=new Set();const o=[];for(const x of a){if(!s.has(x)){s.add(x);o.push(x);}}return o.reverse();}' },
      { op: 'sorted', impl: 'function dedupe(a){return a.slice().sort();}' },
      { op: 'drop-first', impl: 'function dedupe(a){const s=new Set();const o=[];for(const x of a){if(!s.has(x)){s.add(x);o.push(x);}}return o.slice(1);}' },
    ],
  },
  {
    id: 'titleCase',
    impl: "function titleCase(s){return s.split(' ').map(w=>w?w[0].toUpperCase()+w.slice(1).toLowerCase():w).join(' ');}",
    mutants: [
      { op: 'no-lower-rest', impl: "function titleCase(s){return s.split(' ').map(w=>w?w[0].toUpperCase()+w.slice(1):w).join(' ');}" },
      { op: 'lower-first', impl: "function titleCase(s){return s.split(' ').map(w=>w?w[0].toLowerCase()+w.slice(1).toLowerCase():w).join(' ');}" },
      { op: 'all-lower', impl: 'function titleCase(s){return s.toLowerCase();}' },
      { op: 'all-upper', impl: 'function titleCase(s){return s.toUpperCase();}' },
    ],
  },
  {
    id: 'rangeSum',
    impl: 'function rangeSum(n){let s=0;for(let i=1;i<=n;i++)s+=i;return s;}',
    mutants: [
      { op: 'drop-n', impl: 'function rangeSum(n){let s=0;for(let i=1;i<n;i++)s+=i;return s;}' },
      { op: 'extra-term', impl: 'function rangeSum(n){let s=0;for(let i=1;i<=n+1;i++)s+=i;return s;}' },
      { op: 'start-at-2', impl: 'function rangeSum(n){let s=0;for(let i=2;i<=n;i++)s+=i;return s;}' },
      { op: 'formula-neg', impl: 'function rangeSum(n){return n*(n+1)/2;}' }, // differs on n<=0
    ],
  },
  {
    id: 'safeDivide',
    impl: 'function safeDivide(a,b){if(b===0)throw new Error("div by zero");return a/b;}',
    mutants: [
      { op: 'no-throw', impl: 'function safeDivide(a,b){return a/b;}' },
      { op: 'guard-b===1', impl: 'function safeDivide(a,b){if(b===1)throw new Error("x");return a/b;}' },
      { op: 'swap-operands', impl: 'function safeDivide(a,b){if(b===0)throw new Error("x");return b/a;}' },
      { op: 'mul', impl: 'function safeDivide(a,b){if(b===0)throw new Error("x");return a*b;}' },
    ],
  },
];

export default {
  id: 'test-generation',
  title: 'Write a test suite that catches bugs (graded by mutation score)',
  oracleType: 'execution',
  maxTokens: 2500,
  samples: SAMPLES.map((s) => ({ id: s.id, ...s })),
  buildPrompt(sample) {
    return [
      { role: 'system', content: 'Output ONLY a single JavaScript code block and NOTHING else — no analysis, no prose, no explanation before or after. Your response MUST begin with ```js on the first line and end with ```. Inside, write many `test(name, fn)` calls using `expect(x).toBe(y)`, `expect(x).toEqual(arr)`, and `expect(fn).toThrow()`. Call the function directly by name (already in scope). Do not re-declare the function or import anything.' },
      { role: 'user', content: `Write a THOROUGH test suite for this function that catches subtle bugs — wrong boundaries, swapped operators, off-by-one, missing edge cases. Cover boundary values and edge cases, not just the happy path.\n\n${sample.impl}\n\nRespond with only the \`\`\`js code block.` },
    ];
  },
  async grade(sample, output) {
    return gradeByMutationScore({ testCode: output, correctImpl: sample.impl, mutants: sample.mutants, bar: 0.6 });
  },
};
