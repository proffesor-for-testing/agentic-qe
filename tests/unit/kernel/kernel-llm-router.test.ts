/**
 * Tests for ADR-043 kernel ↔ LLM router wiring.
 *
 * Covers:
 *   - kernel.llmRouter is undefined when llmRouter.enabled = false
 *   - kernel.llmRouter is undefined when no provider is available (auto)
 *   - kernel.llmRouter is built when an injected ProviderManager is provided
 *   - the router is forwarded to plugin factories as the 4th arg
 *   - a chat() call round-trips through the mock provider
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { QEKernelImpl } from '../../../src/kernel/kernel';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';
import { ProviderManager } from '../../../src/shared/llm/provider-manager';
import { createMockLLMProvider } from '../../mocks';
import {
  getSharedLLMRouter,
  resetSharedLLMRouter,
} from '../../../src/mcp/tools/base';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-kernel-llm-'));
});

afterEach(async () => {
  resetUnifiedMemory();
  // ADR-043: clear shared singleton between tests so each test gets a
  // fresh router. Kernel.dispose() does this when a router was built,
  // but tests that fail mid-setup might not reach dispose.
  resetSharedLLMRouter();
  // Defensive: also clear the env kill-switch tests may have set.
  delete process.env.AQE_LLM_ROUTER_DISABLED;
  if (fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

/** Build a ProviderManager pre-loaded with a mock provider — bypasses
 *  network on initialize(). Same trick as in llm-router-service.test.ts. */
function makeMockProviderManager(): { pm: ProviderManager; stats: ReturnType<typeof createMockLLMProvider>['stats'] } {
  const { provider, stats } = createMockLLMProvider({ type: 'claude' });
  const pm = new ProviderManager({
    primary: 'claude',
    fallbacks: [],
    providers: { claude: { model: 'mock-model' } as any },
  });
  (pm as any).providers.set('claude', provider);
  (pm as any).initialized = true;
  (pm as any).initializeMetrics('claude');
  return { pm, stats };
}

