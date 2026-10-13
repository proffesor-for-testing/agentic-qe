/**
 * Issue #1014 — the coverage coordinator publishes CoverageGapDetected only
 * for MEASURED coverage (with provenance), and readers of stored coverage
 * (trend history, the quality-gate protocol) skip records without the
 * `measured: true` stamp.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CoverageAnalysisCoordinator } from '../../../../src/domains/coverage-analysis/coordinator';
import { createCoordinatorTestContext, type CoordinatorTestContext } from '../coordinator-test-utils';
import type { CoverageData } from '../../../../src/domains/coverage-analysis/interfaces';
import { createQualityGateProtocol } from '../../../../src/coordination/protocols/quality-gate';

function lowCoverage(): CoverageData {
  return {
    files: [{
      path: 'src/auth/payment-core.ts',
      lines: { covered: 5, total: 200 }, branches: { covered: 0, total: 40 },
      functions: { covered: 0, total: 20 }, statements: { covered: 5, total: 200 },
      uncoveredLines: Array.from({ length: 195 }, (_, i) => i + 6), uncoveredBranches: [10, 12, 14],
    }],
    summary: { line: 2.5, branch: 0, function: 0, statement: 2.5, files: 1 },
  };
}

const gapEvents = (ctx: CoordinatorTestContext) =>
  (ctx.eventBus.publish as ReturnType<typeof vi.fn>).mock.calls
    .map(([event]) => event as { type: string; payload: Record<string, unknown> })
    .filter(e => e.type === 'coverage-analysis.CoverageGapDetected');

describe('#1014 — CoverageGapDetected is published only for measured coverage', () => {
  let ctx: CoordinatorTestContext;
  let coordinator: CoverageAnalysisCoordinator;

  beforeEach(async () => {
    ctx = createCoordinatorTestContext();
    coordinator = new CoverageAnalysisCoordinator(ctx.eventBus, ctx.memory, { enableMinCutAwareness: false, enableConsensus: false });
    await coordinator.initialize();
  });

  it('an estimate returns its gaps but publishes nothing', async () => {
    const result = await coordinator.detectGaps({ coverageData: lowCoverage(), minCoverage: 80, measured: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.gaps.length).toBeGreaterThan(0);
    expect(gapEvents(ctx)).toEqual([]);
  });

  it('measured high-risk gaps are published with provenance', async () => {
    await coordinator.detectGaps({ coverageData: lowCoverage(), minCoverage: 80, measured: true });
    const events = gapEvents(ctx);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.payload).toMatchObject({ measured: true, coverageMethod: 'instrumented-report' });
  });

  it('the coverage trend ignores unstamped (legacy) history snapshots', async () => {
    const now = Date.now();
    const day = 86_400_000;
    // Different days, so daily aggregation cannot merge (and hide) them.
    await ctx.memory.set(`coverage:history:${now - 3 * day}`, { line: 10, branch: 0, function: 0, statement: 10, files: 3 });
    await ctx.memory.set(`coverage:history:${now - 1000}`, { line: 60, branch: 50, function: 40, statement: 30, files: 1, measured: true });

    const result = await coordinator.getTrend({
      timeRange: { start: new Date(now - 7 * day), end: new Date(now + 60_000) }, granularity: 'daily',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const lines = result.value.dataPoints.map(p => p.coverage.line);
      expect(lines).not.toContain(10);
      expect(lines.length).toBe(1);
    }
  });
});

describe('#1014 — quality-gate protocol coverage metrics', () => {
  function protocol(records: Record<string, unknown>) {
    const memory = {
      get: vi.fn(async (key: string) => records[key]), set: vi.fn(), delete: vi.fn(),
      search: vi.fn().mockResolvedValue([]), clear: vi.fn(),
    };
    const p = createQualityGateProtocol(
      { publish: vi.fn(), subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })), subscribeToChannel: vi.fn(), unsubscribe: vi.fn() } as never,
      memory as never,
      { spawn: vi.fn(), stop: vi.fn(), canSpawn: vi.fn(() => true), getActiveAgents: vi.fn(() => []), getAgentStatus: vi.fn() } as never,
    );
    return (p as unknown as { getCoverageMetrics(rc: unknown): Promise<Record<string, unknown> | null> }).getCoverageMetrics.bind(p);
  }

  it('a legacy unstamped coverage:latest is no data (the gate fails closed), not 10%', async () => {
    const read = protocol({ 'coverage:latest': { line: 10, branch: 0, function: 0, statement: 10, files: 3 } });
    expect(await read({})).toBeNull();
  });

  it('a measured record is used; an uncollected branch metric is 0 (no evidence — fails its check closed)', async () => {
    const read = protocol({ 'coverage:latest': { line: 90, branch: null, function: 80, statement: 85, files: 2, measured: true } });
    expect(await read({})).toMatchObject({ line: 90, branch: 0, function: 80, trend: 'stable' });
  });

  it('a legacy coverage:previous is not a trend baseline', async () => {
    const read = protocol({
      'coverage:latest': { line: 90, branch: 80, function: 80, statement: 85, files: 2, measured: true },
      'coverage:previous': { line: 10 },
    });
    expect(await read({})).toMatchObject({ trend: 'stable' });
  });
});
