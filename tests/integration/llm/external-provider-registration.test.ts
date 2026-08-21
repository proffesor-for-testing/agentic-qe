/**
 * Integration tests for ADR-127 / issue #628.
 *
 * The unit tests cover the registry in isolation. These cover the thing the
 * issue actually asked for: that `AQE_LLM_PROVIDER=<registered-type>` survives
 * every gate between the environment and a real `generate()` call.
 *
 * There are five such gates, and before ADR-127 a registered type died at each
 * one: `resolveProviderOverrideFromEnv` (rejected unknown types),
 * `detectAvailableProvidersFromEnv` + `isRuntimeConstructible` (dropped
 * anything not in a hardcoded allowlist), `pickEnabledProviders`,
 * `ProviderManager.createProvider` (threw from its `default` arm), and
 * `HybridRouter.executeWithFallback`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  registerProvider,
  resetProviderRegistry,
} from '../../../src/shared/llm/provider-registry';
import {
  loadRouterConfig,
  resolveProviderOverrideFromEnv,
  detectAvailableProvidersFromEnv,
  isRuntimeConstructible,
  allSelectableProviderTypes,
  shouldEnableRouter,
} from '../../../src/shared/llm/router/config-store';
import {
  pickEnabledProviders,
} from '../../../src/shared/llm/llm-router-service';
import { ProviderManager } from '../../../src/shared/llm/provider-manager';
import { HybridRouter } from '../../../src/shared/llm/router/hybrid-router';
import type { LLMProvider, LLMResponse } from '../../../src/shared/llm/interfaces';
import { billingNotice, billingModeForType } from '../../../src/shared/llm/billing-modes';

const HOST = 'my-host';

/** Records what the router asked it to do, so we can assert real dispatch. */
class FakeHostProvider implements Partial<LLMProvider> {
  static calls: Array<{ model?: string; prompt: string }> = [];

  readonly type = HOST;
  readonly name = 'My Host (subscription)';
  readonly billingMode = 'subscription' as const;

  async isAvailable(): Promise<boolean> {
    return true;
  }
  async healthCheck() {
    return { healthy: true, latencyMs: 1, provider: HOST };
  }
  async generate(input: unknown, options?: { model?: string }): Promise<LLMResponse> {
    const prompt = Array.isArray(input)
      ? (input as Array<{ content: string }>).map((m) => m.content).join('\n')
      : String(input);
    FakeHostProvider.calls.push({ model: options?.model, prompt });
    return {
      content: 'served by my-host',
      model: options?.model ?? 'default',
      provider: HOST,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      cost: { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD' },
      latencyMs: 1,
      finishReason: 'stop',
      cached: false,
      requestId: 'test-1',
    } as unknown as LLMResponse;
  }
  async embed(): Promise<never> {
    throw new Error('unsupported');
  }
  async complete(): Promise<never> {
    throw new Error('unsupported');
  }
  getConfig() {
    return {};
  }
  getSupportedModels() {
    return ['default'];
  }
  getCostPerToken() {
    return { input: 0, output: 0 };
  }
  async dispose(): Promise<void> {}
}

/** Env with every built-in key stripped, so only the registered host exists. */
function isolatedEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH, ...extra };
}

