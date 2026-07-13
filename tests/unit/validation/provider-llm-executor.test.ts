/**
 * Issue #557 follow-up — real eval executor.
 * `aqe eval run` must make real LLM calls by default and NEVER silently
 * fabricate: no provider configured → a clear reason, not a mock.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ProviderLLMExecutor,
  resolveEvalExecutor,
} from '../../../src/validation/provider-llm-executor';
import type { ProviderManager } from '../../../src/shared/llm/provider-manager';

describe('ProviderLLMExecutor', () => {
  it('should_mapProviderResponseToExecutorShape', async () => {
    const fakeManager = {
      generate: vi.fn().mockResolvedValue({
        content: 'real model output',
        usage: { promptTokens: 40, completionTokens: 60, totalTokens: 100 },
        latencyMs: 1234,
      }),
    } as unknown as ProviderManager;

    const executor = new ProviderLLMExecutor(fakeManager, 'claude');
    const result = await executor.execute('prompt', 'claude-sonnet-4-6', { timeout: 5000 });

    expect(result.output).toBe('real model output');
    expect(result.tokensUsed).toBe(100);
    expect(result.durationMs).toBe(1234);
  });

  it('should_forwardModelTimeoutAndPreferredProvider_toGenerate', async () => {
    const generate = vi.fn().mockResolvedValue({
      content: 'x',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      latencyMs: 1,
    });
    const executor = new ProviderLLMExecutor({ generate } as unknown as ProviderManager, 'cognitum');

    await executor.execute('p', 'cognitum-low', { timeout: 9000 });

    expect(generate).toHaveBeenCalledWith('p', {
      model: 'cognitum-low',
      timeoutMs: 9000,
      preferredProvider: 'cognitum',
    });
  });
});

describe('resolveEvalExecutor (never silently fabricates)', () => {
  it('should_returnReasonAndNoExecutor_when_noProviderConfigured', async () => {
    // Empty env: no API keys. Ollama probe will fail (no local server in CI),
    // and claude-code needs the binary — so nothing is configured.
    const resolution = await resolveEvalExecutor({} as NodeJS.ProcessEnv);

    // Either nothing resolved (reason set) OR a genuinely-available local
    // provider was found; it must NEVER return a mock disguised as real.
    if (!resolution.executor) {
      expect(resolution.reason).toMatch(/no llm provider/i);
      expect(resolution.reason).toContain('--mock');
    } else {
      // If something resolved, it must be a real provider with a billing mode.
      expect(resolution.providerType).toBeTruthy();
      expect(resolution.billingMode).toBeTruthy();
      await resolution.manager?.dispose();
    }
  });

  it('should_selectCognitum_when_onlyCognitumKeyPresent', async () => {
    const resolution = await resolveEvalExecutor({
      COGNITUM_API_KEY: 'cog_test',
    } as NodeJS.ProcessEnv);

    expect(resolution.executor).toBeDefined();
    expect(resolution.providerType).toBe('cognitum');
    expect(resolution.billingMode).toBe('metered-capped');
    await resolution.manager?.dispose();
  });
});
