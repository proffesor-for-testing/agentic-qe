/**
 * #1481: a routing decision is "decided", not a success. Success and failure
 * are counted only from outcomes reported after the task ran.
 */

import { describe, it, expect, vi } from 'vitest';
import { createModelRouter } from '../../../../../src/integrations/agentic-flow/model-router/router';
import type { PersistentMetricsTracker } from '../../../../../src/integrations/agentic-flow/metrics';

describe('ModelRouter decided vs observed outcomes (#1481)', () => {
  const route = (router: ReturnType<typeof createModelRouter>, task: string) =>
    router.route({ task, manualTier: 2 });

  it('counts a route as a decision with no success rate', async () => {
    const router = createModelRouter({ enableDecisionCache: false });

    await route(router, 'design a distributed consensus protocol');
    const metrics = router.getMetrics();

    expect(metrics.totalDecisions).toBe(1);
    expect(metrics.byTier[2]?.selectionCount).toBe(1);
    expect(metrics.byTier[2]?.successRate).toBeNull();
    expect(metrics.byTier[2]?.observedOutcomes).toBe(0);
    expect(metrics.agentBoosterStats.successRate).toBeNull();
    expect(metrics.outcomeStats).toEqual({ observed: 0, successful: 0, failed: 0, successRate: null });
  });

  it('a failed task lowers the success rate', async () => {
    const router = createModelRouter({ enableDecisionCache: false });
    await route(router, 'task one');
    await route(router, 'task two');
    await route(router, 'task three');

    router.recordOutcome(2, true, 120);
    router.recordOutcome(2, true, 80);
    expect(router.getMetrics().byTier[2]?.successRate).toBe(1);

    router.recordOutcome(2, false, 300);
    const metrics = router.getMetrics();

    expect(metrics.byTier[2]?.successRate).toBeCloseTo(2 / 3);
    expect(metrics.byTier[2]?.successfulOutcomes).toBe(2);
    expect(metrics.outcomeStats).toEqual({
      observed: 3, successful: 2, failed: 1, successRate: 2 / 3,
    });
    // Decisions are still counted separately from outcomes.
    expect(metrics.totalDecisions).toBe(3);
  });

  it('reports Agent Booster success only from Tier 0 outcomes', () => {
    const router = createModelRouter();

    router.recordOutcome(0, false, 5);
    const stats = router.getMetrics().agentBoosterStats;

    expect(stats.successRate).toBe(0);
    expect(stats.observedOutcomes).toBe(1);
  });

  it('rejects an outcome for a tier that does not exist', () => {
    const router = createModelRouter();

    expect(() => router.recordOutcome(7 as never, true)).toThrow('Invalid model tier');
    expect(() => router.recordOutcome(2, 'yes' as never)).toThrow('boolean');
    expect(router.getMetrics().outcomeStats.observed).toBe(0);
  });

  it('persists outcomes, never a decision, to the metrics tracker', async () => {
    const recordOutcome = vi.fn(async () => {});
    const tracker = { recordOutcome } as unknown as PersistentMetricsTracker;
    const router = createModelRouter({ enableDecisionCache: false }, undefined, tracker);

    await route(router, 'refactor the auth module');
    expect(recordOutcome).not.toHaveBeenCalled();

    router.recordOutcome(2, false, 42);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(recordOutcome).toHaveBeenCalledTimes(1);
    expect(recordOutcome).toHaveBeenCalledWith(
      'router', expect.stringMatching(/^router-tier2-/), false, 42, { subType: 'tier-2' },
    );
  });

  it('reset clears outcomes along with decisions', async () => {
    const router = createModelRouter({ enableDecisionCache: false });
    await route(router, 'task');
    router.recordOutcome(2, true);

    router.resetMetrics();

    expect(router.getMetrics().outcomeStats.observed).toBe(0);
    expect(router.getMetrics().totalDecisions).toBe(0);
  });
});
