/**
 * ADR-123 — ProviderManager enforces budgets BEFORE spending (issue #557).
 *
 * The check runs before any provider call, so an over-budget request throws
 * COST_LIMIT_EXCEEDED without ever touching the network.
 */

import { describe, it, expect } from 'vitest';
import { ProviderManager } from '../../../../src/shared/llm/provider-manager';
import { InMemorySpendLedger, type SpendLedger } from '../../../../src/shared/llm/spend-ledger';

const PRICED_MODEL = 'claude-sonnet-4-6';

/** A ledger pre-seeded to a given spend within the window. */
function seededLedger(spentUsd: number): SpendLedger {
  const ledger = new InMemorySpendLedger();
  if (spentUsd > 0) {
    ledger.record({
      provider: 'claude',
      model: PRICED_MODEL,
      costUsd: spentUsd,
      costSource: 'local-estimate',
      promptTokens: 0,
      completionTokens: 0,
      requestId: 'seed',
    });
  }
  return ledger;
}

function managerWith(
  global: Record<string, number>,
  ledger: SpendLedger
): ProviderManager {
  return new ProviderManager(
    {
      primary: 'claude',
      fallbacks: [],
      loadBalancing: 'round-robin',
      providers: { claude: { model: PRICED_MODEL } },
      global: { ...global, enableCostTracking: true },
    },
    { spendLedger: ledger }
  );
}

describe('ProviderManager budget enforcement (ADR-123)', () => {
  it('should_throwCostLimitExceeded_when_hourlyCapAlreadyBreached', async () => {
    const manager = managerWith({ maxCostPerHour: 0.5 }, seededLedger(1.0));

    await expect(manager.generate('analyze this code')).rejects.toMatchObject({
      code: 'COST_LIMIT_EXCEEDED',
    });
  });

  it('should_throwCostLimitExceeded_when_perRunCapWouldBeExceeded', async () => {
    // Per-run cap of a fraction of a cent; a 4096-token completion estimate
    // on a priced model blows past it on the first call.
    const manager = managerWith({ maxCostPerRun: 0.0001 }, seededLedger(0));

    await expect(manager.generate('hello')).rejects.toMatchObject({
      code: 'COST_LIMIT_EXCEEDED',
    });
  });

  it('should_notEnforce_when_noBudgetConfigured', () => {
    // No caps → no ledger is attached, so nothing to enforce against.
    const manager = new ProviderManager({
      primary: 'ollama',
      fallbacks: [],
      loadBalancing: 'round-robin',
      providers: { ollama: { model: 'llama3.1' } },
    });
    // The manager is constructed without a per-run cap from env or config.
    expect((manager as unknown as { maxCostPerRun?: number }).maxCostPerRun).toBeUndefined();
  });
});
