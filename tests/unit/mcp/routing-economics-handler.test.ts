/**
 * Unit tests for the routing_economics MCP handler (Imp-18)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock unified memory — keep all real exports but stub the singleton
vi.mock('../../../src/kernel/unified-memory.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const mockDb = {
    prepare: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
      all: vi.fn().mockReturnValue([]),
      run: vi.fn(),
    }),
  };
  return {
    ...actual,
    getUnifiedMemory: vi.fn().mockReturnValue({
      isInitialized: vi.fn().mockReturnValue(true),
      initialize: vi.fn().mockResolvedValue(undefined),
      getDatabase: vi.fn().mockReturnValue(mockDb),
    }),
    initializeUnifiedMemory: vi.fn().mockResolvedValue({
      isInitialized: () => true,
      initialize: async () => {},
      getDatabase: () => mockDb,
    }),
  };
});

// Mock cost tracker — keep real exports but stub the global singleton
vi.mock('../../../src/shared/llm/cost-tracker.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getGlobalCostTracker: vi.fn().mockReturnValue({
      getCurrentCost: vi.fn().mockReturnValue(0),
      getSummary: vi.fn().mockReturnValue({
        totalCost: 0, totalTokens: 0, totalRequests: 0,
        period: 'all', periodStart: new Date(0), periodEnd: new Date(),
        byProvider: {}, byModel: {},
      }),
    }),
  };
});

import { handleRoutingEconomics } from '../../../src/mcp/handlers/task-handlers.js';

describe('handleRoutingEconomics MCP handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a successful economic report', async () => {
    const result = await handleRoutingEconomics({ taskComplexity: 0.5 });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.tierEfficiency).toBeInstanceOf(Array);
    expect(result.data!.tierEfficiency.length).toBe(4);
    expect(typeof result.data!.currentHourlyCostUsd).toBe('number');
    expect(typeof result.data!.currentDailyCostUsd).toBe('number');
    expect(typeof result.data!.recommendation).toBe('string');
  });

  it('should include budget remaining as null when no limits set', async () => {
    const result = await handleRoutingEconomics({ taskComplexity: 0.3 });

    expect(result.success).toBe(true);
    expect(result.data!.budgetRemaining).toBeDefined();
    expect(result.data!.budgetRemaining.hourly).toBeNull();
    expect(result.data!.budgetRemaining.daily).toBeNull();
  });

  it('should serialize Infinity qualityPerDollar for booster tier', async () => {
    const result = await handleRoutingEconomics({ taskComplexity: 0.1 });

    expect(result.success).toBe(true);
    const booster = result.data!.tierEfficiency.find(
      (t: Record<string, unknown>) => t.tier === 'booster',
    );
    expect(booster).toBeDefined();
    // Infinity should be serialized as string for JSON safety
    expect(booster!.qualityPerDollar).toBe('Infinity');
  });

  it('should return tiers sorted by economic score descending', async () => {
    const result = await handleRoutingEconomics({ taskComplexity: 0.5 });

    expect(result.success).toBe(true);
    const scores = result.data!.tierEfficiency.map(
      (t: Record<string, unknown>) => t.economicScore as number,
    );
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });

  // #1481: taskComplexity used to be dropped and every call scored at 0.5.
  it('scores the tiers for the requested taskComplexity', async () => {
    const low = await handleRoutingEconomics({ taskComplexity: 0.1 });
    const high = await handleRoutingEconomics({ taskComplexity: 0.9 });
    const quality = (r: typeof low, tier: string) =>
      r.data!.tierEfficiency.find((t) => t.tier === tier)!.qualityScore;

    expect(low.data!.taskComplexity).toBe(0.1);
    expect(high.data!.taskComplexity).toBe(0.9);
    // Cheaper tiers degrade with complexity: haiku -0.2x, booster -0.4x.
    expect(quality(low, 'haiku') - quality(high, 'haiku')).toBeCloseTo(0.16);
    expect(quality(low, 'booster')).toBeGreaterThan(quality(high, 'booster'));
    // The top tier's quality does not depend on complexity.
    expect(quality(low, 'opus')).toBe(quality(high, 'opus'));
  });

  it('defaults taskComplexity to 0.5 when omitted', async () => {
    const result = await handleRoutingEconomics({});

    expect(result.success).toBe(true);
    expect(result.data!.taskComplexity).toBe(0.5);
  });

  it.each([[-0.1], [1.5], [Number.NaN], ['high' as unknown as number]])(
    'rejects taskComplexity %s outside 0-1',
    async (value) => {
      const result = await handleRoutingEconomics({ taskComplexity: value });

      expect(result.success).toBe(false);
      expect(result.error).toContain('taskComplexity must be a number between 0 and 1');
    },
  );
});
