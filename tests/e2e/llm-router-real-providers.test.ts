/**
 * Phase 4 real-provider smoke test for ADR-043 wiring.
 *
 * Confirms the full kernel boot path actually round-trips a chat() call
 * through a real LLM API when a provider key is present in env.
 *
 * Gated by `AQE_LLM_E2E=1` so CI doesn't burn tokens on every run. Run
 * locally with:
 *
 *   source .env && AQE_LLM_E2E=1 npx vitest run tests/e2e/llm-router-real-providers.test.ts
 *
 * Each provider's test is auto-skipped when its API key isn't set.
 * - Gemini:     GOOGLE_AI_API_KEY | GEMINI_API_KEY | GOOGLE_API_KEY
 * - OpenAI:     OPENAI_API_KEY
 * - OpenRouter: OPENROUTER_API_KEY
 *
 * Claude is intentionally NOT exercised here per Phase 4 decisions —
 * the ANTHROPIC_API_KEY in the dev shell may be a paste-truncated stub,
 * and Claude routing is verified by the unit + integration tests
 * already.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { QEKernelImpl } from '../../src/kernel/kernel';
import { resetUnifiedMemory } from '../../src/kernel/unified-memory';

const E2E_ENABLED = process.env.AQE_LLM_E2E === '1';

const hasGeminiKey =
  !!(process.env.GOOGLE_AI_API_KEY?.trim() ||
     process.env.GEMINI_API_KEY?.trim() ||
     process.env.GOOGLE_API_KEY?.trim());
const hasOpenAIKey = !!process.env.OPENAI_API_KEY?.trim();
const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY?.trim();

const describeIfE2E = E2E_ENABLED ? describe : describe.skip;

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-llm-e2e-'));
});

afterEach(async () => {
  resetUnifiedMemory();
  if (fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

describeIfE2E('Real-provider E2E smoke (ADR-043)', () => {
  it.runIf(hasGeminiKey)('Gemini: chat() round-trips through the kernel router', async () => {
    const kernel = new QEKernelImpl({
      memoryBackend: 'memory',
      enabledDomains: [],
      enableExperienceBridge: false,
      enableDreamScheduler: false,
      dataDir: tmpRoot,
      llmRouter: {
        enabled: true,
        configOverride: {
          // 'manual' bypasses the rule engine — without this the router
          // honors DEFAULT_QE_ROUTING_RULES which may route to Claude
          // for general/unlabeled tasks.
          mode: 'manual',
          defaultProvider: 'gemini',
          defaultModel: 'gemini-2.5-flash',
          providers: {
            gemini: { enabled: true, defaultModel: 'gemini-2.5-flash' } as any,
          },
        } as any,
      },
    });
    await kernel.initialize();

    try {
      expect(kernel.llmRouter).toBeDefined();
      const router = kernel.llmRouter as any;

      const response = await router.chat({
        messages: [
          {
            role: 'user',
            content: 'Respond with exactly one word: hello',
          },
        ],
        model: 'gemini-2.5-flash',
      });

      // The Gemini API returns SOMETHING; we just need the call to succeed.
      expect(response).toBeDefined();
      expect(typeof response.content).toBe('string');
      expect(response.content.length).toBeGreaterThan(0);
      // Log so the user can eyeball the actual response when running this.
      // eslint-disable-next-line no-console
      console.log('[E2E:Gemini] response.content =', JSON.stringify(response.content).slice(0, 200));
    } finally {
      await kernel.dispose();
    }
  }, 30000);

  it.runIf(hasOpenAIKey)('OpenAI: chat() round-trips through the kernel router', async () => {
    const kernel = new QEKernelImpl({
      memoryBackend: 'memory',
      enabledDomains: [],
      enableExperienceBridge: false,
      enableDreamScheduler: false,
      dataDir: tmpRoot,
      llmRouter: {
        enabled: true,
        configOverride: {
          mode: 'manual',
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o-mini',
          providers: {
            openai: { enabled: true, defaultModel: 'gpt-4o-mini' } as any,
          },
        } as any,
      },
    });
    await kernel.initialize();

    try {
      expect(kernel.llmRouter).toBeDefined();
      const router = kernel.llmRouter as any;

      const response = await router.chat({
        messages: [{ role: 'user', content: 'Respond with exactly one word: hello' }],
        model: 'gpt-4o-mini',
      });

      expect(response).toBeDefined();
      expect(typeof response.content).toBe('string');
      expect(response.content.length).toBeGreaterThan(0);
      // eslint-disable-next-line no-console
      console.log('[E2E:OpenAI] response.content =', JSON.stringify(response.content).slice(0, 200));
    } finally {
      await kernel.dispose();
    }
  }, 30000);

  it.runIf(hasGeminiKey)('rule-based mode: chat without agentType falls through to defaultProvider', async () => {
    // The default mode is 'rule-based', not 'manual'. This test proves
    // that a chat request WITHOUT an agentType (which is what every
    // domain service in src/domains/ does today — verified by grep)
    // correctly falls through to defaultProvider and the chosen
    // provider's API is the one that fires.
    const kernel = new QEKernelImpl({
      memoryBackend: 'memory',
      enabledDomains: [],
      enableExperienceBridge: false,
      enableDreamScheduler: false,
      dataDir: tmpRoot,
      llmRouter: {
        enabled: true,
        configOverride: {
          // 'rule-based' is the DEFAULT mode — same as production.
          mode: 'rule-based',
          defaultProvider: 'gemini',
          defaultModel: 'gemini-2.5-flash',
          providers: {
            gemini: { enabled: true, defaultModel: 'gemini-2.5-flash' } as any,
          },
        } as any,
      },
    });
    await kernel.initialize();

    try {
      expect(kernel.llmRouter).toBeDefined();
      const router = kernel.llmRouter as any;

      // No agentType set — none of DEFAULT_QE_ROUTING_RULES will match,
      // and the router uses defaultProvider (gemini). This is the
      // production path for every src/domains/* service.
      const response = await router.chat({
        messages: [{ role: 'user', content: 'Respond with exactly one word: hello' }],
        model: 'gemini-2.5-flash',
      });

      expect(response).toBeDefined();
      expect(typeof response.content).toBe('string');
      expect(response.content.length).toBeGreaterThan(0);
      expect(response.provider).toBe('gemini');
      // eslint-disable-next-line no-console
      console.log('[E2E:Gemini rule-based] response.content =', JSON.stringify(response.content).slice(0, 200));
    } finally {
      await kernel.dispose();
    }
  }, 30000);

  it.runIf(hasGeminiKey)('rule-based mode: matched rule selecting an unavailable provider gracefully falls back to defaultProvider', async () => {
    // DEFAULT_QE_ROUTING_RULES routes agentType='security-auditor' to
    // provider='claude'. If the user has only GEMINI_API_KEY in env,
    // claude is unavailable. The HybridRouter at hybrid-router.ts:459
    // checks `providerManager.getProvider(providerType)` — if undefined,
    // it falls through to defaultProvider. This test proves the
    // fallback is graceful (no exception) and the request still routes
    // through Gemini.
    const kernel = new QEKernelImpl({
      memoryBackend: 'memory',
      enabledDomains: [],
      enableExperienceBridge: false,
      enableDreamScheduler: false,
      dataDir: tmpRoot,
      llmRouter: {
        enabled: true,
        configOverride: {
          mode: 'rule-based',
          defaultProvider: 'gemini',
          defaultModel: 'gemini-2.5-flash',
          providers: {
            // ONLY gemini enabled — claude/openai/etc unavailable
            gemini: { enabled: true, defaultModel: 'gemini-2.5-flash' } as any,
          },
        } as any,
      },
    });
    await kernel.initialize();

    try {
      const router = kernel.llmRouter as any;

      // Force-trigger the security-auditor rule which selects claude.
      // The HybridRouter should observe claude isn't available and fall
      // through to defaultProvider (gemini).
      const response = await router.chat({
        agentType: 'security-auditor',
        model: 'gemini-2.5-flash', // request gemini-compatible model
        messages: [{ role: 'user', content: 'Respond with exactly one word: hello' }],
      });

      // The fallback should make this succeed via Gemini, not throw.
      expect(response).toBeDefined();
      expect(response.provider).toBe('gemini');
      // eslint-disable-next-line no-console
      console.log('[E2E:Gemini fallback] response.provider =', response.provider, ', content =', JSON.stringify(response.content).slice(0, 200));
    } finally {
      await kernel.dispose();
    }
  }, 30000);

  it.runIf(hasOpenRouterKey)('OpenRouter: chat() round-trips through the kernel router', async () => {
    const kernel = new QEKernelImpl({
      memoryBackend: 'memory',
      enabledDomains: [],
      enableExperienceBridge: false,
      enableDreamScheduler: false,
      dataDir: tmpRoot,
      llmRouter: {
        enabled: true,
        configOverride: {
          mode: 'manual',
          defaultProvider: 'openrouter',
          defaultModel: 'openai/gpt-4o-mini',
          providers: {
            openrouter: { enabled: true, defaultModel: 'openai/gpt-4o-mini' } as any,
          },
        } as any,
      },
    });
    await kernel.initialize();

    try {
      expect(kernel.llmRouter).toBeDefined();
      const router = kernel.llmRouter as any;

      const response = await router.chat({
        messages: [{ role: 'user', content: 'Respond with exactly one word: hello' }],
        model: 'openai/gpt-4o-mini',
      });

      expect(response).toBeDefined();
      expect(typeof response.content).toBe('string');
      expect(response.content.length).toBeGreaterThan(0);
      // eslint-disable-next-line no-console
      console.log('[E2E:OpenRouter] response.content =', JSON.stringify(response.content).slice(0, 200));
    } finally {
      await kernel.dispose();
    }
  }, 30000);
});
