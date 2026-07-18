// adversarial-review — LABELED oracle, the qe-court signal. A small code delivery
// is either clean (gold SHIP) or carries ONE seeded, non-obvious bug (gold BLOCK).
// Measures the exact failure the qe-court exists to catch: a cheap reviewer
// waving through a subtle bug (false SHIP). The asymmetry matters — a false SHIP
// on a buggy delivery is the costly error, so this is where a high-tier advisor
// most likely earns its price. v1 seed set: 6 deliveries (3 clean, 3 seeded).
import { gradeLabel } from '../lib/grade.mjs';

const CHOICES = ['ship', 'block'];

const SAMPLES = [
  {
    id: 'clean-clamp',
    diff: 'function clamp(x,lo,hi){ return Math.max(lo, Math.min(hi, x)); }',
    note: 'PR: add clamp helper.',
    gold: 'ship',
  },
  {
    id: 'seeded-offbyone',
    diff: 'function lastN(arr, n){ return arr.slice(arr.length - n + 1); } // return the last n elements',
    note: 'PR: add lastN helper to return the final n elements.',
    gold: 'block', // off-by-one: slice(len-n+1) drops one; should be len-n
  },
  {
    id: 'clean-retry',
    diff: 'async function withRetry(fn, max){ let e; for(let i=0;i<max;i++){ try { return await fn(); } catch(err){ e=err; } } throw e; }',
    note: 'PR: retry an async fn up to max times, rethrow the last error.',
    gold: 'ship',
  },
  {
    id: 'seeded-await-missing',
    diff: 'async function saveAll(items, save){ items.forEach(async (it) => { await save(it); }); return "done"; }',
    note: 'PR: save all items, then return "done".',
    gold: 'block', // forEach(async) does NOT await — returns "done" before saves finish
  },
  {
    id: 'clean-dedupe',
    diff: 'function dedupe(a){ return [...new Set(a)]; }',
    note: 'PR: dedupe an array preserving order.',
    gold: 'ship',
  },
  {
    id: 'seeded-mutation-bug',
    diff: 'function addItem(cart, item){ cart.items.push(item); return { ...cart }; } // return a new cart with the item added',
    note: 'PR: immutably add an item to the cart, returning a new cart.',
    gold: 'block', // mutates cart.items in place before the shallow spread — not immutable
  },
];

export default {
  id: 'adversarial-review',
  title: 'Adversarial review: SHIP a clean delivery, BLOCK a seeded subtle bug',
  oracleType: 'labeled',
  maxTokens: 700,
  samples: SAMPLES.map((s) => ({ id: s.id, task: `${s.note}\n\nDELIVERY:\n${s.diff}`, gold: s.gold, choices: CHOICES })),
  buildPrompt(sample) {
    return [
      { role: 'system', content: 'You are an adversarial code reviewer. Scrutinize the delivery for ANY correctness bug (off-by-one, missing await, hidden mutation, wrong boundary). If it is fully correct, SHIP. If it contains any real bug, BLOCK and name it. Bias toward catching, not passing. Your VERY FIRST line must be exactly "VERDICT: ship" or "VERDICT: block"; then justify briefly.' },
      { role: 'user', content: sample.task },
    ];
  },
  async grade(sample, output) {
    return gradeLabel({ output, gold: sample.gold, choices: sample.choices });
  },
};
