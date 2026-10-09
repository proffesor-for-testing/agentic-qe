import { afterEach, describe, expect, it } from 'vitest';
import { ProviderManager } from '../../../../src/shared/llm/provider-manager';
import { CostTracker } from '../../../../src/shared/llm/cost-tracker';
import { registerProvider, resetProviderRegistry } from '../../../../src/shared/llm/provider-registry';
import type { GenerateOptions, LLMProvider, LLMResponse } from '../../../../src/shared/llm/interfaces';

const managers: ProviderManager[] = [];

afterEach(async () => {
  for (const manager of managers.splice(0)) await manager.dispose();
  resetProviderRegistry();
});

function setup() {
  const calls: Array<{ provider: string; options?: GenerateOptions }> = [];
  for (const type of ['owned-alpha', 'owned-beta']) {
    registerProvider(type, (): LLMProvider => {
      const generate = async (_input: unknown, options?: GenerateOptions): Promise<LLMResponse> => {
        calls.push({ provider: type, options });
        return {
          content: JSON.stringify({ provider: type, stop: options?.stopSequences, effort: options?.effort }),
          provider: type, model: 'llama3.1', requestId: `${type}-${calls.length}`,
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          cost: { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD' },
          finishReason: 'stop', cached: false, latencyMs: 1,
        };
      };
      return {
        type, name: type, isAvailable: async () => true,
        healthCheck: async () => ({ healthy: true, provider: type, latencyMs: 0 }),
        generate,
        complete: async (prompt, options) => {
          const response = await generate(prompt, options);
          return { completion: response.content, model: response.model, provider: type,
            usage: response.usage, cached: false, latencyMs: 1 };
        },
        embed: async () => { throw new Error('unused'); },
        getConfig: () => ({ model: 'llama3.1' }), getSupportedModels: () => ['llama3.1'],
        getCostPerToken: () => ({ input: 0, output: 0 }), dispose: async () => {},
      };
    });
  }
  const manager = new ProviderManager({
    primary: 'owned-alpha', fallbacks: ['owned-beta'], providers: {}, loadBalancing: 'least-cost',
  }, { costTracker: new CostTracker() });
  managers.push(manager);
  return { manager, calls };
}

describe('request cache identity', () => {
  it('honors distinct explicit providers and reuses only the matching response', async () => {
    const { manager, calls } = setup();
    const first = await manager.generate('same prompt', { preferredProvider: 'owned-alpha' });
    const second = await manager.generate('same prompt', { preferredProvider: 'owned-beta' });
    const repeated = await manager.generate('same prompt', { preferredProvider: 'owned-alpha' });
    expect(first.provider).toBe('owned-alpha');
    expect(second.provider).toBe('owned-beta');
    expect(repeated.provider).toBe('owned-alpha');
    expect(repeated.cached).toBe(true);
    expect(calls.map(call => call.provider)).toEqual(['owned-alpha', 'owned-beta']);
  });

  it.each([
    [{ stopSequences: ['FIRST'] }, { stopSequences: ['SECOND'] }],
    [{ effort: 'low' }, { effort: 'max' }],
  ] satisfies Array<[GenerateOptions, GenerateOptions]>)(
    'separates generation options %j from %j', async (firstOptions, secondOptions) => {
      const { manager, calls } = setup();
      const first = await manager.generate('same prompt', firstOptions);
      const second = await manager.generate('same prompt', secondOptions);
      expect(second.content).not.toBe(first.content);
      expect(second.cached).toBe(false);
      expect((await manager.generate('same prompt', secondOptions)).cached).toBe(true);
      expect(calls).toHaveLength(2);
    },
  );

  it('separates completion stop sequences including empty versus default', async () => {
    const { manager, calls } = setup();
    const outputs = [];
    for (const stopSequences of [['FIRST'], ['SECOND'], [], undefined]) {
      outputs.push(await manager.complete('same prompt', { stopSequences }));
    }
    expect(new Set(outputs.map(response => response.completion)).size).toBe(4);
    expect(calls).toHaveLength(4);
    expect((await manager.complete('same prompt', { stopSequences: ['SECOND'] })).cached).toBe(true);
    expect(calls).toHaveLength(4);
  });

  it.each([
    [{ model: 'model-one' }, { model: 'model-two' }],
    [{ temperature: 0.1 }, { temperature: 0.9 }],
    [{ maxTokens: 10 }, { maxTokens: 20 }],
    [{ systemPrompt: 'first system' }, { systemPrompt: 'second system' }],
  ] satisfies Array<[GenerateOptions, GenerateOptions]>)(
    'retains partitioning for existing key options %j and %j', async (firstOptions, secondOptions) => {
      const { manager, calls } = setup();
      await manager.generate('same prompt', firstOptions);
      expect((await manager.generate('same prompt', secondOptions)).cached).toBe(false);
      expect(calls).toHaveLength(2);
    },
  );

  it('keeps skipCache requests uncached even with a provider preference', async () => {
    const { manager, calls } = setup();
    const options = { preferredProvider: 'owned-beta', skipCache: true };
    await manager.generate('same prompt', options);
    expect((await manager.generate('same prompt', options)).cached).toBe(false);
    expect(calls).toHaveLength(2);
    expect(calls.every(call => call.provider === 'owned-beta')).toBe(true);
  });
});
