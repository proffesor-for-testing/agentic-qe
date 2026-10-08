import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ABBenchmarkingFramework, createBenchmarkConfig } from '../../../src/governance/ab-benchmarking.js';
import { governanceFlags } from '../../../src/governance/feature-flags.js';
import { evolutionPipelineIntegration } from '../../../src/governance/evolution-pipeline-integration.js';
import { getUnifiedMemory } from '../../../src/kernel/unified-memory.js';

const originalMemoryBackend = process.env.AQE_MEMORY_BACKEND;
beforeAll(async () => {
  process.env.AQE_MEMORY_BACKEND = 'memory';
  const memory = getUnifiedMemory();
  expect(memory.getDbPath()).toBe(':memory:');
  await memory.initialize();
  expect(memory.isInitialized()).toBe(true);
  expect(memory.getDatabase().name).toBe(':memory:');
});
const originalFlags = structuredClone(governanceFlags.getFlags());
const inputs = Array.from({ length: 30 }, (_, index) => [index + 1, index + 2, index + 3]);
const sum = (input: number[]) => input.reduce((total, value) => total + value, 0);
const solver = (correctSamples: number) => (input: number[]) =>
  input[0] <= correctSamples ? sum(input) : input[0];

async function runBenchmark(id: string, successes: number[], auto = false, confidenceLevel = 0.95, configuredSuccessWeight?: number) {
  governanceFlags.updateFlags({ abBenchmarking: { ...originalFlags.abBenchmarking, autoApplyWinners: auto } });
  const framework = new ABBenchmarkingFramework();
  await framework.initialize();
  const variants = successes.map((_, index) => ({ id: `${id}-${index}`, name: `Solver ${index}`, rules: {} }));
  framework.createBenchmark(createBenchmarkConfig(id, variants, {
    minSampleSize: inputs.length, confidenceLevel,
    metrics: [
      { name: 'quality', type: 'quality_score', weight: 1 - (configuredSuccessWeight ?? 0), higherIsBetter: true },
      ...(configuredSuccessWeight === undefined ? [] : [{ name: 'success', type: 'success_rate' as const, weight: configuredSuccessWeight, higherIsBetter: true }]),
    ],
  }));
  framework.startBenchmark(id);
  const solvers = successes.map(solver);
  for (const input of inputs) {
    for (const [index, implementation] of solvers.entries()) {
      const passed = implementation(input) === sum(input);
      framework.recordOutcome(id, variants[index].id, passed, { quality: Number(passed), success: Number(passed) });
    }
  }
  return framework;
}

async function runOperationBenchmark(id: string, qualityWeighted: boolean, auto = false) {
  governanceFlags.updateFlags({ abBenchmarking: { ...originalFlags.abBenchmarking, autoApplyWinners: auto } });
  const framework = new ABBenchmarkingFramework();
  await framework.initialize();
  framework.createBenchmark(createBenchmarkConfig(id, [
    { id: `${id}-0`, name: 'Solver 0', rules: {} },
    { id: `${id}-1`, name: 'Solver 1', rules: {} },
  ], {
    minSampleSize: inputs.length,
    metrics: qualityWeighted ? [
      { name: 'quality', type: 'quality_score', weight: 0.9, higherIsBetter: true },
      { name: 'work', type: 'cost', weight: 0.1, higherIsBetter: false },
    ] : [{ name: 'work', type: 'cost', weight: 1, higherIsBetter: false }],
  }));
  framework.startBenchmark(id);
  for (const input of inputs) {
    for (const variant of [0, 1]) {
      // Execute and count real owned work; these are operation costs, not wall-clock timings.
      const repeats = (qualityWeighted ? (variant === 0 ? 20 : 2) : (variant === 0 ? 2 : 20)) + input[0] % 2;
      let operations = 0;
      let output = 0;
      while (operations < repeats) { output = sum(input); operations++; }
      const solvedSubtasks = Array.from({ length: 10 }, (_, index) =>
        (index < (variant === 0 ? 10 : 0) ? sum(input) : input[0]) === sum(input));
      framework.recordOutcome(id, `${id}-${variant}`, output === sum(input), {
        work: operations, quality: solvedSubtasks.filter(Boolean).length / solvedSubtasks.length,
      });
    }
  }
  return framework;
}