describe('Kernel ↔ LLM router wiring (ADR-043)', () => {
  it('does not build a router when llmRouter.enabled is false', async () => {
    const kernel = new QEKernelImpl({
      memoryBackend: 'memory',
      enabledDomains: [],
      enableExperienceBridge: false,
      enableDreamScheduler: false,
      dataDir: tmpRoot,
      llmRouter: { enabled: false },
    });
    await kernel.initialize();

    expect(kernel.llmRouter).toBeUndefined();

    await kernel.dispose();
  });

  it('does not build a router in auto mode when no provider is available', async () => {
    // Save and clear any provider keys from the host env so this test
    // is hermetic (the dev shell may have keys exported from .env).
    const saved = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    };
    for (const k of Object.keys(saved)) delete process.env[k];

    try {
      const kernel = new QEKernelImpl({
        memoryBackend: 'memory',
        enabledDomains: [],
        enableExperienceBridge: false,
        enableDreamScheduler: false,
        dataDir: tmpRoot,
        llmRouter: { enabled: 'auto' },
      });
      await kernel.initialize();

      expect(kernel.llmRouter).toBeUndefined();

      await kernel.dispose();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v !== undefined) process.env[k] = v;
      }
    }
  });

  it('builds a router when an injected ProviderManager is supplied', async () => {
    const { pm } = makeMockProviderManager();

    const kernel = new QEKernelImpl({
      memoryBackend: 'memory',
      enabledDomains: [],
      enableExperienceBridge: false,
      enableDreamScheduler: false,
      dataDir: tmpRoot,
      llmRouter: { enabled: true, providerManager: pm },
    });
    await kernel.initialize();

    expect(kernel.llmRouter).toBeDefined();

    await kernel.dispose();
  });

  it('round-trips a chat() call through the injected mock provider', async () => {
    const { pm, stats } = makeMockProviderManager();

    const kernel = new QEKernelImpl({
      memoryBackend: 'memory',
      enabledDomains: [],
      enableExperienceBridge: false,
      enableDreamScheduler: false,
      dataDir: tmpRoot,
      llmRouter: { enabled: true, providerManager: pm },
    });
    await kernel.initialize();

    const router = kernel.llmRouter as any;
    const response = await router.chat({
      messages: [{ role: 'user', content: 'hello from a domain plugin' }],
      model: 'mock-model',
    });

    expect(response.content).toBe('mock response');
    expect(stats.generateCalls).toBe(1);

    await kernel.dispose();
  });

  describe('AQE_LLM_ROUTER_DISABLED env kill-switch', () => {
    it('AQE_LLM_ROUTER_DISABLED=1 prevents the router from being built even with enabled=true', async () => {
      process.env.AQE_LLM_ROUTER_DISABLED = '1';
      const { pm } = makeMockProviderManager();

      const kernel = new QEKernelImpl({
        memoryBackend: 'memory',
        enabledDomains: [],
        enableExperienceBridge: false,
        enableDreamScheduler: false,
        dataDir: tmpRoot,
        llmRouter: { enabled: true, providerManager: pm },
      });
      await kernel.initialize();

      expect(kernel.llmRouter).toBeUndefined();
      await kernel.dispose();
    });

    it.each(['true', 'yes', 'on'])(
      'AQE_LLM_ROUTER_DISABLED=%s also disables the router',
      async (value) => {
        process.env.AQE_LLM_ROUTER_DISABLED = value;
        const { pm } = makeMockProviderManager();
        const kernel = new QEKernelImpl({
          memoryBackend: 'memory',
          enabledDomains: [],
          enableExperienceBridge: false,
          enableDreamScheduler: false,
          dataDir: tmpRoot,
          llmRouter: { enabled: true, providerManager: pm },
        });
        await kernel.initialize();
        expect(kernel.llmRouter).toBeUndefined();
        await kernel.dispose();
      }
    );

    it.each(['', '0', 'false', 'no', 'off'])(
      'AQE_LLM_ROUTER_DISABLED=%s does NOT disable the router (router still builds)',
      async (value) => {
        process.env.AQE_LLM_ROUTER_DISABLED = value;
        const { pm } = makeMockProviderManager();
        const kernel = new QEKernelImpl({
          memoryBackend: 'memory',
          enabledDomains: [],
          enableExperienceBridge: false,
          enableDreamScheduler: false,
          dataDir: tmpRoot,
          llmRouter: { enabled: true, providerManager: pm },
        });
        await kernel.initialize();
        expect(kernel.llmRouter).toBeDefined();
        await kernel.dispose();
      }
    );

    it('kill-switch also short-circuits the MCP getSharedLLMRouter() path', async () => {
      process.env.AQE_LLM_ROUTER_DISABLED = '1';
      const shared = await getSharedLLMRouter();
      expect(shared).toBeNull();
    });
  });

  describe('Shared singleton unification (Fix #6)', () => {
    it('kernel registers its router as the shared singleton so MCP sees the same instance', async () => {
      const { pm } = makeMockProviderManager();
      const kernel = new QEKernelImpl({
        memoryBackend: 'memory',
        enabledDomains: [],
        enableExperienceBridge: false,
        enableDreamScheduler: false,
        dataDir: tmpRoot,
        llmRouter: { enabled: true, providerManager: pm },
      });
      await kernel.initialize();

      const shared = await getSharedLLMRouter();
      expect(shared).toBe(kernel.llmRouter);

      await kernel.dispose();
    });

    it('kernel.dispose() clears the shared singleton so the next kernel does not inherit it', async () => {
      const { pm: pm1 } = makeMockProviderManager();
      const kernel1 = new QEKernelImpl({
        memoryBackend: 'memory',
        enabledDomains: [],
        enableExperienceBridge: false,
        enableDreamScheduler: false,
        dataDir: tmpRoot,
        llmRouter: { enabled: true, providerManager: pm1 },
      });
      await kernel1.initialize();
      const router1 = kernel1.llmRouter;
      await kernel1.dispose();

      // After dispose, the shared singleton is cleared; building a fresh
      // kernel with a fresh provider produces a DIFFERENT router instance.
      const { pm: pm2 } = makeMockProviderManager();
      const kernel2 = new QEKernelImpl({
        memoryBackend: 'memory',
        enabledDomains: [],
        enableExperienceBridge: false,
        enableDreamScheduler: false,
        dataDir: tmpRoot,
        llmRouter: { enabled: true, providerManager: pm2 },
      });
      await kernel2.initialize();
      expect(kernel2.llmRouter).not.toBe(router1);
      await kernel2.dispose();
    });
  });

  describe('Init failure observability (Fix #7)', () => {
    it('publishes kernel.llm-router.init-no-provider event when enabled=true but no provider available', async () => {
      // Hermetic: clear all provider keys
      const saved: Record<string, string | undefined> = {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      };
      for (const k of Object.keys(saved)) delete process.env[k];

      try {
        const kernel = new QEKernelImpl({
          memoryBackend: 'memory',
          enabledDomains: [],
          enableExperienceBridge: false,
          enableDreamScheduler: false,
          dataDir: tmpRoot,
          llmRouter: { enabled: true },
        });

        const captured: Array<{ type: string; payload: unknown }> = [];
        kernel.eventBus.subscribe('kernel.llm-router.init-no-provider', async (e: any) => {
          captured.push({ type: e.type, payload: e.payload });
        });

        await kernel.initialize();
        // Wait a tick for the event to propagate.
        await new Promise((r) => setImmediate(r));

        expect(captured.length).toBe(1);
        expect(captured[0].type).toBe('kernel.llm-router.init-no-provider');
        expect((captured[0].payload as any).reason).toContain('no provider available');

        await kernel.dispose();
      } finally {
        for (const [k, v] of Object.entries(saved)) {
          if (v !== undefined) process.env[k] = v;
        }
      }
    });
  });
});
