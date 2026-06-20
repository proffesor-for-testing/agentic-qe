/**
 * Test-generation coordinator — opt-in free-tier local generation (D7-wire).
 * Mocks the free-tier network call + fs read; no real model or disk.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FreeTierChatResult } from '../../../../src/routing/free-tier/provider.js';

// Mock the free-tier network call (executor → freeTierChat) and fs read.
const chatMock = vi.fn<(...a: unknown[]) => Promise<FreeTierChatResult>>();
vi.mock('../../../../src/routing/free-tier/provider.js', async (orig) => {
  const actual = await orig<typeof import('../../../../src/routing/free-tier/provider.js')>();
  return { ...actual, freeTierChat: (...a: unknown[]) => chatMock(...a) };
});
const readFileMock = vi.fn<(...a: unknown[]) => Promise<string>>();
vi.mock('node:fs/promises', async (orig) => {
  const actual = await orig<typeof import('node:fs/promises')>();
  return { ...actual, readFile: (...a: unknown[]) => readFileMock(...a) };
});

import { TestGenerationCoordinator, type CoordinatorConfig } from '../../../../src/domains/test-generation/coordinator';
import { createCoordinatorTestContext, resetTestContext, type CoordinatorTestContext } from '../coordinator-test-utils';
import type { GenerateTestsRequest } from '../../../../src/domains/test-generation/interfaces';

const baseConfig: Partial<CoordinatorConfig> = {
  enablePatternLearning: false, publishEvents: false, enableQESONA: false,
  enableFlashAttention: false, enableDecisionTransformer: false, enableCoherenceGate: false,
  enableMinCutAwareness: false, enableConsensus: false,
};
const request: GenerateTestsRequest = { sourceFiles: ['/proj/src/add.ts'], testType: 'unit', framework: 'vitest' };
const goodTest = '```js\nimport { test, expect } from "vitest";\ntest("adds", () => { expect(add(2,3)).toBe(5); });\n```';

describe('TestGenerationCoordinator — free-tier opt-in', () => {
  let ctx: CoordinatorTestContext;

  beforeEach(() => {
    chatMock.mockReset();
    readFileMock.mockReset().mockResolvedValue('export function add(a:number,b:number){return a+b;}');
    ctx = createCoordinatorTestContext();
  });
  afterEach(() => resetTestContext(ctx));

  it('should NOT touch the free tier when disabled (default)', async () => {
    const coordinator = new TestGenerationCoordinator(ctx.eventBus, ctx.memory, ctx.agentCoordinator, baseConfig);
    await coordinator.generateTests(request).catch(() => undefined);
    expect(chatMock).not.toHaveBeenCalled();
    await coordinator.dispose();
  });

  it('should generate tests via the free local tier when opted in and output is valid', async () => {
    chatMock.mockResolvedValue({ ok: true, content: goodTest, latencyMs: 10 });
    const coordinator = new TestGenerationCoordinator(
      ctx.eventBus, ctx.memory, ctx.agentCoordinator,
      { ...baseConfig, enableFreeTier: true, freeTierModel: 'qwen3:8b' },
    );

    const result = await coordinator.generateTests(request);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.patternsUsed).toContain('free-tier-local');
      expect(result.value.tests[0].llmEnhanced).toBe(true);
      expect(result.value.tests[0].assertions).toBeGreaterThan(0);
      expect(result.value.tests[0].testFile).toBe('/proj/src/add.test.ts');
    }
    await coordinator.dispose();
  });

  it('should retry the same local tier on invalid output (D8 repair) then succeed', async () => {
    chatMock
      .mockResolvedValueOnce({ ok: true, content: 'just prose, no test', latencyMs: 5 })
      .mockResolvedValueOnce({ ok: true, content: goodTest, latencyMs: 8 });
    const coordinator = new TestGenerationCoordinator(
      ctx.eventBus, ctx.memory, ctx.agentCoordinator,
      { ...baseConfig, enableFreeTier: true, freeTierRepairAttempts: 1 },
    );

    const result = await coordinator.generateTests(request);

    expect(chatMock).toHaveBeenCalledTimes(2); // initial + 1 repair
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.patternsUsed).toContain('free-tier-local');
    await coordinator.dispose();
  });

  it('should fall back (no free-tier result) when the local model never produces a valid test', async () => {
    chatMock.mockResolvedValue({ ok: true, content: 'no assertions here', latencyMs: 5 });
    const coordinator = new TestGenerationCoordinator(
      ctx.eventBus, ctx.memory, ctx.agentCoordinator,
      { ...baseConfig, enableFreeTier: true, freeTierRepairAttempts: 1 },
    );

    const result = await coordinator.generateTests(request).catch(() => ({ success: false as const, error: new Error('x') }));

    // Whatever the normal path returns, it must NOT be the free-tier result.
    if (result.success) expect(result.value.patternsUsed).not.toContain('free-tier-local');
    expect(chatMock).toHaveBeenCalled(); // it did attempt the free tier first
    await coordinator.dispose();
  });
});