describe('ADR-127 external provider registration (integration)', () => {
  beforeEach(() => {
    resetProviderRegistry();
    FakeHostProvider.calls = [];
    registerProvider(HOST, () => new FakeHostProvider() as unknown as LLMProvider, {
      billingMode: 'subscription',
      displayName: 'My Host (subscription)',
      source: 'config',
      sourceDetail: '.agentic-qe/llm-config.json',
    });
  });

  afterEach(() => {
    resetProviderRegistry();
    vi.restoreAllMocks();
  });

  describe('gate 1: AQE_LLM_PROVIDER resolution', () => {
    it('resolves a registered type', () => {
      const env = isolatedEnv({ AQE_LLM_PROVIDER: HOST });
      expect(resolveProviderOverrideFromEnv(env)).toBe(HOST);
    });

    it('lists the registered type among selectable providers', () => {
      expect(allSelectableProviderTypes()).toContain(HOST);
    });

    it('still refuses an unregistered type, and names the registered one', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const env = isolatedEnv({ AQE_LLM_PROVIDER: 'not-a-provider' });

      expect(resolveProviderOverrideFromEnv(env)).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('not a known provider'));
      // The warning must enumerate registered types too, so a typo is never
      // confused with "a provider registered but I can't select it".
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(HOST));
    });

    it('still normalizes the anthropic alias to claude', () => {
      expect(resolveProviderOverrideFromEnv(isolatedEnv({ AQE_LLM_PROVIDER: 'anthropic' }))).toBe(
        'claude'
      );
    });
  });

  describe('gate 2: availability and constructibility', () => {
    it('treats a registered provider as runtime-constructible', () => {
      expect(isRuntimeConstructible(HOST)).toBe(true);
      // onnx is in the type system but has no ProviderManager case — unchanged.
      expect(isRuntimeConstructible('onnx')).toBe(false);
    });

    it('detects it without requiring an env key', () => {
      expect(detectAvailableProvidersFromEnv(isolatedEnv())).toContain(HOST);
    });

    it('enables the router for a project whose only provider is registered', () => {
      expect(shouldEnableRouter({ env: isolatedEnv() })).toBe(true);
    });
  });

  describe('gate 3: config load and provider selection', () => {
    it('pins defaultProvider and force-enables the registered provider', () => {
      const config = loadRouterConfig({
        env: isolatedEnv({ AQE_LLM_PROVIDER: HOST }),
        projectRoot: '/nonexistent-project-root',
      });

      expect(config.defaultProvider).toBe(HOST);
      expect(config.providers?.[HOST]?.enabled).toBe(true);
    });

    it('picks it as an enabled provider', () => {
      const env = isolatedEnv({ AQE_LLM_PROVIDER: HOST });
      const config = loadRouterConfig({ env, projectRoot: '/nonexistent-project-root' });

      expect(pickEnabledProviders(config, env)).toContain(HOST);
    });
  });

  describe('gate 4: ProviderManager construction', () => {
    it('constructs the registered provider from the default arm', async () => {
      const manager = new ProviderManager({ primary: HOST, fallbacks: [] });
      await manager.initialize();

      const provider = manager.getProvider(HOST);
      expect(provider).toBeDefined();
      expect(provider?.type).toBe(HOST);
      expect(provider?.name).toBe('My Host (subscription)');
    });

    it('still fails for a type that is neither built-in nor registered', async () => {
      const manager = new ProviderManager({ primary: 'ghost-provider', fallbacks: [] });
      // createProviders() warns per-provider and then throws when none built.
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(manager.initialize()).rejects.toThrow(/No LLM providers could be initialized/);
    });
  });

  describe('billing notices never misattribute an external provider', () => {
    it('does not claim an external subscription host draws on Claude Code', () => {
      // Regression: billingNotice() hardcoded `provider === 'codex' ? 'ChatGPT'
      // : 'Claude Code'`, so ANY provider declaring `subscription` told the
      // user their Claude Code plan was paying for it — the exact vendor
      // misattribution issue #628 refused to perform.
      const notice = billingNotice(HOST, 'subscription');

      expect(notice).toBeDefined();
      expect(notice).not.toMatch(/runs on your Claude Code subscription/);
      expect(notice).not.toMatch(/runs on your ChatGPT subscription/);
      expect(notice).toMatch(/external provider/);
      expect(notice).toMatch(/AQE does not verify this/);
      expect(notice).toMatch(/\.agentic-qe\/llm-config\.json/);
    });

    it('still names the real vendor for built-in subscription providers', () => {
      expect(billingNotice('claude-code', 'subscription')).toMatch(
        /runs on your Claude Code subscription/
      );
      expect(billingNotice('codex', 'subscription')).toMatch(/runs on your ChatGPT subscription/);
    });

    it('treats an external provider that declares nothing as billable', () => {
      resetProviderRegistry();
      registerProvider('bare-host', () => new FakeHostProvider() as unknown as LLMProvider);

      // No declaration => metered-api => the user is told to set a cap, rather
      // than being silently assumed free.
      expect(billingModeForType('bare-host')).toBe('metered-api');
      expect(billingNotice('bare-host', 'metered-api')).toMatch(/--max-budget-usd/);
    });
  });

  describe('gate 5: end-to-end dispatch through HybridRouter', () => {
    it('routes a chat request to the registered provider and returns its answer', async () => {
      const env = isolatedEnv({ AQE_LLM_PROVIDER: HOST });
      const config = loadRouterConfig({ env, projectRoot: '/nonexistent-project-root' });

      const manager = new ProviderManager({ primary: HOST, fallbacks: [] });
      const router = new HybridRouter(manager, {
        ...config,
        mode: 'manual',
        defaultProvider: HOST,
        defaultModel: 'default',
      });
      await router.initialize();

      const response = await router.chat({
        messages: [{ role: 'user', content: 'generate a test' }],
      });

      expect(response.content).toBe('served by my-host');
      expect(FakeHostProvider.calls).toHaveLength(1);
      expect(FakeHostProvider.calls[0].prompt).toContain('generate a test');
    });
  });
});
