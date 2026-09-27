/**
 * Anthropic request-parameter policy.
 *
 * Current Claude models reject `temperature` with a 400 and take effort only as
 * `output_config.effort`; both were verified against the live Messages API on
 * 2026-09-27 (`claude-opus-4-7`, `claude-sonnet-5`). These tests pin that
 * every Anthropic-format request body follows the policy.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyAnthropicParams,
  getAnthropicParamPolicy,
} from '../../../../src/shared/llm/anthropic-params';
import { ClaudeProvider, DEFAULT_CLAUDE_CONFIG } from '../../../../src/shared/llm/providers';
import {
  CLAUDE_TIER_MODELS,
  DEFAULT_OPUS_MODEL,
  DEFAULT_SONNET_MODEL,
  getClaudeModelForTier,
  getModelCapabilities,
} from '../../../../src/shared/llm/model-registry';
import { CostTracker, resolveModelPricing } from '../../../../src/shared/llm/cost-tracker';

describe('getAnthropicParamPolicy', () => {
  it.each(['claude-sonnet-5', 'claude-opus-5', 'claude-opus-5-5', 'claude-fable-5-1', 'claude-opus-4-7'])(
    'rejects sampling params and accepts effort on %s',
    (model) => {
      expect(getAnthropicParamPolicy(model)).toEqual({ sendSampling: false, supportsEffort: true });
    }
  );

  it.each(['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'anthropic.claude-sonnet-4-6-v1:0'])(
    'keeps sampling params and sends no effort on %s',
    (model) => {
      expect(getAnthropicParamPolicy(model)).toEqual({ sendSampling: true, supportsEffort: false });
    }
  );

  it('is conservative for models missing from the registry', () => {
    expect(getAnthropicParamPolicy('claude-unknown-9')).toEqual({ sendSampling: false, supportsEffort: false });
  });
});

describe('applyAnthropicParams', () => {
  it('omits temperature and nests effort under output_config for Sonnet 5', () => {
    const body = applyAnthropicParams({ model: 'claude-sonnet-5' }, 'claude-sonnet-5', {
      temperature: 0.7,
      effort: 'max',
    });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('thinking');
    expect(body.output_config).toEqual({ effort: 'max' });
  });

  it('sends no effort to non-flagship models unless the caller asked for one', () => {
    const body = applyAnthropicParams({}, 'claude-sonnet-5', { temperature: 0.7 });
    expect(body).toEqual({});
  });

  it('applies the fleet effort (QE_EFFORT_LEVEL) to flagship models when none is requested', () => {
    const prev = process.env.QE_EFFORT_LEVEL;
    process.env.QE_EFFORT_LEVEL = 'high';
    try {
      expect(applyAnthropicParams({}, 'claude-opus-5-5', {})).toEqual({ output_config: { effort: 'high' } });
      expect(applyAnthropicParams({}, 'claude-fable-5-1', {})).toEqual({ output_config: { effort: 'high' } });
    } finally {
      if (prev === undefined) delete process.env.QE_EFFORT_LEVEL; else process.env.QE_EFFORT_LEVEL = prev;
    }
  });

  it('falls back to config/fleet-defaults.yaml (xhigh) for flagship models without an env override', () => {
    const prev = process.env.QE_EFFORT_LEVEL;
    delete process.env.QE_EFFORT_LEVEL;
    try {
      expect(applyAnthropicParams({}, 'claude-opus-5-5', {})).toEqual({ output_config: { effort: 'xhigh' } });
    } finally {
      if (prev !== undefined) process.env.QE_EFFORT_LEVEL = prev;
    }
  });

  it('lets an explicit effort win over the fleet effort', () => {
    expect(applyAnthropicParams({}, 'claude-opus-5-5', { effort: 'low' })).toEqual({ output_config: { effort: 'low' } });
  });

  it('keeps temperature for Sonnet 4.6', () => {
    const body = applyAnthropicParams({}, 'claude-sonnet-4-6', { temperature: 0.2, effort: 'high' });
    expect(body).toEqual({ temperature: 0.2 });
  });
});

describe('ClaudeProvider request body', () => {
  const mockFetch = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  function captureBody(): Promise<Record<string, unknown>> {
    vi.stubGlobal('fetch', mockFetch);
    return new Promise((resolve) => {
      mockFetch.mockImplementationOnce((_url, options) => {
        resolve(JSON.parse((options as RequestInit).body as string));
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'msg_1',
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: 'ok' }],
              model: 'claude-sonnet-5',
              stop_reason: 'end_turn',
              stop_sequence: null,
              usage: { input_tokens: 1, output_tokens: 1 },
            }),
        });
      });
    });
  }

  it('defaults to Sonnet 5 and never sends temperature to it', async () => {
    const provider = new ClaudeProvider({ apiKey: 'test-key', enableCache: false });
    const bodyPromise = captureBody();
    await provider.generate('hi', { temperature: 0.4, effort: 'high' });
    const body = await bodyPromise;
    expect(DEFAULT_CLAUDE_CONFIG.model).toBe('claude-sonnet-5');
    expect(body.model).toBe('claude-sonnet-5');
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('thinking');
    expect(body.output_config).toEqual({ effort: 'high' });
  });

  it('still sends temperature to Sonnet 4.6', async () => {
    const provider = new ClaudeProvider({ apiKey: 'test-key', enableCache: false });
    const bodyPromise = captureBody();
    await provider.generate('hi', { model: 'claude-sonnet-4-6', temperature: 0.4 });
    const body = await bodyPromise;
    expect(body.temperature).toBe(0.4);
    expect(body).not.toHaveProperty('output_config');
  });
});

describe('Claude tier map', () => {
  it('maps tiers to the current generation', () => {
    expect(CLAUDE_TIER_MODELS).toEqual({
      1: 'claude-haiku-4-5-20251001',
      2: 'claude-sonnet-5',
      3: 'claude-sonnet-5',
      4: 'claude-opus-5-5',
    });
    expect(getClaudeModelForTier(4)).toBe(DEFAULT_OPUS_MODEL);
    expect(getClaudeModelForTier(99)).toBe(DEFAULT_SONNET_MODEL);
  });

  it('has registry capabilities for every tier model', () => {
    for (const model of Object.values(CLAUDE_TIER_MODELS)) {
      expect(() => getModelCapabilities(model)).not.toThrow();
    }
  });
});

describe('model pricing resolution', () => {
  it('prices every Claude tier model (budgets never see $0 for a routable model)', () => {
    for (const model of Object.values(CLAUDE_TIER_MODELS)) {
      const pricing = resolveModelPricing(model);
      expect(pricing, model).toBeDefined();
      expect(pricing!.input).toBeGreaterThan(0);
    }
  });

  it('prices the canonical Haiku ID used by DEFAULT_HAIKU_MODEL', () => {
    expect(resolveModelPricing('claude-haiku-4-5')).toEqual({ input: 1, output: 5 });
  });

  it('falls back to the registry for provider-specific IDs', () => {
    expect(resolveModelPricing('anthropic.claude-opus-4-7-v1:0')).toEqual({ input: 5, output: 25 });
  });

  it('treats a genuinely unknown model as free/local', () => {
    expect(resolveModelPricing('my-local-model:7b')).toBeUndefined();
    const cost = CostTracker.calculateCost('my-local-model:7b', {
      promptTokens: 1000,
      completionTokens: 1000,
      totalTokens: 2000,
    });
    expect(cost.totalCost).toBe(0);
  });

  it('charges Sonnet 5 at $2/$10 per million tokens', () => {
    const cost = CostTracker.calculateCost('claude-sonnet-5', {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
    });
    expect(cost.totalCost).toBeCloseTo(12, 6);
  });
});
