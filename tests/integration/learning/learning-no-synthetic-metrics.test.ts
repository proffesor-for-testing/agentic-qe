/**
 * #1099: the learning-optimization service reports only what it measured.
 * A/B samples come from recorded metrics, never random padding; the default
 * strategy carries no invented outcome; the replay buffer finds recorded
 * experiences on both backends; improvement is a labelled estimate and
 * confidence is scored on held-out records the optimizer never fitted.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryBackend } from '../../../src/kernel/memory-factory';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';
import { LearningCoordinatorService } from '../../../src/domains/learning-optimization/services/learning-coordinator';
import { MetricsOptimizerService } from '../../../src/domains/learning-optimization/services/metrics-optimizer';
import { LearningOptimizeTool } from '../../../src/mcp/tools/learning-optimization/optimize';
import type {
  ABTestConfig,
  Experience,
  OptimizationObjective,
  Strategy,
} from '../../../src/domains/learning-optimization/interfaces';

const AB_CONFIG: ABTestConfig = {
  duration: 3600000,
  minSamples: 5,
  confidenceLevel: 0.95,
  metric: 'success_rate',
};

const strategy = (name: string, success_rate = 0.85): Strategy => ({
  name,
  parameters: { concurrency: 4 },
  expectedOutcome: { success_rate },
});

describe.each(['sqlite', 'memory'] as const)('#1099 learning metrics are measured, not synthesized (%s)', backendType => {
  let dir: string;
  let memory: MemoryBackend;
  let optimizer: MetricsOptimizerService;
  let learner: LearningCoordinatorService;

  beforeEach(async () => {
    resetUnifiedMemory();
    dir = mkdtempSync(join(tmpdir(), 'aqe-1099-'));
    ({ backend: memory } = await createMemoryBackend({
      type: backendType, sqlite: { path: join(dir, 'memory.db'), walMode: true },
    }, true));
    optimizer = new MetricsOptimizerService(memory);
    learner = new LearningCoordinatorService({ memory }, { enableLLMSynthesis: false });
  });

  afterEach(async () => {
    await memory.dispose();
    resetUnifiedMemory();
    rmSync(dir, { recursive: true, force: true });
  });

  async function track(strategyName: string, values: number[]): Promise<void> {
    for (const success_rate of values) {
      const saved = await optimizer.trackMetrics(strategyName, { success_rate });
      if (!saved.success) throw saved.error;
      // History keys carry a millisecond timestamp; keep them distinct.
      await new Promise(resolve => setTimeout(resolve, 2));
    }
  }

  describe('runABTest', () => {
    it('reports insufficient evidence instead of padding with random samples', async () => {
      const result = await optimizer.runABTest(strategy('ab-none-A'), strategy('ab-none-B'), AB_CONFIG);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value).toMatchObject({
        winner: 'inconclusive',
        evidenceStatus: 'insufficient-evidence',
        sampleSizeA: 0,
        sampleSizeB: 0,
      });
      expect(result.value.pValue).toBeUndefined();
      expect(result.value.strategyAMetrics).toEqual({ samples: 0 });
      expect(result.value.strategyBMetrics).toEqual({ samples: 0 });
      expect(result.value.unmeasured).toEqual(['success_rate', 'stdDev', 'pValue']);
    });

    it('still reports insufficient evidence when only some samples were recorded', async () => {
      await track('ab-few-A', [0.9, 0.9]);
      await track('ab-few-B', [0.5, 0.5, 0.5, 0.5, 0.5]);

      const result = await optimizer.runABTest(strategy('ab-few-A'), strategy('ab-few-B'), AB_CONFIG);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.evidenceStatus).toBe('insufficient-evidence');
      expect(result.value.sampleSizeA).toBe(2);
      expect(result.value.sampleSizeB).toBe(5);
    });

    it('compares only the recorded metrics of each strategy', async () => {
      await track('ab-real-A', [0.9, 0.92, 0.88, 0.91, 0.89]);
      await track('ab-real-B', [0.5, 0.52, 0.48, 0.51, 0.49]);

      const result = await optimizer.runABTest(strategy('ab-real-A'), strategy('ab-real-B'), AB_CONFIG);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.evidenceStatus).toBeUndefined();
      expect(result.value.sampleSizeA).toBe(5);
      expect(result.value.sampleSizeB).toBe(5);
      expect(result.value.strategyAMetrics.success_rate).toBeCloseTo(0.9, 10);
      expect(result.value.strategyBMetrics.success_rate).toBeCloseTo(0.5, 10);
      expect(result.value.winner).toBe('A');
      expect(result.value.pValue).toBeLessThan(0.05);
    });
  });

  it('getMetricsHistory returns the recorded snapshots', async () => {
    await track('history-strategy', [0.7, 0.8, 0.9]);

    const history = await optimizer.getMetricsHistory('history-strategy');

    expect(history.success).toBe(true);
    if (!history.success) return;
    expect(history.value.map(s => s.metrics.success_rate)).toEqual([0.7, 0.8, 0.9]);
  });

  it('recommendStrategy fallback carries no invented expected outcome', async () => {
    const result = await optimizer.recommendStrategy({ tags: ['test-generation', 'coverage'] });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.name).toBe('default-strategy');
    expect(result.value.expectedOutcome).toEqual({});
  });

  it('getReplayBuffer returns the experiences recorded for the agent', async () => {
    const agentId = { value: 'replay-agent', domain: 'test-generation' as const, type: 'specialist' };
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const saved = await learner.recordExperience({
        agentId, domain: 'test-generation', action: 'replay-fixture',
        state: { context: {}, metrics: {} },
        result: { success: true, outcome: { coverage: 50 + i }, duration: 10 },
        reward: 0.5,
      });
      if (!saved.success) throw saved.error;
      ids.push(saved.value);
    }

    const buffer = await learner.getReplayBuffer(agentId);

    expect(buffer.success).toBe(true);
    if (!buffer.success) return;
    expect(buffer.value.map(e => e.id).sort()).toEqual([...ids].sort());
  });

  describe('optimizeStrategy', () => {
    const objective: OptimizationObjective = { metric: 'coverage', direction: 'maximize', constraints: [] };
    const base = Date.now() - 60_000;

    function experience(i: number, coverage: number, concurrency: number): Experience {
      return {
        id: `opt-exp-${i}`,
        agentId: { value: 'opt-agent', domain: 'test-generation', type: 'specialist' },
        domain: 'test-generation',
        action: 'opt-fixture',
        state: { context: { concurrency }, metrics: {} },
        result: { success: true, outcome: { coverage }, duration: 10 },
        reward: 0.5,
        timestamp: new Date(base + i * 1000),
      };
    }

    it('scores confidence on held-out records the optimizer never fitted', async () => {
      // 16 older records at 80% coverage, then 4 recent ones at 40%.
      const experiences = Array.from({ length: 20 }, (_, i) => experience(i, i < 16 ? 80 : 40, 4));

      const result = await optimizer.optimizeStrategy(strategy('held-out'), objective, experiences);

      expect(result.success).toBe(true);
      if (!result.success) return;
      // Expected outcome is fitted on the 16 training records only.
      expect(result.value.optimizedStrategy.expectedOutcome.coverage).toBe(80);
      expect(result.value.evaluation).toMatchObject({
        method: 'held-out', trainingSamples: 16, heldOutSamples: 4,
      });
      expect(result.value.validationResults.map(v => v.testId))
        .toEqual(['opt-exp-16', 'opt-exp-17', 'opt-exp-18', 'opt-exp-19']);
      // None of the held-out records is within 20% of the fitted 80%.
      expect(result.value.validationResults.every(v => !v.passed)).toBe(true);
      expect(result.value.confidence).toBe(0);
    });

    it('labels improvement as an estimate instead of reporting 0 by construction', async () => {
      // Every record ran at concurrency 4.4; the current strategy uses 4.
      const experiences = Array.from({ length: 20 }, (_, i) => experience(i, 80, 4.4));

      const result = await optimizer.optimizeStrategy(
        { name: 'estimate', parameters: { concurrency: 4 }, expectedOutcome: {} },
        objective,
        experiences,
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.optimizedStrategy.parameters.concurrency).toBeCloseTo(4.4, 10);
      expect(result.value.improvement).toBeGreaterThan(0);
      expect(result.value.evaluation?.estimated).toEqual(['improvement']);
      expect(result.value.confidence).toBe(1);
    });
  });

  it('MCP optimize lists the missing default outcome in unmeasured', async () => {
    const result = await new LearningOptimizeTool().invoke({
      action: 'optimize', domain: 'test-generation',
      objective: { metric: 'coverage', direction: 'maximize' },
    }, { memory });

    expect(result.success).toBe(true);
    const optimize = result.data?.optimizeResult;
    expect(optimize?.evidenceStatus).toBe('insufficient-evidence');
    expect(optimize?.bestStrategy.expectedOutcome).toEqual({});
    expect(optimize?.unmeasured).toEqual(['improvement', 'confidence', 'expectedOutcome']);
  });
});
