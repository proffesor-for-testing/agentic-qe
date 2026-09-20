/** Exercise the real judge/router boundary; only provider I/O is faked. */
import { describe, expect, it, vi } from 'vitest';
import { HybridRouter } from '../../../src/shared/llm/router/hybrid-router.js';
import type { ProviderManager } from '../../../src/shared/llm/provider-manager.js';
import type { GenerateOptions, LLMProvider, LLMProviderType, LLMResponse, Message } from '../../../src/shared/llm/interfaces.js';
import type { RouterConfig } from '../../../src/shared/llm/router/types.js';
import { DEFAULT_FALLBACK_BEHAVIOR } from '../../../src/shared/llm/router/types.js';
import { DEFAULT_OPUS_MODEL } from '../../../src/shared/llm/model-registry.js';
import { createRouterFrontierJudge } from '../../../src/validation/frontier-judge.js';
import { computeQualityVerdict } from '../../../src/validation/quality-verdict.js';

function provider(type: LLMProviderType) {
  return {
    type,
    name: `fixture-${type}`,
    isAvailable: vi.fn().mockResolvedValue(true),
    getConfig: () => ({ model: type === 'claude' ? 'claude-sonnet-4-6' : 'llama3.1' }),
    getCostPerToken: () => ({ input: 0, output: 0 }),
    getSupportedModels: () => [DEFAULT_OPUS_MODEL, 'llama3.1'],
    generate: vi.fn(async (messages: Message[], options: GenerateOptions): Promise<LLMResponse> => ({
      content: messages[0].content === 'Reply with exactly: OK' ? 'OK' : '{"unmet":[]}',
      model: options.model!,
      provider: type,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      cost: { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD' },
      latencyMs: 1,
      finishReason: 'stop',
      cached: false,
      requestId: 'fixture',
    })),
  };
}

function setup(config: Partial<RouterConfig> = {}) {
  const claude = provider('claude');
  const ollama = provider('ollama');
  const providers = new Map<LLMProviderType, LLMProvider>([
    ['claude', claude as unknown as LLMProvider],
    ['ollama', ollama as unknown as LLMProvider],
  ]);
  const manager = {
    initialize: vi.fn().mockResolvedValue(undefined),
    getProvider: (type: LLMProviderType) => providers.get(type),
    getAvailableProviders: () => [...providers.keys()],
    getMetrics: () => ({ claude: { avgLatencyMs: 100 }, ollama: { avgLatencyMs: 1 } }),
    assertWithinBudget: vi.fn(),
    recordResponseSpend: vi.fn(),
  };
  const router = new HybridRouter(manager as unknown as ProviderManager, {
    fallbackBehavior: { ...DEFAULT_FALLBACK_BEHAVIOR, maxAttempts: 3, delayMs: 0 },
    ...config,
  });
  return { router, claude, ollama, providers };
}

function verdict(router: HybridRouter, opts: Parameters<typeof createRouterFrontierJudge>[1] = {}) {
  return computeQualityVerdict({
    oracle: { passed: true, baselinePassed: true },
    artifact: 'fixture artifact',
    checklist: { id: 'fixture-checklist', requirements: ['fixture requirement'] },
    judge: createRouterFrontierJudge(router, opts),
  });
}

describe('frontier judge model routing', () => {
  it.each(['manual', 'rule-based', 'cost-optimized', 'performance-optimized'] as const)(
    'uses the frontier model for both preflight and grade in %s mode', async (mode) => {
      const { router, claude, ollama } = setup({ mode, cacheDecisions: false });

      expect((await verdict(router)).verdict).toBe('pass');
      expect(claude.generate).toHaveBeenCalledTimes(2);
      for (const [, options] of claude.generate.mock.calls) {
        expect(options.model).toBe(DEFAULT_OPUS_MODEL);
      }
      expect(ollama.generate).not.toHaveBeenCalled();
    },
  );

  it('keeps a shared router and its warmed ordinary decision unchanged', async () => {
    const { router, claude, ollama } = setup();
    const ordinary = { messages: [{ role: 'user' as const, content: 'small ordinary request' }] };
    expect((await router.chat(ordinary)).model).toBe('llama3.1');
    const config = router.getConfig();

    expect((await verdict(router)).verdict).toBe('pass');

    expect(claude.generate).toHaveBeenCalledTimes(2);
    expect(claude.generate.mock.calls.every(([, options]) => options.model === DEFAULT_OPUS_MODEL)).toBe(true);
    expect(router.getConfig()).toEqual(config);
    expect((await router.chat(ordinary)).model).toBe('llama3.1');
    expect(ollama.generate).toHaveBeenCalledTimes(2);
  });

  it('returns inconclusive when the requested judge is unavailable despite a working local fallback', async () => {
    const { router, claude, ollama } = setup({ mode: 'manual' });
    claude.generate.mockRejectedValue(new Error('frontier unavailable'));

    expect(await verdict(router)).toMatchObject({ verdict: 'inconclusive', attempts: 0 });
    expect(claude.generate).toHaveBeenCalledOnce();
    expect(ollama.generate).not.toHaveBeenCalled();
  });

  it('does not count a fallback opinion when only grading fails after preflight', async () => {
    const { router, claude, ollama } = setup({ mode: 'manual' });
    const generate = claude.generate.getMockImplementation()!;
    claude.generate.mockImplementation(async (messages, options) => {
      if (messages[0].content !== 'Reply with exactly: OK') throw new Error('grade unavailable');
      return generate(messages, options);
    });

    expect(await verdict(router)).toMatchObject({ verdict: 'inconclusive', attempts: 2, specCoverage: null });
    expect(ollama.generate).not.toHaveBeenCalled();
  });

  it('returns inconclusive when the configured judge provider is missing', async () => {
    const { router, claude, ollama, providers } = setup();
    providers.delete('claude');

    expect((await verdict(router)).verdict).toBe('inconclusive');
    expect(claude.generate).not.toHaveBeenCalled();
    expect(ollama.generate).not.toHaveBeenCalled();
  });

  it('rejects a different reported model even when its grade is valid JSON', async () => {
    const { router, claude, ollama } = setup({ mode: 'manual' });
    const generate = claude.generate.getMockImplementation()!;
    claude.generate.mockImplementation(async (messages, options) => ({
      ...await generate(messages, options),
      model: 'claude-sonnet-4-6',
    }));

    expect((await verdict(router)).verdict).toBe('inconclusive');
    expect(ollama.generate).not.toHaveBeenCalled();
  });

  it('honors an explicit judge provider and known model alias', async () => {
    const { router, claude, ollama } = setup({ defaultProvider: 'ollama', defaultModel: 'llama3.1' });

    expect((await verdict(router, {
      model: 'anthropic/claude-opus-4.7', preferredProvider: 'claude',
    })).verdict).toBe('pass');
    expect(claude.generate).toHaveBeenCalledTimes(2);
    expect(claude.generate.mock.calls.every(([, options]) => options.model === DEFAULT_OPUS_MODEL)).toBe(true);
    expect(ollama.generate).not.toHaveBeenCalled();
  });
});
