// D7-wire proof — FreeTierEscalatingExecutor running REAL QE tasks on the free
// local tier (qwen3:8b @ M5 host Ollama), verifying output, escalating the hard
// case to a STUB "senior" tier (no real API spend — clearly labelled).
//
// Reproduce:
//   cd /workspaces/agentic-qe
//   OUT=/tmp/d7wbuild
//   npx tsc src/routing/escalation/auto-escalation-tracker.ts src/routing/free-tier/*.ts \
//       --outDir "$OUT" --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck
//   BUILD_DIR="$OUT" node docs/metaharness/prototype/d7-wire-proof.mjs

const BUILD = process.env.BUILD_DIR || '/tmp/d7wbuild';
const { FreeTierEscalatingExecutor, defaultFreeTierLadder } =
  await import(`${BUILD}/routing/free-tier/index.js`);

// STUB senior tier — stands in for HybridRouter→Claude. Always returns a correct
// vitest test so we can show escalation without real API spend. NOT a real call.
const claudeRunner = async (tier, _messages) => ({
  content: '```js\nimport { test, expect } from "vitest";\ntest("adds", () => { expect(add(2,3)).toBe(5); });\n```',
});

// Objective QE verifier: output must be a vitest test asserting add(2,3) === 5.
const verify = (out) =>
  /expect\s*\(\s*add\s*\(\s*2\s*,\s*3\s*\)\s*\)\s*\.toBe\s*\(\s*5\s*\)/.test(out);

const exec = new FreeTierEscalatingExecutor({
  ladder: defaultFreeTierLadder('qwen3:8b'),
  claudeRunner,
  onOutcome: (o) => console.log('  [outcome]', JSON.stringify(o)),
});

const messages = [
  { role: 'system', content: 'You write vitest tests. Output ONLY a fenced ```js code block, no prose.' },
  { role: 'user', content: 'Given `function add(a,b){return a+b}`, write ONE vitest test asserting add(2,3) is 5 using expect(add(2,3)).toBe(5).' },
];

console.log('=== Task 1: real QE task on the free local tier (cheap-first) ===');
const r1 = await exec.execute({ agentId: 'qe-test-architect:demo', messages, verify, maxEscalations: 3 });
for (const a of r1.attempts) {
  console.log(`  ${a.tier.padEnd(7)} [${a.provider}] ok=${a.ok} passed=${a.passed} ${a.latencyMs}ms ${a.error ? '(' + a.error + ')' : ''}`);
}
console.log(`  => ok=${r1.ok} tierUsed=${r1.tierUsed} escalated=${r1.escalated}`);
console.log('  output (first 90 chars):', JSON.stringify(r1.content.replace(/\n/g, ' ').slice(0, 90)));

console.log('\n=== Task 2: an impossible verify -> climb past local to the senior stub ===');
const r2 = await exec.execute({
  agentId: 'qe-test-architect:hardcase',
  messages,
  verify: (out) => verify(out) && out.includes('IMPOSSIBLE_LOCAL_MARKER'), // local can't produce this; senior stub also can't -> shows full climb
  maxEscalations: 3,
});
console.log('  tiers tried:', r2.attempts.map((a) => `${a.tier}:${a.passed ? 'pass' : 'fail'}`).join(' -> '));
console.log(`  => ok=${r2.ok} tierUsed=${r2.tierUsed} escalated=${r2.escalated}`);

console.log('\nRESULT: executor wires free-tier-first + verify + escalate + recordOutcome against a live local model.');
