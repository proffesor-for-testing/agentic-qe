/**
 * #1481: `aqe routing economics --complexity <n>` scores the report for n,
 * including in --json mode, keeps an explicit 0, and rejects out-of-range input.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

vi.mock('../../../../src/kernel/unified-memory.js', async (importOriginal) => {
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
  };
});

vi.mock('../../../../src/shared/llm/cost-tracker.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getGlobalCostTracker: vi.fn().mockReturnValue({ getCurrentCost: vi.fn().mockReturnValue(0) }),
  };
});

import { RoutingHandler } from '../../../../src/cli/handlers/routing-handler';

type Report = { taskComplexity: number; tierEfficiency: Array<{ tier: string; qualityScore: number }> };

describe('aqe routing economics --complexity (#1481)', () => {
  let exit: ReturnType<typeof vi.fn>;
  let log: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  const run = async (complexity: string): Promise<Report | null> => {
    const program = new Command();
    program.exitOverride();
    new RoutingHandler(exit as never).register(program, {} as never);
    await program.parseAsync(['routing', 'economics', '--complexity', complexity, '--json'], { from: 'user' });
    const out = log.mock.calls.map((c) => String(c[0])).find((s) => s.trim().startsWith('{'));
    return out ? (JSON.parse(out) as Report) : null;
  };
  const haiku = (r: Report) => r.tierEfficiency.find((t) => t.tier === 'haiku')!.qualityScore;

  beforeEach(() => {
    exit = vi.fn(async () => undefined);
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scores the JSON report for the requested complexity', async () => {
    const low = (await run('0.1'))!;
    log.mockClear();
    const high = (await run('0.9'))!;

    expect(low.taskComplexity).toBe(0.1);
    expect(high.taskComplexity).toBe(0.9);
    expect(haiku(low)).toBeGreaterThan(haiku(high));
  });

  it.each([['0', 0], ['1', 1], ['.5', 0.5], ['1.0', 1]])('accepts --complexity %s', async (value, expected) => {
    const report = (await run(value))!;

    expect(report.taskComplexity).toBe(expected);
  });

  it('keeps an explicit complexity of 0', async () => {
    const report = (await run('0'))!;

    expect(report.taskComplexity).toBe(0);
  });

  it.each([['2'], ['-1'], ['abc'], [''], [' '], ['0x1'], ['1e-1'], [' 0.5']])('rejects --complexity "%s"', async (value) => {
    const report = await run(value);

    expect(report).toBeNull();
    expect(exit).toHaveBeenCalledWith(1);
    expect(String(error.mock.calls[0]?.[0])).toContain('taskComplexity must be a number between 0 and 1');
  });
});
