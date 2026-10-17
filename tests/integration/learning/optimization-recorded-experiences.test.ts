import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryBackend } from '../../../src/kernel/memory-factory';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';
import { LearningCoordinatorService } from '../../../src/domains/learning-optimization/services/learning-coordinator';
import { MetricsOptimizerService } from '../../../src/domains/learning-optimization/services/metrics-optimizer';
import { LearningOptimizeTool } from '../../../src/mcp/tools/learning-optimization/optimize';
import { isLearnableResult } from '../../../src/learning/learnable-result';
import type { Experience } from '../../../src/domains/learning-optimization/interfaces';

const NS = { namespace: 'learning-optimization' };

describe.each(['sqlite', 'memory'] as const)('recorded optimization input (%s)', backendType => {
  let dir: string;
  let memory: MemoryBackend;
  let learner: LearningCoordinatorService;

  beforeEach(async () => {
    resetUnifiedMemory();
    dir = mkdtempSync(join(tmpdir(), 'aqe-recorded-optimization-'));
    ({ backend: memory } = await createMemoryBackend({
      type: backendType, sqlite: { path: join(dir, 'memory.db'), walMode: true },
    }, true));
    learner = new LearningCoordinatorService({ memory }, { enableLLMSynthesis: false });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await memory.dispose();
    resetUnifiedMemory();
    rmSync(dir, { recursive: true, force: true });
  });

  async function record(count: number, overrides: Partial<Experience> = {}): Promise<Experience[]> {
    const records: Experience[] = [];
    for (let i = 0; i < count; i++) {
      const input = {
        agentId: { value: 'synthetic-observed-agent', domain: 'test-generation' as const, type: 'specialist' },
        domain: 'test-generation' as const, action: 'synthetic-recording-fixture',
        state: { context: {}, metrics: {} },
        result: { success: false, outcome: { coverage: i + 1 }, duration: i + 9 },
        reward: -0.5, ...overrides,
      };
      const saved = await learner.recordExperience(input);
      if (!saved.success) throw saved.error;
      const stored = await memory.get<Experience>(`learning:experience:${saved.value}`, NS);
      if (!stored) throw new Error('Fixture writer failed');
      records.push(stored);
    }
    return records;
  }

  const invoke = () => new LearningOptimizeTool().invoke({
    action: 'optimize', domain: 'test-generation',
    objective: { metric: 'coverage', direction: 'maximize' },
  }, { memory });

  it('passes exact recorded observations to the real optimizer without inventing samples', async () => {
    const stored = await record(25);
    const optimize = vi.spyOn(MetricsOptimizerService.prototype, 'optimizeStrategy');
    const mined = vi.spyOn(LearningCoordinatorService.prototype, 'mineExperiences');
    const result = await invoke();
    expect(result.success).toBe(true);
    expect(optimize).toHaveBeenCalledTimes(1);
    const actual = optimize.mock.calls[0][2];
    const normalize = (records: Experience[]) => records.map(e => ({
      ...e, timestamp: new Date(e.timestamp).toISOString(),
    })).sort((a, b) => a.id.localeCompare(b.id));
    expect(normalize(actual)).toEqual(normalize(stored));
    expect(mined).not.toHaveBeenCalled();
    expect(result.data?.optimizeResult).toMatchObject({
      experiencesUsed: 25, inputSource: 'recorded-experiences', strategiesEvaluated: 1,
    });
  });

  it('does not replace missing objective values with random outcomes or reach the sample threshold', async () => {
    await record(19);
    await record(6, { result: { success: false, outcome: {}, duration: 1 } });
    const optimize = vi.spyOn(MetricsOptimizerService.prototype, 'optimizeStrategy');
    const result = await invoke();
    expect(result.success).toBe(true);
    expect(optimize).not.toHaveBeenCalled();
    expect(result.data?.optimizeResult).toMatchObject({
      experiencesUsed: 19, strategiesEvaluated: 0, confidence: 0,
      evidenceStatus: 'insufficient-evidence', unmeasured: ['improvement', 'confidence', 'expectedOutcome'],
    });
    expect(result.data?.evidenceStatus).toBe('insufficient-evidence');
    expect(isLearnableResult('learning-optimization', result.data)).toBe(false);
    expect(await memory.search('learning:strategy:optimized:*', 100, NS)).toEqual([]);
  });

  it('excludes other domains, expired records, and non-finite objective values', async () => {
    const valid = await record(20);
    await record(2, { domain: 'test-execution' });
    const old = await record(1);
    await memory.set(`learning:experience:${old[0].id}`, {
      ...old[0], timestamp: new Date(Date.now() - 40 * 86400_000),
    }, NS);
    await record(2, { result: { success: false, outcome: { coverage: Infinity }, duration: 1 } });
    const optimize = vi.spyOn(MetricsOptimizerService.prototype, 'optimizeStrategy');
    const result = await invoke();
    expect(result.success).toBe(true);
    expect(optimize).toHaveBeenCalledTimes(1);
    expect(optimize.mock.calls[0][2].map(e => e.id).sort()).toEqual(valid.map(e => e.id).sort());
  });

  it('reports unavailable recorded input as an error without producing an optimization', async () => {
    const optimize = vi.spyOn(MetricsOptimizerService.prototype, 'optimizeStrategy');
    vi.spyOn(memory, 'search').mockRejectedValue(new Error('synthetic input store unavailable'));
    const result = await invoke();
    expect(result.success).toBe(false);
    expect(result.error).toContain('synthetic input store unavailable');
    expect(optimize).not.toHaveBeenCalled();
  });

  it('marks an empty history insufficient without evaluating a strategy', async () => {
    const optimize = vi.spyOn(MetricsOptimizerService.prototype, 'optimizeStrategy');
    const result = await invoke();
    expect(result.success).toBe(true);
    expect(optimize).not.toHaveBeenCalled();
    expect(result.data?.optimizeResult).toMatchObject({
      experiencesUsed: 0, strategiesEvaluated: 0, confidence: 0,
      evidenceStatus: 'insufficient-evidence',
    });
    expect(isLearnableResult('learning-optimization', result.data)).toBe(false);
  });

  it('propagates a failed optimization write rather than returning a successful default', async () => {
    await record(20);
    vi.spyOn(memory, 'set').mockRejectedValue(new Error('synthetic optimization store unavailable'));
    const result = await invoke();
    expect(result.success).toBe(false);
    expect(result.error).toContain('synthetic optimization store unavailable');
  });
});
