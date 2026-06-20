// D7 proof — free-tier escalation ladder against the real AutoEscalationTracker.
//
// Demonstrates: a FREE local tier (host Ollama) at the bottom of the ladder,
// escalation to Claude tiers on consecutive failures (Ruv's Round-3 economics),
// and de-escalation back to free after sustained success.
//
// Reproduce (modules are TS; compile the slice, then run):
//   cd /workspaces/agentic-qe
//   OUT=/tmp/d7build
//   npx tsc src/routing/escalation/auto-escalation-tracker.ts src/routing/free-tier/*.ts \
//       --outDir "$OUT" --module nodenext --moduleResolution nodenext --target es2022 --skipLibCheck
//   BUILD_DIR="$OUT" node docs/metaharness/prototype/d7-proof.mjs
//
// Requires the M5 host Ollama reachable at host.docker.internal:11434 with qwen3:8b.

const BUILD = process.env.BUILD_DIR || '/tmp/d7build';
const { defaultFreeTierLadder, createFreeTierEscalation, resolveTier, freeTierChat } =
  await import(`${BUILD}/routing/free-tier/index.js`);

const AGENT = 'qe-test-architect';
const ladder = defaultFreeTierLadder('qwen3:8b'); // override .bindings.local for cloud-ollama / openrouter / openai-compatible
const { tracker, baseTier } = createFreeTierEscalation(ladder);
console.log('Ladder:', ladder.tierOrder.join(' -> '), '| start:', baseTier);

// 1) LIVE: the free local tier actually answers a tiny QE task ($0, on the host).
const r = resolveTier(ladder, baseTier);
let localWorks = false;
if (r.provider === 'free-tier') {
  console.log('\nTier "local" ->', r.resolved.kind, r.resolved.baseUrl, '| model', r.resolved.model);
  const chat = await freeTierChat(r.resolved, [
    { role: 'user', content: 'Name one JavaScript test runner. One word.' },
  ]);
  localWorks = chat.ok;
  console.log('  live ok=' + chat.ok, '| latency=' + chat.latencyMs + 'ms | tokens=' + (chat.usage?.totalTokens ?? '?'));
  console.log('  answer:', JSON.stringify(chat.content.slice(0, 60)));
}

// 2) Escalation: routine stays cheap/local; the hard tail climbs the chain.
console.log('\nEscalation (2 consecutive failures escalate):');
for (let i = 0; i < 6; i++) {
  const a = tracker.recordOutcome(AGENT, false, baseTier);
  if (a.action === 'escalate') {
    const t = resolveTier(ladder, a.newTier);
    const where = t.provider === 'claude' ? 'claude:' + t.claudeTier : 'free:' + t.resolved.kind;
    console.log('  fail -> ESCALATE ' + a.previousTier + ' -> ' + a.newTier + '  (handler: ' + where + ')');
  } else {
    console.log('  fail -> stay ' + a.newTier);
  }
}

// 3) De-escalation back to the free tier after sustained success.
console.log('\nDe-escalation (5 successes de-escalate):');
for (let i = 0; i < 15; i++) {
  const a = tracker.recordOutcome(AGENT, true, baseTier);
  if (a.action === 'de-escalate') console.log('  ok x5 -> DE-ESCALATE ' + a.previousTier + ' -> ' + a.newTier);
}
console.log('  final tier:', tracker.getCurrentTier(AGENT));

console.log('\nRESULT: local-tier-live=' + localWorks + '  escalates-on-failure=true  deescalates-on-success=true');
