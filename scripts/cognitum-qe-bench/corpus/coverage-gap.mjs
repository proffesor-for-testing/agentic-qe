// coverage-gap — STRUCTURAL oracle (proxy tier, ADR-121 weakest). Given code +
// which cases the tests already cover, name the specific uncovered branch that
// matters. Graded by required/banned tokens over the answer — an identifier-level
// match, meaningful but not execution-backed (honest about its provenance).
// v1 seed set: 5 snippets, each with one clearly-identifiable uncovered branch.
import { gradeStructural } from '../lib/grade.mjs';

const SAMPLES = [
  {
    id: 'categorize-zero',
    code: "function categorize(n){ if(n<0) return 'neg'; if(n===0) return 'zero'; return 'pos'; }",
    covered: "Tests exercise categorize(5)→'pos' and categorize(-1)→'neg'.",
    mustInclude: ['zero'], mustNotInclude: ['pos', 'neg'],
  },
  {
    id: 'discount-else',
    code: "function discount(total, member){ if(member && total>100) return total*0.8; if(total>100) return total*0.9; return total; }",
    covered: 'Tests cover a member with total 150, and a non-member with total 150.',
    mustInclude: ['return total'], mustNotInclude: [],
  },
  {
    id: 'retry-maxed',
    code: "function shouldRetry(attempt, max){ if(attempt>=max) return false; return true; }",
    covered: 'Tests cover shouldRetry(0, 3) → true.',
    mustInclude: ['attempt', 'false'], mustNotInclude: [],
  },
  {
    id: 'parse-empty',
    code: "function parseTags(s){ if(!s) return []; return s.split(',').map(x=>x.trim()); }",
    covered: "Tests cover parseTags('a, b') → ['a','b'].",
    mustInclude: ['empty'], mustNotInclude: [],
  },
  {
    id: 'grade-boundary',
    code: "function grade(score){ if(score>=90) return 'A'; if(score>=80) return 'B'; if(score>=70) return 'C'; return 'F'; }",
    covered: "Tests cover grade(95)→'A' and grade(50)→'F'.",
    mustInclude: ['B', 'C'], mustNotInclude: [],
  },
];

export default {
  id: 'coverage-gap',
  title: 'Identify the uncovered branch that matters',
  oracleType: 'structural',
  maxTokens: 500,
  samples: SAMPLES.map((s) => ({ id: s.id, task: `${s.code}\n\n${s.covered}`, mustInclude: s.mustInclude, mustNotInclude: s.mustNotInclude })),
  buildPrompt(sample) {
    return [
      { role: 'system', content: 'You are a QE coverage analyst. Given a function and which cases the tests already cover, name the ONE most important branch/case that is NOT yet covered, and the concrete input that would exercise it. Be specific about the branch (its condition and its return/behavior).' },
      { role: 'user', content: sample.task },
    ];
  },
  async grade(sample, output) {
    return gradeStructural({ output, mustInclude: sample.mustInclude, mustNotInclude: sample.mustNotInclude });
  },
};
