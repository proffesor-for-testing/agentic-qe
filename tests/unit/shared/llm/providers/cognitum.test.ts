/**
 * ADR-123 — Cognitum provider: authoritative receipt cost + server budget.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { CognitumProvider } from '../../../../../src/shared/llm/providers/cognitum';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }))
  );
}

const RECEIPT_RESPONSE = {
  id: 'chatcmpl-x',
  object: 'chat.completion',
  created: 1,
  model: 'cognitum-low',
  choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 17, completion_tokens: 10, total_tokens: 27, cache_read_tokens: 13 },
  x_cognitum: {
    request_id: 'r1',
    resolved_tier: 'low',
    resolved_model: 'z-ai/glm-5.2',
    escalated: false,
    price_usd: 0.0000349,
    cache: 'miss',
  },
};

describe('CognitumProvider metadata', () => {
  it('should_declareMeteredCappedBilling', () => {
    const p = new CognitumProvider({ apiKey: 'cog_test' });
    expect(p.type).toBe('cognitum');
    expect(p.billingMode).toBe('metered-capped');
  });
});

describe('CognitumProvider.generate receipt handling', () => {
  it('should_useReceiptPriceAsAuthoritativeCost', async () => {
    stubFetchOnce(200, RECEIPT_RESPONSE);
    const provider = new CognitumProvider({ apiKey: 'cog_test' });

    const res = await provider.generate('hi');

    expect(res.cost.totalCost).toBeCloseTo(0.0000349, 9);
    expect(res.cost.source).toBe('provider-receipt');
  });

  it('should_reportResolvedModelFromReceipt_not_tierName', async () => {
    stubFetchOnce(200, RECEIPT_RESPONSE);
    const provider = new CognitumProvider({ apiKey: 'cog_test' });

    const res = await provider.generate('hi');

    expect(res.model).toBe('z-ai/glm-5.2');
  });

  it('should_fallBackToLocalEstimate_when_receiptMissing', async () => {
    const noReceipt = { ...RECEIPT_RESPONSE, x_cognitum: undefined };
    stubFetchOnce(200, noReceipt);
    const provider = new CognitumProvider({ apiKey: 'cog_test' });

    const res = await provider.generate('hi');

    expect(res.cost.source).toBe('local-estimate');
    expect(res.cost.totalCost).toBe(0);
  });

  it('should_mapBudgetCapTo_CostLimitExceeded_on_402', async () => {
    stubFetchOnce(402, { error: 'budget cap reached' });
    const provider = new CognitumProvider({ apiKey: 'cog_test' });

    await expect(provider.generate('hi')).rejects.toMatchObject({
      code: 'COST_LIMIT_EXCEEDED',
    });
  });
});

describe('CognitumProvider.getRemoteBudget', () => {
  it('should_parseServerSideBudgetSnapshot', async () => {
    stubFetchOnce(200, {
      budget: {
        servingBudgetUsd: 20,
        hardCapUsd: 20,
        committedUsd: 0.43,
        headroomUsd: 19.57,
        status: 'active',
        headroomExhausted: false,
      },
    });
    const provider = new CognitumProvider({ apiKey: 'cog_test' });

    const budget = await provider.getRemoteBudget();

    expect(budget?.hardCapUsd).toBe(20);
    expect(budget?.headroomUsd).toBeCloseTo(19.57, 2);
    expect(budget?.status).toBe('active');
  });

  it('should_returnUndefined_when_usageEndpointFails', async () => {
    stubFetchOnce(500, {});
    const provider = new CognitumProvider({ apiKey: 'cog_test' });

    expect(await provider.getRemoteBudget()).toBeUndefined();
  });
});
