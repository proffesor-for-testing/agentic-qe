import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryBackend } from '../../../src/kernel/memory-factory';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';
import { MetricsOptimizerService } from '../../../src/domains/learning-optimization/services/metrics-optimizer';
import { LearningOptimizeTool } from '../../../src/mcp/tools/learning-optimization/optimize';
import type { Experience, OptimizedStrategy } from '../../../src/domains/learning-optimization/interfaces';

const NS = { namespace: 'learning-optimization' };
const context = { tags: ['test-generation', 'coverage'] };

describe.each(['sqlite', 'memory'] as const)('stored strategy recommendations (%s)', backendType => {
  let dir: string;
  let memory: MemoryBackend;
  let optimizer: MetricsOptimizerService;

  beforeEach(async () => {
    resetUnifiedMemory();
    dir = mkdtempSync(join(tmpdir(), 'aqe-recommendation-'));
    ({ backend: memory } = await createMemoryBackend({
      type: backendType, sqlite: { path: join(dir, 'memory.db'), walMode: true },
    }, true));
    optimizer = new MetricsOptimizerService(memory, { explorationRate: 0 });
  });

  afterEach(async () => {
    await memory.dispose();
    resetUnifiedMemory();
    rmSync(dir, { recursive: true, force: true });
  });

  async function optimize(): Promise<OptimizedStrategy> {
    const experiences: Experience[] = Array.from({ length: 40 }, (_, i) => ({
      id: `synthetic-${i}`,
      agentId: { value: 'synthetic-optimizer', domain: 'test-generation', type: 'specialist' },
      domain: 'test-generation', action: 'fixture', state: { context: {}, metrics: {} },
      result: { success: true, outcome: { coverage: 90 }, duration: 1 },
      reward: 1, timestamp: new Date(),
    }));
    const result = await optimizer.optimizeStrategy({
      name: 'synthetic-recorded-strategy', parameters: { timeout: 7000 },
      expectedOutcome: { coverage: 90 },
    }, { metric: 'coverage', direction: 'maximize', constraints: [] }, experiences);
    if (!result.success) throw result.error;
    expect(result.value.confidence).toBeGreaterThan(0.6);
    return result.value;
  }

  it('recommends the strategy actually persisted by an earlier optimizer instance', async () => {
    const record = await optimize();
    const result = await new MetricsOptimizerService(memory).recommendStrategy(context);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual(record.optimizedStrategy);
  });

  it('ignores a same-key default-namespace decoy', async () => {
    const record = await optimize();
    await memory.set(`learning:strategy:optimized:${record.id}`, {
      ...record, optimizedStrategy: { ...record.optimizedStrategy, name: 'wrong-namespace' },
    });
    const result = await optimizer.recommendStrategy(context);
    expect(result.success && result.value.name).toBe(record.optimizedStrategy.name);
  });

  it('retains the confidence threshold and default when no eligible strategy exists', async () => {
    const record = await optimize();
    await memory.set(`learning:strategy:optimized:${record.id}`, { ...record, confidence: 0.5 }, NS);
    const result = await optimizer.recommendStrategy(context);
    expect(result.success && result.value.name).toBe('default-strategy');
  });

  it('uses the stored recommendation through the public MCP optimize fallback', async () => {
    const record = await optimize();
    const result = await new LearningOptimizeTool().invoke({
      action: 'optimize', domain: 'test-generation',
      objective: { metric: 'coverage', direction: 'maximize' },
    }, { memory });
    expect(result.success).toBe(true);
    expect(result.data?.optimizeResult?.bestStrategy).toEqual(record.optimizedStrategy);
  });
});
