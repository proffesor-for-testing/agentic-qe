// D6 proof: QE-native scoring through Darwin's loop via the new customScore hook.
// Uses the deterministic mutator (perturbs surface params) so surfaces actually
// move; QE fitness is a function of those params (mirrors AQE's qe-fitness adapter
// + ADR-104 weights). Expectation: DIFFERENTIATED finalScores + a real winner delta
// (vs the flat 0.765 the mock substrate gave with the LLM mutator).
import { evolve, extractSurfaceParams } from '/workspaces/agent-harness-generator/packages/darwin-mode/dist/index.js';
import { rmSync, mkdirSync, cpSync } from 'node:fs';

const SRC = '/tmp/darwin-spike';
const repoRoot = '/tmp/darwin-bench/d6-run';
rmSync(repoRoot, { recursive: true, force: true });
mkdirSync(`${repoRoot}/test`, { recursive: true });
cpSync(`${SRC}/package.json`, `${repoRoot}/package.json`);
cpSync(`${SRC}/test/smoke.test.js`, `${repoRoot}/test/smoke.test.js`);

const clamp = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);
const r4 = (n) => Math.round(n * 1e4) / 1e4;

// Deterministic QE evaluator: surface params -> synthetic-but-monotonic QE outcome.
// (Stands in for the real model+arena evaluator; proves the substrate + scoring.)
function qeFromParams(p) {
  const killRate = r4(clamp(0.4 + 0.006 * (p.contextWindow - 30) + 0.04 * (p.maxAttempts - 3), 0, 0.95));
  const coveragePct = r4(clamp(50 + 0.5 * (p.contextWindow - 30), 0, 95));
  const suiteCostRatio = r4(clamp(0.2 + 0.03 * (p.maxAttempts - 3), 0.05, 1));
  const fitness = r4(0.6 * killRate + 0.3 * (coveragePct / 100) - 0.1 * suiteCostRatio);
  return { killRate, coveragePct, suiteCostRatio, fitness };
}

// QE-native ScoreCard + ADR-072 gate (mirrors src/integrations/darwin/qe-fitness.ts).
function gate(card, parent, delta) {
  const pf = parent?.finalScore ?? 0, pt = parent?.testPassRate ?? 0;
  const promoted = card.finalScore > pf + delta && card.safetyScore >= 0.95 && card.testPassRate >= pt && card.safetyScore === 1;
  return { ...card, promoted };
}
async function customScore(variant, _profile, parentScore, promotionDelta) {
  const p = await extractSurfaceParams(variant.dir);
  const qe = qeFromParams(p);
  const card = {
    variantId: variant.id,
    taskSuccess: qe.killRate, testPassRate: 1, traceQuality: qe.coveragePct / 100,
    costEfficiency: 1 - qe.suiteCostRatio, latencyEfficiency: 1, safetyScore: 1,
    secretExposure: 0, destructiveAction: 0, hallucinatedFile: 0, toolLoop: 0, costOverrun: 0,
    baseScore: qe.fitness, finalScore: qe.fitness, promoted: false,
    reason: `QE kill=${qe.killRate} cov=${qe.coveragePct} cost=${qe.suiteCostRatio} cw=${p.contextWindow} ma=${p.maxAttempts}`,
  };
  const scored = gate(card, parentScore, promotionDelta);
  const trace = { variantId: variant.id, taskId: 'qe', startedAt: '1970-01-01T00:00:00.000Z',
    finishedAt: '1970-01-01T00:00:00.000Z', exitCode: 0, stdout: scored.reason, stderr: '',
    durationMs: Math.round(qe.suiteCostRatio * 1000), timedOut: false, blockedActions: [] };
  return { traces: [trace], score: scored };
}

const result = await evolve({
  repoRoot, workRoot: `${repoRoot}/.metaharness`,
  generations: 3, childrenPerGeneration: 3, concurrency: 4, seed: 0, promotionDelta: 0.02,
  tasks: ['qe'], customScore,
});

const scored = result.records.filter((r) => r.score).sort((a, b) => b.score.finalScore - a.score.finalScore);
console.log('\nD6 — QE-native leaderboard (finalScore = ADR-104 fitness):');
for (const r of scored) {
  console.log(`  ${r.score.finalScore.toFixed(4)}  ${r.variant.id.padEnd(10)} [${r.variant.mutationSurface}]  ${r.score.reason}`);
}
const base = result.baseline.score?.finalScore ?? 0;
const win = result.winner?.score?.finalScore ?? 0;
console.log(`\nbaseline=${base.toFixed(4)}  winner=${result.winner?.variant.id} ${win.toFixed(4)}  delta=${(win - base >= 0 ? '+' : '')}${(win - base).toFixed(4)}`);
console.log(`distinct finalScores: ${new Set(scored.map((r) => r.score.finalScore)).size} of ${scored.length} variants`);
console.log(`promoted: ${result.records.filter((r) => r.score?.promoted).length}`);