function expectRefusal(framework: ABBenchmarkingFramework, id: string) {
  const winner = framework.getWinner(id)!;
  const before = evolutionPipelineIntegration.getRuleEffectiveness(winner.winnerId).promotionStatus;
  expect(() => framework.applyWinner(id)).toThrow(/significantly better than the runner-up/);
  expect(evolutionPipelineIntegration.getRuleEffectiveness(winner.winnerId).promotionStatus).toBe(before);
  expect(framework.getBenchmarkResults(id).benchmark.status).toBe('running');
  expect(framework.suggestWinner(id).readyToApply).toBe(false);
}

afterEach(() => governanceFlags.updateFlags(originalFlags));
afterAll(() => {
  try { getUnifiedMemory().close(); }
  finally {
    if (originalMemoryBackend === undefined) delete process.env.AQE_MEMORY_BACKEND;
    else process.env.AQE_MEMORY_BACKEND = originalMemoryBackend;
  }
});

describe('native governance winner admission', () => {
  it('refuses equal successful solvers without changing promotion or benchmark state', async () => {
    const f = await runBenchmark('native-equal', [30, 30]);
    expect(f.calculateStatisticalSignificance('native-equal').isSignificant).toBe(false);
    expectRefusal(f, 'native-equal');
  });
  it('refuses a small success advantage with insufficient statistical evidence', async () => {
    const f = await runBenchmark('native-near', [29, 30]);
    expect(f.getWinner('native-near')!.winnerId).toBe('native-near-1');
    expectRefusal(f, 'native-near');
  });
  it('does not borrow significance from a much worse third solver', async () => {
    const f = await runBenchmark('native-runner', [0, 29, 30]);
    expect(f.calculateStatisticalSignificance('native-runner').isSignificant).toBe(true);
    expect(f.getWinner('native-runner')!.winnerId).toBe('native-runner-2');
    expectRefusal(f, 'native-runner');
  });
  it('does not promote tied leaders because a third solver differs', async () => {
    const f = await runBenchmark('native-tied-leaders', [0, 30, 30]);
    expect(f.calculateStatisticalSignificance('native-tied-leaders').isSignificant).toBe(true);
    expectRefusal(f, 'native-tied-leaders');
  });
  it('uses the configured significance level for admission', async () => {
    const f = await runBenchmark('native-strict-alpha', [7, 23], false, 0.999999);
    expectRefusal(f, 'native-strict-alpha');
  });
  it('preserves direct promotion for a genuinely discriminating solver', async () => {
    const f = await runBenchmark('native-direct-positive', [0, 30]);
    const winner = f.getWinner('native-direct-positive')!;
    expect(winner.winnerId).toBe('native-direct-positive-1');
    f.applyWinner('native-direct-positive');
    expect(evolutionPipelineIntegration.getRuleEffectiveness(winner.winnerId).promotionStatus).toBe('promoted');
    expect(f.getBenchmarkResults('native-direct-positive').benchmark.status).toBe('completed');
  });
  it('keeps automatic tied benchmarks running', async () => {
    const f = await runBenchmark('native-auto-tie', [30, 30], true);
    expect(f.getBenchmarkResults('native-auto-tie').benchmark.status).toBe('running');
    expect(f.suggestWinner('native-auto-tie').readyToApply).toBe(false);
    expect(evolutionPipelineIntegration.getRuleEffectiveness('native-auto-tie-0').promotionStatus).toBe('candidate');
  });
  it('preserves automatic promotion with significant improvement', async () => {
    const f = await runBenchmark('native-auto-positive', [0, 30], true);
    expect(f.getBenchmarkResults('native-auto-positive').benchmark.status).toBe('completed');
    expect(evolutionPipelineIntegration.getRuleEffectiveness('native-auto-positive-1').promotionStatus).toBe('promoted');
  });
  it('preserves promotion for significantly lower actual operation costs', async () => {
    const f = await runOperationBenchmark('native-cost-positive', false);
    expect(f.getWinner('native-cost-positive')!.winnerId).toBe('native-cost-positive-0');
    f.applyWinner('native-cost-positive');
    expect(evolutionPipelineIntegration.getRuleEffectiveness('native-cost-positive-0').promotionStatus).toBe('promoted');
  });
  it('does not count a significant cost regression as an improvement for the score leader', async () => {
    const f = await runOperationBenchmark('native-cost-regression', true);
    expect(f.getWinner('native-cost-regression')!.winnerId).toBe('native-cost-regression-0');
    expect(f.calculateStatisticalSignificance('native-cost-regression').isSignificant).toBe(true);
    expectRefusal(f, 'native-cost-regression');
  });
  it('does not automatically promote a leader with only a significant cost regression', async () => {
    const f = await runOperationBenchmark('native-auto-regression', true, true);
    expect(f.getWinner('native-auto-regression')!.winnerId).toBe('native-auto-regression-0');
    expect(f.getBenchmarkResults('native-auto-regression').benchmark.status).toBe('running');
    expect(f.suggestWinner('native-auto-regression').readyToApply).toBe(false);
    expect(evolutionPipelineIntegration.getRuleEffectiveness('native-auto-regression-0').promotionStatus).toBe('candidate');
  });
  it('does not borrow significant success evidence from an explicitly zero-weight metric', async () => {
    const f = await runBenchmark('native-zero-success', [0, 30], false, 0.95, 0);
    expect(f.calculateStatisticalSignificance('native-zero-success').chiSquareTest!.isSignificant).toBe(true);
    expect(f.getWinner('native-zero-success')!.winnerId).toBe('native-zero-success-1');
    expectRefusal(f, 'native-zero-success');
  });
  it('preserves promotion when configured success rate contributes to the score', async () => {
    const f = await runBenchmark('native-weighted-success', [0, 30], false, 0.95, 0.5);
    f.applyWinner('native-weighted-success');
    expect(evolutionPipelineIntegration.getRuleEffectiveness('native-weighted-success-1').promotionStatus).toBe('promoted');
  });
  it('promotes a higher-quality third solver using its runner-up evidence, not the first pair', async () => {
    const id = 'native-third-quality';
    const f = new ABBenchmarkingFramework();
    await f.initialize();
    f.createBenchmark(createBenchmarkConfig(id, [0, 1, 2].map(index => ({
      id: `${id}-${index}`, name: `Solver ${index}`, rules: {},
    })), { minSampleSize: inputs.length, metrics: [
      { name: 'quality', type: 'quality_score', weight: 1, higherIsBetter: true },
    ] }));
    f.startBenchmark(id);
    for (const input of inputs) {
      for (const variant of [0, 1, 2]) {
        const solved = Array.from({ length: 10 }, (_, index) =>
          (index < (variant === 2 ? 8 : 2) + input[0] % 2 ? sum(input) : input[0]) === sum(input));
        f.recordOutcome(id, `${id}-${variant}`, sum(input) === input[0] + input[1] + input[2], {
          quality: solved.filter(Boolean).length / solved.length,
        });
      }
    }
    expect(f.calculateStatisticalSignificance(id).isSignificant).toBe(false);
    expect(f.getWinner(id)!.winnerId).toBe(`${id}-2`);
    f.applyWinner(id);
    expect(evolutionPipelineIntegration.getRuleEffectiveness(`${id}-2`).promotionStatus).toBe('promoted');
  });
  it('serializes the winner ranking as a heuristic score rather than statistical confidence', async () => {
    const f = await runBenchmark('native-score-label', [0, 30]);
    const winner = JSON.parse(JSON.stringify(f.getWinner('native-score-label')));
    expect(winner).not.toHaveProperty('confidence');
    expect(winner.heuristicScore).toBeGreaterThan(0);
    expect(winner.heuristicScore).toBeLessThanOrEqual(1);
  });
});
