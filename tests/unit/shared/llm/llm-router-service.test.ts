/**
 * Unit tests for src/shared/llm/llm-router-service.ts (ADR-043 wiring).
 *
 * Covers:
 *   - pickEnabledProviders (respects defaultProvider + env detection)
 *   - pickPrimaryAndFallbacks
 *   - createLLMRouterService with an injected ProviderManager
 *   - createLLMRouterService returns null when no providers available
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  createLLMRouterService,
  pickEnabledProviders,
  pickPrimaryAndFallbacks,
} from '../../../../src/shared/llm/llm-router-service';
import { ProviderManager } from '../../../../src/shared/llm/provider-manager';
import {
  DEFAULT_ROUTER_CONFIG,
} from '../../../../src/shared/llm/router/types';
import { mergeRouterConfig } from '../../../../src/shared/llm/router/config-store';
import { createMockLLMProvider } from '../../../mocks';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-llm-svc-'));
});

afterEach(() => {
  if (fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

describe('pickEnabledProviders', () => {
  it('returns only locally-constructible providers when no remote keys present', () => {
    // ollama is local and in ProviderManager's construct switch. onnx is
    // in the type system but ProviderManager has no case for it yet,
    // so it's filtered out of available set (see config-store).
    expect(pickEnabledProviders(DEFAULT_ROUTER_CONFIG, {})).toEqual(['ollama']);
  });

  it('hoists defaultProvider to the front when enabled', () => {
    const cfg = mergeRouterConfig(DEFAULT_ROUTER_CONFIG, {
      defaultProvider: 'gemini',
      providers: { gemini: { enabled: true } } as any,
    });
    const result = pickEnabledProviders(cfg, { GOOGLE_API_KEY: 'x' });
    expect(result[0]).toBe('gemini');
  });

  it('skips providers whose API key is missing even if enabled in config', () => {
    const cfg = mergeRouterConfig(DEFAULT_ROUTER_CONFIG, {
      providers: { gemini: { enabled: true } } as any,
    });
    expect(pickEnabledProviders(cfg, {})).not.toContain('gemini');
  });

  it('skips providers whose enabled flag is false even if key is present', () => {
    const cfg = mergeRouterConfig(DEFAULT_ROUTER_CONFIG, {
      providers: { gemini: { enabled: false } } as any,
    });
    expect(pickEnabledProviders(cfg, { GOOGLE_API_KEY: 'x' })).not.toContain('gemini');
  });
});

describe('pickPrimaryAndFallbacks', () => {
  it('uses defaultProvider when it is in the enabled set', () => {
    const cfg = { ...DEFAULT_ROUTER_CONFIG, defaultProvider: 'gemini' as const };
    const { primary, fallbacks } = pickPrimaryAndFallbacks(cfg, ['claude', 'gemini', 'openai']);
    expect(primary).toBe('gemini');
    expect(fallbacks).toEqual(['claude', 'openai']);
  });

  it('falls back to first enabled when defaultProvider is not available', () => {
    const cfg = { ...DEFAULT_ROUTER_CONFIG, defaultProvider: 'gemini' as const };
    const { primary, fallbacks } = pickPrimaryAndFallbacks(cfg, ['claude', 'openai']);
    expect(primary).toBe('claude');
    expect(fallbacks).toEqual(['openai']);
  });

  it('throws when the enabled set is empty', () => {
    expect(() => pickPrimaryAndFallbacks(DEFAULT_ROUTER_CONFIG, [])).toThrow();
  });
});

describe('createLLMRouterService', () => {
  it('returns null when no providers are available', async () => {
    const built = await createLLMRouterService({
      projectRoot: tmpRoot,
      env: {},
    });
    expect(built).toBeNull();
  });

  it('builds a router when at least one provider key is set', async () => {
    const built = await createLLMRouterService({
      projectRoot: tmpRoot,
      env: { ANTHROPIC_API_KEY: 'fake-key-for-test' },
      // Don't actually hit the network — we just need the router instance
    });
    // ProviderManager.createProviders may warn but shouldn't throw here
    // since claude provider construction itself doesn't network until
    // generate() is called.
    expect(built).not.toBeNull();
    expect(built?.enabledProviders).toContain('claude');
  });

  it('honors an injected ProviderManager with mock providers', async () => {
    const { provider, stats } = createMockLLMProvider({ type: 'claude' });
    const pm = new ProviderManager({
      primary: 'claude',
      fallbacks: [],
      providers: { claude: { model: 'mock-model' } as any },
    });
    // Inject the mock provider directly so initialize() doesn't try the
    // real Claude API.
    (pm as any).providers.set('claude', provider);
    (pm as any).initialized = true;
    (pm as any).initializeMetrics('claude');

    const built = await createLLMRouterService({
      projectRoot: tmpRoot,
      env: {},
      providerManager: pm,
    });

    expect(built).not.toBeNull();
    expect(built!.router).toBeDefined();

    // Confirm the round-trip: a chat call hits the mock provider.
    const response = await built!.router.chat({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'mock-model',
    });

    expect(response.content).toBe('mock response');
    expect(stats.generateCalls).toBe(1);
  });
});
